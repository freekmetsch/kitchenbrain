# Remove Recipe Timers

_Status: Shipped on `wide-sweep/schema-remove-recipe-timers` (2026-07-30)_

## Problem Framing

The recipe cooking view currently owns a complete timer product: inline timer controls, a
persistent app-shell countdown, browser workers and foreground alarms, server-scheduled Web Push,
device subscriptions, authenticated alert APIs, SQLite jobs, VAPID configuration, settings data
controls, and future Assistant timer work. Freek wants that feature fully retired rather than
hidden or left dormant.

The durable outcome is a smaller cooking surface that keeps recipe steps, serving projection,
current-step progress, ingredient checks/swaps, Cook Mode generation, and cook logging, while no
active application code, API, schema, configuration, dependency, message, or roadmap ticket offers
or implements timers.

The repository's append-only migration invariant is binding. Historical migrations, archived plans,
deployment logs, and git history remain truthful records that the feature once existed.

## Scope

### In

- Remove timer controls and alert setup from Cook Mode, the recipe page, and the app shell.
- Remove all client timer coordination, alarm, worker, notification, receipt, and push code.
- Remove all server timer-alert routes, validation, repository, scheduler, startup, and push code.
- Remove the timer metadata contract from Cook Mode types, AI generation, validation, prompts,
  localization, fallback projection, recipe-edit invalidation, fixtures, and active tests.
- Advance persisted cooking sessions to a timer-free version while accepting the previous session
  version as a forward-compatible input and preserving its non-timer progress.
- Remove timer-specific settings reset/export behavior, messages, VAPID configuration, Railway
  configuration tooling, and the `web-push` dependency.
- Append migration `0026` to drop `timer_alert_jobs` before `push_subscriptions`; regenerate only
  the new Drizzle journal entry and snapshot.
- Remove timer capabilities from the active Assistant roadmap and retire the current timer sound
  issue with an explicit feature-removal resolution.
- Verify fresh and populated database upgrades, the surviving Cook Mode journey at phone and
  desktop widths, and the complete repository gate.

### Out

- Rewriting historical migrations `0023`/`0024`, their historical snapshots, archived feature
  lists/artifacts, deployment history, or git history.
- Automatically scrubbing inactive browser storage, IndexedDB, or old Push subscriptions with
  one-release cleanup code. Those values have no sender or reader after removal; keeping cleanup
  code would retain the retired feature in the runtime. Clearing site data removes them manually.
- Bulk-clearing stored Cook Mode JSON. Existing timer keys are ignored as legacy extra data and
  disappear when a recipe is regenerated through the ordinary cache lifecycle; forced clearing
  would create avoidable paid OpenRouter work.
- Changing recipe directions, Dutch AH ingredient fields, authentication, unrelated notification
  behavior, or generic JavaScript timeout usage.
- Merging to `main`, changing production Railway variables, or applying the migration to real
  household data in this run.

## Existing-System Inventory

| Surface | Current owner | Retirement action |
| --- | --- | --- |
| Inline recipe controls | `BenchSheet.svelte`, `CookStepCard.svelte`, `InstructionLines.svelte`, `TimerChip.svelte` | Remove timer props, state, copy, and component |
| Cross-route timer state | `src/lib/timer/`, `CookTimerBar.svelte`, root layout | Delete coordinator/context/worker and shell rendering |
| Foreground lifecycle | `lifecycle-controller.svelte.ts` | Delete with timer runtime; its Wake Lock was active only while a timer ran, so no replacement state exists after retirement |
| Background alerts | `src/lib/server/timer-alerts/`, `/api/timer-alerts/**`, `hooks.server.ts`, `service-worker.ts` | Delete server/API code and return the service worker to asset caching only |
| Durable data | `push_subscriptions`, `timer_alert_jobs` | Drop child table first, then parent, in append-only `0026` |
| Cook Mode contract | `types.ts`, `staleness.ts`, `cook_mode.ts`, `cook_mode.md`, `cooking_steps.ts`, `timer_extract.ts` | Remove emitted/projected timer metadata and delete extraction |
| Cooking progress | `cook_session.ts`, session controller, Bench Sheet | Store v5 without timer fields; read v4 generically and retain surviving state |
| Operations/config | package manifests, env templates, Compose, README, Railway helper | Remove VAPID and `web-push` setup |
| Product planning | active Assistant roadmap and current timer issue | Remove future capabilities; archive issue as retired |

