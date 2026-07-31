# Feature List: Shopping Source Controller Refactor

_Status: Shipped - 2026-07-31 (one Shopping controller owns source mutation, motion, focus, and Undo)_

## Problem framing

`ShoppingLists.svelte` delegates bought/manual-row behavior to the per-instance
`ShoppingListController`, but still owns the complete recipe-source mutation lifecycle itself:
source and recipe pending registries, no-op guards, stale/failure feedback, success feedback,
focus restoration, regroup timing, `Not this run` disclosure state, and Undo resolution.

That split gives one rendered source row two behavioral owners. It also exposes a transition race:
the isolated Shopping browser journey can receive a successful source mutation and immediately see
two matching controls while the old keyed row is still leaving and the reconciled row is already
present. The current end-to-end test fails on that ambiguity even though the controller unit suite
passes (8/8). The failed 1280 px fixture retained no household content and made no AH request.

The refactor should make the existing list controller the single owner of source-choice state and
hold its per-source/per-recipe lock until any regroup motion has settled. The component should be
left with DOM focus primitives, message wiring, and rendering only.

### Behavior invariants

- A no-op term or need choice sends no request and produces no notification.
- At most one mutation runs for a `sourceKey`; need writes also block sibling controls for the same
  recipe until reconciliation settles.
- A saved term change may split or merge an aggregate row; focus lands on the surviving
  source-keyed control only after the keyed transition settles.
- A need change crossing the `required` boundary moves the source between the active ledger and
  `Not this run`, announces the destination, restores focus, and offers one Undo.
- Undo resolves the current source by `sourceKey`; it never replays a stale revision captured
  before invalidation.
- Stale and failed writes clear every lock, retain the current choice, restore source focus, and
  show the existing distinct message.
- Shopping derivation, Dutch AH lookup lineage, persistence, recipe optionality semantics, and
  recurring-item behavior remain unchanged.

## Scope

### In

- Move source pending state, recipe pending state, need/term transitions, disclosure opening,
  feedback, and Undo resolution into `ShoppingListController`.
- Extend the controller dependency/message contract with the existing callbacks and UI effects.
- Cover saved, no-op, stale, failed, regroup-wait, recipe-lock, current-source Undo, and thrown
  dependency cleanup behavior with controller tests.
- Rewire `ShoppingLists.svelte` to read and invoke the controller contract.
- Make the existing browser journey wait for the keyed transition to settle before addressing the
  next exact source control, while asserting that it settles to one actionable target.

### Out

- Shopping API routes, database queries, schema, migrations, recipe mutations, or aggregation
  rules.
- Any new interaction, copy, style, motion token, filter, sorting rule, or component extraction.
- Albert Heijn matching, preview, push, tokens, Dutch-source fields, or external requests.
- Recurring Shopping, manual-item, bought-row, or basket behavior except for regression coverage.
- The unrelated in-flight and untracked documentation already present in the worktree.

## Existing-system inventory

| Owner | Current responsibility | Refactor boundary |
| --- | --- | --- |
| `ShoppingLists.svelte` | Rendering, DOM focus/reveal, motion duration, plus source mutation lifecycle | Retain rendering/DOM effects; delegate source lifecycle |
| `list-controller.svelte.ts` | Filter projection, bought/manual actions, row locks, basket/action-sheet state | Become the single interaction-state owner for the rendered list |
| `ShoppingSourceQuickControls.svelte` | Accessible need/term controls and local select rollback | Keep unchanged; consume controller state through existing props |
| `+page.svelte` | Revision-bound network mutation and `invalidateAll()` | Keep unchanged; continue returning `saved | stale | failed` |
| `shopping_list_view.ts` | Pure projection/grouping/key selection | Keep unchanged |

## Option comparison

| Option | Benefit | Cost | Decision |
| --- | --- | --- | --- |
| Extend the existing list controller | One state owner for every action on the rendered list; reuses injected focus/motion/notification seams and current tests | Broadens the controller dependency contract | **Chosen** |
| Add a separate source-choice controller | Smaller individual classes | Two controllers would coordinate the same source rows, status region, focus, and motion lifecycle | Rejected |
| Leave source logic in the component and only stabilize the browser test | Smallest diff | Preserves split ownership and lets the focus/pending race recur for users | Rejected |

The chosen approach is the narrowest durable seam: no new abstraction layer, no domain changes,
and no component/style movement.

## Phase plan

### Phase 1 — Move and prove the source lifecycle

- Add the source mutation dependencies, messages, state queries, and methods to the existing
  controller.
- Drive the change through controller tests for locks, results, timing, focus, notifications, and
  current-source Undo.

### Phase 2 — Replace the component-owned path

- Remove the component's pending registries and mutation functions.
- Wire source controls and `Not this run` state directly to the controller.
- Stabilize the existing isolated browser journey around the intentional keyed transition and
  prove one exact target remains after settlement.

