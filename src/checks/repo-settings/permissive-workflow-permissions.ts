import type { Check, CheckContext, Finding } from '../../core/types.js';
import { buildFindingId } from '../../core/types.js';

const ID = 'permissive-workflow-permissions';

export const permissiveWorkflowPermissionsCheck: Check = {
  id: ID,
  name: 'Permissive Workflow Permissions',
  category: 'repo-settings',
  async run(context: CheckContext): Promise<Finding[]> {
    const permissions = await context.client.getWorkflowPermissions(context.owner, context.repo);
    if (permissions.default_workflow_permissions !== 'write') return [];

    return [
      {
        id: buildFindingId(ID),
        title: 'Default GITHUB_TOKEN permission is read-write',
        severity: 'high',
        category: 'repo-settings',
        description:
          'The default permissions granted to GITHUB_TOKEN for Actions workflows in this repository are ' +
          'read-write. Any workflow — including one triggered by an untrusted pull request — gets write access ' +
          'to repository contents, packages, and other scopes by default.',
        remediation:
          'In the GitHub UI: Settings → Actions → General → Workflow permissions → select "Read repository ' +
          'contents permission" and grant write access explicitly per-workflow where needed via the ' +
          `"permissions:" key. Via the API: PUT /repos/${context.owner}/${context.repo}/actions/permissions/workflow ` +
          'with default_workflow_permissions set to "read".',
        cweId: 'CWE-269',
      },
    ];
  },
};
