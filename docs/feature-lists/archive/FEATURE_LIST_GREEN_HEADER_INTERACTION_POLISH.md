# Green Header Interaction Polish

_Status: Shipped (2026-08-01)_

## Problem framing

The Green Ribbon has the right identity and route hierarchy, but its controls do not yet behave as
one finished family. At 393 px, the Stock, Recipes, and recipe-detail filter buttons open absolute
desktop-style popovers inside the ribbon. The page remains scrollable behind them, there is no modal
backdrop, and the panels visually float over the list. Meal Plan's More control has the same mobile
problem through a separate `<details>` dropdown; Escape does not close it, so it can remain visible
behind the Add meal drawer. Recipe detail carries a third custom overflow-menu implementation.

The goal is one responsive rule: a menu or multi-choice disclosure opened from the Green Ribbon is a
modal bottom drawer on phone and an anchored popover on desktop. Direct actions and destinations stay
direct. The established Grove material, title geometry, action hierarchy, labels, route behavior, and
44 px targets remain unchanged.

## Existing-system inventory

- `KitchenPageHeader.svelte` owns Green Ribbon identity and joined command-action geometry.
- `CombinedFilterMenu.svelte` owns the mobile Stock, Recipes, and recipe-detail filter/view trigger,
  but currently implements its own absolute panel and focus trap.
- `BottomSheet.svelte` is the app's established native-dialog drawer with focus containment, backdrop,
  Escape dismissal, focus return, safe-area padding, and reduced-motion-aware transitions.
- Meal Plan uses a daisyUI `<details>` dropdown for More; Recipe detail uses a separate custom menu,
  outside-click handler, focus loop, and transition.
- Header actions that already open `BottomSheet`—Stock Activity/Add, Recipes New meal/Import, Meal
  Plan Add meal, Shopping Add item, and Recipe Plan—are the reference behavior, not migration targets.

## Scope

### In

- Stock, Recipes, and recipe-detail mobile filter/view disclosures.
- Meal Plan and conditional recipe-detail overflow menus.
- Shared Green Ribbon action-group surface, open-state styling, and launcher semantics.
- Phone and desktop pointer/keyboard behavior, English/Dutch copy fit, dark theme, reduced motion,
  focus return, background inertness, and fixed-navigation clearance.
- Focused source/unit/browser contracts, complete repository gate, default-branch delivery, Railway
  deployment supervision, and authenticated canary.

### Out

- Green Ribbon palette, type, 64/72 px standard geometry, contextual Recipe layout, navigation, data,
  schema, auth, persistence, AH behavior, or shopping-list derivation.
- Reworking direct actions into menus, changing action labels, or redesigning page content below the
  ribbon.
- Adding Vaul or another drawer dependency. The existing native-dialog drawer already owns the needed
  accessible modal behavior; the missing work is routing header disclosures through it.

## Option comparison

### Chosen — shared responsive header menus on the existing BottomSheet

Move `CombinedFilterMenu` content into `BottomSheet` and add one small responsive header-overflow
primitive for Meal Plan and Recipe detail. Mobile gets the established modal drawer; desktop retains
an anchored menu with menu-key behavior. This removes three bespoke dismissal/focus implementations
without adding a second drawer stack.

### Rejected — add `vaul-svelte`

This duplicates an existing application primitive and introduces a new interaction dependency solely
for a presentation seam. The requested Vaul-style phone outcome is available through the current
native dialog with less bundle, migration, and maintenance cost.

### Rejected — patch each route-local popover

Route-local mobile CSS would preserve duplicate focus, Escape, backdrop, scroll-lock, and z-index code.
The interaction would drift again as soon as another header menu is added.

## Phase plan

1. Convert the three combined filter/view disclosures to the established mobile bottom drawer and
   prove modal behavior before changing any overflow menu.
2. Add one responsive header overflow primitive, migrate Meal Plan and Recipe detail, and preserve the
   desktop menu keyboard contract.
