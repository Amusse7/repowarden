import type { Check, CheckContext, Finding } from '../../core/types.js';
import { buildFindingId } from '../../core/types.js';

const ID = 'force-push-allowed';

export const forcePushAllowedCheck: Check = {
  id: ID,
  name: 'Force Push Allowed',
  category: 'repo-settings',
  async run(context: CheckContext): Promise<Finding[]> {
    const protection = await context.branchProtection();
    if (protection === null) return [];

    if (protection.allow_force_pushes?.enabled !== true) return [];

    const repo = await context.repoData();

    return [
      {
        id: buildFindingId(ID),
        title: 'Force pushes are allowed on the default branch',
        severity: 'high',
        category: 'repo-settings',
        description:
          `The branch protection rule on "${repo.default_branch}" allows force pushes, so history on the ` +
          'default branch can be rewritten, silently dropping merged commits or altering review-approved code.',
        remediation:
          `In the GitHub UI: Settings → Branches → edit the rule for "${repo.default_branch}" → disable ` +
          `"Allow force pushes". Via the API: PATCH /repos/${context.owner}/${context.repo}/branches/` +
          `${repo.default_branch}/protection with allow_force_pushes set to false.`,
      },
    ];
  },
};
