import type { Check, CheckContext, Finding } from './types.js';
import { SEVERITY_WEIGHT } from './types.js';

export interface CheckError {
  checkId: string;
  checkName: string;
  message: string;
}

export interface RunnerResult {
  findings: Finding[];
  errors: CheckError[];
}

export interface RunChecksOptions {
  /** Per-check timeout in milliseconds. A timed-out check is recorded as an error. */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 60_000;

/**
 * Runs all checks in parallel and isolates failures: a check that throws,
 * rejects, or times out is recorded in `errors` and never prevents the other
 * checks' findings from coming back. Findings are sorted most-severe first.
 */
export async function runChecks(
  checks: Check[],
  context: CheckContext,
  options: RunChecksOptions = {},
): Promise<RunnerResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const settled = await Promise.allSettled(
    checks.map((check) => runSingleCheck(check, context, timeoutMs)),
  );

  const findings: Finding[] = [];
  const errors: CheckError[] = [];

  settled.forEach((result, index) => {
    const check = checks[index];
    if (!check) return;

    if (result.status === 'fulfilled') {
      findings.push(...result.value);
    } else {
      errors.push({
        checkId: check.id,
        checkName: check.name,
        message: result.reason instanceof Error ? result.reason.message : String(result.reason),
      });
    }
  });

  findings.sort((a, b) => SEVERITY_WEIGHT[a.severity] - SEVERITY_WEIGHT[b.severity]);

  return { findings, errors };
}

function runSingleCheck(check: Check, context: CheckContext, timeoutMs: number): Promise<Finding[]> {
  // Wrapping the call in Promise.resolve().then(...) ensures a synchronous
  // throw from check.run() becomes a rejection, same as an async failure.
  const runPromise = Promise.resolve().then(() => check.run(context));
  return withTimeout(runPromise, timeoutMs, check.id);
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, checkId: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`Check "${checkId}" timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer));
}
