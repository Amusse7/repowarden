import type { Command } from 'commander';
import dotenv from 'dotenv';
import { checks } from '../../checks/index.js';
import { createCheckContext } from '../../core/context.js';
import { GitHubClient, GitHubClientError } from '../../core/github-client.js';
import { runChecks } from '../../core/runner.js';
import type { CheckError, RunnerResult } from '../../core/runner.js';
import { SEVERITY_WEIGHT } from '../../core/types.js';
import type { Finding, Severity } from '../../core/types.js';

interface AuditCommandOptions {
  verbose?: boolean;
}

export function registerAuditCommand(program: Command): void {
  program
    .command('audit')
    .argument('<owner/repo>', 'GitHub repository to audit, e.g. octocat/hello-world')
    .option('--verbose', 'print Octokit warning/error log output to stderr (silenced by default)')
    .description('Run security checks against a GitHub repository')
    .action(async (ownerRepo: string, options: AuditCommandOptions) => {
      // Only the CLI loads .env / reads process.env. Core never touches either.
      dotenv.config();

      const parsed = parseOwnerRepo(ownerRepo);
      if (!parsed) {
        console.error(`Invalid repository "${ownerRepo}". Expected format: owner/repo`);
        process.exitCode = 1;
        return;
      }

      const token = process.env['GITHUB_TOKEN'];
      if (!token) {
        console.error('GITHUB_TOKEN is not set. Add it to your environment or a .env file (see .env.example).');
        process.exitCode = 1;
        return;
      }

      const { owner, repo } = parsed;
      const client = new GitHubClient(token, { verbose: options.verbose ?? false });
      const context = createCheckContext(owner, repo, client);

      try {
        const result = await runChecks(checks, context);
        printSummary(owner, repo, result);
        process.exitCode = determineExitCode(result);
      } catch (err) {
        const message = err instanceof GitHubClientError ? err.message : String(err);
        console.error(`Audit failed: ${message}`);
        process.exitCode = 1;
      }
    });
}

function parseOwnerRepo(input: string): { owner: string; repo: string } | undefined {
  const parts = input.split('/');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return undefined;
  return { owner: parts[0], repo: parts[1] };
}

/** A failed check must never look like a clean result: any error forces a non-zero exit. */
function determineExitCode(result: RunnerResult): number {
  if (result.errors.length > 0) return 1;
  if (result.findings.some((f) => f.severity === 'critical' || f.severity === 'high')) return 1;
  return 0;
}

function printSummary(owner: string, repo: string, result: RunnerResult): void {
  console.log(`\nRepoWarden audit: ${owner}/${repo}`);
  console.log('='.repeat(40));

  if (result.errors.length > 0) {
    console.log('\nAUDIT INCOMPLETE — the following checks failed to run:');
    for (const line of formatFailedChecks(result.errors)) {
      console.log(line);
    }
  }

  console.log('\nFindings by severity:');
  const counts = countBySeverity(result.findings);
  for (const severity of Object.keys(SEVERITY_WEIGHT) as Severity[]) {
    console.log(`  ${severity.padEnd(8)}: ${counts[severity]}`);
  }

  if (result.findings.length === 0 && result.errors.length === 0) {
    console.log('\nNo findings. Repository looks clean for the checks that ran.');
  }

  for (const finding of result.findings) {
    printFinding(finding);
  }

  console.log('');
}

/**
 * Errors sharing the same requiredPermission (e.g. several checks all 403'd
 * on branch protection because the token lacks admin access) are grouped
 * into one summary line instead of repeating the same message per check.
 * Errors without a requiredPermission — genuinely distinct failures — still
 * list individually. Returns plain lines (no console side effect) so the
 * grouping logic itself is unit-testable.
 */
export function formatFailedChecks(errors: CheckError[]): string[] {
  const permissionGroups = new Map<string, CheckError[]>();
  const individual: CheckError[] = [];

  for (const e of errors) {
    if (e.requiredPermission) {
      const group = permissionGroups.get(e.requiredPermission) ?? [];
      group.push(e);
      permissionGroups.set(e.requiredPermission, group);
    } else {
      individual.push(e);
    }
  }

  const lines: string[] = [];

  for (const [permission, group] of permissionGroups) {
    const checkWord = group.length === 1 ? 'check requires' : 'checks require';
    lines.push(`  - ${group.length} ${checkWord} admin access to this repository (${permission})`);
  }

  for (const e of individual) {
    lines.push(`  - ${e.checkName} (${e.checkId}): ${e.message}`);
  }

  return lines;
}

function printFinding(finding: Finding): void {
  console.log(`\n[${finding.severity.toUpperCase()}] ${finding.title}`);
  console.log(`  ${finding.description}`);
  if (finding.location) {
    const line = finding.location.line !== undefined ? `:${finding.location.line}` : '';
    console.log(`  Location: ${finding.location.path}${line}`);
  }
  console.log(`  Remediation: ${finding.remediation}`);
}

function countBySeverity(findings: Finding[]): Record<Severity, number> {
  const counts: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const f of findings) counts[f.severity]++;
  return counts;
}
