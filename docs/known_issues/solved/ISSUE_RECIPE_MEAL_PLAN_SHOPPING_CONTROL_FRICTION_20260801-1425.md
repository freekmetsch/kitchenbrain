# Issue: Recipe-to-shopping portion and removal controls are frustrating
Created: 2026-08-01 14:25 +02:00
Status: RESOLVED

## Symptom

The recipe → meal plan → shopping journey makes portion planning difficult to understand. The
meal-plan increase and decrease controls appear broken, deleting planned recipes is hard to find,
and removing unwanted shopping entries or recipe-derived ingredients is unclear. The recipe
portion presets also include an unwanted `x1.5` option and omit requested `x3` and `x4` options.

Freek clarified that the `+` and `−` controls on the recipe page cannot be pressed at all. Portion
editing must also be available from Shopping, not only Meal Plan, and all three pages must edit and
display the same planned serving value.

## Expected Behavior

Freek and Ylfa can choose the intended meal portions, see the shopping quantities update from that
choice, remove a planned recipe, and remove or exclude an unwanted shopping item without guessing
which control changes which source. Recipe portion presets offer `x1`, `x2`, `x3`, and `x4`, using a
compact menu when the available width cannot show them safely.

When a recipe has a planned meal, Recipe, Meal Plan, and the recipe source inside Shopping expose
working serving controls backed by that meal's one shared value. Shopping aggregate ingredient rows
never apply an ambiguous serving change across unrelated meals.

## Resolution

Recipe, Meal Plan, and Shopping now edit one planned-meal serving value through a shared client
registry and a guarded server command. Rapid taps coalesce to the latest absolute target, navigation
flushes pending intent, and shopping quantities reconcile transactionally. Recipe controls remain
usable while cooking guidance loads; plan-linked recipes choose an exact occurrence, while an
unlinked recipe changes only its local cooking portions.

The shared picker now offers `x1`, `x2`, `x3`, and `x4`, with a compact labelled menu when needed.
Shopping adds meal-level portion controls, reversible current-week exclusions, and explicit future
defaults. Planned meals support remove/Undo, and cookbook recipes support archive/restore through an
additive migration that preserves historical references.

Svelte diagnostics and a clean production build passed. The implementation workspace passed all
694 Vitest tests; all 14 filesystem architecture guards also passed on the clean runner with a
relaxed timeout under concurrent machine load. The five changed authenticated browser journeys
passed: meal-plan portion/remove/Undo, three-page Shopping synchronization, week exclusion/Undo,
recipe archive/Undo, and Recipe portion input during cooking-guidance loading. R3 stage rehearsal
and the complete browser matrix remain production delivery gates.

## Diagnosis

1. **P1 — recipe-page portion buttons are disabled by an unrelated cooking-guidance request.**
   All four `BenchSheet` `+`/`−` buttons include `loading` in their `disabled` expression, while
   the page automatically starts that loading state whenever no eligible structured cooking plan
   is cached. Changing portions is local arithmetic and does not require that request, so an
   uncached, slow, failed, or retrying provider call makes the core controls unpressable.
2. **P1 — recipe portions are not synchronized even when the page knows the planned meal.** The
   recipe loader validates and returns `planMealId` from `?plan=<id>`, but `changeServings()` only
   mutates the cook-session `servingDraft`; it never updates `meal_plan_meals.servings`. The plan
   ID is currently used only when marking the meal cooked.
3. **P1 — rapid meal-plan portion taps are dropped.** `changeServings()` derives the next value
   from the event's meal object, while `setServings()` ignores every call made while that meal has a
   request in flight. A deterministic controller probe showed that two immediate `+` calls issue
   one request and leave 5 portions instead of 6. The control therefore behaves correctly for a
   slow tap and incorrectly for normal repeated input.
4. **P1 — Shopping has no planned-meal serving control or serving identity.** Its projection maps
   entry `mealIds` to display names only. The page receives no meal ID + serving record that could
   safely update one planned occurrence, and putting a stepper on an aggregate ingredient row
   would be ambiguous and repeated across every ingredient from the same meal.
