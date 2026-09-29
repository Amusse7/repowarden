import type { Check, CheckContext, Finding } from '../../src/core/types.js';
import { buildFindingId } from '../../src/core/types.js';

/**
 * The dummy check proving the Check interface end-to-end. Lives here, not in
 * src/checks, since the real registry stays empty until phase 2.
 */
export const dummyCheck: Check = {
  id: 'dummy-check',
  name: 'Dummy Check',
  category: 'repo-settings',
  run: (_context: CheckContext): Promise<Finding[]> => {
    return Promise.resolve([
      {
        id: buildFindingId('dummy-check'),
        title: 'Dummy finding',
        severity: 'info',
        category: 'repo-settings',
        description: 'This finding is produced by the dummy check used in tests.',
        remediation: 'No action needed; this is a fixture.',
      },
    ]);
  },
};

export const findingWithLocationCheck: Check = {
  id: 'location-check',
  name: 'Location Check',
  category: 'secrets',
  run: (_context: CheckContext): Promise<Finding[]> => {
    const location = { path: 'src/config.ts', line: 42 };
    return Promise.resolve([
      {
        id: buildFindingId('location-check', location),
        title: 'Finding with a location',
        severity: 'medium',
        category: 'secrets',
        description: 'This finding has a file location attached.',
        location,
        remediation: 'No action needed; this is a fixture.',
      },
    ]);
  },
};

export const throwingCheck: Check = {
  id: 'throwing-check',
  name: 'Throwing Check',
  category: 'repo-settings',
  run: (_context: CheckContext): Promise<Finding[]> => {
    throw new Error('synchronous failure');
  },
};

export const rejectingCheck: Check = {
  id: 'rejecting-check',
  name: 'Rejecting Check',
  category: 'repo-settings',
  run: async (_context: CheckContext): Promise<Finding[]> => {
    throw new Error('asynchronous failure');
  },
};

export function makeSlowCheck(delayMs: number): Check {
  return {
    id: 'slow-check',
    name: 'Slow Check',
    category: 'repo-settings',
    run: async (_context: CheckContext): Promise<Finding[]> => {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      return [];
    },
  };
}

export function makeSeverityCheck(id: string, severity: Finding['severity']): Check {
  return {
    id,
    name: `Severity Check (${severity})`,
    category: 'repo-settings',
    run: (_context: CheckContext): Promise<Finding[]> => {
      return Promise.resolve([
        {
          id: buildFindingId(id),
          title: `${severity} finding`,
          severity,
          category: 'repo-settings',
          description: 'Fixture finding for severity ordering tests.',
          remediation: 'No action needed; this is a fixture.',
        },
      ]);
    },
  };
}
