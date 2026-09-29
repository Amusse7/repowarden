import { describe, expect, it } from 'vitest';
import { permissiveWorkflowPermissionsCheck } from '../../../src/checks/repo-settings/permissive-workflow-permissions.js';
import { makeTestContext } from '../../fixtures/context.js';
import { makeFakeClient, makeFakeWorkflowPermissions } from '../../fixtures/github-client.js';

describe('permissiveWorkflowPermissionsCheck', () => {
  it('flags a repository whose default GITHUB_TOKEN permission is read-write', async () => {
    const permissions = makeFakeWorkflowPermissions({ default_workflow_permissions: 'write' });
    const context = makeTestContext(makeFakeClient({ getWorkflowPermissions: () => Promise.resolve(permissions) }));

    const findings = await permissiveWorkflowPermissionsCheck.run(context);

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ id: 'permissive-workflow-permissions', severity: 'high', cweId: 'CWE-269' });
  });

  it('is clean when the default GITHUB_TOKEN permission is read-only', async () => {
    const context = makeTestContext(
      makeFakeClient({ getWorkflowPermissions: () => Promise.resolve(makeFakeWorkflowPermissions()) }),
    );

    const findings = await permissiveWorkflowPermissionsCheck.run(context);

    expect(findings).toEqual([]);
  });
});
