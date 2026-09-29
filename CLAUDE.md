# RepoWarden

A GitHub repository security auditor. Ships as a CLI, an MCP server, and a
GitHub Action, all three built on one shared core library. This is phase 1:
the skeleton, with zero real checks yet.

## Architecture

```
src/core/     Shared library. The only thing CLI/MCP/Action ever import from.
src/checks/   Check implementations, registered in src/checks/index.ts.
src/cli/      Commander-based CLI. The only place that reads process.env / .env.
tests/        Vitest tests, plus tests/fixtures for check fixtures used only in tests.
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
where `run` returns `Promise<Finding[]>`. `run` receives a `CheckContext`
(`{ owner, repo, client }`) — checks depend on `GitHubClient`, never on raw
Octokit, so they stay mockable in tests without hitting the network.

The real registry is `src/checks/index.ts`, currently an **empty array** —
no checks exist yet. Don't add a "dummy" or example check there; fixture
checks used to exercise the runner in tests live in `tests/fixtures/checks.ts`
instead, so the real registry never carries test-only code.

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
handling (don't hand-roll retry/backoff logic — use the plugin). Translates
raw Octokit errors into clear `GitHubClientError`s via the exported
`translateGitHubError` function (kept as a standalone function, not a private
method, so the error-translation logic is unit-testable without a live
Octokit instance):

- 404 → "repo not found or token lacks access"
- 403 with `x-ratelimit-remaining: 0` → rate-limit message with reset time
- 403 otherwise → permission/scope message

The rate-limit-vs-permission-denied distinction is read from the
`x-ratelimit-remaining` response header — both cases arrive as HTTP 403, so
don't collapse them into one generic "forbidden" message.

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

## Never commit real secrets

Never commit a real `GITHUB_TOKEN`, PAT, webhook secret, or any other live
credential — including inside test fixtures, example output, or comments.
`.env` is gitignored; only `.env.example` (with an empty value) is committed.

When a check or test needs a secret-shaped string (e.g. testing a
secret-detection check in a later phase), use an obviously-fake value — e.g.
`ghp_FAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKE` — never a real-looking token
copied from a real service, and never a real token even if "it's expired" or
"it's a throwaway account."