3. Polish shared action-group/open states and dialog-launcher semantics, then audit every Green Ribbon
   shape at the priority viewports and states.
4. Simplify, update the durable house-style contract, run the complete gate, ship to `main`, supervise
   Railway, and run the authenticated production canary without retaining household evidence.

## Execution tickets

### GHP-1 — mobile filter and view drawers

- **Observable behavior:** Stock Filters, Recipes Filters, and recipe-detail View open as modal bottom
  drawers on phone; the trigger summary remains in the ribbon and focus returns to it on close.
- **Scope in:** replace the absolute mobile panel and manual focus trap with `BottomSheet`; preserve
  trigger markup, active summaries, filter state, URL state, and Done behavior.
- **Scope out:** desktop inline filter toolbars, filter values, search/sort behavior, route loaders.
- **Target files:** `src/lib/components/ui/CombinedFilterMenu.svelte`,
  `tests/e2e/house-style.e2e.ts`, `tests/e2e/responsive-parity.e2e.ts`.
- **Risk tier:** R2. `wide_sweep: false`. `requires_stage_gate: false`.
- **Verification:** phone drawer is a top-layer modal with backdrop and inert background; 320/393 px
  fit; Escape/backdrop/Done dismissal; focus return; filter changes persist; desktop inline controls
  remain unchanged.
- **Rollback:** revert the component and its focused tests; no data/configuration recovery.

### GHP-2 — responsive header overflow menu

- **Observable behavior:** Meal Plan More and conditional recipe-detail More open a bottom drawer below
  768 px and an anchored keyboard-operable popover at desktop width; opening another dialog never
  leaves the menu behind it.
- **Scope in:** one shared header-menu primitive, existing links/actions/icons/danger tone, outside
  click, Escape, Arrow/Home/End behavior on desktop, modal dismissal/focus return on phone.
- **Scope out:** menu destinations, reset/remove behavior, confirmation rules, recipe progress state.
- **Target files:** new `src/lib/components/ui/HeaderActionMenu.svelte`,
  `src/routes/meal-plan/+page.svelte`, `src/lib/components/recipe-detail/RecipeHeader.svelte`,
  `tests/e2e/house-style.e2e.ts`, `tests/e2e/responsive-parity.e2e.ts`.
- **Risk tier:** R2. `wide_sweep: false`. `requires_stage_gate: false`.
- **Dependencies:** GHP-1.
- **Verification:** mobile Meal Plan and recipe-detail menu states; desktop pointer and keyboard menu
  traversal; route navigation; action dispatch; focus restoration; no duplicate open surface.
- **Rollback:** revert the shared primitive and both callers together.

### GHP-3 — Green Ribbon control finish

- **Observable behavior:** joined and standalone header actions share a crisp outer boundary, consistent
  type/icon rhythm, visible open/pressed state, and correct dialog/menu launcher semantics without
  changing the established hierarchy.
- **Scope in:** shared command-action surface and `[aria-expanded]` treatment; `aria-haspopup` and
  expanded state where the launcher owns a drawer; source contract updates.
- **Scope out:** route-specific palette, label changes, moving actions, new icons, or control behavior.
- **Target files:** `src/lib/components/ui/KitchenPageHeader.svelte`, Green Ribbon callers in
  `src/routes/inventory/+page.svelte`, `src/routes/recipes/+page.svelte`,
  `src/routes/meal-plan/+page.svelte`, `src/lib/components/shopping/WeekNav.svelte`,
  `src/lib/components/recipe-detail/RecipeHeader.svelte`, `src/lib/ui_house_style_source.test.ts`,
  `tests/e2e/house-style.e2e.ts`.
- **Risk tier:** R2. `wide_sweep: false`. `requires_stage_gate: false`.
- **Dependencies:** GHP-1 and GHP-2.
- **Verification:** 320/393/768/1280 px; normal/long content; light/dark; hover/focus/active/open/
  disabled; 44 px targets; no clipping, overflow, or Ribbon geometry regression.
