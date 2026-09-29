import type { Check } from '../core/types.js';

/**
 * The real check registry. Empty in phase 1 — no checks have been built yet.
 * Checks used for testing the runner live under tests/fixtures, not here.
 */
export const checks: Check[] = [];
