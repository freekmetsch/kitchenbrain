# Feature List: Domain Boundary Refactor

_Status: Shipped — 2026-07-27_

## Implementation outcome

All four phases shipped on `codex/domain-boundary-refactor`.

- Core inventory, recipe, meal-plan, shopping, and AH use cases now enter through explicit
  domain/query or cross-domain workflow boundaries. Core HTTP routes and AI executors no longer
  own schema-level persistence.
- Recipe enhancement keeps provider generation DB-free; its workflow owns the generation
  snapshot, stale-write check, and apply transaction. The runtime LLM SDK and model-selection
  seams remain unchanged.
- AH transport and write orchestration retain explicit definite, partial, and uncertain outcomes.
  Architecture guards prove that product lookup and basket writes can only receive Dutch
  canonical recipe fields.
- Stock, Meal Plan, Shopping, and Cook Mode use per-instance controllers. Cook lifecycle work
  (timers, visibility recovery, wake lock, audio, vibration, notification, and cleanup) has one
  independently tested owner.
- The responsive parity matrix covers empty, long, error/rollback, undo, sheet/focus, deep-link,
  and cook-session recovery states at phone and desktop widths for both isolated accounts.
- Verification passed with 95 unit-test files / 540 tests, 17 primary and 17 secondary
  authenticated browser tests, zero Svelte diagnostics, a production build, zero production
  dependency advisories, and a clean diff check.
- No schema, migration, auth, runtime configuration, dependency, or live provider behavior
  changed. Review reached GO after the initial dual-account and responsive-matrix gaps were fixed.

The sequential implementation commits are `e0b2569`, `fa79b4a`, `1df9d4a`, `4ea582c`,
`b7976e0`, `d7ea804`, and `30da510`; the final documentation closure is recorded alongside them
in the branch history.

## Problem framing

Keukenbrein passes its current quality gate, but core behavior has outgrown its ownership
boundaries. The problem is not file length by itself. The same household data can be reached from
page loaders, API routes, AI tool executors, and cross-feature helpers, while several primary UI
files own rendering, network calls, optimistic rollback, focus, undo, and modal sequencing at
once.

Current evidence:

- `npm test` passes: 445 unit tests, four authenticated Playwright checks, zero Svelte
  diagnostics, and a production build.
- `npm audit --omit=dev --audit-level=high` reports zero production vulnerabilities.
- 27 of 29 production TypeScript files under the four core route families
  (`inventory`, `recipes`, `meal-plan`/`meals`, and `shopping`) import
  `db/index` or `db/schema` directly.
- All five AI domain executor modules know database/schema details.
- The largest UI orchestrators combine state, effects, HTTP, rollback, focus, and markup:
  `inventory/+page.svelte` (1,354 lines), `meal-plan/+page.svelte` (1,206),
  `ShoppingLists.svelte` (1,097), and `BenchSheet.svelte` (1,041).
- The E2E suite characterizes authentication, but not the repeated household journeys that the
  refactor could regress.

The objective is a parity-preserving refactor: one tested application entry point for each core
use case, thin HTTP/AI adapters, explicit cross-domain workflows, and per-instance UI controllers.
No product redesign, schema migration, provider change, or new feature rides along.

## Behavior and safety invariants

1. **No data migration.** `drizzle/` and its append-only journal remain unchanged.
2. **One write path per use case.** HTTP and AI callers use the same command/workflow before the
   old path is deleted; no forwarding aliases or dual implementations remain after a ticket.
3. **Transaction ownership is explicit.** Domain commands accept `DbOrTx`; one workflow owns each
   multi-domain transaction. A domain module never begins an invisible nested transaction.
4. **AH remains Dutch-only.** Shopping-to-AH DTOs carry explicitly Dutch lookup terms. Tests seed
   divergent Dutch/English values and prove that English display fields cannot reach matching or
   basket calls.
5. **AH uncertainty remains first-class.** Definite failure, partial success, and uncertain
   external writes keep distinct history and bought-state outcomes. An uncertain write is never
   retried automatically.
6. **The LLM seam stays put.** `src/lib/server/ai/client.ts` remains the only runtime LLM SDK
   import. Model resolution, spend caps, prompt files, commit-risk confirmation, executor result
   shapes, and precondition conflicts keep their current behavior.
7. **Auth and runtime configuration stay unchanged.** No auth boundary, cookie, `.env`, public
   variable, secret source, or household-user model changes.
