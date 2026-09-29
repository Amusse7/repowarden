import { describe, expect, it } from 'vitest';
import { forcePushAllowedCheck } from '../../../src/checks/repo-settings/force-push-allowed.js';
import { makeTestContext } from '../../fixtures/context.js';
import { makeFakeBranchProtection, makeFakeClient } from '../../fixtures/github-client.js';

describe('forcePushAllowedCheck', () => {
  it('flags protection that allows force pushes', async () => {
    const protection = makeFakeBranchProtection({ allow_force_pushes: { enabled: true } });
    const context = makeTestContext(makeFakeClient({ getBranchProtection: () => Promise.resolve(protection) }));

    const findings = await forcePushAllowedCheck.run(context);

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ id: 'force-push-allowed', severity: 'high' });
  });

  it('is clean when force pushes are disallowed', async () => {
    const context = makeTestContext(
      makeFakeClient({ getBranchProtection: () => Promise.resolve(makeFakeBranchProtection()) }),
    );

    const findings = await forcePushAllowedCheck.run(context);

    expect(findings).toEqual([]);
  });

  it('is clean (skips) when there is no protection rule at all', async () => {
    const context = makeTestContext(makeFakeClient({ getBranchProtection: () => Promise.resolve(null) }));

    const findings = await forcePushAllowedCheck.run(context);

    expect(findings).toEqual([]);
  });
});
