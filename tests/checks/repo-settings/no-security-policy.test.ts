import { describe, expect, it } from 'vitest';
import { noSecurityPolicyCheck } from '../../../src/checks/repo-settings/no-security-policy.js';
import { makeTestContext } from '../../fixtures/context.js';
import { makeFakeClient } from '../../fixtures/github-client.js';

describe('noSecurityPolicyCheck', () => {
  it('flags a repository where SECURITY.md is missing from all three conventional paths (all 404)', async () => {
    const context = makeTestContext(makeFakeClient({ getContentExists: () => Promise.resolve(false) }));

    const findings = await noSecurityPolicyCheck.run(context);

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ id: 'no-security-policy', severity: 'low' });
  });

  it('is clean when SECURITY.md exists at any one of the three paths', async () => {
    const context = makeTestContext(
      makeFakeClient({
        getContentExists: (_owner: string, _repo: string, path: string) =>
          Promise.resolve(path === '.github/SECURITY.md'),
      }),
    );

    const findings = await noSecurityPolicyCheck.run(context);

    expect(findings).toEqual([]);
  });

  it('throws instead of returning a finding when a lookup fails for a reason other than 404', async () => {
    const context = makeTestContext(
      makeFakeClient({ getContentExists: () => Promise.reject(new Error('Access forbidden')) }),
    );

    await expect(noSecurityPolicyCheck.run(context)).rejects.toThrow('Access forbidden');
  });
});
