# Recipe Rotation + Freezer Rhythm

_Status: Implemented - 2026-07-31 (all five phases complete and fully verified; awaiting draft PR review and merge)_

## Problem framing

Replace Meal Plan's paid, free-form AI `Suggest` action with an explainable deterministic
shortlist driven by household-owned recipe cadence, cook history, planned reservations, and
existing freezer stock. Each row exposes exactly `Cook` or `Use freezer`; that source decides
Shopping through the existing Dutch-ingredient derivation.

## Product contract

- Rotation policies are household recipe metadata: unconfigured, `never`, `weekly`,
  `fortnightly`, `monthly`, `seasonal`, or `special`, with optional meteorological season filters.
- Missing cadence creates no debt; a recipe is either due once or not due.
- Planning reserves cadence; only cooking resets it.
- `Cook` reuses `source=fresh` and the recipe's normal servings. Shopping includes every Dutch
  recipe ingredient. Existing Freeze confirmation records actual frozen portions after cooking.
- `Use freezer` reuses `source=freezer` and the current on-hand serving default. Shopping includes
  only `serve_fresh` ingredients. Existing Consume confirmation records actual use.
- Freezer targets choose the recommended source; they never calculate a special batch or mutate
  inventory during planning.
- The selected ledger has `For this week` (up to 3 due rows) and `Freezer low` (up to 2 non-due,
  non-planned below-target rows). A recipe appears in only one lane.
- AI may optionally propose season tags for unconfigured recipes after explicit invocation and
  review. It never chooses cadence or freezer targets and never runs on ordinary page loads.

## Canonical behavior

- Time zone: `Europe/Amsterdam`; weekly/fortnightly are 7/14 local days; monthly advances one
  clamped calendar month; seasons are Mar-May, Jun-Aug, Sep-Nov, and Dec-Feb.
- Past weeks omit the shortlist. Reservation queries include an explicit lookback/lookahead
  independent of visible weeks; seasonal reservations cover the whole season instance.
- `Use freezer` when linked portions exist and a configured keep-stocked target is not below
  target. `Cook` when stock is empty or a configured target is below target.
- A keep-stocked recipe with `targetPortions=null` has no low-stock ratio/lane; when due and stock
  exists it may use the freezer.
- Stock is keyed to the exact recipe ID; composite child stock is not rolled up.
- Shortlist writes normalize the week inside the SQLite transaction, recompute cadence, stock,
  source, and duplicates, and return `json({ code, candidates }, { status: 409 })` on drift.

## Scope

### In

- Additive recipe rotation columns and append-only Drizzle migration.
- Pure cadence/reservation/ranking and binary source projections with focused tests.
- Atomic rotation + existing freezer-target recipe metadata API and import compatibility.
- Combined `Rhythm & freezer` recipe panel/sheet and recipe-list metadata/filter.
- Two-lane Meal Plan shortlist, optimistic add, structured drift recovery, Planned + Undo.
- Removal of Meal Plan Suggest UI, stream/prompt state, and obsolete repeat/suggestion settings.
- Assistant suggestion migration to explicit rotation facts.
- Optional reviewed AI season bootstrap with spend cap, single-flight, strict validation, stale
  protection, atomic apply, and guarded undo.
- English/Dutch copy, authenticated E2E, migration rehearsal, rollback and production gates.

### Out

- Auto-filling weeks, automatic day assignment, reminders, scheduled jobs, public-holiday logic.
- Batch calculators, custom cook servings, inventory writes during planning, or new freezer data.
- AI-owned cadence/targets, Assistant removal, shopping/AH ingredient-source changes.

## Execution phases

1. Additive schema, pure rotation engine, binary source projection, persistence/import.
2. Combined recipe editor, recipe metadata/filter, selected-week shortlist.
3. Migrate Assistant callers, then delete the page-specific AI suggestion system.
4. Add the optional reviewed season bootstrap.
5. Simplify, run focused/full gates, rehearse migration/rollback, document and deliver.

## Execution tickets

