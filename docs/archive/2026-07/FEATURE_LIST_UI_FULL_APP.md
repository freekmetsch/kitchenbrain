# Feature List: Full-App UI and UX Polish
_Status: Shipped — 2026-07-18_

## Completion note

All four phases and UI-1 through UI-15 shipped together with the contextual-agent plan. Automated closeout passed 26 Vitest files / 203 tests, `svelte-check`, and the production build. The one-pass adversarial browser run recorded 5 passes, 3 failures, and 8 budget skips; all three findings (agent focus/reopen, exact short-timer labeling, and shared text contrast) were fixed after the run and retained as original evidence in `.context/ui-test-report.html`. No paid AI or Albert Heijn calls were made.

## Problem framing

Kitchenbrain has a coherent visual foundation—shared page shells, native-dialog sheets, localized messages, global reduced-motion handling, and optimistic list mutations—but several seams break the feeling of a dependable kitchen tool. The most visible failures are not ornamental: content is covered by fixed controls, route changes can open above the new page title, chat content becomes thousands of pixels wide, Undo can restore the database without restoring the visible row, and partial ingredient-role data is treated as complete.

The objective is a mobile-first polish pass that removes correctness and obstruction bugs before refining recipe editing, accessibility, localization, and motion consistency. The primary target is 375 px; 768, 1280, and 1536 px remain required verification surfaces.

## Scope

### In scope

- Authenticated routes: Home/chat, Stock, Meal plan, Shopping, Recipes, recipe detail/edit, Settings and every Settings child route.
- Shared navigation, overlays, bottom sheets, fixed bars, toasts, touch targets, focus behavior, reduced motion, and safe areas.
- English and Dutch UI states.
- Empty, single-item, long-content, deletion/Undo, and partial ingredient-role states.
- Browser verification without paid AI calls.

### Out of scope

- Implementing the floating contextual AI agent; it was planned separately in `docs/archive/2026-07/FEATURE_LIST_CONTEXTUAL_AI_AGENT.md` and shipped alongside this plan.
- Visual redesign of the product identity, color palette, or icon family.
- Albert Heijn live calls and paid OpenRouter calls.
- Multi-tenancy or a new design-system dependency.

## Evidence pack

The audit used a disposable, seeded SQLite database and a real Chromium session. Every static route was captured at 375, 768, 1280, and 1536 px under `output/playwright/`.

High-signal reproductions:

- `output/playwright/20260718-ui-inventory-two-portion-375.png` — deterministic `2 portion` copy.
- `output/playwright/20260718-ui-inventory-undo-missing-item-375.png` — Undo succeeded server-side while the live list remained empty.
- `output/playwright/20260718-ui-recipe-edit-notes-overlap-375.png` — Notes intersects the fixed Saved bar by 21.25 px; computed page bottom padding is only 16 px.
- `output/playwright/20260718-ui-home-chat-overflow-375.png` — a long token creates a 4,824 px-wide chat scroller.
- `output/playwright/20260718-ui-recipe-roles-trigger-after-375.png` and `output/playwright/20260718-ui-roles-home-chat-375.png` — the role helper opens above the trigger, then sends the user to a clipped Home composer.
- `output/playwright/20260718-ui-nav-scroll-retention-375.png` — after navigating from a scrolled Settings page, Meal plan opens with `main.scrollTop = 66` and its H1 at `top = -47`.
- `output/playwright/20260718-ui-inventory-nl-375.png` — Dutch UI leaks English food-class labels.

## Findings

