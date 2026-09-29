import { describe, expect, it } from 'vitest';
import { formatFailedChecks } from '../../src/cli/commands/audit.js';
import type { CheckError } from '../../src/core/runner.js';

function makeError(overrides: Partial<CheckError> = {}): CheckError {
  return { checkId: 'some-check', checkName: 'Some Check', message: 'it broke', ...overrides };
}

describe('formatFailedChecks', () => {
  it('lists a single non-permission error individually', () => {
    const lines = formatFailedChecks([makeError({ checkId: 'x', checkName: 'X Check', message: 'boom' })]);

    expect(lines).toEqual(['  - X Check (x): boom']);
  });

  it('groups several errors sharing the same requiredPermission into one line', () => {
    const errors: CheckError[] = [
      makeError({ checkId: 'a', checkName: 'A', requiredPermission: 'Administration: read' }),
      makeError({ checkId: 'b', checkName: 'B', requiredPermission: 'Administration: read' }),
      makeError({ checkId: 'c', checkName: 'C', requiredPermission: 'Administration: read' }),
      makeError({ checkId: 'd', checkName: 'D', requiredPermission: 'Administration: read' }),
      makeError({ checkId: 'e', checkName: 'E', requiredPermission: 'Administration: read' }),
      makeError({ checkId: 'f', checkName: 'F', requiredPermission: 'Administration: read' }),
    ];

    const lines = formatFailedChecks(errors);

    expect(lines).toEqual(['  - 6 checks require admin access to this repository (Administration: read)']);
  });

  it('uses singular grammar for a group of exactly one', () => {
    const lines = formatFailedChecks([makeError({ requiredPermission: 'Administration: read' })]);

    expect(lines).toEqual(['  - 1 check requires admin access to this repository (Administration: read)']);
  });

  it('keeps distinct permission groups separate and lists non-permission errors individually alongside them', () => {
    const errors: CheckError[] = [
      makeError({ checkId: 'a', checkName: 'A', requiredPermission: 'Administration: read' }),
      makeError({ checkId: 'b', checkName: 'B', requiredPermission: 'Administration: read' }),
      makeError({ checkId: 'c', checkName: 'C', requiredPermission: 'Actions: write' }),
      makeError({ checkId: 'd', checkName: 'D Check', message: 'timed out after 60000ms' }),
    ];

    const lines = formatFailedChecks(errors);

    expect(lines).toContain('  - 2 checks require admin access to this repository (Administration: read)');
    expect(lines).toContain('  - 1 check requires admin access to this repository (Actions: write)');
    expect(lines).toContain('  - D Check (d): timed out after 60000ms');
    expect(lines).toHaveLength(3);
  });
});
