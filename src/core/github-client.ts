import { Octokit } from '@octokit/rest';
import { throttling } from '@octokit/plugin-throttling';
import type { RestEndpointMethodTypes } from '@octokit/rest';

const ThrottledOctokit = Octokit.plugin(throttling);

/**
 * The GitHub fine-grained permission required to read branch protection,
 * workflow permissions, and security_and_analysis. Shared as a constant (not
 * repeated as string literals) so every PermissionError that means the same
 * underlying gap groups together in the CLI's AUDIT INCOMPLETE summary.
 */
export const ADMINISTRATION_READ_PERMISSION = 'Administration: read';

export type RepoData = RestEndpointMethodTypes['repos']['get']['response']['data'];
export type BranchProtection = RestEndpointMethodTypes['repos']['getBranchProtection']['response']['data'];
export type WorkflowPermissions =
  RestEndpointMethodTypes['actions']['getGithubActionsDefaultWorkflowPermissionsRepository']['response']['data'];

/** A GitHub API error translated into a clear, actionable message. */
export class GitHubClientError extends Error {
  override readonly name = 'GitHubClientError';
}

/**
 * Thrown when a request failed specifically because the token lacks a
 * particular GitHub permission (as opposed to a generic/unclassified
 * forbidden or a rate limit). Kept distinct from GitHubClientError so callers
 * — the CLI's "AUDIT INCOMPLETE" summary in particular — can group repeated
 * occurrences of the same missing permission into one line instead of
 * repeating the same message once per check.
 */
export class PermissionError extends Error {
  override readonly name = 'PermissionError';
  readonly requiredPermission: string;

  constructor(message: string, requiredPermission: string) {
    super(message);
    this.requiredPermission = requiredPermission;
  }
}

interface OctokitErrorLike {
  status: number;
  response?: {
    headers?: Record<string, string | undefined>;
  };
}

function isOctokitErrorLike(err: unknown): err is OctokitErrorLike {
  return typeof err === 'object' && err !== null && 'status' in err && typeof (err as { status: unknown }).status === 'number';
}

function isRateLimitError(err: OctokitErrorLike): boolean {
  return err.status === 403 && err.response?.headers?.['x-ratelimit-remaining'] === '0';
}

/**
 * Translates a raw Octokit error into a clear GitHubClientError. Exported as
 * a standalone function (rather than a private class method) so the 403
 * rate-limit-vs-permission-denied distinction can be unit tested directly.
 */
export function translateGitHubError(err: unknown, owner: string, repo: string): Error {
  if (!isOctokitErrorLike(err)) {
    return err instanceof Error ? err : new Error(String(err));
  }

  if (err.status === 404) {
    return new GitHubClientError(
      `Repository "${owner}/${repo}" was not found, or the provided token does not have access to it.`,
    );
  }

  if (err.status === 403) {
    if (isRateLimitError(err)) {
      const reset = err.response?.headers?.['x-ratelimit-reset'];
      const resetAt = reset ? new Date(Number(reset) * 1000).toISOString() : 'an unknown time';
      return new GitHubClientError(`GitHub API rate limit exceeded. Limit resets at ${resetAt}.`);
    }
    return new GitHubClientError(
      `Access to "${owner}/${repo}" was forbidden. The token likely lacks the required permissions/scopes.`,
    );
  }

  return err instanceof Error ? err : new Error(String(err));
}

/**
 * Like translateGitHubError, but a plain 403 "forbidden" (never a rate
 * limit) is upgraded to a PermissionError naming the specific GitHub
 * permission this endpoint requires. Used for endpoints that are
 * specifically documented as requiring the repository's "Administration"
 * permission (branch protection, workflow permissions) so failures on them
 * can be grouped in the CLI summary instead of listed one by one.
 */
export function translateGitHubErrorWithPermission(
  err: unknown,
  owner: string,
  repo: string,
  requiredPermission: string,
): Error {
  const translated = translateGitHubError(err, owner, repo);
  if (isOctokitErrorLike(err) && err.status === 403 && !isRateLimitError(err)) {
    return new PermissionError(translated.message, requiredPermission);
  }
  return translated;
}

/**
 * The subset of GitHubClient that checks and CheckContext depend on. Checks
 * are written against this interface, never the concrete Octokit-backed
 * class, so tests can supply plain object doubles instead of mocking Octokit.
 */
