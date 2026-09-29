import { Octokit } from '@octokit/rest';
import { throttling } from '@octokit/plugin-throttling';

const ThrottledOctokit = Octokit.plugin(throttling);

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
 * Thin wrapper around Octokit. Owns rate-limit handling and translates
 * common HTTP failures into clear errors; callers never see raw Octokit
 * exceptions. Never reads environment variables or .env files itself — the
 * caller (CLI, MCP server, Action) is responsible for sourcing the token.
 */
export class GitHubClient {
  private readonly octokit: InstanceType<typeof ThrottledOctokit>;

  constructor(token: string) {
    if (!token) {
      throw new GitHubClientError('A GitHub token is required to construct a GitHubClient.');
    }

    this.octokit = new ThrottledOctokit({
      auth: token,
      throttle: {
        onRateLimit: (retryAfter, options, _octokit, retryCount) => {
          if (retryCount < 1) {
            return true;
          }
          return false;
        },
        onSecondaryRateLimit: (retryAfter, options, _octokit, retryCount) => {
          if (retryCount < 1) {
            return true;
          }
          return false;
        },
      },
    });
  }

  async getRepo(owner: string, repo: string): Promise<Awaited<ReturnType<Octokit['repos']['get']>>['data']> {
    try {
      const { data } = await this.octokit.repos.get({ owner, repo });
      return data;
    } catch (err) {
      throw translateGitHubError(err, owner, repo);
    }
  }
}
