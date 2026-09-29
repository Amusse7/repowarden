import { describe, expect, it, vi } from 'vitest';
import { createCheckContext } from '../src/core/context.js';
import { makeFakeBranchProtection, makeFakeClient, makeFakeRepoData } from './fixtures/github-client.js';

describe('createCheckContext', () => {
  it('fetches repoData at most once even when called repeatedly', async () => {
    const getRepo = vi.fn().mockResolvedValue(makeFakeRepoData());
    const client = makeFakeClient({ getRepo });
    const context = createCheckContext('octocat', 'hello-world', client);

    await Promise.all([context.repoData(), context.repoData(), context.repoData()]);

    expect(getRepo).toHaveBeenCalledTimes(1);
  });

  it('fetches branchProtection at most once, and reuses the cached repoData for the default branch', async () => {
    const getRepo = vi.fn().mockResolvedValue(makeFakeRepoData({ default_branch: 'develop' }));
    const getBranchProtection = vi.fn().mockResolvedValue(makeFakeBranchProtection());
    const client = makeFakeClient({ getRepo, getBranchProtection });
    const context = createCheckContext('octocat', 'hello-world', client);

    await Promise.all([context.branchProtection(), context.branchProtection(), context.repoData()]);

    expect(getRepo).toHaveBeenCalledTimes(1);
    expect(getBranchProtection).toHaveBeenCalledTimes(1);
    expect(getBranchProtection).toHaveBeenCalledWith('octocat', 'hello-world', 'develop');
  });

  it('resolves branchProtection to null when the client reports no protection (404)', async () => {
    const client = makeFakeClient({ getBranchProtection: () => Promise.resolve(null) });
    const context = createCheckContext('octocat', 'hello-world', client);

    await expect(context.branchProtection()).resolves.toBeNull();
  });

  it('rejects branchProtection when the client reports an access error (403), rather than treating it as unprotected', async () => {
    const client = makeFakeClient({
      getBranchProtection: () => Promise.reject(new Error('Access forbidden')),
    });
    const context = createCheckContext('octocat', 'hello-world', client);

    await expect(context.branchProtection()).rejects.toThrow('Access forbidden');
  });
});