export interface GitHubClientLike {
  getRepo(owner: string, repo: string): Promise<RepoData>;

  /** Returns null on 404 (no protection rule) — the caller decides whether that's a finding. Throws (a PermissionError on a plain 403) on other failures. */
  getBranchProtection(owner: string, repo: string, branch: string): Promise<BranchProtection | null>;

  /**
   * Returns false on 404. This is genuinely ambiguous — a 404 here means
   * either "alerts disabled" or "token lacks admin access", and this method
   * cannot tell which; the caller must check repoData().permissions?.admin
   * before treating false as "disabled". Throws on 403 and other failures.
   */
  getVulnerabilityAlertsEnabled(owner: string, repo: string): Promise<boolean>;

  /** Throws (a PermissionError on a plain 403) on failure — this endpoint requires repo admin access. */
  getWorkflowPermissions(owner: string, repo: string): Promise<WorkflowPermissions>;

  /** Returns false on 404 (path doesn't exist). Throws on 403 and other failures. */
  getContentExists(owner: string, repo: string, path: string): Promise<boolean>;
}

export interface GitHubClientOptions {
  /** When true, Octokit's own warn/error log output (deprecation notices, throttling warnings, etc.) is printed to stderr, prefixed "[octokit]". When false (the default), it's silenced — audit output should be ours only. */
  verbose?: boolean;
}

/**
 * Thin wrapper around Octokit. Owns rate-limit handling and translates
 * common HTTP failures into clear errors; callers never see raw Octokit
 * exceptions. Never reads environment variables or .env files itself — the
 * caller (CLI, MCP server, Action) is responsible for sourcing the token.
 */
export class GitHubClient implements GitHubClientLike {
  private readonly octokit: InstanceType<typeof ThrottledOctokit>;

  constructor(token: string, options: GitHubClientOptions = {}) {
    if (!token) {
      throw new GitHubClientError('A GitHub token is required to construct a GitHubClient.');
    }

    const verbose = options.verbose ?? false;

    this.octokit = new ThrottledOctokit({
      auth: token,
      log: {
        debug: () => {},
        info: () => {},
        warn: (message: string) => {
          if (verbose) console.error(`[octokit] ${message}`);
        },
        error: (message: string) => {
          if (verbose) console.error(`[octokit] ${message}`);
        },
      },
      throttle: {
        onRateLimit: (_retryAfter, _options, _octokit, retryCount) => {
          return retryCount < 1;
        },
        onSecondaryRateLimit: (_retryAfter, _options, _octokit, retryCount) => {
          return retryCount < 1;
        },
      },
    });
  }

  async getRepo(owner: string, repo: string): Promise<RepoData> {
    try {
      const { data } = await this.octokit.repos.get({ owner, repo });
      return data;
    } catch (err) {
      throw translateGitHubError(err, owner, repo);
    }
  }

  async getBranchProtection(owner: string, repo: string, branch: string): Promise<BranchProtection | null> {
    try {
      const { data } = await this.octokit.repos.getBranchProtection({ owner, repo, branch });
      return data;
    } catch (err) {
      if (isOctokitErrorLike(err) && err.status === 404) {
        return null;
      }
      throw translateGitHubErrorWithPermission(err, owner, repo, ADMINISTRATION_READ_PERMISSION);
    }
  }

  async getVulnerabilityAlertsEnabled(owner: string, repo: string): Promise<boolean> {
    try {
      await this.octokit.repos.checkVulnerabilityAlerts({ owner, repo });
      return true;
    } catch (err) {
      if (isOctokitErrorLike(err) && err.status === 404) {
        return false;
      }
      throw translateGitHubError(err, owner, repo);
    }
  }

  async getWorkflowPermissions(owner: string, repo: string): Promise<WorkflowPermissions> {
    try {
      const { data } = await this.octokit.actions.getGithubActionsDefaultWorkflowPermissionsRepository({
        owner,
        repo,
      });
      return data;
    } catch (err) {
      throw translateGitHubErrorWithPermission(err, owner, repo, ADMINISTRATION_READ_PERMISSION);
    }
  }

  async getContentExists(owner: string, repo: string, path: string): Promise<boolean> {
    try {
      await this.octokit.repos.getContent({ owner, repo, path });
      return true;
    } catch (err) {
      if (isOctokitErrorLike(err) && err.status === 404) {
        return false;
      }
      throw translateGitHubError(err, owner, repo);
    }
  }
}
