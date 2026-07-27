# Feature List: Authenticated Testing Harness

_Status: Shipped - 2026-07-27 (isolated authenticated Playwright harness and unified test gate shipped)_

## Goal

Make authenticated browser checks repeatable without touching production authentication, real household
data, or paid providers. Contributors should have one full verification command and focused unit/E2E
commands when they only need one layer.

## Scope and risk

Risk: R1. This is test infrastructure only. Production auth code, database schema, migrations, and runtime
credentials remain unchanged.

- Add an isolated Playwright server and SQLite database under ignored `.test-data/`.
- Seed two deterministic test-only users through the existing `HOUSEHOLD_USERS` contract.
- Authenticate through the real login form and reuse ignored browser storage state.
- Keep the primary account as the default E2E project; make the secondary account explicit.
- Add login-boundary and authenticated-shell smoke coverage.
- Make `npm test` the complete local gate while retaining focused test commands.
- Document setup and command ownership in `AGENTS.md` and `README.md`.

## Safety invariants

- The E2E server binds to `localhost` on a strict dedicated port and never reuses another process.
- Every test path resolves beneath `.test-data/e2e/`, which is recreated for each server start.
- Browser state files are ignored because they contain live test session cookies.
- Test credentials are fixed non-secrets and are only passed to the isolated server.
- Browser smoke tests do not call OpenRouter or Albert Heijn.

## Acceptance

- `npm run test:e2e` proves the login redirect, invalid-login response, and authenticated primary account.
- `npm run test:e2e:secondary` runs the same authenticated smoke coverage as the secondary account.
- `npm test` passes Svelte diagnostics, unit tests, the production build, and primary E2E coverage.
- `git diff --check` passes and no generated test state is tracked.

## Resume pack

Current state: complete. The isolated primary and secondary accounts authenticate through the production
login path, storage state remains ignored, and the complete gate is available as `npm test`.

Independent review corrections adopted: use `localhost` for Secure cookies, align cleanup and database
paths, forbid existing-server reuse, use a strict port, verify the stored `session_id`, and keep secondary
account execution explicit.

Verification: `npm test` passed with 0 Svelte diagnostics, 73 Vitest files / 445 tests, 4 primary
Playwright tests, and the production build. `npm run test:e2e:secondary` passed all 4 secondary-account
tests. The simplification pass disabled `.env` loading and its targeted Playwright rerun passed.
