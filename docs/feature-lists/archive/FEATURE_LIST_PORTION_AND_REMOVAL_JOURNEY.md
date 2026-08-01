# Portion and Removal Journey

_Status: Shipped to production — PR #64, Railway deployment `ea73e310-ee83-4ec8-9aae-5284fe1c082a`; late-review hardening in PR #66, Railway deployment `a11a5b76-5b45-4266-bead-65794f3ce305` (2026-08-01)_

_Overall risk: R3 — additive SQLite migrations and real household records_
_Stage gate: passed by the pre-0028 migration rehearsal before PR #64 merged_
_Diagnosis: `docs/known_issues/solved/ISSUE_RECIPE_MEAL_PLAN_SHOPPING_CONTROL_FRICTION_20260801-1425.md`_

## Outcome

Recipe, Meal Plan, and Shopping edit the same planned-meal serving count. A change made on any of
those pages updates the planned meal and re-materializes its shopping quantities. Rapid taps are
not dropped, and client-side navigation cannot leave the last tap unsaved.

On a Recipe page that is not linked to a planned occurrence, the control is explicitly labelled
`Cooking portions` and scales only the current cooking session. There is no planned record to sync
in that state. When one or more current/future occurrences exist, the page offers an explicit
planned-meal selector and never guesses between duplicates.

Serving presets are exactly `x1`, `x2`, `x3`, and `x4`; `x1.5` is removed. Presets stay inline when
their component container fits and move into a labelled `Batch` menu when it does not.

The same journey also gains consistent planned-meal removal, current-week shopping exclusion,
explicit future shopping defaults, and reversible recipe archive/restore.

## Implementation Result

- One planned-meal serving registry now coalesces rapid absolute-target writes and keeps Recipe,
  Meal Plan, and Shopping synchronized. Server-side guards reject historical or cooked changes and
  reconcile Shopping in the same transaction.
- Recipe portions remain editable while cooking guidance loads. Plan-linked recipes edit one
  selected occurrence; unlinked recipes clearly retain local cooking portions.
- The shared batch picker offers `x1`, `x2`, `x3`, and `x4`, moving to a labelled menu when its
  container is too narrow.
- Shopping now exposes meal-level portion controls, reversible week exclusions, and an explicit
  future-default action without placing ambiguous controls on aggregate ingredient rows.
- Planned meals can be removed with Undo, and cookbook recipes can be archived and restored without
  breaking historical references. Additive migrations and settings round trips cover both records.

Verification passed Svelte diagnostics, a clean production build, all 696 Vitest tests, the full
primary authenticated browser matrix, and the full secondary-account matrix with the deliberate
connected-AH skip. The one load-sensitive secondary hydration timeout passed on its focused rerun.
The R3 migration rehearsal upgrades a pre-0028 database with representative recipe, planned-meal,
shopping, revision, bought, and prior-AH-push data; it preserves those records, reports no foreign-key
errors, and proves older installations can still apply their earlier journal before upgrading.

The late-review follow-up centralizes the 1–99 planned-serving schema, rejects protected serving edits
before AI proposals are shown and again when they are applied, bounds client writes, clears optimistic
serving state on every removal path, keeps archive restore state live without a reload, and preserves
shopping-list revision invalidation across an in-flight AH push. Its final head passed all 705 Vitest
tests, warning-free Svelte diagnostics, the production build, and focused primary/secondary browser
coverage before the exact-main production canary passed.

## Problem Framing

The current journey has several different failures behind one frustrating experience:

- Recipe `+`/`−` buttons are disabled while structured cooking guidance loads, even though portion
  arithmetic does not depend on that request.
- Recipe portions remain local cook-session state even when the route has an exact planned-meal ID.
- Meal Plan drops repeated serving taps while one request is pending.
- Shopping discards meal identity after converting `mealIds` into names and therefore cannot offer
  an unambiguous planned-meal serving control.
- Shopping's need-cycle control looks temporary but can change recipe optionality and pantry staple
  inventory for future weeks.
- “Remove from this week” exists only for manual shopping sources.
- Shopping quantities do not show which planned meal and servings produced them.
- Planned-meal removal is buried, and cookbook recipes have no safe removal path.

The repair must preserve recipe base yield, fixed-batch rules, cook-session progress, derived bought
state, manual shopping amount overrides, prior AH pushes, historical recipe references, Dutch AH
lookup fields, and the append-only migration journal.

## UX Evidence

The first audit used isolated Playwright fixtures at 375 × 812 and 1280 × 900. Freek's follow-up is
first-class runtime evidence for the uncached Recipe state: the `+`/`−` controls could not be
pressed. Source tracing then established the deterministic cause.

