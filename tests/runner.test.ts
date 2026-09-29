import { describe, expect, it } from 'vitest';
import { runChecks } from '../src/core/runner.js';
import { GitHubClient } from '../src/core/github-client.js';
import type { CheckContext } from '../src/core/types.js';
import {
  dummyCheck,
  makeSeverityCheck,
  makeSlowCheck,
  rejectingCheck,
  throwingCheck,
} from './fixtures/checks.js';

const context: CheckContext = {
  owner: 'octocat',
  repo: 'hello-world',
  client: new GitHubClient('fake-token-for-tests'),
};

describe('runChecks', () => {
  it('returns empty results for an empty check list', async () => {
    const result = await runChecks([], context);
    expect(result.findings).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  it('runs a check and returns its findings', async () => {
    const result = await runChecks([dummyCheck], context);
    expect(result.errors).toEqual([]);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.title).toBe('Dummy finding');
  });

  it('isolates a synchronous throw: other checks still complete', async () => {
    const result = await runChecks([throwingCheck, dummyCheck], context);

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.title).toBe('Dummy finding');

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({
      checkId: 'throwing-check',
      checkName: 'Throwing Check',
      message: 'synchronous failure',
    });
  });

  it('isolates an async rejection: other checks still complete', async () => {
    const result = await runChecks([rejectingCheck, dummyCheck], context);

    expect(result.findings).toHaveLength(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({
      checkId: 'rejecting-check',
      checkName: 'Rejecting Check',
      message: 'asynchronous failure',
    });
  });

  it('records a timed-out check as an error without failing the rest', async () => {
    const slow = makeSlowCheck(50);
    const result = await runChecks([slow, dummyCheck], context, { timeoutMs: 10 });

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.title).toBe('Dummy finding');

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.checkId).toBe('slow-check');
    expect(result.errors[0]?.message).toMatch(/timed out after 10ms/);
  });

  it('sorts findings by severity, most severe first', async () => {
    const checks = [
      makeSeverityCheck('c-low', 'low'),
      makeSeverityCheck('c-critical', 'critical'),
      makeSeverityCheck('c-info', 'info'),
      makeSeverityCheck('c-high', 'high'),
      makeSeverityCheck('c-medium', 'medium'),
    ];

    const result = await runChecks(checks, context);

    expect(result.findings.map((f) => f.severity)).toEqual([
      'critical',
      'high',
      'medium',
      'low',
      'info',
    ]);
  });
});