## Options

| Option | Tradeoff | Decision |
| --- | --- | --- |
| Hide timer UI but keep runtime/server/schema | Fastest visible change, but preserves cost, attack surface, dead jobs, dependencies, and future caller debt | Rejected |
| Delete runtime but leave schema/config/contracts dormant | Avoids a destructive migration, but contradicts full retirement and leaves misleading operational surface | Rejected |
| Two-release deprecation before deletion | Maximizes rollback compatibility, but keeps the unwanted feature live for another release and compounds duplicate paths | Rejected |
| Full vertical deletion with one append-only retirement migration | Smallest lasting system; requires R3 migration discipline and an explicit post-migration rollback path | Chosen |

## Chosen Approach

Delete the feature by seam, starting with its rendered/client contract, then its server and
persistence boundary, then documentation and dependency residue. Keep old Cook Mode cache objects
readable but project only surviving fields. Accept previous v4 session objects by reading only the
v5 fields so an in-progress cook retains its position, checks, swaps, language, servings, and
frozen recipe while timer state is silently discarded.

Generate `0026` from the timer-free schema. Its SQL must drop `timer_alert_jobs` before
`push_subscriptions`. The production rollout is intentionally not part of this run: the branch and
draft PR are the beta staging boundary. Once a later merge applies the migration, rollback is a
Litestream/database restore to a pre-migration generation or a new append-only migration that
recreates empty tables before old code is restored; reverting application code alone is not safe.

Context7 exception: internal-only deletion; no external framework or API behavior changes.

## Phase Plan

1. Remove the rendered and client Cook Mode timer contract while preserving the cooking journey
   and forward-migrating local progress.
2. Remove the server, service-worker, schema, operational configuration, and dependency boundary;
   generate and rehearse the retirement migration.
3. Remove active product/documentation residue, run the no-feature sweeps and complete gates, then
   publish a draft PR without promoting it to production.

## Execution Tickets

### TIMER-REMOVE-1 — Retire the recipe and client timer experience

- **Observable behavior:** Cook Mode renders and restores normal cooking progress without timer
  controls, timer alert banners, edit guards, or a global countdown on any route.
- **Scope in:** `src/routes/+layout.svelte`, `src/routes/recipes/[slug]/+page.svelte`,
  `src/lib/components/BenchSheet.svelte`, `CookTimerBar.svelte`,
  `src/lib/components/cook-mode/{CookStepCard,InstructionLines,TimerChip}.svelte`,
  `cook_session.ts`, `session-controller.svelte.ts`, timer/lifecycle controllers and tests,
  `src/lib/timer/**`, timer extraction, messages, relevant unit and Playwright fixtures/tests.
- **Scope out:** serving projection, ingredient checks/swaps, current-step selection, cook logging,
  generic retry/acknowledgement timeouts, and service-worker asset caching.
- **Risk:** R2; impact 5; effort L; confidence high.
- **Verification:** timer-free unit fixtures; v4-to-v5 session preservation test; recipe edit and
  Cook Mode tests; authenticated 375/1280 browser story proving selection, reload restore,
  malformed recovery, no timer buttons/alerts/global role, and no horizontal overflow.
- **Rollback:** revert this ticket before the database ticket lands.

### TIMER-REMOVE-2 — Retire background alert infrastructure and data