### Phase 3 — Simplify, verify, and deliver

- Remove redundant types/helpers and keep DOM-only concerns in the component.
- Run focused controller and Shopping browser checks, then the complete repository gate and the
  secondary-account browser suite.
- Stage only the refactor artifact, controller, component, and directly changed tests.

## Execution tickets

### SSC-01 — Give source mutations one tested state owner

- **Observable behavior:** source and recipe controls remain locked for the complete mutation and
  regroup lifecycle; success, no-op, stale, failure, focus, disclosure, and Undo behave exactly
  once.
- **Scope in:** controller dependency/message types; pending registries; `changeTerm` and
  `changeNeed`; current-source lookup for Undo; cleanup on every completion path.
- **Scope out:** DOM queries, component rendering, persistence, or mutation semantics.
- **Targets:** `src/lib/components/shopping/list-controller.svelte.ts`,
  `src/lib/components/shopping/list-controller.svelte.test.ts`.
- **Risk tier:** R1. Impact 4/5. Effort M. Confidence high.
- **Verification:** focused Vitest proves no-op suppression; source and recipe lock duration;
  transition wait ordering; immediate stale/failure recovery; disclosure state; one Undo; refreshed
  source revision use; and cleanup after an unexpected dependency rejection.
- **Rollback:** revert the controller contract and tests; no persisted state exists.

### SSC-02 — Retire component-owned source state and settle the browser target

- **Observable behavior:** the Shopping component renders the same controls and messages, but the
  next source action is addressed only after the old keyed row has left and one exact actionable
  control remains.
- **Scope in:** controller construction/message wiring; source-control props; `Not this run` open
  binding; existing recoverability browser journey.
- **Scope out:** markup hierarchy, CSS, copy, visual design, API payloads, or new test fixtures.
- **Targets:** `src/lib/components/shopping/ShoppingLists.svelte`,
  `tests/e2e/kitchen-flows.e2e.ts`.
- **Risk tier:** R1. Impact 4/5. Effort S. Confidence high.
- **Dependencies:** SSC-01.
- **Verification:** component diagnostics plus the isolated primary journey for term save/restore,
  need changes, recipe-wide blocking, regroup, Undo, and exact-target settlement; then full and
  secondary-account gates.
- **Rollback:** revert the component/test wiring and SSC-01 together; server and database state are
  unchanged.

## Risk tier, rollout, and rollback

Overall risk is **R1**: this is localized client interaction logic with no schema, auth, shared
server data, provider, or external-handoff change. The beta R3 stage gate does not apply. Delivery
uses the ordinary code route. Rollback is a normal revert of the refactor commit; there is no data,
configuration, or AH rollback.

## Failure-mode critique

| Priority | Failure mode | Trigger | Impact | Detectability | Mitigation | Residual risk |
| --- | --- | --- | --- | --- | --- | --- |
| P2 | Old and reconciled controls are simultaneously actionable | Pending state clears before a keyed outro ends | Ambiguous focus or duplicate user action | High in exact source-key browser count | Keep the controller lock through regroup motion; address the next action only after one exact target remains | Low |
| P2 | A sibling recipe source unlocks early | Need mutation bumps a shared recipe revision | A stale sibling write can follow immediately | High in deferred-promise unit test | Track recipe IDs alongside source keys and release both in one cleanup path | Low |
| P2 | Undo replays a stale revision | Closure captures the pre-invalidation source object | Undo returns a 409 instead of restoring the source | High in source-replacement unit test | Resolve `sources()` by `sourceKey` when Undo executes | Low |
| P2 | A rejected dependency leaves permanent busy UI | Injected callback throws instead of returning `failed` | Source and sibling controls stay disabled | High in rejection unit test | Normalize rejection to failure and release locks in `finally` | Low |
| P2 | Feedback timing drifts during extraction | Toast/status calls move ahead of or behind reconciliation | Success appears disconnected or Undo becomes a no-op | High in call-order unit test and browser journey | Keep failure immediate; publish move/Undo only after the destination control settles | Low |
| P3 | Controller becomes a DOM abstraction | Focus queries or rendered element details move into the class | Tests become browser-coupled and controller reuse worsens | High in diff review | Keep DOM focus/reveal injected from the component | None expected |
| P3 | Unrelated worktree changes enter delivery | Broad staging in a dirty branch | User-owned plans/log edits are bundled | High in staged diff | Stage only the five intended paths | None expected |

**Steelman:** A dedicated source-choice controller is the strongest alternative because it would
keep the existing list controller smaller. It is still weaker here: source choices change the same
row projection, status live region, focus target, disclosure state, and motion window already owned
by `ShoppingListController`. A second controller would need cross-controller locks or callbacks for
those shared effects. Extending the existing per-instance controller keeps one lifecycle owner and
uses dependency injection to prevent DOM or persistence concerns from leaking into it.

