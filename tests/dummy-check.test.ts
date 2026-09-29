import { describe, expect, it } from 'vitest';
import { GitHubClient } from '../src/core/github-client.js';
import type { CheckContext } from '../src/core/types.js';
import { dummyCheck, findingWithLocationCheck } from './fixtures/checks.js';

const context: CheckContext = {
  owner: 'octocat',
  repo: 'hello-world',
  client: new GitHubClient('fake-token-for-tests'),
};

describe('dummyCheck fixture', () => {
  it('conforms to the Check interface and returns a well-formed Finding', async () => {
    const findings = await dummyCheck.run(context);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      id: 'dummy-check',
      severity: 'info',
      category: 'repo-settings',
    });
  });
});

describe('findingWithLocationCheck fixture', () => {
  it('produces a Finding whose id encodes the location', async () => {
    const findings = await findingWithLocationCheck.run(context);
    expect(findings[0]?.id).toBe('location-check:src/config.ts:42');
  });
});