| Ticket | Observable behavior | Risk | Primary targets | Verification / rollback |
| --- | --- | --- | --- | --- |
| ROT-1 | Existing DBs migrate with rotation unconfigured and old rows unchanged. | R3, `requires_stage_gate: true` | `src/lib/server/db/schema.ts`, generated `drizzle/0027_*`, metadata journal/snapshot | Empty replay, populated upgrade, invalid-state tests; code rollback leaves additive columns. |
| ROT-2 | Pure stable due/reason/rank output for cadence, seasons, history, and reservations. | R2 | `src/lib/meal_rotation.ts`, recipe/meal-plan queries | DST, month-end, winter, prior-week plan, removal/reappearance; remove projection to roll back. |
| ROT-3 | Due/low recipes resolve to exactly `cook` or `use_freezer`. | R2 | `src/lib/meal_rotation_source.ts`, inventory queries | Target null/met/low, exact recipe identity, duplicate-lane exclusion; remove projection. |
| ROT-4 | One authenticated metadata write atomically saves rhythm and freezer target; imports remain compatible. | R3, `requires_stage_gate: true` | recipe commands/workflow/API, settings import | Invalid state rolls back both, old/new import; stop exposing additive fields. |
| ROT-5 | Recipe detail edits both independent intentions in one recoverable Bottom Sheet. | R2 | recipe detail components/loaders/list, messages | Phone/desktop, keyboard, English/Dutch, failure drafts; restore current freezer panel. |
| ROT-6 | Current/future Meal Plan shows guarded two-lane shortlist with Cook/Use freezer and Undo. | R2 | meal-plan page/workflow/controller/API, messages, E2E | All states, structured 409, source/shopping agreement, two accounts; remove shortlist. |
| ROT-7 | Assistant suggestions use rotation facts and no retired preference readers. | R2 | `meal-plan-suggestions.ts`, prompt/eval/tests | Due/unconfigured/never/large catalog and exact response shape; coherent caller revert only. |
| ROT-8 | Meal Plan/Settings contain no page-specific AI Suggest path or dead knobs. | R2 | meal-plan page/controller/workflow/settings/API/messages | Source guard, no provider request, settings save; coherent UI/prefs revert only. |
| ROT-9 | Explicit Settings action proposes reviewed season tags only, within existing AI controls. | R2 | AI/workflow/API/Settings review component | Auth, cap, single-flight, malformed/stale output, atomic apply/undo; optional action removable. |
| ROT-10 | Both test accounts pass the complete regression and production-shaped migration gates. | R3, `requires_stage_gate: true` | tests, delivery log | `npm test`, scratch integrity/migration/rollback, revision truth, canary. |

## Verification matrix

| Seam | Required proof |
| --- | --- |
| Rotation | Pure boundary tables; no debt; previous/future reservation; deterministic reasons/rank. |
| Freezer/source | Null/met/low/on-hand cases; exact recipe identity; Cook/Use freezer only. |
| Shopping/AH | Cook matches manual fresh needs; Use freezer emits only `serve_fresh`; names remain Dutch. |
| Persistence | Auth, atomic validation, legacy/new import, append-only migration replay and rollback. |
| UI/UX | 320/375/393/768/1280, long Dutch, keyboard/focus/live region, first/caught/stale/error/undo. |
| AI boundary | Explicit invocation, background cap, strict schema/IDs, fingerprint, review, spend log, no silent write. |
| Delivery | Unit/check/build/E2E/full gate, isolated production-shaped restore, Railway truth and canary. |

## Rollout and rollback

Implement on `wide-sweep/schema-recipe-rotation` from current `origin/main`. The migration is
additive and is rehearsed against an isolated production-shaped restore before merge. A code
rollback keeps the extra columns; never drop them during an incident. Production promotion occurs
only through merged `main`, Railway `SUCCESS`, deployed commit equality, and privacy-safe canary.

## Open Questions

None. The Shortlist Ledger, binary action vocabulary, combined editor, soft-due semantics,
manual special shelf, and optional season-only AI scope are resolved.

## Completion evidence

- Additive migration `0027_funny_wallop` passed populated upgrade, foreign-key integrity, and
  pre-rotation code rollback compatibility rehearsals.
- `npm test` passed 114 test files / 669 unit tests, 31 primary authenticated browser stories
  with one deliberate connected-AH skip, zero Svelte diagnostics, and the production build.
- The complete secondary-account browser suite passed 31 stories with the same deliberate skip.
- The new phone E2E sets a weekly rhythm, confirms Meal Plan has no `Suggest` action, plans the
  deterministic `Cook` row, and undoes it back into the shortlist.
- Shopping seam tests prove `Cook` derives all canonical Dutch recipe ingredients while
  `Use freezer` derives only canonical Dutch `serve_fresh` ingredients.
- The reviewed AI bootstrap is explicit, capped, strict-schema, season-only, stale-guarded,
  atomic, and undoable; ordinary shortlist page loads make no provider request.

## Resume pack

- **Goal:** ship deterministic recipe rotation with freezer-aware Cook/Use freezer actions.
- **Current state:** implementation and local stage gates are complete on
  `wide-sweep/schema-recipe-rotation`; draft PR creation is next.
- **First command:** review and merge the draft PR when ready.
- **First files:** `src/lib/meal_rotation.ts`, `src/lib/meal_rotation_shortlist.ts`,
  `src/lib/server/workflows/meal-plan.ts`, `src/routes/meal-plan/+page.svelte`.
- **Pending verification:** after merge, supervise Railway `main` deployment truth and run the
  privacy-safe authenticated canary before calling the feature live.
- **Open questions:** none.