5. **P1 — the compact shopping control changes lasting defaults without saying so.** Cycling
   `Always → Nice to have → Usually stocked` can update a recipe ingredient's optional flag and add
   or remove a pantry staple. It looks like a way to change this week's list, but it modifies future
   lists and sometimes inventory.
6. **P2 — shopping removal depends on the source type.** Manual rows expose “Remove from this
   week”; recipe-derived rows do not. The existing `included` field cannot safely fill the gap: its
   recipe-choice command propagates lasting choices into future weeks, and it exists per source
   while one visible row can aggregate several sources.
7. **P2 — recipe deletion does not exist.** There is no recipe delete or archive action. Hard
   deletion would endanger cook history, existing meal plans, shopping lineage, and freezer or
   inventory references, so the safe product behavior is reversible recipe archiving.
8. **P2 — shopping quantities do not show their portion lineage.** A recipe source can name the
   meal but does not show the planned serving count that produced the amount.
9. **P2 — serving controls disagree across the journey.** The cooking screen still offers `x1.5`
   and stops at `x2`; add-to-plan and make-recipe sheets offer only `+`/`−`; meal-plan batch choices
   are always hidden in a popover. At 375 px the current three cooking presets consume the remaining
   row width, so adding two buttons requires a responsive menu rather than another cramped row.

## Root Cause

The planned meal already owns the one value that shopping materialization reads, but only the Meal
Plan page can edit it. Recipe treats portions as cook-session state even when it has an exact
`planMealId`; Shopping discards meal IDs after deriving names; and Meal Plan treats input as
independent writes instead of one desired value. Separately, recipe controls are coupled to
structured-guidance loading, shopping conflates “exclude this week” with lasting defaults, and
recipe removal was omitted because hard deletion is unsafe.

## Investigation Log

