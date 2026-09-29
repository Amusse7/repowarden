import type { Check, CheckContext, Finding } from '../../core/types.js';
import { buildFindingId } from '../../core/types.js';

const ID = 'branch-protection-missing';

export const branchProtectionMissingCheck: Check = {
  id: ID,
  name: 'Branch Protection Missing',
  category: 'repo-settings',
  async run(context: CheckContext): Promise<Finding[]> {
    const protection = await context.branchProtection();
    if (protection !== null) return [];

    const repo = await context.repoData();

    return [
      {
        id: buildFindingId(ID),
        title: 'Default branch has no branch protection rule',
        severity: 'high',
        category: 'repo-settings',
        description:
          `The default branch "${repo.default_branch}" has no branch protection rule at all. ` +
          'Anyone with push access can force-push, delete the branch, or merge without review.',
        remediation:
          `In the GitHub UI: Settings → Branches → Add branch protection rule, set the branch name pattern to ` +
          `"${repo.default_branch}", and enable at least "Require a pull request before merging". ` +
          `Via the API: PUT /repos/${context.owner}/${context.repo}/branches/${repo.default_branch}/protection ` +
          'with a body defining the required checks and review rules.',
      },
    ];
  },
};