8. **Rendered behavior stays unchanged.** URL state, optimistic updates, rollback, undo, focus
   return, live announcements, sheets, timers, wake lock, audio, and cook-session resume preserve
   their current outcomes.
9. **Svelte controller state is per instance.** No module-global household state. Rune controllers
   expose reactive object properties/actions rather than directly exporting reassigned `$state`.
10. **No net-new feature work.** Product or visual improvements discovered during execution are
    recorded separately after parity is proved.

## Existing-system inventory

| Area | Reusable foundation | Current seam to replace |
|---|---|---|
| Database | `src/lib/server/db/index.ts`, `schema.ts`, `test_db.ts`; synchronous Drizzle transactions | `DB`/`DbOrTx` types are re-declared across modules, with `DbOrTx` currently owned by `inventory_merge.ts` |
| Inventory | `inventory_writes.ts` already centralizes preconditions, logging, undo, and transactional writes | Page loaders, routes, AI executors, recipe/freezer helpers, and history queries still know schema details |
| Recipes and meals | `recipe_mutations.ts`, `meal_recipes.ts`, recipe validation, image helpers | HTTP and AI callers assemble related operations and shopping reconciliation themselves |
| Meal plan and cooking | `cook_log.ts`, meal-plan preference helpers, pure week/meal utilities | Route handlers own CRUD sequencing, cooking side effects, and shopping reconciliation |
| Shopping | `shopping_entries.ts`, `shopping_mutations.ts`, `shopping_view.ts`, recipe-choice tests | Read models and transactions are spread across routes and AI callers |
| AH | `ah/client.ts`, matching tests, preview-token protection, write-status classification | `ah-push/+server.ts` mixes HTTP, preview freshness, external calls, uncertainty, history, and local bought-state writes |
| AI | Split executor maps, commit-risk gate, pending actions, provider seam | Executors still reach schema and domain helpers directly instead of one use-case boundary |
| UI | Existing focused components and many pure helper tests | Four orchestrators still combine controller/state-machine work with large render trees |
| Browser tests | Isolated server, two deterministic accounts, real login, secret-free test env | Only the auth boundary and shell are covered; core write, recovery, and resume journeys are not |

## Target architecture

```text
Svelte page/component -> per-instance controller -> HTTP route
                                              |
AI executor ----------------------------------+
                                              v
                               domain command/query or workflow
                                  |                    |
                                  v                    v
                             db / DbOrTx         AH or AI adapter
```

- `src/lib/server/db/types.ts` owns the application database and transaction types.
- `src/lib/server/domains/{inventory,recipes,meal-plan,shopping}/` owns domain-local queries,
  commands, DTOs, errors, and tests. Domain modules may use the database layer and pure shared
  utilities; they do not import another domain.
- `src/lib/server/workflows/` owns cross-domain and adapter-spanning use cases such as cooking a
  planned meal, reconciling shopping after a recipe/plan mutation, and pushing reviewed shopping
  items to AH. A workflow owns the transaction and failure ordering it coordinates.
- `src/lib/server/ai/` and `src/lib/server/ah/` remain adapters. They call workflows/domain APIs;
  they do not become alternate business-logic owners.
- Core page loaders and API routes validate/authorize/map HTTP only. Infrastructure routes
  (auth, settings, import/export/reset, chat history, health) are outside the core-route import
  guard unless a core workflow actually requires them.
- Large Svelte surfaces retain composition locally but move reusable pure logic, state machines,
  and network coordination into focused components and per-instance `.svelte.ts` controllers.

## Scope

### In

- Core inventory, recipe/meal, meal-plan/cooking, shopping, and AH-push server boundaries.
- The matching page loaders, API routes, AI executors, and cross-domain callers.
- Shared `Db`/`DbOrTx` type ownership and enforceable import rules.
- Deterministic E2E data fixtures and parity journeys for core repeated tasks.
- Controller/component extraction for Stock, Meal Plan, Shopping, and Cook Mode.
- Focused unit/contract/rollback tests, primary and secondary account E2E, and release checks.
- Architecture notes needed to keep the new boundary legible to future agents/contributors.

### Out

- Database schema, migrations, compatibility repair, auth, cookies, user seeding, or multi-tenancy.
- Settings information architecture, import/export/reset behavior, chat streaming UI, or Home.
- LLM provider/model/prompt/spend-cap changes and real paid-provider calls.
- AH login/token-store redesign or real basket writes during verification.
- Visual redesign, copy changes, new features, analytics, telemetry, or new dependencies.
- Repository-wide conversion of unrelated infrastructure routes to domain services.

