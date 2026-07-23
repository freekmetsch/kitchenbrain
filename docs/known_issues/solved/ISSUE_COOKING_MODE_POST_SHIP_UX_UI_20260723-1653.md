# Issue: Cooking mode post-ship UX and UI regressions
Created: 2026-07-23 16:53 Europe/Amsterdam
Status: RESOLVED

## Symptom

The shipped Kitchen Timeline works at its main happy path, but deterministic edge states still break or weaken the cooking experience:

- a valid legacy v2 cache renders an English-only, incomplete timeline instead of upgrading to the v5 contract;
- the mobile ingredient-swap menu opens partly outside the viewport and stays open after Escape;
- the sticky progress and serving controls sit underneath the recipe translation-status row after scrolling;
- several cooking controls miss the plan's 44 px phone target;
- timer and preparation presentation can repeat or expose non-action-led text.

## Expected Behavior

Every saved recipe should render a complete, language-consistent cooking view that honors the v5 guarantees or a complete source-derived fallback. Mobile overlays must stay within the viewport and support expected dismissal. Sticky cooking controls must account for every visible header state. Phone controls must meet the cooking plan's 44 px target, and preparation/timer copy should remain concise and action-led.

## Investigation Log

| Date | Action | Result | Next Step |
|------|--------|--------|-----------|
| 2026-07-23 16:43–16:53 | Walked `ui-substitute-curry` and `ui-rice-bowl` in an isolated copy of `dev.db` at 375, 768, 1280, and 1536 px with Playwright. | Reproduced all five symptoms deterministically. Screenshots saved under `output/playwright/20260723-*cooking*`. | Trace each symptom to its source/state seam and define focused regression tests. |
| 2026-07-23 16:48 | Opened the first counter swap at 375 px and pressed Escape. | The 256 px menu rendered from x=-65 to x=191 and remained open after Escape. | Replace or constrain the disclosure at the shared counter-swap seam. |
| 2026-07-23 16:49 | Selected step 2 while the translation failure row was visible. | The cooking toolbar stayed at y=52–116 while the translation row occupied y=52–96, obscuring progress and serving controls. | Make sticky offsets derive from the actual recipe-header height. |
| 2026-07-23 16:51 | Inspected the persisted v2 session and `staleness.ts`. | `isStaleCookMode` still accepts v2; `localizeCookMode` returns it only for English, and its mise-en-place becomes a synthetic first step without v5 references. | Gate legacy caches out of the new surface and prove safe v5/fallback adoption. |
| 2026-07-23 16:55 | Traced the recipe route, server generation seam, and current unit expectations. | The route now sends every non-stale cache to the Kitchen Timeline, the server returns valid v2/v3 caches without generating v5, and the tests explicitly define v2 as current. | Split new-session eligibility from active-session compatibility and replace the obsolete test contract. |
| 2026-07-23 16:58 | Ran the targeted staleness, instruction-projection, and cooking-step suites. | All 18 tests passed, confirming the regression is encoded in current expectations rather than caused by an incidental failing test. | Add red tests for v2/v3 new-session rejection and frozen legacy-session behavior before changing production code. |
| 2026-07-23 17:01 | Traced timer labels and preparation projection independently. | Timer duplication comes from rendering identical title/purpose values; preparation text comes from punctuation/joining of legacy mise-en-place tasks. They are separate projection defects. | Deduplicate timer context at render time and normalize supported v4 preparation tasks without inventing recipe content. |
| 2026-07-23 17:12 | Independently critiqued the selected repair architecture. | The current persisted session does not freeze display language, so pre-fix legacy sessions cannot truthfully be preserved across language changes. Review otherwise passed with refinements. | Version the session payload; clear ambiguous old/corrupt payloads once to source fallback and remove stale timers. |
| 2026-07-23 18:03 | Shipped and verified the compatibility, recovery, sticky-layout, swap-dialog, target-size, and copy repairs. | New sessions reject v2/v3 caches; ambiguous sessions clear safely; fallback/retry copy is localized; sticky controls follow measured header height; swaps stay visible and restore focus; timer/preparation copy is concise. The isolated staged tree passed all 398 unit tests, Svelte diagnostics, and production build; the mocked 320–1536 px EN/NL browser matrix passed without provider spend or primary-database writes. | Resolved. |

## Hypotheses

- [x] Legacy schema acceptance bypasses the new v5 rendering guarantees.
- [x] A fixed `top` utility assumes the recipe header is always one row high.
- [x] `dropdown-end` anchors a 256 px panel to a narrow inline summary without viewport collision handling.
- [x] Compact daisyUI size classes conflict with the cooking plan's 44 px phone-target rule.
- [x] Timer/preparation duplication has one shared projection cause rather than two local rendering causes. Rejected: they are two independent projection causes.
- [x] Existing persisted sessions contain enough state to freeze a legacy session exactly. Rejected: the payload omits frozen display language.

## Approaches Tried

- Real-browser reproduction with a copied SQLite database and disposable local session.
- Mobile/tablet/desktop/wide screenshots and accessibility snapshots.
- Keyboard pass through the cooking controls, including Arrow-key tabs and Escape dismissal.
- Source trace into legacy cache validation/localization, cooking projections, counter disclosure, and sticky layout.
- Current daisyUI interaction guidance and the repository's existing `BottomSheet` primitive; the latter already supplies modal focus, Escape/backdrop dismissal, and motion handling without relying on fragile disclosure positioning.

## Related Files

- `src/lib/components/BenchSheet.svelte`
- `src/lib/components/cook-mode/CounterBoard.svelte`
- `src/lib/components/cook-mode/CookStepCard.svelte`
- `src/lib/components/cook-mode/Timer.svelte`
- `src/lib/components/cook-mode/TimerStack.svelte`
- `src/lib/components/cook-mode/cooking_steps.ts`
- `src/lib/components/cook-mode/staleness.ts`
- `src/lib/components/recipe-detail/RecipeHeader.svelte`
- `src/routes/recipes/[slug]/+page.svelte`