- **Observable behavior:** the application has no timer alert endpoint, scheduler, push sender,
  VAPID setting, timer reset group, timer database table, or timer-specific dependency.
- **Scope in:** `src/lib/server/timer-alerts/**`, `src/routes/api/timer-alerts/**`,
  `src/hooks.server.ts`, `src/service-worker.ts`, `src/lib/server/db/schema.ts`,
  settings reset/export files and tests, `package.json`, `package-lock.json`,
  `scripts/configure_railway_timer_alerts*`, `.env.example`, `.env.template`,
  `docker-compose.yml`, `README.md`, and new Drizzle `0026` journal/snapshot files.
- **Scope out:** historical migrations/snapshots, unrelated PWA caching, current production
  Railway variable mutation, and real-data migration execution.
- **Risk:** R3; impact 5; effort M; confidence high.
- **requires_stage_gate:** true
- **wide_sweep:** true
- **Dependencies:** TIMER-REMOVE-1 must remove every caller before the schema is dropped.
- **Verification:** generated SQL inspection; fresh migration; populated `0025` upgrade containing
  representative subscription/job rows and an old Cook Mode cache; `foreign_key_check`;
  `integrity_check`; old API route absence; package/config symbol sweep; focused settings tests.
- **Rollback:** before migration, revert the commit. After migration, restore the pre-migration
  database generation or ship a new append-only schema recreation before restoring old code;
  device subscriptions and pending timer jobs are intentionally not recoverable.

### TIMER-REMOVE-3 — Close active product promises and prove full removal

- **Observable behavior:** current documentation states the timer feature was retired, no active
  roadmap promises its return, and all repository gates pass.
- **Scope in:** `FEATURE_LIST_ASSISTANT_HOUSEHOLD_BUTLER_ROADMAP.md`, the current mobile timer
  issue, this feature list, README timer setup removal, and tests/sweeps needed for closure.
- **Scope out:** rewriting archived plans, old deployment log entries, and historical HTML.
- **Risk:** R2; impact 4; effort M; confidence high.
- **Verification:** active-code/config/product-doc symbol sweep with explicit exceptions only for
  immutable migration/archive/retirement history; `npm run check`; `npm run test:unit`;
  `npm run test:e2e`; `npm run test:e2e:secondary`; `npm run build`; final `npm test`;
  `git diff --check`.
- **Rollback:** restore the roadmap/issue state only when the feature code and schema are restored.

## Plan Critique

### Failure-Mode Table

| Failure mode | Trigger | Impact | Detectability | Mitigation | Residual risk |
| --- | --- | --- | --- | --- | --- |
| Parent table is dropped before child | Incorrect migration ordering with foreign keys enabled | Migration failure or inconsistent upgrade | Fresh/populated rehearsal and SQL inspection | Drop `timer_alert_jobs` before `push_subscriptions`; require FK/integrity checks | Low |
| Old code is redeployed after migration | Application-only revert assumes deleted tables still exist | Production startup failure when configured scheduler queries absent tables | Deployment/startup canary | Restore the pre-migration DB or recreate schema additively before reverting code; never use code-only rollback | Medium until production promotion is explicitly approved |
| Existing Cook Mode caches are invalidated globally | Cache cleanup nulls stored JSON | Paid regeneration, latency, and household friction | DB diff and provider-free browser fixture | Do not bulk-clear caches; ignore legacy extra keys and remove them only through ordinary regeneration | Low |
| In-progress cooking state is discarded | New reader accepts only v5 | Lost step, checks, swaps, language, or serving selection | v4 fixture upgraded through reader | Accept v4 as input, read only surviving fields, emit/save v5 | Low |
| Timer caller survives deletion | Hidden import, route, message, fixture, roadmap item, or reset group remains | Build failure or incomplete deprecation | Exact symbol and file sweeps plus complete gate | Delete all mapped seams in one change; no deferred caller cleanup | Low |
| Old app instance overlaps new schema during Railway rollout | New instance migrates while old scheduler still ticks | Short-lived timer API failures and caught scheduler errors | Bounded deployment logs/canary during later promotion | Stage/draft PR first; accept only bounded rollout noise; verify new instance succeeds before old revision retires | Low |
| Old service worker or browser data remains | Device has not activated the new worker or cleared storage | Inert local residue; at most a queued pre-deploy notification | Manual site-data inspection only | New worker removes push handlers and replaces via existing `skipWaiting`; no server sender remains; document manual site-data clearing rather than retain cleanup code | Low |
| Removing lifecycle code also removes Wake Lock | Wake Lock existed only while a timer ran | Cooking screen may sleep as it already did when no timer ran | Source inspection | Explicitly accept removal: there is no timer-running state after retirement; any always-awake Cook Mode is separate product scope | Low |
| Active Assistant plan resurrects timers | Future timer capability tickets remain | Feature returns through unrelated work | Active-doc sweep | Delete timer capabilities/dependencies and add one retirement constraint | Low |
| Generic timeout tests are over-deleted | Broad text replacement treats `setTimeout`/fake timers as the product | Retry, toast, or async behavior regresses | Diff review and focused tests | Delete by ownership/import seam, not by the English word “timer” alone | Low |