| Date | Action | Result | Next Step |
|------|--------|--------|-----------|
| 2026-08-01 14:25 +02:00 | Recorded Freek's report and selected the recipe → meal plan → shopping journey for source and browser diagnosis. | Reproduction and root cause were not yet established. | Map state lineage and reproduce at desktop and phone widths. |
| 2026-08-01 14:32 +02:00 | Traced recipe serving, meal-plan update, shopping materialization, and source-default code. | Found a pending-request guard that drops serving input, a source-type removal split, and lasting mutations behind the need-cycle button. | Confirm the serving race at the controller seam and inspect responsive behavior. |
| 2026-08-01 14:43 +02:00 | Exercised isolated Playwright fixtures at 375 px and 1280 px. | Slow `+` works; recipe rows have no per-week removal action; manual rows do; the cooking presets fit only because they stop at `x2`. | Reproduce rapid input deterministically without relying on browser timing. |
| 2026-08-01 14:48 +02:00 | Ran a disposable Vitest controller probe with two immediate `changeServings(meal, 1)` calls. | One fetch was sent and the local value stopped at 5 rather than 6. The pending guard is the direct cause of the apparently broken `+`/`−` controls. | Plan a per-meal coalescing queue and add the regression test at the controller seam. |
| 2026-08-01 14:54 +02:00 | Audited recipe references and active/historical query paths. | Hard deletion would be destructive; an additive `archivedAt` field with separate active-list and historical-resolution queries preserves existing plans and history. | Treat archive delivery as an R3 schema change and stage it before production. |
| 2026-08-01 15:05 +02:00 | Ran an independent Opus plan critique against the current controller, shopping commands, aggregation query, and recipe callers. | The reviewer found that serving generations must span source and sync writers; `included` already has lasting semantics; and archived filters would break existing planned-meal controls unless referenced recipes are unioned into the load. Verdict: ready with mitigations. | Give week removal its own aggregate-key table, split archive schema/boundary/UI, and add the missing compatibility tests. |
| 2026-08-01 15:28 +02:00 | Recorded Freek's clarification that Recipe `+`/`−` cannot be pressed and that Shopping also needs synchronized serving controls. | The prior diagnosis proved only the meal-plan race and treated recipe controls as a presentation-unification task. It did not establish the recipe-page input blocker or plan shopping as a serving-write surface. | Reproduce the recipe-page blocker at the rendered control seam; trace recipe and shopping meal identity to the canonical meal-plan serving command; revise tickets and verification. |
| 2026-08-01 15:36 +02:00 | Traced every recipe serving button, the cook-mode loading lifecycle, recipe plan linkage, shopping meal projection, and the meal-plan update transaction. | Recipe buttons are deterministically disabled whenever cook guidance loads; linked recipe changes remain local; Shopping drops meal IDs/servings into name-only context; the existing authenticated meal update already reconciles shopping transactionally. | Move planned-serving intent into a shared client controller, preserve exact meal identity in Recipe and Shopping, and keep unplanned cooking scale explicitly local. |
| 2026-08-01 15:39 +02:00 | Attempted a fresh isolated E2E server for an uncached cook-guidance browser state. | The server never became reachable under concurrent local processes and was terminated. No runtime claim was taken from this attempt. Freek's direct observation remains the runtime evidence; the disabled source condition is deterministic. | Make a pending cook-guidance component regression the first Recipe verification in `$run`. |
| 2026-08-01 15:40 +02:00 | Ran a fresh independent Opus critique of the three-page serving design against Recipe session storage, Shopping materialization, AH preview, and week-meal loaders. | Verdict GO with mitigations. It found that stale Recipe session servings could poison the plan, Shopping must source controls from meal rows, amount overrides can mask scaling, bought/pushed rows can silently change quantity, and route navigation/AH preview need explicit coordination. | Split the Recipe unblock from planned synchronization; add a shared module registry, server past/cooked guard, Shopping mutation coordinator, bought-row reopening, and explicit AH/override copy. |
| 2026-08-01 16:30 +02:00 | Started `$run` after Freek selected concurrent solo execution; the other active task is UI-only. | Full twelve-ticket scope authorized with stage-first migration rehearsal. Shared worktree currently contains the other task's Recipe-header, Meal Plan, BottomSheet, filter, and browser-test edits. | Implement PRJ-02A and shared non-UI seams first; re-read and preserve concurrent UI work before integration. |

## Ranked Hypotheses

- [x] **Confirmed:** recipe serving buttons become disabled whenever cook-guidance loading is true.
- [x] **Confirmed:** a recipe opened with an exact planned-meal ID still changes only local cooking
  state, so Meal Plan and Shopping cannot reflect that edit.
- [x] **Confirmed:** pending meal-plan requests discard repeated serving input.
- [x] **Confirmed:** Shopping lacks the meal ID + serving projection needed for an unambiguous
  serving write.
- [x] **Confirmed:** removal actions are source-specific and do not consistently express “this
  week only.”
- [x] **Confirmed:** the shopping need-cycle control performs lasting recipe or inventory writes
  without clear consequence copy.
- [x] **Confirmed:** serving presets and narrow-screen layout encode obsolete multipliers and cannot
  safely fit `x3` and `x4` in the existing phone row.
- [ ] **Not supported:** shopping amounts are mathematically disconnected from meal servings. The
  projection uses meal servings, but the interface does not reveal that lineage.

## Approaches Tried

### Rejected: labels and spacing only

Relabeling the existing controls would not recover dropped taps, create a recipe-derived per-week
removal path, or make recipe removal safe.

### Rejected: hard-delete recipes and shopping sources

Hard deletion would erase or break historical references. Deleting a recipe-derived shopping source
would also confuse a derived projection with its meal-plan source.

### Chosen: repair each existing ownership seam

- Treat serving taps as one desired value per meal and serialize/coalesce persistence.
- Reuse that one client intent controller on Meal Plan, a plan-linked Recipe page, and a dedicated
  planned-meal control area in Shopping; keep ingredient rows read-only for portions.
- Decouple recipe portion input from cook-guidance loading. A late guidance response may update
  instructions, but it may not disable or reset the current serving intent.