- **Rollback:** revert the shared styling/semantics commit; drawer behavior remains independently
  reversible.

### GHP-4 — closure and production delivery

- **Observable behavior:** the house-style contract describes responsive header disclosures; the full
  gate passes; `main` deploys the exact commit; the authenticated production canary passes.
- **Scope in:** style guide, feature-list lifecycle, append-only log/deploy record, complete gate,
  scoped commit/push/PR merge, Railway truth, privacy-safe canary.
- **Scope out:** provider calls, AH pushes, config writes, household screenshots/HAR/cookies/bodies.
- **Target files:** `docs/ui-house-style.md`, this feature list, `docs/log.md`, and the existing monthly
  deploy record if production evidence requires it.
- **Risk tier:** R2. `wide_sweep: false`. `requires_stage_gate: false`.
- **Dependencies:** GHP-1 through GHP-3.
- **Verification:** `git diff --check`; focused Playwright; `npm test`; deployed source branch `main`,
  Railway `SUCCESS`, deployed commit equals remote `main`, authenticated canary passes.
- **Rollback:** revert the feature commit on `main` and supervise the Railway redeploy; no schema,
  data, auth, secret, provider, or AH rollback.

## Risk and verification matrix

Overall risk is **R2** because shared rendered interaction code changes across several routes. The
rollback is code-only; no beta stage gate applies because schema, auth, real-user data, and destructive
operations are untouched.

| Failure mode | Trigger | Impact | Detectability | Mitigation | Residual risk |
|---|---|---|---|---|---|
| Filter choice closes or resets unexpectedly | Drawer ownership replaces local open state incorrectly | Repeated mobile filtering becomes slower or URL state drifts | Focused route tests and browser back/forward probe | Keep caller-owned bound `open` and render the existing snippet unchanged | Low |
| Native dialog is nested or left open across navigation | Sheet is rendered inside header markup without close synchronization | Stuck backdrop or focus loss | Route navigation and close-state assertions | Let `BottomSheet` own `showModal`, close, and focus return; close before item navigation/action | Low |
| Desktop menus regress while fixing phone | Shared component applies modal behavior at all widths | Desktop loses compact anchored actions | 768/1280 pointer and keyboard matrix | Explicit responsive branch; preserve menu semantics above the breakpoint | Low |
| Meal Plan More remains open behind Add meal | `<details>` state survives Escape or another modal launch | Layered controls and confusing focus | Reproduce at 393 px before/after | Remove `<details>` ownership and enforce one `open` state in the shared primitive | Low |
| Conditional Recipe More loses an action | Data-driven items are mapped incorrectly | Reset progress or Remove photo becomes inaccessible | Fixture/source coverage for one- and two-item menus | Keep condition checks in the caller and pass the existing handlers unchanged | Low |
| Shared polish changes Green Ribbon geometry | border/shadow/type adjustments add size | Header grows or overflows at 320 px | Exact geometry and overflow assertions | Use inset/box-shadow and existing 44 px dimensions; do not change layout tracks | Low |
| Drawer looks draggable but is not | Decorative handle implies swipe behavior | False affordance | Visual review | Do not add a grab handle unless drag interaction exists | None |

### Audit record

- **UI:** Applicable. Browser evidence at 393 × 852 shows the Stock, Recipes, and recipe-detail
  disclosures as absolute panels without backdrop/background inertness. Their content fits, but the
  surface behaves and reads as a desktop popover. The action groups also lack one consistent open-state
  treatment.
- **UX:** Applicable. Meal Plan More remains open when Escape is pressed and can remain visible behind
  Add meal. The three filter/view journeys require manual close/focus logic instead of the app's
  established drawer behavior.
- **Harden:** Not triggered. No security, persistence, provider, AH, or production-readiness boundary
  changes beyond ordinary verified delivery.
