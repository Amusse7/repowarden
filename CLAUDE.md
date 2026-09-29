# RepoWarden

A GitHub repository security auditor. Ships as a CLI, an MCP server, and a
GitHub Action, all three built on one shared core library. Phase 1 built the
skeleton; phase 2 added the first real checks (repo-settings).

## Architecture

```
src/core/                Shared library. The only thing CLI/MCP/Action ever import from.
src/checks/               Check implementations, registered in src/checks/index.ts.
src/checks/repo-settings/ Checks that audit repo configuration, not code (branch protection, Actions permissions, etc).
src/cli/                  Commander-based CLI. The only place that reads process.env / .env.
tests/                    Vitest tests, mirroring the src/ layout under tests/checks/.
tests/fixtures/           Fixtures used only in tests: fake checks, a fake GitHubClientLike, a test CheckContext builder.
```

**`src/core` never reads environment variables or `.env` files, and never
imports `dotenv`.** `GitHubClient` takes its token as a constructor argument.
Only `src/cli` (and, later, the MCP server and Action entrypoints) load
`dotenv` / read `process.env` and pass the token in. This keeps core testable
without env mocking and keeps token-sourcing a per-surface concern (a GitHub
Action gets its token from `core.getInput`, not `.env`).

### Finding

A `Finding` (`src/core/types.ts`) is the unit of output from a check: `id`,
`title`, `severity` (`critical|high|medium|low|info`), `category`
(`secrets|dependencies|repo-settings|actions`), `description`, optional
`location` (`{ path, line? }`), `remediation`, optional `cweId`. Validated
with a zod schema.

Finding `id` is **deterministic**, built by `buildFindingId(checkId, location?)`:
- `${checkId}:${path}:${line}` when the location has a line
- `${checkId}:${path}` when the location has only a path
- just `checkId` when there's no location

Never hand-construct a Finding's `id` — always go through `buildFindingId`.
Determinism matters because downstream (later phases: GitHub annotations,
diffing findings across runs) needs stable IDs across repeated audits of the
same repo.

### Check

A `Check` (`src/core/types.ts`) is `{ id, name, category, run(context) }`
where `run` returns `Promise<Finding[]>`. `run` receives a `CheckContext` —
checks depend on `GitHubClientLike` (an interface), never the concrete
`GitHubClient` class or raw Octokit, so they stay mockable in tests without
hitting the network or Octokit's internals.

The real registry is `src/checks/index.ts`. Don't add a "dummy" or example
check there; fixture checks used to exercise the runner in tests live in
`tests/fixtures/checks.ts` instead, so the real registry never carries
test-only code.