| # | Priority | Area | Finding and impact | Evidence | Direction | Effort |
|---|---|---|---|---|---|---|
| 1 | P1 | Navigation | The custom `<main>` scroller retains position across client navigation. A new page can open with its H1 and primary actions above the viewport. | Browser: `20260718-ui-nav-scroll-retention-375.png`; `src/routes/+layout.svelte:71` | Add deliberate custom-container scroll restoration: reset on forward navigation and preserve per-history-entry position on back/forward. | M |
| 2 | P1 | Recipe edit | The fixed Saved bar covers the final Notes field on mobile. | Browser overlap 21.25 px; `src/app.css:93`; `src/routes/recipes/[slug]/edit/+page.svelte:102,250,264` | Remove the `py-4` conflict and reserve bottom space using a shared nav + fixed-bar + safe-area offset. | S |
| 3 | P1 | Home chat | Long URLs/tokens/tool values create a nested horizontal scrollbar up to 4,824 px wide. | Browser: `20260718-ui-home-chat-overflow-375.png`; `src/lib/components/ChatView.svelte:543-571,592-639` | Apply `min-w-0`, clip accidental x-overflow, wrap arbitrary words, and confine intentional scrolling to code/pre blocks. | S |
| 4 | P1 | Stock Undo | Delete/Undo can restore the DB while leaving the item absent until refresh; the callback discarded the row snapshot/index and has no interrupted-response recovery. | Browser combined remove/Undo; `src/routes/inventory/+page.svelte:473-505` | Optimistically reinsert the captured snapshot at its prior index, reconcile server truth, and roll back on conflict/failure. | M |
| 5 | P1 | Recipe roles | `some(role)` treats partial role coverage as complete, so unclassified fresh ingredients can silently disappear from shopping derivation. | `src/routes/recipes/[slug]/+page.server.ts:46-60`; `src/lib/server/recipe_links.ts:59-67`; `src/lib/server/shopping_needs.ts:99-110` | Compute expanded ingredient coverage (`classified`, `total`, unknown names) and only mark complete when every relevant ingredient has a valid role. | M |
| 6 | P1 | Recipe AI entry | “Set roles with AI” is a faint 11 px action that opens a one-line editor above itself, without focus movement, then navigates away to a clipped composer. | Browser paired screenshots; `src/routes/recipes/[slug]/+page.svelte:203-284`; `AiEditBar.svelte:27-59`; `FreezerStockPanel.svelte:203-210` | Replace with the contextual agent surface; until then, an adjacent focused sheet is the acceptable local pattern. | L, separate plan |
| 7 | P1 | Overlays | Toasts use a fixed `bottom: 4.5rem` and can overlap `FixedBottomBar`, obscuring Save/rating controls. | `src/lib/components/ui/Toast.svelte:19-35`; `FixedBottomBar.svelte:19-30` | Centralize overlay bottom offsets in layout-owned CSS variables. | S |
| 8 | P1 | Timer accessibility | The whole cook timer is a polite live region while its countdown updates every second, producing repeated announcements. | `src/lib/components/cook-mode/Timer.svelte:122-149` | Remove tick text from the live region; announce completion/cancellation only. | S |
| 9 | P1 conditional | PWA safe areas | `viewport-fit=cover` is enabled, but most page shells lack top safe-area clearance in installed iOS mode. | `src/app.html:9`; `src/routes/+layout.svelte:71-79`; only `RecipeHeader.svelte:117-120` compensates | Own top safe-area padding centrally and verify sticky headers in portrait/landscape. | M |
| 10 | P2 | Stock copy | Canonical unit `portion` is rendered raw, producing `2 portion`; Dutch/English display pluralization is inconsistent. | Browser: `20260718-ui-inventory-two-portion-375.png`; `inventory/shared.ts:67-68`; `QtyControl.svelte:80-111` | Add a localized display-quantity helper while keeping DB unit canonical. | S |
| 11 | P2 | Recipe editing | Manual edit and AI edit are hidden behind the same overflow menu, the form is dense, repeated fields lack persistent labels, and ingredient roles cannot be edited manually. | `RecipeHeader.svelte:189-225`; edit page `:13-19,163-248` | Make Edit direct, distinguish “Edit fields” from “Ask AI”, introduce section editing, labels, role controls, and draft recovery. | L |
| 12 | P2 | Localization | Dutch pages leak Meat/Fish/Veggie/Other and several English status/date strings. | Browser NL inventory; `inventory/shared.ts:45-65`; `food_categories.ts:1-19`; `ChatView.svelte:346-349`; `Spinner.svelte:12-24` | Route all labels/status/date formatting through shared locale-aware helpers/messages. | M |
| 13 | P2 | Touch targets | Several compact critical actions fall below 24 px high, including Toast Undo, recipe-role CTA, inventory quantity/edit links, and “View meal plan”. | Automated bounding-box scan; `Toast.svelte:31-35`; `FreezerStockPanel.svelte:203-210`; `FacetChips.svelte:168-187,252-264` | Add a shared compact-action primitive with 24 px conformance floor and 36–44 px mobile target where space allows. | M |
| 14 | P2 | Navigation labels | Six equal-width bottom-nav destinations force unusually small labels and intentionally truncate Shopping; Dutch is especially fragile. | `src/lib/components/NavBar.svelte:20-27,51-53`; 375 px English/Dutch captures | Use shorter localized labels or a responsive five-plus-More information architecture. | M |
| 15 | P2 | Motion | Sheets, chat, list transitions, and swipe behavior hard-code durations/easing independently; there is no motion-token seam. | `src/app.css:137-158`; `BottomSheet.svelte:66-104`; `ChatView.svelte:53-58`; `swipe.ts:38-49` | Seed micro/content/large duration and easing tokens, preserving reduced-motion behavior. | M |
| 16 | P2 | Settings avatar | The username initial sits at the left edge of the orange avatar rather than centered at mobile and desktop widths. | 375/1280 Settings screenshots; `src/routes/settings/+page.svelte:69-72` | Make the avatar surface an explicit grid/flex centering container instead of relying on the daisyUI placeholder contract. | S |
| 17 | P2 | Page titles | Home has no explicit title; SPA navigation from Recipe detail can leave “Bolognese · Recipes” as the Home document title. | Browser after role handoff; `src/routes/+page.svelte` has no `<svelte:head>` | Add a localized Home title and include title assertions in route smoke tests. | S |
| 18 | P2 | Horizontal filter affordance | Stock/Recipe filter rails scroll intentionally but show no edge fade or other cue that more options exist. | Browser metrics and 375 px screenshots; `FacetBar.svelte:34`; recipes page `:363,384` | Add an overflow affordance and ensure keyboard scrolling/focus keeps the selected chip visible. | S |