| Priority | Finding | Evidence | Consequence |
|---|---|---|---|
| P1 | Recipe serving input is inaccessible during guidance loading. | All four `BenchSheet` serving buttons include `loading` in `disabled`; the component automatically starts that state when no eligible plan is cached. | A slow, failed, or retrying provider call blocks local portion arithmetic. |
| P1 | Recipe does not write the selected planned occurrence. | `recipe-pages.ts` returns validated `planMealId`, but `BenchSheet.changeServings()` updates only `servingDraft`; the ID is used only by Mark cooked. | Recipe, Meal Plan, and Shopping disagree after a recipe-page edit. |
| P1 | Rapid Meal Plan input is dropped. | A deterministic controller probe sent two immediate `+` calls; one request ran and the value stopped at 5 instead of 6. | Normal repeated input feels intermittently broken. |
| P1 | Shopping has neither an editable meal record nor safe control location. | Shopping maps entry `mealIds` to names. Ingredient rows can aggregate several sources and repeat the same recipe across all ingredients. | An ingredient-row stepper would be ambiguous and duplicated. |
| P1 | A temporary-looking Shopping control changes lasting data. | The need cycle can alter recipe optionality and pantry staple inventory. | A current-list intent silently changes future lists or inventory. |
| P2 | Removal depends on source and page. | Manual Shopping rows expose a removal action; recipe rows do not; planned-meal removal is secondary; recipe archive is absent. | Freek and Ylfa must hunt for or cannot perform common cleanup. |
| P2 | Portion lineage is invisible in Shopping. | Sources expose meal names but not planned serving counts. | Quantity changes are hard to verify or trust. |
| P2 | Presets are obsolete and width-bound. | Cooking shows `x1`, `x1.5`, `x2`; those controls already fill the 375 px row. | `x3` and `x4` need a responsive menu, not more cramped buttons. |

The isolated fixture used in the first audit contained cached guidance, so its working slow tap did
not cover Freek's uncached/loading state. A later attempt to launch a fresh isolated server was not
reachable under concurrent local processes and was terminated; no runtime conclusion was taken
from that attempt. The permanent regression seam is a component test that holds the cook-guidance
request pending and presses the serving controls.

## Scope

### In scope

- one canonical planned-serving command and one shared client intent registry keyed by meal ID;
- reliable serving edits from Recipe, Meal Plan, and Shopping;
- an explicit Recipe distinction between planned portions and local cooking scale;
- a Shopping planned-meals projection sourced from meal rows, not ingredient entries;
- responsive `x1`/`x2`/`x3`/`x4` selectors and working `+`/`−`;
- planned-meal removal from the three contextual surfaces with Undo;
- correct handling of manual amount overrides, bought rows, open AH preview, and prior AH pushes;
- current-week Shopping remove/restore for every aggregate;
- explicit lasting recipe/pantry default controls;
- reversible recipe archive/restore;
- additive migration, compatibility, accessibility, localization, and responsive verification.

### Out of scope

- real-time cross-device or cross-tab synchronization;
- changing recipe base yield when a planned occurrence changes;
- changing ingredient scaling mathematics;
- automatically editing a basket or list already sent to AH;
- changing AH search, ranking, Dutch product terms, or push payloads;
- changing past or cooked planned meals;
- deleting recipe history, cook logs, images, inventory provenance, or AH preferences;
- multi-household behavior or a new dependency/service.

## Existing-System Inventory

| Concern | Current owner | Plan decision |
|---|---|---|
| Planned serving record | `meal_plan_meals.servings` | Remains the only canonical value for planned shopping quantities. |
| Serving server write | `PUT /api/meal-plan/[id]` → `mealPlanService.updateMetadata()` | Add an explicit planned-serving command/guard; keep shopping reconciliation in the same transaction. |
| Meal Plan optimistic state | `src/lib/components/meal-plan/controller.svelte.ts` | Delegate serving/source intent to a module-level registry instead of dropping pending input. |
| Recipe cook scale | `src/lib/components/BenchSheet.svelte` | Keep local only without plan context; bind to canonical meal value with a validated plan context. |
| Recipe plan context | `loadRecipeDetailData()` and `?plan=<id>` | Validate recipe, non-past week, and planned status; add explicit current/future occurrence choices. |
| Cook guidance | `CookModeNetworkController` + `localizeCookMode()` | Never block portion input or overwrite it; scale locally and avoid paid regeneration per tap. |
| Shopping meal context | `loadShoppingPageData()` already reads week meals | Project all recipe-backed week meals directly, including ones with no active ingredient row. |
| Shopping ingredient sources | `shopping_week_entries.mealIds` | Retain for lineage only; never derive the editable meal identity from an owner recipe/source row. |
| Lasting shopping defaults | `choose-shopping-source.ts`, `applyRecipeShoppingChoice()` | Keep `included` for its existing lasting, cross-week meaning and label that meaning explicitly. |
| Current-week aggregate identity | `normalizeNameKey(source.term)` | Store one separate week + normalized-term exclusion record. |
| Recipe listing/lookup | `src/lib/server/domains/recipes/queries.ts` | Split active choices, historical reads, and new-reference guards. |
| Recipe schema | `recipes` + append-only `drizzle/` | Add nullable `archivedAt`; never hard-delete or squash migrations. |