**Undetermined state is an error, never a finding.** If a check cannot tell
whether something is safe or not — the API didn't return the data needed to
decide, an endpoint 403'd — it must throw, not return `[]` (which reads as
"checked and clean") and not return a finding (which reads as "checked and
found a problem" when nothing was actually checked). See
`secret-scanning-disabled` for the canonical example: it throws when
`security_and_analysis` is missing (the token lacks admin access) rather than
guessing either way.

### CheckContext and shared data (`src/core/context.ts`)

`createCheckContext(owner, repo, client)` builds the `CheckContext` passed to
every check. Two pieces of data are fetched at most once per audit run and
shared across every check that asks for them, via lazily-resolved, memoized
accessors:

- `context.repoData()` — `GET /repos/{owner}/{repo}` (default branch,
  `private`, `security_and_analysis`, etc.)
- `context.branchProtection()` — the default branch's protection rule.
  **Resolves to `null` on a 404 (no protection rule — a finding), but
  *rejects* on a 403 or any other failure (an error, never a clean/null
  result).** This 404-vs-403 distinction lives in `GitHubClient.getBranchProtection`
  and is covered by `tests/context.test.ts` and `tests/github-client.test.ts`.

Only add a new cached accessor here when the data will genuinely be reused by
**more than one check** — that's the whole reason `repoData`/`branchProtection`
live on the context instead of being called directly. Data used by exactly
one check (vulnerability alerts, workflow permissions, `SECURITY.md`
presence) is fetched directly via `context.client.getX(...)` inside that
check — no caching needed, and it keeps unused data from ever being fetched.

### Runner

`runChecks(checks, context, options?)` (`src/core/runner.ts`) runs every
check in parallel via `Promise.allSettled`, isolating failures:

- A synchronous throw inside `check.run()` is caught (the call is wrapped in
  `Promise.resolve().then(...)` so a sync throw becomes a rejection).
- Each check has a per-check timeout (`options.timeoutMs`, default 60s); a
  timeout is recorded as an error exactly like any other failure, not treated
  specially.
- One check failing never drops the other checks' findings.

Returns `{ findings, errors }` — kept as **separate arrays on purpose**, not
merged into a single list. `findings` are sorted most-severe-first. `errors`
is `{ checkId, checkName, message }[]`, one entry per failed/timed-out check.

**A failed check must never look like a clean result.** Any caller printing a
summary (the CLI today; MCP/Action later) must check `errors.length > 0`
independently of `findings` and surface it distinctly — see the CLI's
`AUDIT INCOMPLETE` behavior below. Don't fold check errors into `findings` as
fake info-severity entries; that would let "0 findings, but 2 checks silently
died" render as a clean audit.

### GitHubClient

Wraps `@octokit/rest` with `@octokit/plugin-throttling` for rate-limit
handling (don't hand-roll retry/backoff logic — use the plugin). Implements
the `GitHubClientLike` interface (`src/core/github-client.ts`) that checks
and `CheckContext` are written against. Translates raw Octokit errors into
clear `GitHubClientError`s via the exported `translateGitHubError` function
(kept as a standalone function, not a private method, so the error-translation
logic is unit-testable without a live Octokit instance):

- 404 → "repo not found or token lacks access" (for `getRepo`)
- 403 with `x-ratelimit-remaining: 0` → rate-limit message with reset time
- 403 otherwise → permission/scope message

The rate-limit-vs-permission-denied distinction is read from the
`x-ratelimit-remaining` response header — both cases arrive as HTTP 403, so
don't collapse them into one generic "forbidden" message.

`getBranchProtection`, `getVulnerabilityAlertsEnabled`, and `getContentExists`
each catch a 404 themselves and return a typed "absent" value (`null` /
`false`) instead of throwing — that 404 is meaningful domain data (no
protection rule, alerts off, file doesn't exist), not a failure. Any other
status, 403 included, still goes through `translateGitHubError` and throws.
**When adding a new `GitHubClientLike` method, keep that split deliberate:**
only catch-and-return-a-value for the specific status code that means
"absent," never for a broad `catch { return false }` that would also swallow
403s and other real failures.

Method types are derived from Octokit's own generated types
(`RestEndpointMethodTypes[...]['response']['data']`, re-exported as
`RepoData` / `BranchProtection` / `WorkflowPermissions`) rather than
hand-rolled — check the installed `@octokit/openapi-types` schema before
assuming a field's shape (e.g. `security_and_analysis` is optional *and*
nullable; `enforce_admins` and `required_pull_request_reviews` both require a
`url` field alongside the fields you actually care about).

## CLI

`repowarden audit <owner/repo>`:
1. Loads `.env` (CLI-only — see above), reads `GITHUB_TOKEN`.
2. Constructs `GitHubClient`, runs the (currently empty) check registry.
3. Prints a summary: if `errors.length > 0`, prints `AUDIT INCOMPLETE` with
   the list of failed checks, *before* the findings summary — the failure
   must be the first thing the user sees, not buried after a findings count.
4. Exit code is non-zero if there are any check errors, **or** any
   critical/high finding. Errors force non-zero even with zero findings.

## Conventions

- ESM throughout (`"type": "module"`). Relative imports use explicit `.js`
  extensions (even though source is `.ts`) — required for `NodeNext` module
  resolution.
- TypeScript strict mode, plus `noUncheckedIndexedAccess`. Don't loosen these
  in `tsconfig.base.json` to work around a type error — fix the underlying
  types instead.
- zod schemas at data boundaries (`Finding`, `Severity`, `Category`, file
  locations) — this is what checks and consumers validate against, not just
  a TS type.
- `npm run typecheck` type-checks `src` **and** `tests` (`tsconfig.json`);
  `npm run build` only emits `src` (`tsconfig.build.json`). Keep test-only
  types out of `src` — if a fixture needs a type, define it in `tests/`.

## Adding a new check

1. Create `src/checks/<category>/<id>.ts` (kebab-case id, matching the file
   name) exporting a single `Check` object. Use an existing repo-settings
   check as a template — e.g. `src/checks/repo-settings/force-push-allowed.ts`
   for one that reads `context.branchProtection()`, or
   `src/checks/repo-settings/vulnerability-alerts-disabled.ts` for one that
   calls `context.client` directly.
2. Pull shared data through `context.repoData()` / `context.branchProtection()`
   rather than calling `context.client` for them directly. If the new check
   needs a new piece of GitHub data:
   - Add the method to `GitHubClientLike` and implement it on `GitHubClient`
     in `src/core/github-client.ts`, deciding deliberately what a 404 means
     (absent value vs. error — see above).
   - Only add a new cached accessor to `src/core/context.ts` if that data will
     be reused by more than one check; otherwise call
     `context.client.getYourNewMethod(...)` directly inside the check.
3. Return `[]` when clean. Return a `Finding[]` (built with `buildFindingId`,
   never a hand-written `id`) when the condition fires. **Throw** — don't
   return `[]` or a finding — when the check cannot actually determine the
   answer (see "Undetermined state is an error" above).
4. Every finding needs a `remediation` that names both the exact GitHub UI
   settings path and the equivalent REST call. Add a `cweId` only when a CWE
   genuinely fits the weakness being flagged — most repo-settings/process
   checks won't have one; don't force it.
5. Register the check in `src/checks/index.ts`.
6. Add `tests/checks/<category>/<id>.test.ts` with at minimum: one case that
   triggers the finding, one clean case, and (if the check reads
   `branchProtection()`) a case confirming it returns `[]` when there's no
   protection rule at all rather than duplicating
   `branch-protection-missing`'s finding. Build fixtures with
   `makeTestContext` / `makeFakeClient` from `tests/fixtures/` — extend those
   fixtures' default "clean repo" shape if the new check needs a field they
   don't yet provide, rather than constructing a client by hand in the test.

## Never commit real secrets

Never commit a real `GITHUB_TOKEN`, PAT, webhook secret, or any other live
credential — including inside test fixtures, example output, or comments.
`.env` is gitignored; only `.env.example` (with an empty value) is committed.

When a check or test needs a secret-shaped string (e.g. testing a
secret-detection check in a later phase), use an obviously-fake value — e.g.
`ghp_FAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKE` — never a real-looking token
copied from a real service, and never a real token even if "it's expired" or
"it's a throwaway account."
