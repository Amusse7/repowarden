import type { Check, CheckContext, Finding } from '../../core/types.js';
import { buildFindingId } from '../../core/types.js';

const ID = 'stale-reviews-not-dismissed';

export const staleReviewsNotDismissedCheck: Check = {
  id: ID,
  name: 'Stale Reviews Not Dismissed',
  category: 'repo-settings',
  async run(context: CheckContext): Promise<Finding[]> {
    const protection = await context.branchProtection();
    if (protection === null) return [];

    const requiredCount = protection.required_pull_request_reviews?.required_approving_review_count ?? 0;
    if (requiredCount === 0) return [];

    if (protection.required_pull_request_reviews?.dismiss_stale_reviews === true) return [];

    const repo = await context.repoData();

    return [
      {
        id: buildFindingId(ID),
        title: 'Approved reviews are not dismissed when new commits are pushed',
        severity: 'low',
        category: 'repo-settings',
        description:
          `The branch protection rule on "${repo.default_branch}" requires approving reviews, but does not ` +
          'dismiss them when new commits are pushed. An approval given on an earlier version of a pull request ' +
          'still counts after the code has changed.',
        remediation:
          `In the GitHub UI: Settings → Branches → edit the rule for "${repo.default_branch}" → enable ` +
          `"Dismiss stale pull request approvals when new commits are pushed". Via the API: PATCH ` +
          `/repos/${context.owner}/${context.repo}/branches/${repo.default_branch}/protection with ` +
          'required_pull_request_reviews.dismiss_stale_reviews set to true.',
      },
    ];
  },
};