## Options Considered

### Chosen: one meal-owned serving value with contextual adapters

All planned edits target an explicit meal ID through one server command and one shared client
registry. Recipe without a plan context remains honest local cooking scale. Shopping exposes one
control row per week meal, outside repeated/aggregate ingredient rows.

This is the smallest sustainable boundary because the meal record already drives shopping and the
server already reconciles Shopping transactionally.

### Rejected: keep three independent client controllers

Separate queues can calculate from stale values, lose an in-flight write during navigation, and
drift in retry/rollback behavior. The caller adapters may differ, but intent ownership cannot.

### Rejected: place `+`/`−` on Shopping ingredient rows

The same meal repeats across every recipe ingredient, one row can aggregate unrelated meals, and a
sub-recipe source can belong to two parent meals. The action would not identify what it changes.

### Rejected: make recipe yield the shared value

Recipe yield is the baseline for scaling; a planned meal is one occurrence. Updating yield would
change every future use and cache rather than the selected week's plan.

### Rejected: reuse `shopping_week_entries.included` for current-week removal

That field already carries lasting choices into future weeks and exists per source rather than per
visible aggregate. Reuse would conflate scopes and corrupt Undo.

### Rejected: hard-delete recipes

Recipes are referenced by plans, Shopping, cook history, inventory/freezer provenance, and AH
preferences. Archive/restore preserves those records.

## Fixed Product Decisions

1. A planned meal's database ID is the synchronization identity. Duplicate titles and duplicate
   occurrences remain distinct.
2. Planned-serving writes are absolute targets. `+`/`−` calculate from server-confirmed value plus
   queued intent, never from restored Recipe session storage or a stale event object.
3. Same-page controls update immediately. The registry flushes before client-side navigation; the
   next route reads the persisted value. No real-time protocol is added.
4. Two devices remain last-write-wins. Every client reconciles to the meal returned by the server;
   this accepted beta behavior is explicit rather than hidden.
5. Past or cooked meal links are read-only for portions. The server rejects serving writes even if a
   stale client renders a control.
6. Recipe plan context is explicit. Without it, `Cooking portions` stays local and never mutates an
   arbitrary occurrence. Current/future planned occurrences are selectable by date/title/ID.
7. Recipe serving controls remain interactive while cook guidance loads. Bounds and fixed-batch
   constraints may disable them; unrelated network I/O may not.
8. Cook guidance scales locally with the current target. Provider regeneration is never triggered
   per tap; a genuinely incompatible plan may regenerate once after the target settles.
9. Shopping shows all recipe-backed meals for the selected editable week, including freezer meals,
   meals with all sources excluded/covered, and meals with no fresh-side contribution. A short reason
   explains when a meal contributes no active item.
10. Shopping manual amount overrides remain authoritative and show `Manual amount — not following
    portions`; serving changes never clear them silently.
11. When derived amount/unit changes, affected bought entries return to the active list. A toast or
    status explains that the quantity changed and needs checking again.
12. A serving write cannot race Shopping row mutations or AH preview creation. Pending mutations are
    serialized; a completed serving change invalidates any preview and requires review again.
13. If the week has prior AH push history, the result says that the local list changed and the
    already-sent AH contents did not.
14. Presets are exactly `x1`, `x2`, `x3`, `x4`; `x1.5` disappears. The component switches between
    inline choices and a labelled `Batch` menu by available container width.
15. “Remove from this week” affects one Shopping week only. “Change future lists” is the only path
    that changes recipe optionality or pantry staples.
16. Cookbook removal means reversible archive, never hard delete.

## Delivery Sequence

### Phase 1 — Unblock and synchronize portions

- PRJ-02A — unblock Recipe controls and reconcile cook-session ownership
- PRJ-01 — canonical planned-serving command and shared intent registry
- PRJ-02B — plan-linked Recipe and Meal Plan serving selectors
- PRJ-02C — visible planned-meal removal across contextual pages

### Phase 2 — Add honest Shopping controls

- PRJ-03A — week planned-meals read model and portion lineage
- PRJ-03B — Shopping serving editing and mutation coherence
- PRJ-04 — current-week aggregate exclusion schema and commands
- PRJ-05 — remove/restore and explicit future-default UI

### Phase 3 — Add reversible cookbook removal

- PRJ-06 — recipe archive schema and settings round-trip
- PRJ-07 — active, historical, and new-reference boundaries
- PRJ-08 — archive/restore cookbook experience

### Phase 4 — Rehearse and prove the complete journey

- PRJ-09 — migration rehearsal, cross-page serving proof, and production handoff evidence

## Execution Tickets

### PRJ-02A — Make Recipe `+`/`−` work independently of cook guidance

**Risk:** R1
**Depends on:** none

