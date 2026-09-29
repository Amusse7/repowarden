import { describe, expect, it } from 'vitest';
import { adminBypassAllowedCheck } from '../../../src/checks/repo-settings/admin-bypass-allowed.js';
import { makeTestContext } from '../../fixtures/context.js';
import { makeFakeBranchProtection, makeFakeClient } from '../../fixtures/github-client.js';

describe('adminBypassAllowedCheck', () => {
  it('flags protection that is not enforced for administrators', async () => {
    const protection = makeFakeBranchProtection({ enforce_admins: { enabled: false } });
    const context = makeTestContext(makeFakeClient({ getBranchProtection: () => Promise.resolve(protection) }));

    const findings = await adminBypassAllowedCheck.run(context);

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ id: 'admin-bypass-allowed', severity: 'high' });
  });

  it('is clean when protection is enforced for administrators', async () => {
    const context = makeTestContext(
      makeFakeClient({ getBranchProtection: () => Promise.resolve(makeFakeBranchProtection()) }),
    );

    const findings = await adminBypassAllowedCheck.run(context);

    expect(findings).toEqual([]);
  });

  it('is clean (skips) when there is no protection rule at all', async () => {
    const context = makeTestContext(makeFakeClient({ getBranchProtection: () => Promise.resolve(null) }));

    const findings = await adminBypassAllowedCheck.run(context);

    expect(findings).toEqual([]);
  });
});
