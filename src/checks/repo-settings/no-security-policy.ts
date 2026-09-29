import type { Check, CheckContext, Finding } from '../../core/types.js';
import { buildFindingId } from '../../core/types.js';

const ID = 'no-security-policy';

const CANDIDATE_PATHS = ['SECURITY.md', '.github/SECURITY.md', 'docs/SECURITY.md'];

export const noSecurityPolicyCheck: Check = {
  id: ID,
  name: 'No Security Policy',
  category: 'repo-settings',
  async run(context: CheckContext): Promise<Finding[]> {
    const exists = await Promise.all(
      CANDIDATE_PATHS.map((path) => context.client.getContentExists(context.owner, context.repo, path)),
    );
    if (exists.some(Boolean)) return [];

    return [
      {
        id: buildFindingId(ID),
        title: 'No SECURITY.md policy found',
        severity: 'low',
        category: 'repo-settings',
        description:
          `No SECURITY.md was found at any of the conventional locations (${CANDIDATE_PATHS.join(', ')}), so ` +
          'there is no documented way for someone to responsibly report a vulnerability in this project.',
        remediation:
          'Add a SECURITY.md to the repository root (or .github/, or docs/) describing which versions are ' +
          'supported and how to report a vulnerability. In the GitHub UI: Settings → Security → "Security ' +
          'policy" → "Start setup" generates a template.',
      },
    ];
  },
};