Totals: 9 P1 (including one installed-PWA conditional), 9 P2. The UI gap is concentrated in cross-component coordination—scroll containers, fixed overlays, async reconciliation, and server-derived completeness—not in the underlying visual language.

## Top three improvements

1. Restore spatial correctness: reset/restore the custom page scroller, reserve fixed-bar space, and coordinate overlay offsets.
2. Restore state correctness: make Undo optimistic/reconciling and make ingredient-role completeness exact.
3. Make chat and recipe editing resilient: contain long content, then replace scattered AI edit entry points with the planned global agent.

## Phase plan

### Phase 1 — Remove visible breakage (R1/R2, single window per ticket)

- [x] **UI-1: Custom scroller restoration**
  - Scope: forward navigation starts at top; browser back/forward restores the prior custom-main position.
  - Targets: `src/routes/+layout.svelte`, a focused navigation/scroll helper if needed.
  - Verification: Data → scroll → Meals; browser back/forward; 375 and 1280 px.
  - Rollback: remove the navigation hook/helper and restore the current layout.
- [x] **UI-2: Fixed-surface layout contract**
  - Scope: page shell, nav, fixed action bars, toasts, and safe-area offsets share tokens; no overlap.
  - Targets: `src/app.css`, `FixedBottomBar.svelte`, `Toast.svelte`, recipe edit page.
  - Verification: Notes/Save bounding boxes, toast + fixed bar, installed-PWA safe areas.
  - Rollback: revert token consumers together; do not leave mixed offsets.
- [x] **UI-3: Chat width containment**
  - Scope: long text, URLs, tool summaries, and diff chips wrap; only code/pre can intentionally scroll.
  - Targets: `src/lib/components/ChatView.svelte`; add a browser regression fixture/smoke.
  - Verification: 300-character token and tool values at 320/375/768 px; `scrollWidth === clientWidth` for the chat list.
  - Rollback: revert containment classes as one change.
