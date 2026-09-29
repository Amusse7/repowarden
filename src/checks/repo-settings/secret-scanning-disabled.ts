import { ADMINISTRATION_READ_PERMISSION, PermissionError } from '../../core/github-client.js';
import type { Check, CheckContext, Finding } from '../../core/types.js';
import { buildFindingId } from '../../core/types.js';

const ID = 'secret-scanning-disabled';

export const secretScanningDisabledCheck: Check = {
  id: ID,
  name: 'Secret Scanning Disabled',
  category: 'repo-settings',
  async run(context: CheckContext): Promise<Finding[]> {
    const repo = await context.repoData();
    const securityAndAnalysis = repo.security_and_analysis;

    // GitHub omits this field entirely when the token lacks admin access to
    // the repo. That's an undetermined state, not a clean result — surface it
    // as an error rather than silently reporting "secret scanning is fine".
    if (securityAndAnalysis === undefined || securityAndAnalysis === null) {
      throw new PermissionError(
        `Cannot determine secret scanning status for ${context.owner}/${context.repo}: the GitHub API did not ` +
          'return security_and_analysis data. This usually means the token lacks admin access to the repository.',
        ADMINISTRATION_READ_PERMISSION,
      );
    }

    const scanningOff = securityAndAnalysis.secret_scanning?.status !== 'enabled';
    const pushProtectionOff = securityAndAnalysis.secret_scanning_push_protection?.status !== 'enabled';
    if (!scanningOff && !pushProtectionOff) return [];

    const off: string[] = [];
    if (scanningOff) off.push('secret scanning');
    if (pushProtectionOff) off.push('push protection');

    let description = `${capitalize(off.join(' and '))} ${off.length > 1 ? 'are' : 'is'} disabled for this repository.`;
    if (repo.private) {
      description +=
        ' This repository is private, so GitHub Advanced Security must also be enabled for the organization ' +
        'before secret scanning can be turned on.';
    }

    return [
      {
        id: buildFindingId(ID),
        title: `Secret scanning ${off.length > 1 ? 'features are' : 'is'} disabled`,
        severity: 'medium',
        category: 'repo-settings',
        description,
        remediation:
          'In the GitHub UI: Settings → Code security → enable "Secret scanning" and "Push protection". Via the ' +
          `API: PATCH /repos/${context.owner}/${context.repo} with security_and_analysis.secret_scanning.status ` +
          'and security_and_analysis.secret_scanning_push_protection.status set to "enabled".' +
          (repo.private ? ' Private repositories additionally require GitHub Advanced Security to be enabled.' : ''),
      },
    ];
  },
};

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