- **Stack discipline:** Not triggered. No dependency is introduced.
- **Reference verification:** the chosen implementation is internal-only; no external API behavior is
  required.

### Plan critique

The plan is **GO**. Each ticket maps to one observable behavior, every rendered interaction has an
explicit Playwright path, and rollback is code-only. The highest blast radius is a shared responsive
menu regression; separating filter drawers from overflow menus and verifying each vertically limits
that risk. Independent implementation review was still required because this delivery changes the
durable house-style rules; its accepted findings and repairs are recorded below.

**Steelman:** The strongest alternative is installing Vaul so the drawer name and gesture model match
the request literally. That would be justified if swipe/snap behavior were itself the product goal.
Here the observed defect is modality, focus, dismissal, background locking, and visual placement; the
existing `BottomSheet` already owns those behaviors throughout Keukenbrein. Reusing it is the stronger
choice because it makes header menus agree with every other household drawer and removes duplicate
code without adding a second modal runtime.

## Execution update

All four tickets are complete. Stock, Recipes, and recipe-detail compact disclosures now open the
existing native-dialog bottom drawer and close when their responsive trigger is hidden. Meal Plan and
conditional Recipe More actions share one responsive component: a modal drawer below 768 px and a
standards-compliant `role="menu"` action list above it. Desktop menus support Arrow, Home, End, Tab,
Escape, outside-click, and focus-leave dismissal; mobile and desktop command actions return focus to a
stable control. Direct dialog launchers expose `aria-haspopup` and their owned expanded state.

The command action group gained a subtle joined boundary without creating a stacking context or
letting ribbon button rules style dialog content. The external review caught both risks, plus invalid
menu children, Tab dismissal, conditional-action focus, and breakpoint-modal gaps; each accepted
finding was repaired before the final gate.

Model opus (resolved: claude-opus-5) [verify]: reviewed only the staged Green Ribbon diff; identified
the stacking, menu-semantics, focus, style-leakage, breakpoint, and recipe-action coverage defects
that were fixed and reverified.

The exact scoped patch passed `git diff --check`, 114 unit files / 680 tests, zero Svelte diagnostics,
35 authenticated primary-account browser stories with one deliberate connected-AH skip, and the
production build. The focused browser story also proves Recipe command-button dispatch, phone focus
landing, desktop frontmost painting, Tab dismissal, and Escape focus return. Verification used an
in-memory SQLite database and isolated fixed test users. The first bare run encountered the already
documented ignored `dev.db` migration mismatch; a shared-worktree rerun then saw concurrent Portion
and Removal edits, so the successful release gate ran in a clean temporary worktree containing only
this staged patch. No dependency, schema, auth, provider, AH, household data, or configuration changed.

## Rollout and rollback strategy

Ship the R2 change through the ordinary feature-branch PR route. After the full isolated gate passes,
merge to `main`, wait for Railway to report `SUCCESS` at the remote `main` tip, and run the authenticated
canary. If the canary exposes a header regression, revert the feature commit and supervise that redeploy;
there is no schema or data rollback.

## Open Questions

None. The user explicitly requested mobile drawer menus and production delivery; implementation uses
the repository's established modal drawer rather than adding a second dependency.

## Resume pack

- **Goal:** finish every Green Ribbon control by routing mobile disclosures to bottom drawers,
  preserving desktop popovers, and unifying action-group/open states.
- **Current state:** shipped on `codex/green-header-mobile-sheets`; GHP-1 through GHP-4 are complete.
- **First command:** inspect the production delivery record if post-merge evidence is needed.
- **First files:** `src/lib/components/ui/CombinedFilterMenu.svelte` and
  `src/lib/components/ui/HeaderActionMenu.svelte`.
- **Pending verification:** none for the feature patch. Railway revision truth and the authenticated
  production canary are recorded separately after the merge.
- **Open questions:** none.
