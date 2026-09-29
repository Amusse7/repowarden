import { describe, expect, it } from 'vitest';
import { staleReviewsNotDismissedCheck } from '../../../src/checks/repo-settings/stale-reviews-not-dismissed.js';
import { makeTestContext } from '../../fixtures/context.js';
import { makeFakeBranchProtection, makeFakeClient } from '../../fixtures/github-client.js';

describe('staleReviewsNotDismissedCheck', () => {
  it('flags required reviews that are not dismissed on new commits', async () => {
    const protection = makeFakeBranchProtection({
      required_pull_request_reviews: {
        required_approving_review_count: 1,
        dismiss_stale_reviews: false,
        require_code_owner_reviews: false,
      },
    });
    const context = makeTestContext(makeFakeClient({ getBranchProtection: () => Promise.resolve(protection) }));

    const findings = await staleReviewsNotDismissedCheck.run(context);

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ id: 'stale-reviews-not-dismissed', severity: 'low' });
  });

  it('is clean when stale reviews are dismissed', async () => {
    const context = makeTestContext(
      makeFakeClient({ getBranchProtection: () => Promise.resolve(makeFakeBranchProtection()) }),
    );

    const findings = await staleReviewsNotDismissedCheck.run(context);

    expect(findings).toEqual([]);
  });

  it('is clean when no reviews are required at all (covered by no-required-reviews instead)', async () => {
    const protection = makeFakeBranchProtection({
      required_pull_request_reviews: {
        required_approving_review_count: 0,
        dismiss_stale_reviews: false,
        require_code_owner_reviews: false,
      },
    });
    const context = makeTestContext(makeFakeClient({ getBranchProtection: () => Promise.resolve(protection) }));

    const findings = await staleReviewsNotDismissedCheck.run(context);

    expect(findings).toEqual([]);
  });

  it('is clean (skips) when there is no protection rule at all', async () => {
    const context = makeTestContext(makeFakeClient({ getBranchProtection: () => Promise.resolve(null) }));

    const findings = await staleReviewsNotDismissedCheck.run(context);

    expect(findings).toEqual([]);
  });
});
