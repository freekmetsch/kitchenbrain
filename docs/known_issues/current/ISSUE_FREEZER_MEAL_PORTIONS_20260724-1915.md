# Issue: Freezer meal plans use the recipe yield instead of frozen portions
Created: 2026-07-24 19:15
Status: AWAITING VERIFICATION

## Symptom

The meal-plan `Add meal` sheet shows Adam Ragusea's Bolognese under `From your freezer` with
`6 portions ready`. Selecting that row calls `addMealFromRecipe(recipe, 'freezer')`, which sends
the recipe's baseline `servings` value (`16`) to the meal-plan API.

## Expected Behavior

Choosing the freezer option should create an intent the user can understand before committing:
serve the available frozen portions, not silently substitute the recipe's full fresh-cook yield.
For the observed fixture, the visible choice and submitted default should both be 6 portions.
Choosing `Cook fresh` should continue to default to the recipe's 16-portion yield.

## Investigation Log

| Date | Action | Result | Next Step |
|------|--------|--------|-----------|
| 2026-07-24 19:15 | Inspected the deployed `Add meal` sheet at 375 px without submitting a write. | The freezer row visibly offered `6 portions ready`; the same recipe was duplicated in the library with `6 in freezer`. | Trace the selected source and serving value through the client and API. |
| 2026-07-24 19:15 | Traced `addMealFromRecipe` in `src/routes/meal-plan/+page.svelte` and the create endpoint in `src/routes/api/meal-plan/+server.ts`. | The client always sends `recipe.servings`; the API preserves an explicit submitted serving count. The mismatch is deterministic and client-owned. | Extract a pure source-choice helper and make its focused failing test the first `/run` step. |
| 2026-07-24 19:15 | Searched existing unit coverage. | Shopping/cooking tests cover stored servings, but no test owns the freezer-versus-fresh default chosen by the meal drawer. | Add the missing correct-seam regression test before changing the drawer. |
| 2026-07-24 19:18 | Checked the recipe-detail `Plan` path for a sibling caller. | `AddToPlanSheet.svelte` defaults the source to freezer when stock exists but independently resets `servings` to the recipe baseline, reproducing the same contradiction. | Put both callers behind one source-aware choice helper and shared control. |
| 2026-07-24 21:01 | Implemented one shared source-aware helper/control and exercised both planning callers against a disposable database. | The freezer action showed and persisted 6 portions, the fresh action showed the recipe yield, and the reloaded meal matched the selected source. Unit, type, build, mobile/wide, and English/Dutch checks passed. | Await confirmation with the household fixture before moving this issue to resolved. |

## Hypotheses

- [x] **High — the drawer uses one serving default for both sources.** If this is the cause,
  extracting a helper that returns `onHandPortions` for `freezer` and baseline `servings` for
  `fresh` will make the focused fixture pass.
- [x] **Low — the API overwrites the submitted freezer count with the baseline. Refuted.**
  `POST /api/meal-plan` uses `body.servings ?? baselineServings`, so an explicit source-aware
  count survives.
- [x] **Low — the visible stock count is stale. Refuted for the observed path.** The same loaded
  recipe object renders `6 portions ready` and supplies the baseline `16`; the mismatch exists
  before any request or reload.

## Approaches Tried

- Read-only deployed browser reproduction at 375 px.
- Client-to-server source trace.
- Existing-test search for the source-choice seam.

No production meal was added and no external provider or Albert Heijn call was made.

## Repro Pack

- **Environment:** authenticated deployed beta; equivalent local fixture can use a copied database.
- **Data:** recipe baseline `servings = 16`, `onHandPortions = 6`.
- **Interaction:** Meal plan → Add meal → inspect the recipe under `From your freezer`.
- **Expected:** the freezer action clearly plans 6 portions; the fresh action clearly plans 16.
- **Actual:** the freezer row says 6 but `addMealFromRecipe` submits 16.
- **Classification:** deterministic.
- **First automated loop for `/run`:** a focused pure-helper test for fresh/freezer defaults;
  target runtime under 1 second.

## Recommended Fix

Unify the duplicate freezer/library rows into one recipe choice with explicit `Serve 6 from
freezer` and `Cook 16 fresh` actions. Reuse the same source-aware control in recipe-detail Plan.
Extract the source/serving decision into a pure helper used by both callers and its test. Keep the
server's existing source validation and stored occasion servings; do not add schema or infer from
translated fields.

## Related Files

- `src/routes/meal-plan/+page.svelte`
- `src/lib/components/recipe-detail/AddToPlanSheet.svelte`
- `src/routes/api/meal-plan/+server.ts`
- `src/lib/meal_batch.ts`
- `messages/en.json`
- `messages/nl.json`