### UI/UX Audit

The authenticated baseline story passed at 375 px and 1280 px on 2026-07-30. Removal verification
then passed the surviving step-selection, progress, malformed-session recovery, and overflow
stories at both widths under both isolated accounts. The resulting journey is recipe → cooking
steps → select/adjust/log, with no permission prompt, background-alert status, timer chip, or
global timer detour.

### Review-Work Critique

The first draft had three material weaknesses: it described an unsafe code-only rollback after the
drop migration, proposed expensive bulk cache invalidation, and would have discarded valid v4
cooking progress. The final plan fixes all three. It also names the previously implicit
`timer_extract.ts`, recipe edit guard, settings reset, staleness/localization, and Wake Lock seams.

**Steelman:** A two-release deprecation would provide the easiest application rollback, especially
around rolling deploys and old service workers. Full deletion is still the right choice because the
user explicitly wants the feature gone, the only durable database rows are disposable device
subscriptions and pending jobs, historical migrations already provide deployment lineage, and the
beta staging branch prevents real-data promotion before a separate merge decision. The stricter
post-migration rollback runbook handles the real risk without keeping a complete unwanted subsystem
alive.

**Plan critique recommendation: GO.**

## Risk and Verification Matrix

Overall risk is **R3** because the plan drops schema containing real household timer data. The code
and UI deletion is R2. The schema/auth split is already active through branch
`wide-sweep/schema-remove-recipe-timers`; this run stops at a draft PR.

| Boundary | Risk | Required proof |
| --- | --- | --- |
| UI/UX | R2 | Authenticated 375/1280 story; no timer affordance; progress and recovery preserved |
| Cook Mode contracts | R2 | Type/check/unit coverage; legacy cache accepted as inert extras; new output has no timer fields |
| Local session compatibility | R2 | v4 fixture preserves all surviving state and saves v5 |
| Authenticated APIs | R2 | Timer route tree deleted; no unrelated auth/session change |
| SQLite migration | R3 | Child-first drop; fresh and populated rehearsals; FK/integrity `ok` |
| Deployment rollback | R3 | Database-aware runbook; no code-only revert claim after migration |
| Secrets/config | R2 | References removed from repo without reading values; production variables untouched in this run |
| Dependencies | R1 | `web-push` and types absent from manifest/lock; install/build pass |
| UI audit | R2 | Ran; baseline passed at 375 and 1280; removal story specified |
| UX audit | R2 | Ran; no unrelated finding; simplified cooking journey specified |
| Harden audit | — | Skipped: no auth/security design change; migration integrity is covered directly |
| Stack discipline | — | Skipped: the change removes a dependency/service and adds none |
| Context7 | — | Internal-only deletion; no external API behavior claim |
| Independent critique | R3 | `opus` GO after rollback, cache, session, seam, and Wake Lock refinements |

