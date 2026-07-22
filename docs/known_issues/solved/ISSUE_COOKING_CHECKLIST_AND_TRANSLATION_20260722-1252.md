# Issue: Cooking checklist groups prep and mixes Dutch into English
Created: 2026-07-22 12:52
Status: RESOLVED

## Symptom

- `Get ready` can combine several ingredients behind one checkbox.
- English cooking mode can show mixed labels such as `1 blik chickpeas` or `1 groot red onion`.
- Ingredient chips inside a cooking step are labels; only the whole step can be checked.

## Expected Behavior

- Each preparation item has its own checkbox.
- Every visible ingredient field uses the selected display language while the stored Dutch ingredient remains the Albert Heijn lookup value.
- Each ingredient chip in a step can be checked without completing the whole step.

## Investigation Log

| Date | Action | Result | Next Step |
|---|---|---|---|
| 2026-07-22 | Walked the recipe and cooking views at 375 px and 1280 px, then traced cook-cache projection and recipe translation. | Reproduced mixed English/Dutch quantity-unit labels and non-interactive step ingredient chips. The prep schema permits one task to reference several ingredients, so one generated sentence becomes one checkbox. | Plan one-per-item prep validation, shared ingredient check state, and complete display translation. |
| 2026-07-22 | Shipped and checked the one-item prep projection, localized ingredient projection, interactive step ingredients, and current-step controls. | Each prep row owns one checkbox, EN and NL cooking views use their full localized ingredient fields, and step ingredients can be checked without completing the step. | Resolved. |

## Hypotheses

- [x] `prep_tasks[].ingredient_indexes` accepts several indexes and the renderer checks the task, not each referenced ingredient.
- [x] `TranslatedIngredient` and `TranslationSchema` omit amount and unit; the page replaces only the name and substitutes.
- [x] `ComponentCard` and `MergeCard` render `step.ingredients` as spans inside the step button, so ingredient-level checking has no control or state seam.

## Approaches Tried

- Added one-item preparation projection, full localized ingredient fields, shared ingredient state, and separate step completion controls.

## Related Files

- `src/lib/server/ai/cook_mode.ts`
- `src/lib/server/ai/prompts/cook_mode.md`
- `src/lib/components/cook-mode/staleness.ts`
- `src/lib/components/BenchSheet.svelte`
- `src/lib/components/cook-mode/ComponentCard.svelte`
- `src/lib/components/cook-mode/MergeCard.svelte`
- `src/lib/server/ai/translate_recipe.ts`
- `src/routes/recipes/[slug]/+page.svelte`
