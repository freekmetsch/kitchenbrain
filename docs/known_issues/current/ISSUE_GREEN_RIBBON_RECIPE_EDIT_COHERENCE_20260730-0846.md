# Issue: Recipe Edit Green Ribbon lost family coherence

Created: 2026-07-30 08:46
Status: AWAITING VERIFICATION

## Symptom

The compact-ribbon follow-up reduced every Green Ribbon to 56/64 px and forced Recipe Edit's
Back, contextual identity, and Save action into one compressed row at 320 px. Recipe Edit now
feels like a squeezed utility bar rather than the same green page identity used elsewhere.

## Expected Behavior

Recipe Edit should use the same green material, typography, content alignment, and normal space
expectations as the rest of the stable app. Its transactional context may have a bespoke
composition, but that composition must remain recognizably part of the Green Ribbon family and
must not make all other headers absorb editor-specific constraints.

## Investigation Log

| Date | Action | Result | Next Step |
|---|---|---|---|
| 2026-07-30 08:46 | Compared commits `e1ba4fc` and `8f4b1a5` with the 320 px Recipe Edit evidence state. | The regression is deterministic: a global height/flex-basis change solved vertical density by squeezing an editor-specific three-part composition. | Restore the pre-follow-up contract, inspect the rendered shared and editor variants, then plan a variant owned by the shared primitive. |
| 2026-07-30 08:49 | Plan critique completed with a GO recommendation; user-provided `/run` authority accepted. | The selected approach restores 64/72 globally, then adds one explicit contextual layout for Recipe detail/edit. | Restore and verify the baseline before adding the contextual variant. |
| 2026-07-30 08:52 | Restored the original shared geometry before replacement work. | Standard ribbons returned to 64/72; Recipe Edit again reproduced at 114 px on 320, confirming the original composition failure. | Add the contextual layout behind a failing rendered contract. |
| 2026-07-30 08:57 | Exercised Recipe detail/edit in English and Dutch at 320/393 px, 200%-equivalent text, disabled/active/focused actions, and standard route breakpoints. | One 64/72 family now holds. At 320, contextual Recipe actions use a 44 px icon treatment with their full accessible label; wider viewports restore the text. No overflow or remaining P1-P3 finding. | Run the complete repository gate. |
| 2026-07-30 09:15 | Completed the clean repository gate after isolating one Cook Mode timeout and one SQLite I/O contention failure; both passed unchanged on rerun. | Final result: 125 unit files / 691 tests, 29 browser stories with one deliberate AH skip, clean diagnostics, and production build. | Await user confirmation of the rendered result. |

## Hypotheses

- [x] The root cause is a global geometry change applied to every caller even though only the
  Recipe Edit composition needed a different responsive arrangement.
- [ ] Recipe Edit needs a second, route-local header component.
- [ ] The Save action should move entirely below the green surface.

## Approaches Tried

- Commit `8f4b1a5` tightened the shared 64/72 px contract to 56/64 px and narrowed the copy flex
  basis. It removed the 320 px second row but lost the intended family rhythm.

## Related Files

- `src/lib/components/ui/KitchenPageHeader.svelte`
- `src/routes/recipes/[slug]/edit/+page.svelte`
- `tests/e2e/house-style.e2e.ts`
- `docs/ui-house-style.md`
- `docs/feature-lists/archive/FEATURE_LIST_APP_HOUSE_STYLE_GREEN_RIBBON.md`