**Observable result:** A Recipe serving button works while its cook-guidance request is pending,
failed, or retrying; a late response never resets the chosen value.

**In scope**

- Remove guidance `loading` from serving-button disabled rules.
- Keep only bounds and fixed-batch constraints as serving-input disable conditions.
- In plan context, initialize the visible value from `occasionServings`; do not restore a stale
  session serving over it.
- Keep unplanned `Cooking portions` restorable as local cook-session state.
- Ensure guidance response/adoption reads the latest target and never writes `servingDraft`.
- Scale existing structured guidance through `localizeCookMode()`; debounce/settle any genuinely
  required regeneration so a tap burst cannot create paid calls per tap.

**Out of scope:** persisting planned servings; shared selector extraction.

**Targets:** `BenchSheet.svelte`, `cook-mode/network-controller.svelte.ts`, cook-session storage and
focused tests.

**Verification**

- Component test holds cook-guidance fetch pending, presses `+` twice, and observes both changes.
- Pending, failure, retry, and late-success states preserve input and focus.
- A stale stored session cannot replace server-provided planned servings.
- A rapid burst produces no provider regeneration per tap.

**Rollback:** Revert this isolated component/controller change; no stored data changes.

### PRJ-01 — Own planned-serving writes at one shared seam

**Risk:** R2
**Depends on:** none

**Observable result:** Rapid and interleaved serving/source input converges on the last absolute
target, survives client-side navigation, and returns one authoritative meal value.

**In scope**

- Add an explicit server command for planned serving changes using the existing authenticated meal
  endpoint and transaction.
- Reject non-existent, past-week, or cooked meals; reconcile Shopping in the same transaction.
- Extract a module-level client registry keyed by meal ID, with confirmed value, desired value,
  generation, subscribers, and one serial/coalescing request loop.
- Route Meal Plan `setServings`, batch selection, and serving changes caused by fresh/freezer source
  through the registry.
- Buffer negative optimistic IDs and transfer intent when the real ID arrives.
- Discard superseded responses across `syncData()`, delete, source changes, and subscriber teardown.
- Flush the registry before client-side navigation; failure resolves with one toast and the last
  confirmed value rather than trapping navigation.
- Reconcile each client to the meal returned by the server. Document two-device last-write-wins.

**Out of scope:** cross-device real-time delivery; Recipe/Shopping markup.

**Targets:** meal-plan workflow/domain command and endpoint, a shared planned-serving client module,
`meal-plan/controller.svelte.ts`, focused service/controller tests.

**Verification**

- N rapid taps → final persisted = final visible target with coalesced requests.
- Interleaved source and serving actions preserve the later intent.
- Negative-ID input replays after ID replacement.
- A response crossing sync/delete cannot clobber a newer generation or resurrect a meal.
- Tap then navigate persists before the destination reads.
- Past/cooked writes are rejected server-side; one failed burst emits one error.

**Rollback:** Revert client registry and explicit command; existing meal data stays valid.

### PRJ-02B — Bind Recipe and Meal Plan to the shared selector

**Risk:** R2
**Depends on:** PRJ-02A, PRJ-01

**Observable result:** Meal Plan and a plan-linked Recipe page show and edit the same value with the
same controls; an unlinked Recipe clearly changes only local cooking scale.

**In scope**

- Extract/compose one accessible serving selector from established button, segmented-control, and
  compact-popover primitives.
- Offer `x1`, `x2`, `x3`, `x4`; inline when the container fits, `Batch` menu when narrow.
- Preserve 1–99 bounds, recipe baseline math, fresh/freezer defaults, and fixed-batch rules.
- Extend Recipe load data with current/future planned occurrences from meal rows.
- Keep validated `?plan=<id>` as the selected occurrence; offer `Choose planned meal` when entering
  directly; never auto-select among duplicates.
- Label states literally: `Planned portions` versus `Cooking portions`.
- Make past/cooked plan contexts read-only with an explanation.
- Keep Meal Plan and Shopping links plan-ID-specific.

**Out of scope:** Shopping rendering; planned-meal removal.

**Targets:** shared selector component, `BenchSheet.svelte`, `AddToPlanSheet.svelte`,
`MakeRecipeSheet.svelte`, Recipe detail loader/page, Meal Plan page, messages.

**Verification**

- Recipe plan context and Meal Plan reflect each other's writes after navigation.
- Direct Recipe with no occurrence stays local; one/multiple occurrence choices target exact IDs.
- Duplicate titles/recipe occurrences do not alias.
- 320/375/768/1280 px, pointer, keyboard, visible focus, 44 px targets, and fixed-batch cases pass.
- Exact preset set is asserted; no `x1.5` remains.

**Rollback:** Revert selector/call-site wiring; PRJ-01 and PRJ-02A remain useful.

### PRJ-02C — Make planned-meal removal visible in context

**Risk:** R2
**Depends on:** PRJ-01

