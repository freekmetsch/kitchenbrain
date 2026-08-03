# Issue: Cooking view shows preparation status over usable recipe content
Created: 2026-08-03 12:11 +02:00
Status: RESOLVED

## Symptom
Opening a recipe in cooking view immediately shows “Preparing your cooking view…” even though a usable cooking view is already visible.

## Expected Behavior
Saved recipe directions remain the authoritative, immediately usable cooking view. Structured cooking details are generated only after an explicit action, write only to the cooking-details cache, and never present the whole cooking view as unavailable.

## Resolution

The automatic page effect and every background cooking-details caller were removed. Source-derived
steps render immediately, and `Add cooking details` is now the deliberate paid action. Generation
writes only `cook_mode_json`; a regression test proves directions, Dutch ingredients, translations,
source snapshot, and content revision remain unchanged.

The cooking-first Split Prep Desk also places portions, view/language controls, optional details,
counter ingredients, and steps before reference material. Focused primary and secondary browser
checks cover the opt-in request and responsive layout; all 713 unit tests and the isolated
production build passed. One full-browser attempt had a Chromium context close before an unrelated
house-style case; that exact case passed on immediate isolated rerun.

## Investigation Log
| Date | Action | Result | Next Step |
|------|--------|--------|-----------|
| 2026-08-03 | Located the message, recipe route, cooking-view component, existing end-to-end coverage, and archived cooking-view plans. | The message is owned by `BenchSheet.svelte`; archived decisions require source-derived directions to remain usable while optional AI enhancement is pending or fails. | Reproduce the exact state, trace the loading predicate, and plan the smallest durable state-model repair. |
| 2026-08-03 | Ran the isolated held-request Playwright story and traced page load through `requiresPlan`, `localizedPlan`, and `CookModeNetworkController`. | Reproduced deterministically in 24.6 seconds. Every recipe opts into structured guidance; a missing eligible cache starts `/cook-mode` while deterministic source steps remain available. The loading label incorrectly describes the whole view as unfinished. | Execute `FEATURE_LIST_RECIPE_COOKING_PROGRESSIVE_ENHANCEMENT.md` with a red source-ready/status assertion first. |
| 2026-08-03 | Compared the automatic request with the shipped Kitchen Timeline decisions and current generation contract. | Automatic enhancement remains useful for exact ingredient links, preparation, streams, and composed-meal ordering. Disabling it would remove accepted behavior; content readiness and enhancement progress need separate language and tests. | Preserve cache recovery and active-session freezing while replacing the misleading state model and copy. |
| 2026-08-03 | Reframed the enhancement after Freek selected explicit opt-in and audited every caller plus the generation write path. | Page load, import, edit, meal composition, background recipe work, and chat writes can currently trigger generation; untouched imports can also promote generated directions into canonical recipe text. The earlier automatic-enhancement direction is superseded. | Remove every automatic caller, make the explicit action cache-only, and implement the cooking-first layout in `FEATURE_LIST_RECIPE_COOKING_PROGRESSIVE_ENHANCEMENT.md`. |
| 2026-08-03 | Implemented the accepted plan with red/green caller, cache-integrity, controller, palette, and browser tests. | No automatic request remains; explicit generation is cache-only; the selected page order and merge bands pass both household-account checks. | Close and archive the issue with the completed feature plan. |

## Hypotheses
- [x] The component presents “AI enhancement requested” as “cooking view being prepared” even when source-derived steps exist. Confirmed by `BenchSheet.svelte:143-153,229-232,525-544`.
- [x] A missing or ineligible cache starts generation because the recipe route enables structured planning for every recipe. Confirmed by `+page.svelte:388-392` and the held-request browser story.
- [x] A recent portion or recipe-header change causes the generation request to run earlier than intended. Refuted: `requiresPlan={true}` dates to the shipped 2026-07-23 Kitchen Timeline work; the August portion change only kept controls enabled during loading.

## Approaches Tried
- `$env:PLAYWRIGHT_HTML_OPEN='never'; npm run test:e2e -- --grep "Recipe portions stay interactive while cook guidance loads"` — passed; confirmed one automatic request with usable controls against isolated test data.
- Compared copy-only, progressive-enhancement state separation, and disabling ordinary-recipe generation. Initially selected state separation; Freek superseded this after review by choosing explicit opt-in.
- Design-shotgun and plan pass selected an explicit, cache-only `Add cooking details` action. Source steps stay visible; AI suggestions remains a separate reviewed recipe-editing action.

## Related Files
- `src/lib/components/BenchSheet.svelte`
- `src/routes/recipes/[slug]/+page.svelte`
- `src/lib/components/cook-mode/network-controller.svelte.ts`
- `tests/e2e/kitchen-flows.e2e.ts`
- `docs/feature-lists/archive/FEATURE_LIST_RECIPE_COOKING_PROGRESSIVE_ENHANCEMENT.md`
