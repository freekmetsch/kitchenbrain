# Issue: Grove chassis refinement left responsive and state regressions
Created: 2026-07-31 10:10
Status: RESOLVED

## Symptom

The latest Deep Grove house-style pass leaves Stock quantity actions clipped on narrow screens,
exposes route-owned green space below short work surfaces, clips the Recipe detail surface away
from the six-pixel chassis reveal, and marks a freshly opened Recipe editor as dirty. The same
audit found recurrent hierarchy debt in Stock, Meal Plan, Shopping, and the connected Recipe
ledger.

## Expected Behavior

Household work remains reachable at 320-375 CSS pixels, every route keeps one continuous
six-pixel Grove reveal down to the fixed navigation, untouched editors stay clean, and repeated
objects use compact hierarchy without warning color or secondary controls overwhelming the
primary task.

## Investigation Log

| Date | Action | Result | Next Step |
|------|--------|--------|-----------|
| 2026-07-31 10:10 | Reproduced the latest `origin/main` UI with isolated seeded fixtures at 320, 375, 393, and 1280 CSS pixels in light and dark themes. | Stock rows expand to roughly 571 px inside a 331 px column and clip the quantity stepper; Meal Plan and Recipes leave a 24 px Grove band below the paper surface; Recipe detail starts its paper surface at 64 px on desktop; Recipe Edit enables Save and persists a draft without user input. Findings are deterministic. | Lock each regression at the closest browser seam before implementing the shared surface, row, and dirty-state repairs. |
| 2026-07-31 10:10 | Traced the responsive and surface failures to their rendering seams. | Stock grid tracks retain their min-content width while the list clips overflow; route-level bottom padding sits outside `ui-grove-surface`; Recipe detail applies clipping to the surface owner. The editor's fresh-load mismatch is observable, but its exact differing field is not yet proven. | Prefer shared-owner fixes over route-specific offsets; make a focused fresh-load editor regression test identify the mismatch before changing its baseline. |
| 2026-07-31 10:24 | Sent the proposed fix plan to the independent `opus` reviewer. | The reviewer rejected a post-hydration editor baseline because it could treat a recovered draft as clean and delete it. It also identified failed/partial AH push recovery as state that must remain inline rather than moving into a closed history sheet. | Derive the clean editor baseline from normalized server data, preserve recovered drafts as dirty, and split unresolved AH outcomes from on-demand success/history. |
| 2026-07-31 10:58 | Implemented the shared surface, segmented-control, compact-popover, and route-composition repairs in the isolated worktree. | Stock and Meal items are separate compact cards; Recipe cards are separated; Shopping is centered with unresolved AH recovery inline and history in a named sheet; fresh Recipe Edit is clean while restored drafts remain dirty. Focused static, unit, and seeded browser checks pass. | Run the complete repository gate, simplify the intended diff, and close the issue only after the clean final run. |
| 2026-07-31 11:24 | Ran the complete repository gate after the changed-code simplification and shared-state browser pass. | Svelte diagnostics reported 0 errors/warnings; all 107 unit files / 633 tests passed; 31 authenticated primary browser tests passed with one deliberate connected-AH skip; the production build completed. | Resolved. |

## Hypotheses

- [x] **High — Stock grid min-content sizing defeats the narrow track.** If the track and row are
  allowed to shrink and reflow, the quantity stepper remains within the 375 px viewport without
  hiding content.
- [x] **High — Grove spacing has multiple owners.** If route padding moves inside the shared
  surface and clipping moves to an inner Recipe detail wrapper, the paper surface keeps the
  documented reveal at both its sides and bottom.
- [x] **Medium — Recipe Edit's client snapshot differed from the normalized server baseline on a
  fresh load.** A normalized server snapshot now defines the initial clean state; recovered
  session state forces dirty, and explicit discard waits for child-editor normalization before
  adopting the restored server copy as clean.

## Approaches Tried

- Added shared semantic segmented choices with measured CSS motion and a native top-layer compact
  popover, then migrated exclusive-choice callers.
- Reworked Stock, Meal Plan, Shopping, and Recipes at their route composition seams without
  changing their persistence or provider behavior.
- Derived Recipe Edit's clean baseline from the normalized server copy and kept recovered drafts
  explicitly dirty until save or discard.
- Tightened the browser suite to scope shared controls to their owning review/card and to tolerate
  valid state left by earlier stories.

## Related Files

- `src/app.css`
- `src/lib/components/inventory/ItemRow.svelte`
- `src/lib/components/inventory/FacetChips.svelte`
- `src/routes/inventory/+page.svelte`
- `src/routes/meal-plan/+page.svelte`
- `src/routes/recipes/+page.svelte`
- `src/routes/recipes/[slug]/+page.svelte`
- `src/routes/recipes/[slug]/edit/+page.svelte`
- `tests/e2e/house-style.e2e.ts`
- `tests/e2e/responsive-parity.e2e.ts`
