import type { Check, CheckContext, Finding } from '../../core/types.js';
import { buildFindingId } from '../../core/types.js';

const ID = 'admin-bypass-allowed';

export const adminBypassAllowedCheck: Check = {
  id: ID,
  name: 'Admin Bypass Allowed',
  category: 'repo-settings',
  async run(context: CheckContext): Promise<Finding[]> {
    const protection = await context.branchProtection();
    if (protection === null) return [];

    if (protection.enforce_admins?.enabled === true) return [];

    const repo = await context.repoData();

    return [
      {
        id: buildFindingId(ID),
        title: 'Branch protection does not apply to administrators',
        severity: 'high',
        category: 'repo-settings',
        description:
          `The branch protection rule on "${repo.default_branch}" is not enforced for repository administrators, ` +
          'so any admin account can bypass required reviews and status checks and push directly.',
        remediation:
          `In the GitHub UI: Settings → Branches → edit the rule for "${repo.default_branch}" → enable ` +
          '"Do not allow bypassing the above settings" (also shown as "Include administrators"). ' +
          `Via the API: POST /repos/${context.owner}/${context.repo}/branches/${repo.default_branch}/protection/enforce_admins.`,
      },
    ];
  },
};
