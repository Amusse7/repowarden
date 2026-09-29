import { describe, expect, it } from 'vitest';
import { dummyCheck, findingWithLocationCheck } from './fixtures/checks.js';
import { makeTestContext } from './fixtures/context.js';

const context = makeTestContext();

describe('dummyCheck fixture', () => {
  it('conforms to the Check interface and returns a well-formed Finding', async () => {
    const findings = await dummyCheck.run(context);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      id: 'dummy-check',
      severity: 'info',
      category: 'repo-settings',
    });
  });
});

describe('findingWithLocationCheck fixture', () => {
  it('produces a Finding whose id encodes the location', async () => {
    const findings = await findingWithLocationCheck.run(context);
    expect(findings[0]?.id).toBe('location-check:src/config.ts:42');
  });
});