## Rollout and Rollback

- Develop, verify, commit, and push only on `wide-sweep/schema-remove-recipe-timers`.
- Open a draft PR against `main`; do not merge or deploy in this run.
- A later promotion must supervise Railway through exact `main` revision `SUCCESS`, then run the
  authenticated canary and bounded error checks declared in `AGENTS.md`.
- Timer tables, subscriptions, and pending jobs are intentionally deleted on promotion.
- Before migration, rollback is an ordinary commit revert.
- After migration, rollback requires a Litestream/pre-migration database restore or a new
  append-only migration recreating empty compatibility tables before old code is deployed.
- Production VAPID variables may be removed only in the later promotion flow through the
  repository's value-safe Railway configuration contract; they are never read or exposed here.

## Open Questions

> **Q: Should this R3 branch be promoted to production immediately after review?** - Default: keep
> the PR in draft and stop before merge/deployment. Reason: beta permits stage-first development,
> while dropping real household timer rows remains a separate explicit production decision.

## Execution Evidence

- Removed the rendered controls, app-shell coordinator, workers, alert routes and scheduler,
  settings surface, operational helper, VAPID configuration, packages, messages, and active
  Assistant roadmap work.
- Added append-only migration `0026_fat_agent_zero.sql`, dropping the child job table before its
  subscription parent with `IF EXISTS` compatibility for partially provisioned databases.
- Rehearsed a populated `0025` database containing representative retired rows and a legacy Cook
  Mode cache. The cache was preserved, both tables were absent afterward, and
  `foreign_key_check`/`integrity_check` returned `ok`.
- Preserved valid v4 Cook Mode progress through the v5 reader while discarding unknown retired
  payload fields. New sessions persist only current step, language, servings, frozen recipe,
  ingredient checks, and swaps.
- Active source/config/package/asset sweeps found no feature-owned symbols or files. Historical
  migrations, archived plans, deployment records, and this retirement record remain intentionally
  truthful.
- `npm test` passed in supported CI retry mode: 0 Svelte diagnostics, 107 unit-test files /
  631 tests, 27 primary browser stories, one intentional fake-AH skip, and a production build. One
  unrelated Chromium context launch passed on its configured retry.
- The changed secondary-account Cook Mode journey passed 4/4 stories, including route/reload
  resume and malformed-session recovery at phone and desktop widths. The full secondary suite was
  attempted but remains blocked by an unchanged Shopping shared-fixture selector/state collision;
  no Shopping source or component is part of this diff.
- `npm audit --omit=dev` reported zero vulnerabilities and `git diff --check` passed.
- Production and real household data were not touched. Publication stops at the required draft
  PR; merge, Railway migration, canary, and value-safe production-variable cleanup remain a
  separate decision.

## Resume Pack

- **Goal:** remove the recipe timer feature completely from active application code, data,
  configuration, dependencies, tests, and current product promises.
- **Current state:** implementation and verification are complete on
  `wide-sweep/schema-remove-recipe-timers`; publication stops at a draft PR.
- **First command:** review the draft PR and decide separately whether to promote the R3 migration.
- **First files:** this feature list; `src/lib/components/BenchSheet.svelte`;
  `src/lib/components/cook-mode/cook_session.ts`; `src/lib/types.ts`;
  `src/lib/server/ai/cook_mode.ts`; `src/lib/server/db/schema.ts`.
- **First implementation move:** none; the branch is complete.
- **Pending verification:** full secondary Shopping suite after its unrelated shared-fixture
  collision is repaired; production migration/canary only after explicit promotion.
- **Open questions:** default to draft PR only; no production promotion in this run.
- **Beta wide-sweep note:** schema work is already split to the required wide-sweep branch; no auth
  change is included.
