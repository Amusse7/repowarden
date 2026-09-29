import { Octokit } from '@octokit/rest';
import { throttling } from '@octokit/plugin-throttling';
import type { RestEndpointMethodTypes } from '@octokit/rest';

const ThrottledOctokit = Octokit.plugin(throttling);

export type RepoData = RestEndpointMethodTypes['repos']['get']['response']['data'];
export type BranchProtection = RestEndpointMethodTypes['repos']['getBranchProtection']['response']['data'];
export type WorkflowPermissions =
  RestEndpointMethodTypes['actions']['getGithubActionsDefaultWorkflowPermissionsRepository']['response']['data'];

/** A GitHub API error translated into a clear, actionable message. */
export class GitHubClientError extends Error {
  override readonly name = 'GitHubClientError';
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
    const remaining = err.response?.headers?.['x-ratelimit-remaining'];
    if (remaining === '0') {
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
 * The subset of GitHubClient that checks and CheckContext depend on. Checks
 * are written against this interface, never the concrete Octokit-backed
 * class, so tests can supply plain object doubles instead of mocking Octokit.
 */
export interface GitHubClientLike {
  getRepo(owner: string, repo: string): Promise<RepoData>;

  /** Returns null on 404 (no protection rule) — the caller decides whether that's a finding. Throws on 403 and other failures. */
  getBranchProtection(owner: string, repo: string, branch: string): Promise<BranchProtection | null>;

  /** Returns false on 404 (alerts disabled). Throws on 403 and other failures — a 403 must never read as "disabled". */
  getVulnerabilityAlertsEnabled(owner: string, repo: string): Promise<boolean>;

  getWorkflowPermissions(owner: string, repo: string): Promise<WorkflowPermissions>;

  /** Returns false on 404 (path doesn't exist). Throws on 403 and other failures. */
  getContentExists(owner: string, repo: string, path: string): Promise<boolean>;
}

/**
 * Thin wrapper around Octokit. Owns rate-limit handling and translates
 * common HTTP failures into clear errors; callers never see raw Octokit
 * exceptions. Never reads environment variables or .env files itself — the
 * caller (CLI, MCP server, Action) is responsible for sourcing the token.
 */
export class GitHubClient implements GitHubClientLike {
  private readonly octokit: InstanceType<typeof ThrottledOctokit>;

  constructor(token: string) {
    if (!token) {
      throw new GitHubClientError('A GitHub token is required to construct a GitHubClient.');
    }

    this.octokit = new ThrottledOctokit({
      auth: token,
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
      throw translateGitHubError(err, owner, repo);
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
      throw translateGitHubError(err, owner, repo);
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