The excluded work is inert: this refactor creates no migration, compatibility caller, or rename
that requires those areas to change.

## Option comparison

| Option | Decision | Trade-off |
|---|---|---|
| **Seam-first vertical refactor** | **Selected** | More disciplined sequencing, but every slice proves parity, migrates all callers, and is independently revertible |
| Mechanical file split | Rejected | Reduces file length while preserving duplicate DB knowledge, transaction ownership, and caller drift |
| Server-only boundary cleanup | Viable scope reduction, not selected | Removes the highest data risk but leaves the four UI state machines as the next compounding maintenance bottleneck |
| Generic repository/event-bus/state-library rewrite | Rejected | Adds indirection and dependencies that do not fit a single-process SQLite app |
| Big-bang folder reorganization | Rejected | Maximizes import churn before behavior is protected and makes rollback or root-cause isolation weak |

The selected approach is the smallest structure that removes both compounding seams. It does not
introduce persistence abstractions the app does not need.

## Phase plan

### Phase 1 - Lock behavior and establish the seam

1. Seed deterministic, isolated kitchen fixtures and add core browser characterization.
2. Centralize database types and define the domain/workflow dependency contract.
3. Add guard tests in reporting mode; switch each rule to enforcement only after its slice is
   migrated.

Checkpoint: current behavior is executable from tests, and the target boundary exists without
moving production behavior yet.

### Phase 2 - Migrate server behavior vertically

1. Inventory, including undo/history/preconditions and freezer relationships.
2. Recipes/meals, including ingestion persistence, images, composition, freeze/consume, and
   shopping reconciliation.
3. Meal plan/cook logging, including planned-meal cooking and reconciliation.
4. Shopping/AH, including source decisions, read models, preview freshness, external uncertainty,
   history, and bought-state updates.

Each slice migrates its page/API/AI callers and deletes the old implementation in the same
ticket. A full gate passes before the next slice starts.

Checkpoint: all 29 core route files and the five AI domain executors use public domain/workflow
APIs; there is no dual path.

### Phase 3 - Split the four UI orchestrators

1. Stock controller and focused sections.
2. Meal Plan controller and ledger/drawer sections.
3. Shopping list state machine and focused list/sheet sections.
4. Cook Mode timer/session/network controllers and focused render sections.

Pure helpers move first, per-instance controllers second, markup last. Each surface keeps its
existing rendered hierarchy and completes its browser parity matrix before the next begins.

Checkpoint: orchestration is testable outside the render tree, and no controller is shared across
requests, users, or component instances.

### Phase 4 - Enforce, simplify, and release

1. Turn all core import rules into hard failures.
2. Delete obsolete aliases, unused helpers, duplicate types, and temporary characterization
   scaffolding that has no lasting value.
3. Update architecture/contributor documentation and run the complete release matrix.

Checkpoint: the new structure is smaller than the transitional structure, documented, fully
guarded, and ready for beta deployment.

## Execution tickets

### DBR-1 - Deterministic core-journey characterization

- **Observable behavior:** both isolated E2E accounts can exercise the current Stock, Meal Plan,
  Shopping, Recipes, and Cook Mode success/recovery paths without real credentials or providers.
- **Scope in:** deterministic seeded recipes, inventory, planned meals, shopping sources, and cook
  state; stable role/label assertions; state reset per server start.
- **Scope out:** screenshots as golden truth, live OpenRouter/AH, production data, and testing
  private DOM structure.
- **Targets:** `scripts/e2e_server.ts`, `tests/e2e/config.ts`, new
  `tests/e2e/fixtures.ts`, new `tests/e2e/kitchen-flows.e2e.ts`, existing route/component test
  helpers as needed.
- **Risk:** R1. Test-only data and harness code.
- **Impact / effort / confidence:** 5 / L / high.
- **Dependencies:** none.
- **wide_sweep:** false.
- **Verification:** `npm run test:e2e`, `npm run test:e2e:secondary`; prove quantity/delete/undo,
  meal add/edit/cook/remove, shopping buy/undo/source decision, recipe plan/make/freeze, and
  cook-session resume/failure recovery.
- **Rollback:** revert only the fixture/spec changes; production code and data are untouched.

### DBR-2 - Database types and enforceable dependency contract

- **Observable behavior:** server code uses one `Db`/`DbOrTx` definition, and an architecture test
  reports forbidden core-route/AI direct imports without changing runtime behavior.
