import { describe, expect, it } from 'vitest';
import { secretScanningDisabledCheck } from '../../../src/checks/repo-settings/secret-scanning-disabled.js';
import { makeTestContext } from '../../fixtures/context.js';
import { makeFakeClient, makeFakeRepoData } from '../../fixtures/github-client.js';

describe('secretScanningDisabledCheck', () => {
  it('flags a repository with secret scanning disabled', async () => {
    const repo = makeFakeRepoData({
      security_and_analysis: {
        secret_scanning: { status: 'disabled' },
        secret_scanning_push_protection: { status: 'disabled' },
      },
    });
    const context = makeTestContext(makeFakeClient({ getRepo: () => Promise.resolve(repo) }));

    const findings = await secretScanningDisabledCheck.run(context);

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ id: 'secret-scanning-disabled', severity: 'medium' });
    expect(findings[0]?.cweId).toBeUndefined();
  });

  it('notes the GitHub Advanced Security prerequisite when the repo is private', async () => {
    const repo = makeFakeRepoData({
      private: true,
      security_and_analysis: {
        secret_scanning: { status: 'disabled' },
        secret_scanning_push_protection: { status: 'disabled' },
      },
    });
    const context = makeTestContext(makeFakeClient({ getRepo: () => Promise.resolve(repo) }));

    const findings = await secretScanningDisabledCheck.run(context);

    expect(findings[0]?.description).toMatch(/Advanced Security/);
  });

  it('is clean when both secret scanning and push protection are enabled', async () => {
    const context = makeTestContext(makeFakeClient({ getRepo: () => Promise.resolve(makeFakeRepoData()) }));

    const findings = await secretScanningDisabledCheck.run(context);

    expect(findings).toEqual([]);
  });

  it('throws instead of returning a finding when security_and_analysis is undefined (token lacks admin)', async () => {
    const repo = makeFakeRepoData({ security_and_analysis: undefined });
    const context = makeTestContext(makeFakeClient({ getRepo: () => Promise.resolve(repo) }));

    await expect(secretScanningDisabledCheck.run(context)).rejects.toThrow(/security_and_analysis/);
  });

  it('throws instead of returning a finding when security_and_analysis is null', async () => {
    const repo = makeFakeRepoData({ security_and_analysis: null });
    const context = makeTestContext(makeFakeClient({ getRepo: () => Promise.resolve(repo) }));

    await expect(secretScanningDisabledCheck.run(context)).rejects.toThrow(/security_and_analysis/);
  });
});