**Observable result:** A selected planned occurrence can be removed from Meal Plan, Recipe, or
Shopping without being confused with recipe archive; Shopping re-materializes and Undo restores it.

**In scope**

- Put named `Remove meal` actions in the primary/overflow action group for an exact meal ID.
- Reuse the existing transactional delete and restore/Undo behavior through one client action seam.
- Cancel pending serving intent before delete and prevent late response resurrection.
- Use copy that distinguishes `Remove meal` from `Archive recipe` and `Remove from this week`.

**Out of scope:** recipe archive; Shopping ingredient exclusion.

**Targets:** Meal Plan page/controller, Recipe plan-context actions, Shopping planned-meal actions,
meal API/service only if restore needs a shared adapter, messages and tests.

**Verification:** remove/Undo from each page; pending serving delete; list/shopping reconciliation;
keyboard/focus; exact occurrence among duplicates.

**Rollback:** Revert contextual actions/adapters; meal rows remain recoverable through existing Undo.

### PRJ-03A — Project all week meals into Shopping with serving lineage

**Risk:** R1
**Depends on:** none

**Observable result:** Shopping shows one `Planned portions` row per recipe-backed week meal with its
exact ID, title/date/source, current servings, and contribution state.

**In scope**

- Build `plannedMeals` from the selected week's meal rows already loaded by the Shopping workflow,
  never from ingredient entry owner recipes.
- Include ID, dinner, recipe slug, servings, planned date, fresh/freezer source, status, recipe
  baseline/scaling mode, and a display-only contribution reason.
- Include meals with no active rows: freezer/no fresh side, all covered/excluded, or no ingredient
  contribution.
- Preserve duplicate titles and duplicate recipe occurrences by ID.
- Add serving context to recipe source disclosures as separate display data.
- Surface `Manual amount — not following portions` when `amountOverride` masks derived scaling.

**Out of scope:** writing servings; changing overrides; placing controls on ingredient rows.

**Targets:** Shopping workflow/query/types/page loader, `ShoppingLists.svelte` and a planned-meals
component, format/query/component tests, messages.

**Verification**

- Duplicate occurrences, same titles, freezer with no fresh side, fully covered/excluded meal, and
  composite/sub-recipe sources remain distinct and correctly labelled.
- Manual override is visible and unchanged.
- `name`, `term`, `selectedName`, `approvedTerms`, normalized aggregate key, AH preferences, and push
  payload remain byte-identical.

**Rollback:** Remove display projection/components; no stored data changes.

### PRJ-03B — Edit planned servings safely from Shopping

**Risk:** R2
**Depends on:** PRJ-01, PRJ-02B, PRJ-03A

**Observable result:** Shopping `+`/`−` and presets edit one planned meal; its quantities refresh;
manual overrides remain explicit; changed bought items return for checking; AH review cannot go
stale silently.

**In scope**

- Use the shared selector and registry for each editable, recipe-backed planned meal.
- Keep controls available for all such meals, not only meals with active ingredient rows.
- Coordinate serving intent with Shopping source/bought/recurring mutations so a user's own
  reconciliation cannot cause expected-revision errors.
- Invalidate once after a settled serving burst and refresh entry revisions/focus without layout
  loss.
- When recipe-derived amount/unit changes, clear `bought` for affected entries so they return to the
  active list with an explanation. Preserve manual/recurring bought state unless their derived
  requirement actually changed.
- Preserve `amountOverride`; report how many manual amounts did not follow the serving change.
- Disable AH preview creation while serving writes are pending. A completed write dismisses or
  invalidates any preview and requires Review again.
- When push history exists, state: local Shopping changed; already-sent AH contents did not.
- Keep past weeks and cooked meals read-only.

**Out of scope:** editing an AH basket automatically; clearing a manual amount without an explicit
user action; real-time multi-device conflict resolution.

**Targets:** Shopping planned-meals component/page/controller, shared serving registry adapter,
shopping materialization bought-state rule, AH sheet invalidation adapter, focused tests/messages.

**Verification**

- Shopping change updates Meal Plan and plan-linked Recipe after navigation and updates derived
  amounts locally.
- Rapid burst + concurrent row edit serialize without a self-created stale error.
- Manual override stays fixed and labelled; affected bought/pushed rows return active.
- Open/pending AH preview is blocked or invalidated with explicit recovery.
- Past/cooked, failure/rollback, fixed batch, fresh/freezer, no-contribution, duplicate, composite,
  and navigation-flush cases pass.

**Rollback:** Revert Shopping editing and materialization rule; read-only PRJ-03A context remains.

### PRJ-04 — Store current-week removal at the Shopping aggregate identity

**Risk:** R3
**requires_stage_gate:** true
**wide_sweep:** true
**Suggested branch:** `wide-sweep/schema-week-shopping-exclusions`
**Depends on:** PRJ-03A