Plan-readiness recommendation: **GO**. The scope and rollback are explicit, all observed failure
modes have direct tests, and no P0/P1 blocker or high-residual-risk finding remains. Independent
outside-model review is not triggered because every finding is P2 or lower.

## Verification matrix

| Layer | Required proof |
| --- | --- |
| Controller | Focused Vitest for no-op, saved, stale, failed, thrown, locks, regroup timing, disclosure, and refreshed-source Undo |
| Component diagnostics | `npm run check` with zero new Svelte/TypeScript diagnostics |
| Primary browser | Existing isolated Shopping recoverability journey; one exact source target after regroup; no real AH request |
| Responsive/runtime | Reuse the existing 320/375/768/1280 Shopping coverage in the full primary suite; no visual contract change |
| Secondary account | Repository secondary-account browser suite passes against its isolated fixture |
| Repository gate | `npm test`, `npm run test:e2e:secondary`, and `git diff --check` |
| UI audit | Applicable and run: current source/control inspection plus isolated 1280 px browser baseline; found the P2 keyed-transition ambiguity addressed by SSC-01/02 |
| UX audit | Applicable and run: repeated Shopping source-choice success, stale, block, regroup, focus, and Undo journey; no new journey or copy selected |
| Harden audit | Skipped: no security, data-integrity, deployment, auth, or destructive scope |
| Stack discipline | Skipped: no dependency, library, service, or platform change |
| Reference lookup | Context7 exception: internal-only refactor; no external framework or API behavior change |

## Execution update — 2026-07-31

SSC-01 and SSC-02 are complete. `ShoppingListController` now owns term and need no-op guards,
source and recipe locks, mutation result normalization, disclosure state, live status, motion
settlement, source focus, and refreshed-source Undo. `ShoppingLists.svelte` retains only DOM
focus/reveal, transition timing, message adapters, and rendering. Pending state remains locked
through the Svelte render tick and transition window, so an outgoing keyed row and its replacement
cannot both become the next actionable source control.

The implementation was test-driven from the existing isolated browser failure:

- the baseline controller suite passed 8/8 while the Shopping recoverability journey failed on
  two matching source controls during a keyed transition;
- the controller suite now passes 15/15, including saved, stale, rejected, no-op, source/recipe
  lock, regroup wait, disclosure, focus, and refreshed-revision Undo behavior;
- the focused primary Shopping journey passes and polls for exactly one enabled source control
  after each regroup;
- `npm test` passed against a per-process in-memory SQLite database: 125 unit files / 690 tests,
  zero Svelte diagnostics, 25 primary browser tests plus the expected opt-in connected-AH skip,
  and the production build;
- the secondary run passed all 24 application journeys plus the expected opt-in skip; its only
  failure was a 5 ms browser-context startup error in the account identity test, which passed on
  an exact retry. A later clean-run attempt timed out during auth setup, and a retry-enabled run
  leaked its localhost test server/workers; the exact `localhost:4173` server process was stopped
  after the bounded run was terminated. No secondary Shopping assertion failed.

The first bare `npm test` attempt encountered a pre-existing local `dev.db` migration mismatch
(`timer_alert_jobs` absent at an ALTER migration). The database file's timestamp remained
unchanged. The successful rerun used `DATABASE_URL=:memory:` and `LITESTREAM_ENABLED=0`, so unit
verification could not read or modify the ignored local database. No real AH request, provider
request, household fixture, migration, schema, or production action was used.

The simplification pass made pending registries private and consolidated mutation rejection and
error reporting behind two controller helpers. Context7 remained unnecessary because this was an
internal-only refactor with no external API or framework contract change.

## Decisions applied

- Source-choice state was added to the existing per-instance list controller. A second controller
  would have required synchronization across the same rows, focus, motion, and live status.

- The browser contract does not accept two actionable controls. The keyed transition remains, but
  the controller releases its lock only after render and motion settle, and the journey proves one
  enabled exact target before continuing.

## Resume pack

- **Goal:** consolidate Shopping source-choice behavior into the existing list controller and
  remove the keyed-transition action race without changing domain or visual behavior.
- **Current state:** shipped on `codex/shopping-source-controller-refactor`; 15 focused controller
  tests, the complete primary gate, and all secondary application journeys pass.
- **First command:** `$plan` for the next item.
- **First files:** `src/lib/components/shopping/list-controller.svelte.ts`,
  `src/lib/components/shopping/list-controller.svelte.test.ts`,
  `src/lib/components/shopping/ShoppingLists.svelte`.
- **First proof:** the archived execution update and changed tests contain the final evidence.
- **Pending verification:** none for this refactor. Secondary browser-process startup/teardown is a
  repository-level harness watch, not an application blocker.
- **Open questions:** none.
