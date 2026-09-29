import { describe, expect, it } from 'vitest';
import { branchProtectionMissingCheck } from '../../../src/checks/repo-settings/branch-protection-missing.js';
import { makeTestContext } from '../../fixtures/context.js';
import { makeFakeBranchProtection, makeFakeClient } from '../../fixtures/github-client.js';

describe('branchProtectionMissingCheck', () => {
  it('flags a default branch with no protection rule (404)', async () => {
    const context = makeTestContext(makeFakeClient({ getBranchProtection: () => Promise.resolve(null) }));

    const findings = await branchProtectionMissingCheck.run(context);

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ id: 'branch-protection-missing', severity: 'high' });
  });

  it('is clean when a protection rule exists', async () => {
    const context = makeTestContext(
      makeFakeClient({ getBranchProtection: () => Promise.resolve(makeFakeBranchProtection()) }),
    );

    const findings = await branchProtectionMissingCheck.run(context);

    expect(findings).toEqual([]);
  });

  it('propagates a 403 as an error instead of reporting a finding or a clean result', async () => {
    const context = makeTestContext(
      makeFakeClient({ getBranchProtection: () => Promise.reject(new Error('Access forbidden')) }),
    );

    await expect(branchProtectionMissingCheck.run(context)).rejects.toThrow('Access forbidden');
  });
});