- **Scope in:** database/transaction types; dependency rules; initial allowlist for unrelated
  infrastructure routes; target skeletons for domains/workflows.
- **Scope out:** generic repositories, service containers, runtime dependency injection
  frameworks, and production behavior moves.
- **Targets:** new `src/lib/server/db/types.ts`, new
  `src/lib/server/architecture_boundaries.test.ts`, new
  `src/lib/server/domains/`, new `src/lib/server/workflows/`; type imports in existing modules.
- **Risk:** R2. Shared server types and future import enforcement.
- **Impact / effort / confidence:** 5 / M / high.
- **Dependencies:** DBR-1.
- **wide_sweep:** true.
- **Verification:** focused architecture/type tests, `npm run check`, `npm run test:unit`,
  `npm run build`; reporting inventory must match the known core/AI bypass set.
- **Rollback:** revert the shared type/skeleton commit; no behavior or data changed.

### DBR-3 - Inventory vertical boundary

- **Observable behavior:** Stock HTTP and AI actions produce the same rows, operation log,
  precondition conflicts, review flags, history, and undo outcomes through one inventory API.
- **Scope in:** inventory commands/queries, merge/taxonomy/history, recipe-link/freezer
  relationships needed by Stock, page/API/AI caller migration, old-path deletion.
- **Scope out:** UI decomposition and new inventory behavior.
- **Targets:** current `src/lib/server/inventory_*.ts`, `freezer_staple.ts`,
  inventory-facing parts of `recipe_links.ts`; new
  `src/lib/server/domains/inventory/` and inventory workflows;
  `src/routes/inventory/+page.server.ts`, `src/routes/api/inventory/**`,
  `src/lib/server/ai/executors/inventory.ts`, `commit_risk.ts`, `tool_display.ts`, related tests.
- **Risk:** R2. Shared data mutation, undo, and AI confirmation behavior.
- **Impact / effort / confidence:** 5 / L / medium-high.
- **Dependencies:** DBR-2.
- **wide_sweep:** true.
- **Verification:** existing inventory unit/guard/undo tests; new web-versus-AI effect contracts;
  transaction fault injection; stale-precondition 409; DBR-1 Stock journey; full `npm test`.
- **Rollback:** revert the whole inventory slice before another slice starts; no compatibility
  alias is retained and no schema restore is needed.

### DBR-4 - Recipe and meal-composition vertical boundary

- **Observable behavior:** recipe list/detail/edit/import/image/composition/freeze/consume actions
  and equivalent AI tools preserve validation, Dutch canonical ingredients, English display
  fields, review state, and shopping reconciliation through one recipe API.
- **Scope in:** recipe commands/queries, meal composition, images, AI-ingest persistence seam,
  freeze/consume workflows, all recipe/meal page/API/AI caller migration, old-path deletion.
- **Scope out:** prompt/provider redesign, recipe UI refactor, image-storage replacement, or
  schema normalization.
- **Targets:** `recipe_mutations.ts`, `meal_recipes.ts`, `recipe_images.ts`,
  recipe-facing `recipe_links.ts`; new `src/lib/server/domains/recipes/` and recipe workflows;
  `src/routes/recipes/**`, `src/routes/api/recipes/**`, `src/routes/api/meals/**`,
  `src/lib/server/ai/{recipe_ingest.ts,recipe_enhancement.ts,recipe_normalization.ts,translate_recipe.ts}`,
  `src/lib/server/ai/executors/recipes.ts`, related tests.
- **Risk:** R2. Shared recipe data, cross-domain stock effects, and AI-generated input.
- **Impact / effort / confidence:** 5 / L / medium.
- **Dependencies:** DBR-3.
- **wide_sweep:** true.
- **Verification:** existing mutation/composition/ingest/normalization tests; malformed AI output;
  transaction rollback; Dutch/English divergence fixture; DBR-1 recipe/freeze journey; full
  `npm test`.
- **Rollback:** revert the complete recipe slice; image/database formats remain unchanged.

### DBR-5 - Meal-plan and cooking workflow boundary

- **Observable behavior:** page, API, recipe-sheet, and AI callers add/update/remove/cook meals
  with identical week bucketing, servings, cook log, frozen-stock effect, and shopping
  reconciliation.
- **Scope in:** meal-plan commands/queries, cook-log workflow, multi-domain transaction ownership,
  all meal-plan page/API/AI caller migration, old-path deletion.
