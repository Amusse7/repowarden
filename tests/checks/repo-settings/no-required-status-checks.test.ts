import { describe, expect, it } from 'vitest';
import { noRequiredStatusChecksCheck } from '../../../src/checks/repo-settings/no-required-status-checks.js';
import { makeTestContext } from '../../fixtures/context.js';
import { makeFakeBranchProtection, makeFakeClient } from '../../fixtures/github-client.js';

describe('noRequiredStatusChecksCheck', () => {
  it('flags protection with no required status checks', async () => {
    const protection = makeFakeBranchProtection({ required_status_checks: undefined });
    const context = makeTestContext(makeFakeClient({ getBranchProtection: () => Promise.resolve(protection) }));

    const findings = await noRequiredStatusChecksCheck.run(context);

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ id: 'no-required-status-checks', severity: 'medium' });
  });

  it('flags protection whose required_status_checks lists no contexts or checks', async () => {
    const protection = makeFakeBranchProtection({
      required_status_checks: { strict: true, contexts: [], checks: [] },
    });
    const context = makeTestContext(makeFakeClient({ getBranchProtection: () => Promise.resolve(protection) }));

    const findings = await noRequiredStatusChecksCheck.run(context);

    expect(findings).toHaveLength(1);
  });

  it('is clean when at least one status check is required', async () => {
    const context = makeTestContext(
      makeFakeClient({ getBranchProtection: () => Promise.resolve(makeFakeBranchProtection()) }),
    );

    const findings = await noRequiredStatusChecksCheck.run(context);

    expect(findings).toEqual([]);
  });

  it('is clean (skips) when there is no protection rule at all', async () => {
    const context = makeTestContext(makeFakeClient({ getBranchProtection: () => Promise.resolve(null) }));

    const findings = await noRequiredStatusChecksCheck.run(context);

    expect(findings).toEqual([]);
  });
});