- [x] **UI-4: Reliable inventory Undo**
  - Scope: snapshot/index survives delete; Undo reinserts immediately, reconciles success, and handles conflict/interrupted response.
  - Targets: `src/routes/inventory/+page.svelte`, inventory client-state tests, existing inventory write tests.
  - Verification: happy path, delayed response, 409 conflict, rejected response, committed-server/interrupted-client response.
  - Rollback: revert client optimistic path; server history remains authoritative.
- [x] **UI-5: Exact ingredient-role coverage**
  - Scope: parent and expanded sub-recipe ingredients report total/classified/unknown; shopping never silently drops unknown ingredients.
  - Targets: recipe detail server load, `recipe_links.ts`, `shopping_needs.ts`, unit tests.
  - Verification: zero, partial, complete, and sub-recipe-only roles.
  - Rollback: revert shared coverage helper and its consumers together.

Exit: all deterministic P1 browser reproductions are clean; no paid model request is used.

### Phase 2 — Reduce recipe and AI friction (R2, multi-window)

- [x] **UI-6: Contextual agent handoff** — execute `FEATURE_LIST_CONTEXTUAL_AI_AGENT.md`; remove the one-line `AiEditBar`/Home redirect only after the global controller is verified.
- [x] **UI-7: Recipe-edit information architecture** — direct Edit action, section-level edits, persistent labels, ingredient-role editing, reorder controls with non-drag alternatives, and unsaved-draft recovery.
- [x] **UI-8: Role-coverage component** — replace the faint sentence with a complete component showing coverage/progress, unknown ingredients, consequence for freezer serving, and a clear agent CTA.

Exit: a user can discover editing in one tap, assign roles manually or through the agent, and remain on the recipe route.

### Phase 3 — Accessibility, language, and responsive integrity (R1/R2)

- [x] **UI-9: Timer announcements** — meaningful events only.
- [x] **UI-10: Localized quantity/category/status helpers** — English and Dutch sentinel tests.
- [x] **UI-11: Compact action and nav-label pass** — 24 px floor, 200% text, Dutch labels.
- [x] **UI-12: Home title and Settings avatar** — explicit title; explicit avatar centering.

Exit: keyboard/focus walk is clean, no English sentinel leaks in Dutch core journeys, and touch-target audit has no critical sub-24 px actions.

### Phase 4 — Unified feel (R1)

- [x] **UI-13: Motion tokens** — micro/content/large durations and easing curves; reduced-motion remains authoritative.
- [x] **UI-14: Scroll-rail affordances** — edge fades, selected-chip visibility, keyboard behavior.
- [x] **UI-15: Cross-page interaction regression pack** — paired before/after screenshots for sheets, filters, list mutations, and theme toggles.

Exit: repeated interactions use shared motion semantics and all four audit viewports remain visually consistent.

## Verification matrix

| Risk | Fast seam | Browser seam | Required commands |
|---|---|---|---|
| Scroll/layout | helper/unit test where possible | route transition + bounding-box assertions | `npm run check`, `npm run build` |
| Undo/state | client state function + inventory write tests | delete/Undo without reload under delayed/failing responses | `npm run test:unit` |
| Ingredient roles | pure coverage/shopping tests | recipe detail coverage states | `npm run test:unit` |
| Chat overflow | rendering fixture | 320/375/768 px width assertions | `npm run check`, `npm run build` |
| Accessibility/i18n | formatter/message tests | keyboard walk, NL sentinel scan, installed-PWA safe area | all three repo gates |

## Critique and sequencing call

The plan should not start with visual refinements. Scroll restoration, content obstruction, state reconciliation, and ingredient-role correctness have direct task and shopping consequences, so they remain Phase 1. The contextual agent is intentionally separated because using it as a shortcut before fixing its controller/security/context seams would compound ChatView state and create another overlay collision.

## Open Questions

None block execution. Safe defaults are already chosen: mobile-first, no new dependency, no paid-model browser tests, and structural fixes before motion/delight.

## Resume pack

Next: execute Phase 1 in vertical tickets, beginning with UI-1 and UI-2, then verify each reproduction before moving to state correctness.
