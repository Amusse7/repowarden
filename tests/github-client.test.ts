import { describe, expect, it } from 'vitest';
import { GitHubClient, GitHubClientError, translateGitHubError } from '../src/core/github-client.js';

describe('GitHubClient constructor', () => {
  it('throws when constructed without a token', () => {
    expect(() => new GitHubClient('')).toThrow(GitHubClientError);
  });

  it('never reads GITHUB_TOKEN from the environment itself', () => {
    const original = process.env['GITHUB_TOKEN'];
    delete process.env['GITHUB_TOKEN'];
    try {
      expect(() => new GitHubClient('explicit-token')).not.toThrow();
    } finally {
      if (original !== undefined) process.env['GITHUB_TOKEN'] = original;
    }
  });
});

describe('translateGitHubError', () => {
  it('produces a clear message for a 404', () => {
    const err = { status: 404 };
    const translated = translateGitHubError(err, 'octocat', 'missing-repo');
    expect(translated).toBeInstanceOf(GitHubClientError);
    expect(translated.message).toMatch(/not found/i);
  });

  it('distinguishes a 403 rate-limit exhaustion from a permission error', () => {
    const rateLimited = {
      status: 403,
      response: { headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1700000000' } },
    };
    const translated = translateGitHubError(rateLimited, 'octocat', 'hello-world');
    expect(translated.message).toMatch(/rate limit exceeded/i);
  });

  it('treats a 403 with remaining rate-limit quota as a permission error', () => {
    const permissionDenied = {
      status: 403,
      response: { headers: { 'x-ratelimit-remaining': '42' } },
    };
    const translated = translateGitHubError(permissionDenied, 'octocat', 'hello-world');
    expect(translated.message).toMatch(/forbidden/i);
    expect(translated.message).not.toMatch(/rate limit/i);
  });

  it('treats a 403 with no rate-limit headers at all as a permission error', () => {
    const permissionDenied = { status: 403 };
    const translated = translateGitHubError(permissionDenied, 'octocat', 'hello-world');
    expect(translated.message).toMatch(/forbidden/i);
  });

  it('passes through non-Octokit errors unchanged', () => {
    const original = new Error('network exploded');
    expect(translateGitHubError(original, 'octocat', 'hello-world')).toBe(original);
  });
});
