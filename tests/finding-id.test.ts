import { describe, expect, it } from 'vitest';
import { buildFindingId } from '../src/core/types.js';

describe('buildFindingId', () => {
  it('uses just the check ID when there is no location', () => {
    expect(buildFindingId('missing-branch-protection')).toBe('missing-branch-protection');
  });

  it('includes path and line when both are known', () => {
    const id = buildFindingId('hardcoded-secret', { path: 'src/config.ts', line: 42 });
    expect(id).toBe('hardcoded-secret:src/config.ts:42');
  });

  it('includes just the path when no line is known', () => {
    const id = buildFindingId('hardcoded-secret', { path: 'src/config.ts' });
    expect(id).toBe('hardcoded-secret:src/config.ts');
  });

  it('is deterministic across repeated calls with the same inputs', () => {
    const location = { path: 'src/config.ts', line: 42 };
    expect(buildFindingId('hardcoded-secret', location)).toBe(
      buildFindingId('hardcoded-secret', location),
    );
  });
});
