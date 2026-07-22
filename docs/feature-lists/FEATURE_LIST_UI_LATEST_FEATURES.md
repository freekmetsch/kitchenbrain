# Feature List: UI Audit — Latest Features

_Status: Audit ready — 2026-07-22_

## Scope

This visual audit covers the same latest feature set as the UX audit: shopping decisions and recurring items, batch controls, recipe enhancement review, the denser recipe grid, and cooking progress. It checks the parent pages and shared primitives at 375, 768, 1280, and 1536 px.

## UI gap

The new surfaces share the app’s warm palette, spacing, card shape, and mobile shell. They remain free of horizontal overflow across all four viewports. The main gap is interaction correctness, not styling: a dropdown is fully clipped, several visual checkbox controls hide their state from assistive tech, and the shopping tabs bypass the shared component that already owns keyboard and motion rules.

## Findings

| ID | Priority | Category | Finding | Evidence | File(s) | Effort | Cite |
|---|---|---|---|---|---|---|---|
| UI-1 | P1 | Overlap / clipping | The recurring-item menu renders below a 62 px `overflow-hidden` list card. Its 115 px menu extends past the clip; all action labels disappear at 375 px. | Both. `output/playwright/20260722-uxui-latest-weekly-menu-clipped-375.png`; measured parent and menu boxes. | `src/lib/components/shopping/RecurringShoppingList.svelte:40-60`; `src/app.css:143-146` | S | `[RUI] [Norman]` |
| UI-2 | P1 | Typography / hierarchy | Cooking goals, bodies, and ingredient controls remain 11–15 px and the action list starts below the mobile fold. | Both. `output/gate-c-cook-375-en.png`; the latest commit already records this gap. | `src/lib/components/cook-mode/ComponentCard.svelte:72-96`; `MergeCard.svelte:92-119`; `docs/feature-lists/FEATURE_LIST_COOKING_MODE_FOCUS.md` | Already planned | `[Type] [VH] [WCAG 2.5.8]` |
| UI-3 | P2 | Interactive correctness | Main cooking check controls look like checkboxes but expose no pressed or checked state. The smaller ingredient pills do expose `aria-pressed`, so the same page has two state contracts. | Source review and browser accessibility snapshot. | `BenchSheet.svelte:969-1033`; `ComponentCard.svelte:61-83,91-96`; `MergeCard.svelte:82-119` | S | `[H4] [Saffer] [WCAG 4.1.2]` |
| UI-4 | P2 | Component reuse | Shopping reimplements the shared segmented tabs. It loses roving focus, arrow keys, panel links, and the shared transition recipe. | Both. Browser ArrowRight probe; source comparison. | `ShoppingLists.svelte:54-58`; canonical `ui/SegmentedTabs.svelte:21-55` | S | `[H4] [Jakob] [KNav]` |
| UI-5 | P2 | Icon consistency | Empty recipe cards use the platform `🍽️` emoji while the app otherwise uses its own icon component and style sets. The glyph changes by platform and clashes with the line icons around it. | Both. `output/playwright/20260722-uxui-latest-recipes-375.png`. | `src/routes/recipes/+page.svelte:479-486`; canonical `src/lib/components/ui/icons/Icon.svelte` | XS | `[H4] [Gestalt]` |
| UI-6 | P3 | Motion | Shopping tab content and bought-item relocation appear instantly. The selected tab color eases, but the panel and list geometry pop to the new state. | Browser interaction and source review. | `ShoppingLists.svelte:54-97`; `shopping/+page.svelte:51-59`; motion tokens in `src/lib/motion.ts` | S | `[Motion] [Material] [Saffer]` |

## Summary

- P1: 2, including one already covered by the cooking-mode plan.
- P2: 3.
- P3: 1.
- Categories: clipping 1, typography/hierarchy 1, interactive correctness 1, component reuse 1, icon consistency 1, motion 1.

The app feels unified on static screens. The recurring-item blocker and inconsistent interaction contracts keep the latest feature set from feeling finished.

## Top three improvements

1. Move recurring actions into the existing top-layer sheet pattern.
2. Fold cooking state semantics into the existing cooking-mode plan while that code is already open.
3. Replace the shopping tab copy with `SegmentedTabs`, then add small list/panel transitions using existing motion tokens.

## UI plan

### P1

- UI-1: render recurring actions outside the clipped card; preserve rounded list clipping.
- UI-2: execute the existing `CMF-2` and `CMF-3` tickets. Do not create a second cooking redesign.

### P2

- UI-3: expose visual completion state with native checkboxes or `aria-pressed` on every button-shaped checkbox.
- UI-4: reuse `SegmentedTabs`; add `aria-controls`, stable panel IDs, and panel roles where the component owns them.
- UI-5: replace the emoji placeholder with an existing recipe/plate icon from the project icon set.

### P3

- UI-6: use the current micro/content durations for tab-panel fade and keyed list movement. Keep reduced-motion behavior at duration zero.

## Shared pieces

- No new token is needed. Use `--motion-micro`, `--motion-content`, and the existing easing variables.
- Reuse `BottomSheet`, `SegmentedTabs`, and `Icon`.
- Do not remove `overflow-hidden` from `ui-list-card` globally; it owns rounded row clipping across the app.

## Verification target

Run the recurring menu, shopping tabs, bought-state move, enhancement sheet, batch controls, recipe grid, and cooking checklist at 375 and 768 px, then inspect representative 1280 and 1536 px views. Include keyboard, reduced motion, and focus restoration. No external API call is needed.