**Observable result:** One command excludes a normalized Shopping item for one non-past week,
including sources added later; Restore reveals every unchanged underlying source choice.

**In scope**

- Add append-only `shopping_week_exclusions`, unique by `weekStartDate + itemKey`, where `itemKey`
  is the normalized Dutch term used by aggregation.
- Add transactional exclude/restore commands with the non-past guard and no entry revision coupling.
- Apply exclusions after materialization so new sources cannot resurrect the row.
- Show excluded aggregates in `Not this run` with sources intact.
- Round-trip through settings export/import/reset and migration compatibility tests.

**Out of scope:** changing entry `included`, recipe optionality, pantry staples, terms, AH choices,
or past weeks.

**Targets:** schema/migration journal, Shopping commands/queries/API, settings export/import/reset,
focused migration/guard tests.

**Verification:** mixed optional/required aggregate; new source after exclusion; revision churn;
past-week rejection; byte-identical source/default/AH guards; fresh/upgrade/replay/round-trip.

**Rollback:** Code-only; leave the additive table. Old code ignores exclusions, so rows reappear
without data loss. Prove with compatibility boot; never down-migrate or squash.

### PRJ-05 — Give every Shopping row honest remove and future-default actions

**Risk:** R2
**Depends on:** PRJ-03B, PRJ-04

**Observable result:** Every active aggregate offers `Remove from this week`; every excluded row
offers Restore. Lasting recipe/pantry changes require an explicit secondary action.

**In scope**

- Use one remove/restore action and Undo for recipe, recurring, and manual aggregates.
- Undo deletes the aggregate exclusion; it never sets every source `included=true`.
- Replace the one-tap need cycle with `Change future lists` and literal consequences: required
  ingredient, optional ingredient, or pantry staple.
- Preserve stale/failure handling, focus, and narrow-screen usability.

**Out of scope:** retiring recurring items forever or editing lasting defaults outside the explicit
action.

**Targets:** Shopping lists/quick controls/controller/page/API/workflow, messages and tests.

**Verification:** every source kind and multi-source aggregate; remove → materialize → restore;
lasting-state byte guards; explicit consequence copy; keyboard/320/375/error/Undo.

**Rollback:** Revert UI/API wiring; exclusion records remain inert and recoverable.

### PRJ-06 — Add reversible recipe archive data and settings compatibility

**Risk:** R3
**requires_stage_gate:** true
**wide_sweep:** true
**Suggested branch:** `wide-sweep/schema-recipe-archive`
**Depends on:** none

**Observable result:** The database records/restores recipe archive timestamps and backups preserve
them without changing list behavior yet.

**In scope:** nullable `recipes.archivedAt` append-only migration; idempotent commands; settings
export/import/reset; foreign-reference and AH-preference preservation.

**Out of scope:** filtering/new-reference behavior (PRJ-07); UI (PRJ-08).

**Targets:** schema/migrations, recipe commands, settings modules and compatibility tests.

**Verification:** fresh/upgrade/replay, archive/restore, export/import/reset, no cascades, AH
preferences unchanged, pre-change code boots against additive column.

**Rollback:** Code-only; keep column/timestamps. Accepted old-code behavior: archived recipes
temporarily reappear, with no deletion.

### PRJ-07 — Separate active choices, historical reads, and new recipe references

**Risk:** R3
**requires_stage_gate:** true
**wide_sweep:** true
**Depends on:** PRJ-06

**Observable result:** Archives disappear from new choices but remain functional through existing
plans, Shopping, cook history, freezer/inventory, direct links, and AH preferences.

**In scope**

- Classify every non-test direct recipe-table query as active choice, historical display, or
  write-a-new-reference; encode the boundary in architecture tests.
- Exclude archives from cookbook default, new planning, rotation/AI suggestions, and other choices.
- Load Meal Plan as active recipes ∪ recipes referenced by loaded meals.
- Keep Shopping hydration unfiltered for Dutch purchase-form/optionality/title/AH context.
- Guard create/import/add/freeze/AI write paths from new archive references until explicit restore.
- Detect archived slug/title collision before suffix generation and return restore-required.

**Out of scope:** archive controls or deletion.

**Targets:** recipe queries and all classified callers, Meal Plan loader, create/import/AI paths,
architecture boundary tests.

**Verification:** archived future meal retains servings/source/cooked/freezer/Shopping controls;
absent from all new choices; write guards; collision behavior; history/AH unchanged; full caller
accounting.

**Rollback:** Revert boundary code; archive timestamps remain and old lists temporarily show them.

### PRJ-08 — Add archive and restore to the cookbook

**Risk:** R2
**Depends on:** PRJ-07

**Observable result:** Recipe detail offers `Archive recipe` with literal confirmation and Undo;
Archived view provides a durable Restore path.

**In scope:** detail action; consequence confirmation; redirect + Undo; Archived cookbook view;
archived status/Restore; disable new plan/make until restored; English/Dutch focus handling.

