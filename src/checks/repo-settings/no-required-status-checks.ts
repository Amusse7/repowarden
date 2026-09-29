import type { Check, CheckContext, Finding } from '../../core/types.js';
import { buildFindingId } from '../../core/types.js';

const ID = 'no-required-status-checks';

export const noRequiredStatusChecksCheck: Check = {
  id: ID,
  name: 'No Required Status Checks',
  category: 'repo-settings',
  async run(context: CheckContext): Promise<Finding[]> {
    const protection = await context.branchProtection();
    if (protection === null) return [];

    const statusChecks = protection.required_status_checks;
    const hasRequiredChecks =
      statusChecks !== undefined && (statusChecks.contexts.length > 0 || statusChecks.checks.length > 0);
    if (hasRequiredChecks) return [];

    const repo = await context.repoData();

    return [
      {
        id: buildFindingId(ID),
        title: 'No status checks are required to pass before merging',
        severity: 'medium',
        category: 'repo-settings',
        description:
          `The branch protection rule on "${repo.default_branch}" does not require any status checks (CI, ` +
          'linting, tests) to pass before a pull request can be merged.',
        remediation:
          `In the GitHub UI: Settings → Branches → edit the rule for "${repo.default_branch}" → enable ` +
          '"Require status checks to pass before merging" and select the checks that must pass. Via the API: ' +
          `PATCH /repos/${context.owner}/${context.repo}/branches/${repo.default_branch}/protection with ` +
          'required_status_checks.contexts (or the newer required_status_checks.checks) listing the required checks.',
      },
    ];
  },
};
