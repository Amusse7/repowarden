import type { Check, CheckContext, Finding } from '../../core/types.js';
import { buildFindingId } from '../../core/types.js';

const ID = 'no-required-reviews';

export const noRequiredReviewsCheck: Check = {
  id: ID,
  name: 'No Required Reviews',
  category: 'repo-settings',
  async run(context: CheckContext): Promise<Finding[]> {
    const protection = await context.branchProtection();
    if (protection === null) return [];

    const requiredCount = protection.required_pull_request_reviews?.required_approving_review_count ?? 0;
    if (requiredCount > 0) return [];

    const repo = await context.repoData();

    return [
      {
        id: buildFindingId(ID),
        title: 'Branch protection does not require any approving reviews',
        severity: 'high',
        category: 'repo-settings',
        description:
          `The branch protection rule on "${repo.default_branch}" does not require any pull request approvals ` +
          'before merging, so code can reach the default branch unreviewed.',
        remediation:
          `In the GitHub UI: Settings → Branches → edit the rule for "${repo.default_branch}" → enable ` +
          '"Require a pull request before merging" and set "Required number of approvals before merging" to at ' +
          `least 1. Via the API: PATCH /repos/${context.owner}/${context.repo}/branches/${repo.default_branch}/protection ` +
          'with required_pull_request_reviews.required_approving_review_count set to 1 or more.',
      },
    ];
  },
};
