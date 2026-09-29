import type { BranchProtection, GitHubClientLike, RepoData } from './github-client.js';
import type { CheckContext } from './types.js';

/** Memoizes an async factory: the first call triggers the fetch, every later call reuses the same (possibly still in-flight) promise. */
function lazy<T>(fn: () => Promise<T>): () => Promise<T> {
  let cached: Promise<T> | undefined;
  return () => {
    if (!cached) {
      cached = fn();
    }
    return cached;
  };
}

/**
 * Builds a CheckContext with shared data fetched at most once per audit run,
 * however many checks ask for it. Only data genuinely reused across checks
 * (repo data, branch protection) gets a cached accessor here — data used by a
 * single check is fetched directly through context.client instead.
 */
export function createCheckContext(owner: string, repo: string, client: GitHubClientLike): CheckContext {
  const repoData = lazy((): Promise<RepoData> => client.getRepo(owner, repo));

  const branchProtection = lazy(async (): Promise<BranchProtection | null> => {
    const repository = await repoData();
    return client.getBranchProtection(owner, repo, repository.default_branch);
  });

  return { owner, repo, client, repoData, branchProtection };
}