**Out of scope:** hard deletion, image deletion, bulk archive.

**Targets:** Recipe header/detail API/page, cookbook loader/page, messages and tests.

**Verification:** cancel/archive/Undo/expired-Undo restore/direct historical link; no new plan until
restore; existing plan/Shopping controls work; named phone/desktop keyboard actions.

**Rollback:** Revert UI/API wiring; timestamps stay recoverable and may temporarily list as active.

### PRJ-09 — Rehearse migrations and prove the complete journey

**Risk:** R3
**requires_stage_gate:** true
**Depends on:** every prior ticket

**Observable result:** Both additive migrations and Recipe → Meal Plan → Shopping synchronization
pass on disposable data before production delivery.

**In scope**

- Rehearse upgrade and code-only rollback with planned, shopped, bought, pushed, overridden,
  archived, optional, recurring, freezer, composite, duplicate, and AH-preference records.
- Cross-journey E2E: change Meal Plan → verify Recipe/Shopping; change Recipe → verify both; change
  Shopping → verify both; remove/Undo; archive/restore while existing occurrence remains usable.
- Cover cook guidance pending, rapid navigation, duplicate occurrences/titles, sub-recipe shared
  sources, fixed batch, fresh/freezer, no active source, amount override, bought/pushed row, open AH
  preview, concurrent row mutation, failure, and past/cooked read-only state.
- Run primary and secondary isolated accounts at 320, 375, 768, and 1280 px.
- Finish with `npm test` and `npm run test:e2e:secondary`.
- During authorized delivery, supervise Railway source truth, migrations, health, authenticated
  canary, and exact deployed commit under the repository contract.

**Out of scope:** real provider calls, real AH pushes, or retained household evidence.

**Targets:** migration rehearsal/tests, cross-journey E2E, delivery evidence during `$run` only.

**Rollback:** Stop on any matrix mismatch. After deployment, roll back code only and retain additive
schema/data. Under old code, exclusions are ignored and archives reappear non-destructively.

## Failure-Mode Table

| Failure mode | Trigger | Impact | Detectability | Mitigation | Residual risk |
|---|---|---|---|---|---|
| Stale cook session poisons plan | Recipe local storage says 8; server meal says 4 | Next `+` persists 9 | Focused session/plan test | Server owns planned initial value; absolute targets | Low |
| Last tap lost on navigation | User taps then opens Shopping | Destination reads older value | Navigation E2E | Module registry + pre-navigation flush | Low |
| Old response clobbers new intent | Source/sync/delete overlaps serving write | Value reverts or meal resurrects | Controller generation tests | Meal-key generations across all writers | Low |
| Past/cooked link accepts change | Historical Recipe URL retains plan ID | Meal changes but Shopping cannot reconcile | Domain/API test | Read-only UI + server guard | Low |
| Meal identity inferred from ingredient | Duplicate/composite/sub-recipe source | Wrong occurrence edited | Query fixtures | Week meal rows are the only editable projection | Low |
| Manual override masks scaling | Row has `amountOverride` | `+` seems broken in Shopping | Query/UI test | Explicit manual-amount label and unchanged-count result | Medium; user must clear deliberately |
| Bought/pushed quantity changes silently | Serving update after tick/AH push | Done item no longer proves enough was bought | Materialization test | Reopen affected bought entries; explain AH is unchanged | Low |
| Own write causes source stale error | Serving reconciliation bumps revisions during row edit | User sees false conflict | Concurrent controller test | Serialize mutations and refresh revisions once settled | Low |
| AH preview becomes stale | Portion write overlaps preview | Guaranteed 409 or wrong expectation | AH preview test | Block creation while pending; invalidate/review again | Low |
| Guidance regeneration multiplies cost | Recipe taps while generation is serving-specific | Provider spend/cap failure | Network-controller count test | Local scaling; regenerate once only after settle if needed | Low |
| Two devices write same meal | Freek and Ylfa edit concurrently | Last writer overwrites first | Only observable after refresh | Accept LWW at beta; reconcile returned meal and document | Medium |
| Archive filter leaks into history | Global archived predicate | Existing plan/Shopping controls break | Caller audit + E2E | Explicit active/historical/write boundaries | Low |

**Steelman:** A skeptic could argue that a module-level registry and three contextual adapters are
more complex than letting each page issue a simple PUT. The shared registry is still the right
choice because navigation, source changes, optimistic meal IDs, and rapid taps all write the same
record; three queues would reproduce the race in three forms. The registry centralizes only intent
ordering and confirmation. Route loaders, labels, and layouts remain page-owned, while the existing
server transaction remains the sole persistence/reconciliation boundary.

## Verification Matrix