- **Scope out:** planning UI decomposition, suggestion prompt/model behavior, and schema changes.
- **Targets:** `cook_log.ts`, meal-plan behavior currently in
  `src/routes/api/meal-plan/**`; new `src/lib/server/domains/meal-plan/` and
  `src/lib/server/workflows/cook-meal.ts`; `src/routes/meal-plan/+page.server.ts`,
  recipe-detail plan callers, `src/lib/server/ai/executors/meal_plan.ts`, related tests.
- **Risk:** R2. Cross-domain writes and cooked/un-cooked compensation.
- **Impact / effort / confidence:** 5 / L / medium-high.
- **Dependencies:** DBR-4.
- **wide_sweep:** true.
- **Verification:** week-start variants, fresh/freezer sources, cook/un-cook, transaction fault
  injection, web-versus-AI effects, DBR-1 meal-plan journey, full `npm test`.
- **Rollback:** revert the whole meal-plan slice; no data migration or backfill exists.

### DBR-6 - Shopping and AH workflow boundary

- **Observable behavior:** list materialization, source decisions, weekly/manual items, recipe
  choices, preview freshness, AH push outcomes, history, and local bought state keep their
  current success/failure/uncertain behavior through one shopping/workflow API.
- **Scope in:** shopping commands/queries/read models; reconciliation workflow; AH-preview/push
  orchestration with injected adapter; all shopping page/API/AI caller migration; old-path
  deletion.
- **Scope out:** AH token/login redesign, matching algorithm changes, real AH calls, and shopping
  UI decomposition.
- **Targets:** `shopping_entries.ts`, `shopping_mutations.ts`, `shopping_needs.ts`,
  `shopping_recipe_choice.ts`, `shopping_view.ts`; new
  `src/lib/server/domains/shopping/`, new
  `src/lib/server/workflows/{reconcile-shopping.ts,push-shopping-to-ah.ts}`;
  `src/routes/shopping/+page.server.ts`, `src/routes/api/shopping/**`,
  `src/lib/server/ah/{client.ts,preview_tokens.ts}`, `src/lib/server/ai/executors/shopping.ts`,
  related tests.
- **Risk:** R2. Shared data plus a non-transactional external side effect.
- **Impact / effort / confidence:** 5 / L / medium.
- **Dependencies:** DBR-5.
- **wide_sweep:** true.
- **Verification:** materialization/idempotency/revision tests; mocked AH product/free-text/order
  matrices; definite/partial/uncertain write ordering; preview replay/staleness; divergent
  Dutch/English lookup fixture; no automatic uncertain retry; DBR-1 shopping journey; full
  `npm test`.
- **Rollback:** revert the complete shopping/AH slice. Verification makes no real external write.
  If a post-deploy regression reaches AH, review the basket manually and roll back code; external
  basket state is not automatically reversible.

### DBR-7 - Stock per-instance controller and component split

- **Observable behavior:** Stock filters, quick views, quantity coalescing, review/link/edit,
  delete/undo/history, deep links, focus, and toasts behave identically with orchestration outside
  the route render tree.
- **Scope in:** pure helper extraction, per-instance rune controller, focused ledger/header/sheet
  composition, controller/component tests.
- **Scope out:** visual redesign, copy changes, URL/preferences changes, and server behavior.
- **Targets:** `src/routes/inventory/+page.svelte`, new
  `src/lib/components/inventory/controller.svelte.ts`, focused inventory components/tests.
- **Risk:** R2. Primary repeated-task state and optimistic writes.
- **Impact / effort / confidence:** 4 / L / medium-high.
- **Dependencies:** DBR-3 and Phase 2 checkpoint.
- **wide_sweep:** true.
- **Verification:** two-controller isolation test; rapid quantity taps; rollback/undo races;
  deep-link focus; empty/populated/long/error at 375 and 1280; DBR-1 Stock journey; full
  `npm test`.
- **Rollback:** revert the Stock UI slice; server boundary remains independently valid.

### DBR-8 - Meal Plan per-instance controller and ledger split

- **Observable behavior:** week navigation, add/edit/remove, serving/source changes, optimistic
  rollback, suggestions, freeze/consume sheets, and focus keep their current outcomes.
- **Scope in:** pure week/view helpers, per-instance rune controller, ledger/drawer/suggestion
  components, controller/component tests.
