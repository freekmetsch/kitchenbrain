# Feature List: UX Audit — Latest Features

_Status: Shipped - 2026-07-22 (accepted P1 and P2 work complete)_

## Scope and user

This audit covers the latest shipped shopping, recipe, meal-plan, and cooking changes: source-aware shopping choices, weekly recurring buys, recipe enhancement review, whole-recipe batch controls, and ingredient-level cooking progress. The primary user is a household member using a phone while planning, shopping, or cooking.

The newest commit, `42ac08e`, adds a cooking-mode plan rather than app code. Its existing findings stay in [FEATURE_LIST_COOKING_MODE_FOCUS.md](./FEATURE_LIST_COOKING_MODE_FOCUS.md); this plan links to that work and does not copy it.

Browser checks ran against an isolated copy of the local database at 375, 768, 1280, and 1536 px. The audit used synthetic writes only. No horizontal overflow or browser console error appeared. Bottom sheets restored focus after Escape, source choices confirmed success, and the AH-disconnected state gave a useful Settings link.

## Headline gap

The new flows carry the right data and explain the new shopping choices well. Their failure and keyboard paths are weaker than their happy paths. One clipped menu blocks all recurring-item actions on mobile. Several async updates remove keyboard focus, several repeated controls lack enough spoken context, and failed shopping writes discard the draft that the user must retry.

## Findings

| ID | Priority | Dimension | Finding | User impact | Evidence | Effort | Cite |
|---|---|---|---|---|---|---|---|
| UX-1 | P1 | Dead end | The weekly-item action menu opens inside a clipped list card. Skip, edit, and stop sit outside the visible card at 375 px. | A phone user can add a weekly item but cannot manage it afterward. | Browser: `output/playwright/20260722-uxui-latest-weekly-menu-clipped-375.png`. Source: `RecurringShoppingList.svelte:40,54-60`; `app.css:143-146`. | S | `[H3] [Norman] [WCAG 2.4.11]` |
| UX-2 | P2 | Feedback / keyboard | Marking a shopping item bought and choosing a meal batch both leave focus on `<body>`. Neither update announces the new count or portion value. | Keyboard and screen-reader users lose their place after common repeated actions. | Browser state checks after the checkbox and `×2` actions; `shopping/+page.svelte:38-59`; `meal-plan/+page.svelte:536-560,783-790`. | M | `[H1] [KNav] [WCAG 4.1.3]` |
| UX-3 | P2 | Error recovery | Weekly add/edit forms clear or close before the server confirms the write. The source-choice sheet also closes before its write finishes. | A failed request forces the user to reopen the control and type or choose everything again. | Browser failure probe: `output/playwright/20260722-uxui-latest-weekly-error-375.png`. Source: `RecurringShoppingList.svelte:31-50`; `SourceDecisionSheet.svelte:62-65`; `shopping/+page.svelte:38-48,61-70,104-107`. Section 5 `draft-loss`. | M | `[H9] [Norman] [Wro]` |
| UX-4 | P2 | Form integrity | Nine shopping buttons are announced only as “Change”; meal steppers expose only “−” and “+”; weekly fields rely on placeholders instead of labels. | Repeated controls are indistinguishable in a screen-reader button list, and field meaning disappears while typing. | Browser accessibility snapshots; `ShoppingLists.svelte:87-91`; `RecurringShoppingList.svelte:31-36`; `meal-plan/+page.svelte:773-790`. | S | `[H6] [Wro] [WCAG 4.1.2]` |
| UX-5 | P2 | Convention match | The shopping tabs hand-roll `role="tab"`, keep all tabs in the normal Tab order, expose no panels, and ignore Left/Right arrows. | Keyboard behavior differs from the shared tab control and from standard tabs. | Browser ArrowRight probe; `ShoppingLists.svelte:54-58`; working contract in `SegmentedTabs.svelte:21-55`. | S | `[H4] [KNav] [Jakob]` |
| UX-6 | P2 | Error prevention | Recipe enhancement selects every AI addition and substitute by default. Its repeated need selectors have no accessible label tied to the suggested ingredient. | One Apply accepts the full AI proposal, and assistive-tech users cannot tell which need selector changes which ingredient. | Browser: `output/playwright/20260722-uxui-latest-recipe-enhance-375.png`; `RecipeEnhancementSheet.svelte:25-35,73-86`. | S | `[H5] [Norman] [WCAG 4.1.2]` |
| UX-7 | P2 | Reversibility / cost | Closing a generated enhancement keeps the proposal in memory, but the only entry button calls `generate()` again and clears it first. | Reopening a review repeats paid work and loses prior selections instead of resuming the proposal. | `RecipeEnhancementSheet.svelte:25-35,64-66`. | M | `[H3] [Doherty] [Aza]` |
| UX-8 | P2 | Status semantics | Cooking ingredient, preparation, and step controls draw checkbox states but the main buttons do not expose checked or pressed state. | A screen reader hears an action label but not whether it is complete. | `BenchSheet.svelte:969-1033`; `ComponentCard.svelte:61-83`; `MergeCard.svelte:82-111`. | S | `[H1] [WCAG 4.1.2]` |
| UX-9 | P3 | Microcopy | The batch label says “Set 1 recipe batches: 4 portions.” | Spoken copy sounds broken at the most common multiplier. | Browser accessibility snapshot; message used at `meal-plan/+page.svelte:787`. | XS | `[H2] [H4]` |

