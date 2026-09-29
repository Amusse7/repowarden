import { createCheckContext } from '../../src/core/context.js';
import type { GitHubClientLike } from '../../src/core/github-client.js';
import type { CheckContext } from '../../src/core/types.js';
import { makeFakeClient } from './github-client.js';

export function makeTestContext(
  client: GitHubClientLike = makeFakeClient(),
  owner = 'octocat',
  repo = 'hello-world',
): CheckContext {
  return createCheckContext(owner, repo, client);
}