- **Scope out:** visual redesign, AI suggestion behavior, and server changes.
- **Targets:** `src/routes/meal-plan/+page.svelte`, new
  `src/lib/components/meal-plan/controller.svelte.ts`, focused meal-plan components/tests.
- **Risk:** R2. Multi-request optimistic state and cross-sheet sequencing.
- **Impact / effort / confidence:** 4 / L / medium.
- **Dependencies:** DBR-5 and DBR-7.
- **wide_sweep:** true.
- **Verification:** rapid/double actions, rollback, current/past/future week, suggestion
  pending/error/apply, sheet focus return at 375/1280, DBR-1 Meal Plan journey, full `npm test`.
- **Rollback:** revert the Meal Plan UI slice; server workflows remain.

### DBR-9 - Shopping list state machine and focused component split

- **Observable behavior:** filtering/sorting, bought/undo focus, source/rule sheet handoff,
  recurring items, legacy resolution, and empty/completed states behave identically.
- **Scope in:** per-instance list controller/state machine, focused list group/action/rules
  components, controller/component tests.
- **Scope out:** AH sheet internals, visual redesign, and server behavior.
- **Targets:** `src/lib/components/shopping/ShoppingLists.svelte`, new
  `src/lib/components/shopping/list-controller.svelte.ts`, focused shopping components/tests;
  `src/routes/shopping/+page.svelte` only where props/contracts change.
- **Risk:** R2. Focus-sensitive repeated task and optimistic undo.
- **Impact / effort / confidence:** 4 / L / medium-high.
- **Dependencies:** DBR-6 and DBR-8.
- **wide_sweep:** true.
- **Verification:** bought/undo next-focus matrix, sheet close/open sequencing, filter invalidation,
  empty/populated/complete/long at 375/1280, DBR-1 Shopping journey, full `npm test`.
- **Rollback:** revert the Shopping UI slice; server/AH workflows remain.

### DBR-10 - Cook Mode timer/session controller split

- **Observable behavior:** generation/retry, step progress, timer start/cancel/fire, visibility and
  wake-lock changes, audio/notification fallback, swaps, servings, mark-cooked, and session resume
  remain identical.
- **Scope in:** timer lifecycle controller, cook-session/network controller, focused render
  components, deterministic controller tests with fake time and browser API adapters.
- **Scope out:** generated cook-mode content, prompt/model changes, visual redesign, and new PWA
  capabilities.
- **Targets:** `src/lib/components/BenchSheet.svelte`, new
  `src/lib/components/cook-mode/{timer-controller.svelte.ts,session-controller.svelte.ts}`,
  existing cook-mode helpers/components/tests.
- **Risk:** R2. Time, lifecycle, browser APIs, and persisted local state.
- **Impact / effort / confidence:** 4 / L / medium.
- **Dependencies:** DBR-4, DBR-5, and DBR-9.
- **wide_sweep:** true.
- **Verification:** fake-clock timer matrix, visibility/unmount cleanup, two-instance isolation,
  storage version/staleness, audio/notification/wake-lock failures, 375/1280 resume journey,
  DBR-1 Cook Mode coverage, full `npm test`.
- **Rollback:** revert the Cook Mode UI slice; pure helper improvements may stay only if proven
  independent.

### DBR-11 - Hard enforcement, simplification, and release gate

- **Observable behavior:** forbidden core DB/schema and AI/AH boundary bypasses fail fast in tests;
  all user journeys and build gates remain green with no transitional aliases.
- **Scope in:** enforce architecture rules; delete obsolete files/types/aliases; update
  architecture and contributor documentation; final primary/secondary release matrix.
- **Scope out:** new cleanup unrelated to this plan and any schema/auth follow-up.
- **Targets:** `src/lib/server/architecture_boundaries.test.ts`, migrated server/UI directories,
  new or existing `docs/architecture.md` plus `README.md` only where execution proves durable
  facts, package scripts only if needed for the existing gate.
- **Risk:** R2. Wide deletion and final boundary enforcement.
- **Impact / effort / confidence:** 5 / M / high after prior checkpoints.
- **Dependencies:** DBR-1 through DBR-10.
- **wide_sweep:** true.
- **Verification:** no `drizzle/` diff; no new env keys/dependencies; architecture tests; `npm run
  test:unit`; `npm run test:e2e`; `npm run test:e2e:secondary`; `npm run check`; `npm run build`;
  `npm test`; `npm audit --omit=dev --audit-level=high`; `git diff --check`.
