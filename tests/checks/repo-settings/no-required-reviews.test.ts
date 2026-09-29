import { describe, expect, it } from 'vitest';
import { noRequiredReviewsCheck } from '../../../src/checks/repo-settings/no-required-reviews.js';
import { makeTestContext } from '../../fixtures/context.js';
import { makeFakeBranchProtection, makeFakeClient } from '../../fixtures/github-client.js';

describe('noRequiredReviewsCheck', () => {
  it('flags protection that requires zero approving reviews', async () => {
    const protection = makeFakeBranchProtection({
      required_pull_request_reviews: {
        required_approving_review_count: 0,
        dismiss_stale_reviews: true,
        require_code_owner_reviews: false,
      },
    });
    const context = makeTestContext(makeFakeClient({ getBranchProtection: () => Promise.resolve(protection) }));

    const findings = await noRequiredReviewsCheck.run(context);

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ id: 'no-required-reviews', severity: 'high' });
  });

  it('is clean when at least one approving review is required', async () => {
    const context = makeTestContext(
      makeFakeClient({ getBranchProtection: () => Promise.resolve(makeFakeBranchProtection()) }),
    );

    const findings = await noRequiredReviewsCheck.run(context);

    expect(findings).toEqual([]);
  });

  it('is clean (skips) when there is no protection rule at all', async () => {
    const context = makeTestContext(makeFakeClient({ getBranchProtection: () => Promise.resolve(null) }));

    const findings = await noRequiredReviewsCheck.run(context);

    expect(findings).toEqual([]);
  });
});