- Add a week + normalized-term exclusion record for reversible current-week removal with Undo;
  leave every source's lasting `included` value untouched.
- Move lasting recipe/pantry defaults into an explicitly labelled secondary action.
- Add reversible recipe archiving with active and historical query boundaries.
- Reuse one responsive serving selector with `x1`, `x2`, `x3`, and `x4` across the journey.

## Reproduction Pack

- **Safe fixture:** isolated Playwright users and `.test-data/e2e`; no household database or provider
  credential was read.
- **Viewports:** 375 × 812 and 1280 × 900.
- **Deterministic controller reproduction:** two immediate `changeServings(meal, 1)` calls against a
  mocked successful fetch leave the meal one serving short.
- **Deterministic recipe source reproduction:** the four serving buttons at `BenchSheet.svelte:464`,
  `:472`, `:516`, and `:518` are disabled by `loading`; `:207` automatically starts that state when
  no eligible plan exists. Expected: bounds may disable a button, cooking-guidance I/O may not.
- **Plan-link trace:** `recipe-pages.ts:242–258` validates an explicit meal occurrence, but
  `BenchSheet.changeServings()` never writes it. The existing `PUT /api/meal-plan/[id]` update runs
  shopping reconciliation in the same database transaction.
- **Browser limitation:** concurrent local E2E server resets made a later multi-test run unreliable;
  those redirects and timeouts were not classified as product defects. The controller reproduction
  and source ownership trace establish the reported failure independently.

## Hardening Notes

- Current-week shopping exclusion must never change recipe optionality or pantry staples.
- Aggregate rows with multiple sources need one atomic exclusion command; sequential partial writes
  could leave a row half-removed.
- Recipe archive is an additive, append-only migration. Old code can tolerate the unused column on
  rollback; the migration journal must not be squashed or reversed.
- Archived recipes stay resolvable for existing meal plans, shopping derivation, cook history, and
  inventory provenance, but disappear from new-plan, cookbook, rotation, and AI-choice lists.
- Albert Heijn search and basket push must continue to use the Dutch ingredient `name`; planned
  portions are display context only.
- Shopping serving controls must operate on one explicit meal ID outside aggregate ingredient rows.
  Two meals with the same title or recipe remain distinct, and every write uses the existing
  authenticated meal-plan transaction.
- A Recipe page without a selected planned occurrence changes only `Cooking portions` and says so;
  it must never guess which of several planned occurrences to mutate.
- In a plan-linked Recipe, the server serving count overrides stale local cook-session storage.
  Every write is an absolute target, and a late cook-guidance response cannot reset it.
- Shopping planned meals come from the week's meal rows, not `shopping_week_entries`: duplicate
  occurrences, freezer meals with no fresh sides, and composite/sub-recipe sources remain correct.
- Manual amount overrides remain explicit and unchanged. When a derived requirement changes, bought
  entries return to Active; an open AH preview is invalidated; an already-sent AH basket/list is
  never described as synchronized.

## Related Files

- `src/lib/components/BenchSheet.svelte`
- `src/lib/components/recipe-detail/AddToPlanSheet.svelte`
- `src/lib/components/recipe-detail/MakeRecipeSheet.svelte`
- `src/lib/components/meal-plan/controller.svelte.ts`
- `src/lib/components/cook-mode/network-controller.svelte.ts`
- `src/routes/meal-plan/+page.svelte`
- `src/routes/recipes/[slug]/+page.svelte`
- `src/lib/server/workflows/recipe-pages.ts`
- `src/lib/components/shopping/ShoppingLists.svelte`
- `src/lib/components/shopping/ShoppingSourceQuickControls.svelte`
- `src/lib/server/workflows/choose-shopping-source.ts`
- `src/lib/server/domains/shopping/entries.ts`
- `src/lib/server/domains/recipes/queries.ts`
- `src/lib/server/db/schema.ts`
- `src/routes/api/shopping/+server.ts`
- `src/routes/api/meal-plan/[id]/+server.ts`
- `src/routes/api/recipes/[slug]/+server.ts`