- **Rollback:** revert deletion/enforcement separately if it exposes an overlooked caller, fix
  that caller in its owning slice, then reapply. Do not restore forwarding aliases as a permanent
  solution.

## Risk tier and verification matrix

Overall risk: **R2, code-only wide sweep**. The refactor touches shared logic, data access,
external-write orchestration, and primary UI state, but it explicitly excludes schema, auth, and
destructive operations. At `app_stage: beta`, the ordinary code wide-sweep route applies; there
is no R3 staging or schema/auth branch split. If execution discovers a required schema or auth
change, stop that ticket and plan it as separate R3 work before continuing.

| Concern | Proof before move | Proof per slice | Final proof |
|---|---|---|---|
| Current behavior | Existing 445 unit tests + DBR-1 characterization | Owning journey and focused tests | Primary + secondary E2E |
| Data integrity | Snapshot effects and fixture rows | Success, conflict, rollback, and fault-injection tests | Full unit suite; no migration diff |
| HTTP/AI parity | Record current status/result/effect contracts | Same command/workflow effect from both adapters | Import guard + contract suite |
| AH invariant | Divergent Dutch/English fixture | Mocked adapter receives Dutch-only DTO | No real AH write; uncertainty matrix |
| LLM seam | Runtime-import inventory | Executor/provider tests | Only `ai/client.ts` imports SDK at runtime |
| UI/UX | Empty primary routes at 375/1280 | Populated/error/undo/focus/resume at 375/1280 | Four-route keyboard/console/overflow pass |
| Isolation | Two deterministic users | Per-instance controller tests; secondary account smoke | Full secondary E2E |
| Build/dependencies | Baseline gate and zero production advisories | Focused check/build as touched | `npm test`, secondary E2E, audit, diff check |
| Rollback | No schema/data transformation | Revert whole vertical slice before proceeding | Deploy previous code; no DB restore |

### Audit records

- **Harden (embedded app/data-integrity audit):** P1 execution gap: core journeys lack E2E
  characterization. P2 architecture gap: 27/29 core route files and all five AI domain executors
  bypass a public use-case boundary. Production dependency audit is clean. Mitigation: DBR-1,
  vertical caller migration, fault-injection tests, and hard import guards.
- **UI audit:** Browser-observed empty Stock, Meal Plan, Shopping, and Recipes at 375 and 1280 had
  one H1, no horizontal overflow, and no console errors. Populated/write/error/resume states were
  not exercised. Source evidence shows four mixed-responsibility orchestrators. Mitigation:
  preserve the observed baseline and add state coverage before UI extraction.
- **UX audit:** No current empty-state journey defect was observed. The refactor risk is
  uncharacterized optimistic, undo, focus, sheet-handoff, and resume behavior. Mitigation: DBR-1
  plus per-surface journey matrices in DBR-7 through DBR-10.
- **Context7:** Current Svelte 5 documentation confirms `.svelte.ts` is appropriate for reusable
  rune logic, while directly exported reassigned `$state` is not. The controller contract in this
  plan follows that constraint.
- **Stack discipline:** not triggered; no new tool, library, service, auth, queue, or persistence
  dependency is proposed.
- **Independent model:** `fable` was selected for this multi-session architecture plan but was
  unavailable because usage credits were required. No outside-model findings were accepted.

## Failure-mode critique