## Top three improvements

1. Replace the clipped recurring-item dropdown with the existing bottom-sheet pattern so every action stays visible, focus-trapped, and dismissible.
2. Make async editors own their pending state: await writes, keep drafts on error, keep or restore focus, and announce the changed count or value.
3. Make every repeated control self-describing, reuse `SegmentedTabs`, and require explicit acceptance in recipe enhancement.

## Recommended order

### Phase 1 — Restore the blocked weekly-item path

- Replace the recurring action dropdown with `BottomSheet` or a shared action sheet outside the clipped list surface.
- Give the trigger an item-specific name.
- Verify Skip, Edit, Stop, Escape, backdrop close, and focus return at 375 and 768 px.

### Phase 2 — Keep user work through server writes

- Change shopping callbacks to return `Promise<boolean>`.
- Clear or close forms only after success; keep values, selection, and focus after failure.
- Preserve focus after bought and batch changes and announce the result through one shared polite status region.

### Phase 3 — Repair labels and keyboard contracts

- Add ingredient or meal names to Change, decrease, increase, and batch labels.
- Add real labels to weekly add/edit inputs and keep a single-column mobile form order.
- Replace the shopping tab markup with `SegmentedTabs` plus linked tab panels.
- Fix the singular batch message.

### Phase 4 — Make AI review explicit and resumable

- Default new recipe ideas to unchecked unless Freek chooses the faster preselected path in the review artifact.
- Label each need selector with its ingredient.
- Reopen the current unexpired proposal and its selections instead of generating again.

### Phase 5 — Extend the existing cooking plan

- Add `aria-pressed` or real checkbox inputs to the existing cooking-plan tickets for ingredient, preparation, and step completion.
- Keep the already planned current-step, readability, progress, and focus work in `FEATURE_LIST_COOKING_MODE_FOCUS.md`.

## Adopted patterns and terms

- Reuse `BottomSheet`, `SegmentedTabs`, the toast/status region, and existing motion tokens. Add no package.
- Keep visible “Change” where space is tight, but use “Change {ingredient}” as its accessible name.
- Use “Decrease portions for {meal}” and “Increase portions for {meal}”.
- Use singular “Set 1 recipe batch” and plural for 2–4.
- Keep the shipped shopping terms: “Every time”, “Nice to have”, “Usually stocked”, and “Use in recipe”. They tested clearly.

## Effort and risk

Overall effort: M. Phase 1 is a small P1 UI fix. Phases 2 and 4 touch async state and need focused regression tests. No schema, migration, model, or provider change is needed.

## Shipped result

The accepted P1 and P2 work now ships across shopping, meal planning, recipe review, and cooking. Failed writes keep the user's draft, repeated controls have specific names, tabs follow keyboard rules, focus survives list moves, and AI suggestions start unchecked and reopen without another model call. The unselected P3 motion work and singular batch-copy refinement remain outside this run.

[Open the archived visual audit](../../artifacts/archive/2026-07-22-ux-ui-latest-features.html)