| Boundary | Required proof |
|---|---|
| Recipe accessibility | Pending/error/retry guidance never disables `+`/`−`; late response preserves value/focus |
| Planned serving correctness | Rapid, interleaved, optimistic-ID, sync, delete, failure, navigation cases |
| Context honesty | Planned Recipe writes exact ID; unplanned Recipe stays local; duplicate choices explicit |
| Shopping projection | All recipe-backed week meals, including no-contribution/freezer/composite cases |
| Shopping coherence | Override labelled; changed bought rows reopen; row writes serialize; AH preview invalidates |
| Responsive UI | 320/375/768/1280; pointer/keyboard/focus/44 px/no overflow; responsive Batch menu |
| Shopping scope | Current-week exclusion only; future default only through explicit action |
| AH invariant | Dutch names/terms/keys/preferences/payload unchanged; sent basket never implied updated |
| Recipe archive | New choices hidden; historical reads and existing controls remain; no cascades |
| Settings/schema | Export/import/reset; fresh/upgrade/replay/pre-change-code boot for both additions |
| Accounts/locales | Primary and secondary isolated users; English and Dutch copy |

## Rollout and Rollback Strategy

1. Land PRJ-02A as the isolated, immediately verifiable Recipe unblock.
2. Land PRJ-01/PRJ-02B/PRJ-02C and prove cross-navigation synchronization before Shopping becomes a
   new writer.
3. Land PRJ-03A/PRJ-03B before the exclusion schema so Shopping has one coherent week-meal model.
4. Route PRJ-04–PRJ-05 through `wide-sweep/schema-week-shopping-exclusions` and a PR.
5. Route PRJ-06–PRJ-08 through `wide-sweep/schema-recipe-archive` and a PR.
6. Rehearse both additive migrations stage-first, then run the complete cross-journey gate.

Every schema rollback is code-only. The migration journal is append-only: never reverse or squash.
Old code safely ignores week exclusions and archive semantics, so excluded rows and archived recipes
temporarily reappear without deleting records.

## Audit Record

### UI/UX audit

- P1: Recipe input is blocked by unrelated loading.
- P1: Recipe/Meal Plan/Shopping lack one shared planned-serving interaction.
- P1: ingredient rows are the wrong place for serving controls; meal-level context is required.
- P1: Shopping default control label does not match its lasting effect.
- P2: removal and portion lineage are inconsistent.
- Browser coverage: initial cached fixture at 375/1280; Freek's uncached runtime observation; fresh
  local server attempt unavailable and explicitly excluded from findings.

### Hardening audit

- P0: none.
- P1: stale session → canonical meal corruption; mitigated by server-owned initial value.
- P1: derived amount can change under bought/pushed state; mitigated by reopening affected entries
  and honest AH copy.
- P1: past/cooked serving write produces unsynchronized history; blocked in UI and server.
- R3: two additive schema changes retain separate branches, stage gates, round-trip tests,
  compatibility boots, and code-only rollback.
- No new dependency, service, secret, client credential, destructive migration, or AH-field change.

## Plan-Critique Record

Two independent Opus reviews were run against current source. The first corrected weekly exclusion
storage and archived-recipe boundaries. The clarification review returned **GO conditional on
mitigations** and added:

- planned Recipe value must override stale cook-session storage;
- past/cooked server guards and absolute targets;
- week meals, not ingredient sources, as Shopping control identity;
- explicit override, bought, revision, AH-preview, and prior-push behavior;
- one module-level registry with navigation flush; and
- accepted two-device last-write-wins behavior.

Every mitigation is assigned to PRJ-02A, PRJ-01, PRJ-03A, PRJ-03B, or PRJ-09. Ticket boundaries are
independently verifiable, and cross-journey verification is not deferred: each ticket carries its
own tests; PRJ-09 owns only migration rehearsal and full-story proof.

## Open Questions

> **Q: Should both additive migrations be rehearsed on a disposable staging copy before production?** - Default: Stage first. Reason: the beta may contain real household records, and this proves upgrade plus code-only rollback before the first production replay.

The portion synchronization work can begin without another answer. Only PRJ-04 and PRJ-06 are
gated from production by this choice.

## Resume Pack

**Goal:** Make Recipe, Meal Plan, and Shopping edit one planned serving value, then complete
reversible meal/item/recipe removal without weakening Shopping or AH data integrity.

**Current state:** All twelve tickets are implemented and locally verified. The issue is resolved in
code; no household data, provider request, or AH basket was touched.

**Next delivery step:** rehearse migrations `0028` and `0029` against a disposable,
production-shaped database copy, then run the complete primary/secondary authenticated browser and
responsive matrix before merging to `main`.

**Pending verification:** R3 stage rehearsal, complete browser matrix, and supervised production
delivery with an authenticated canary.

**Open question default:** stage both additive migrations before production.

**Delivery boundary:** keep this work stacked on the Green Ribbon UI commit until that dependency is
integrated; do not merge either additive migration to production before the stage gate.

**Preserve:** unrelated worktree changes, append-only Drizzle history, Dutch AH lookup fields,
isolated E2E data, recipe/history references, manual overrides, and stage gates.