| Failure mode | Trigger | Impact | Detectability | Integrated mitigation | Residual risk |
|---|---|---|---|---|---|
| Tests freeze implementation rather than behavior | Characterization asserts private DOM or exact SQL rows unnecessarily | Refactor becomes impossible or produces false confidence | High during first move | Stable roles, visible outcomes, public API effects, and only load-bearing row assertions | Low |
| Domain folders become a file shuffle | Callers still import schema or old aliases forward forever | Coupling and drift remain under new names | High via import guard | Migrate every caller and delete the old path in the same vertical ticket | Low |
| New domains form circular dependencies | Recipe, inventory, plan, and shopping call each other directly | Hidden transaction ownership and hard-to-test cycles | High in imports | Domain-local modules never import another domain; `workflows/` owns cross-domain use cases | Low |
| Transaction boundaries split | A route and service each start/commit part of one use case | Partial household updates or lost undo/reconciliation | High with fault injection | One workflow owns the transaction; domain commands accept `DbOrTx`; rollback tests at each failure point | Low |
| AH uncertainty is flattened | External call is moved behind a generic success/error result | Duplicate basket writes or wrong local bought state | Medium without live AH | Explicit adapter result union, mocked partial/uncertain matrices, no automatic retry, preserved history ordering | Medium-low |
| Dutch/English seam is bypassed | A generic `name` DTO reaches AH after refactor | Bad product matching | High with divergent fixture | Dutch-specific DTO field/type and boundary test; English remains display-only | Low |
| AI confirmation/preconditions drift | Executors call services below or around commit-risk handling | Destructive tool action bypasses approval or stale-write protection | High in executor tests | Keep commit-risk gate above domain call; shared precondition error; web/AI contract tests | Low |
| UI controller leaks across instances | Module-global `$state` or exported reassigned state is introduced | SSR/user/component state contamination | High in two-instance tests | Per-component factory, reactive object properties/actions, no singleton state | Low |
| Component split breaks recovery/focus | Markup is moved before controller behavior is characterized | Undo, sheets, keyboard, timer resume, or rollback silently regress | Medium without journey tests | Pure helpers first; controller second; markup last; browser parity before next surface | Low |
| Multi-session work leaves a dual path | A slice pauses after adding the new service but before callers/deletion | Future changes must update both paths | High at checkpoint | No ticket completes with forwarding aliases or mixed callers; revert incomplete slice instead | Low |
| Scope absorbs redesign/features | Large files expose tempting product changes | Parity cannot be distinguished from new behavior | High in diff/review | Explicit freeze; record improvements separately after the refactor ships | Low |
| Final guard overreaches | Unrelated auth/settings infrastructure is forced into core domains | Unnecessary churn and false architectural purity | High in guard test | Guard only the four core route families and AI domain executors; document explicit infrastructure exclusions | Low |

### Plan critique result

**GO.** No P0/P1 blocker remains after adding characterization first, a cross-domain workflow
layer, per-slice caller deletion, transaction fault injection, and scoped import guards. Tickets
map to one observable boundary or user surface and are independently revertible.

### Steelman

The strongest alternative is a server-only refactor: it would remove the highest data-integrity
risk sooner and avoid touching already-shipped UI. That is a credible smaller scope, but it leaves
four stateful 1,000-line orchestrators as a separate compounding refactor with the same missing
journey coverage. The selected plan still wins because the server and UI halves are sequenced,
not interleaved: server boundaries can ship and stand alone after Phase 2, while Phase 3 reuses
the characterization already paid for. A mechanical file split is weaker because it makes
rollback look easier without removing any duplicate owner or enforcing a seam.

## Rollout, rollback, and handoff checkpoints

- Use one refactor branch/PR and one coherent commit per ticket. Do not start the next vertical
  slice while focused or full gates are red.
- At each checkpoint, record: callers migrated, old files deleted, focused tests, full gate,
  architecture-guard delta, and any deferred behavior (normally none).
- The beta wide-sweep execution gate should offer the normal three routes. The recommended route
  is sequential ticket execution on one branch because this is code-only R2 work.
- No schema/auth split applies. If a ticket discovers schema/auth work, park it and create a
  separate R3 ticket/branch; do not mix it into this plan.
- Rollback is by complete ticket/slice. Because no migration or data rewrite occurs, database
  restoration is not part of rollback.
- AH is the exception to reversible state: an already-sent basket mutation cannot be undone by
  code. Verification uses mocks only; a live regression requires reviewing the AH basket before
  retrying and rolling back the deployment.

## Open Questions

> **Q: Execute the full server-plus-UI plan, or stop after the Phase 2 server checkpoint?** -
> Default: execute all four phases. Reason: server-only removes the data boundary risk but leaves
> the four UI orchestration bottlenecks and wastes some of the characterization investment.

> **Q: May execution fold in user-visible improvements discovered during extraction?** -
> Default: no; preserve parity and record improvements for a separate plan. Reason: mixing
> redesign with structural movement makes regressions harder to detect and rollback.

## Resume pack

- **Goal:** replace dispersed core data/UI ownership with tested domain/workflow boundaries and
  per-instance UI controllers without changing product behavior, schema, auth, or providers.
- **Current state:** shipped on `codex/domain-boundary-refactor`; all four phases and eleven
  tickets are complete; final review is GO.
- **Pending verification:** none. Live provider verification remained intentionally out of scope.
- **Open questions:** resolved in favor of all four phases and strict no-visible-change parity.
- **Stage note:** this is R2 code-only wide-sweep work at beta. The schema/auth split does not
  apply; execution discovered no R3 scope.
