# Feature List: Shopping Mobile Density Refinement

_Status: Shipped - 2026-07-28 (compact mobile controls and a progress-free Shopping header)_

## Problem framing

`/shopping` already has a compact 50 CSS-pixel checkable row and a useful fixed Add/AH dock. The
mobile overload sits above that list: meal filters, a full-width sort select, weekly-item
management, shopping-rule management, and notices all appear before the repeated shopping task.

The seeded authenticated browser fixture made the cost measurable:

| State | Viewport | Observed geometry |
|---|---:|---|
| Populated, one collapsed notice | 375 × 900 | Header `151px`; controls `148px`; first row begins at `373px` |
| Populated, one collapsed notice | 320 × 900 | Header `151px`; controls grow to `198px`; first row begins at `425px` |
| Empty week | 375 × 900 | The same `148px` controls remain despite there being nothing to filter or sort |

At 320px, low-frequency maintenance takes nearly four row-heights before the first item. In the
empty state, `All`, `List order`, and a disabled `Manage shopping rules` control compete with the
actual next step, while the fixed dock gives half its width to a disabled AH action.

The goal is to make the page feel like a shopping list first on a phone without deleting the sort,
weekly-item, recipe-rule, notice, Add-item, or AH capabilities. The visual progress track is also
removed from the shared Shopping header at every viewport; the useful left/basket counts remain.

### Success criteria

- At widths below `48rem`, the populated list exposes meal filters and one pinned `List options`
  trigger in a single 44px control row.
- In the seeded 320px and 375px populated state with one collapsed notice, the first checkable row
  begins above `300px` without reducing the 44px touch targets.
- Sort, weekly items, and shopping rules remain reachable from `List options`; opening either
  owner sheet never stacks two dialogs.
- A true empty week shows no inert filter/sort chrome. Its primary recovery action remains first,
  with list maintenance available as a secondary option.
- When AH review has no eligible items on mobile, the dock presents the available Add action
  without an equally weighted disabled AH button.
- Mobile and desktop retain the textual left/basket counts without rendering a progressbar role or
  visual progress track.
- Filter-empty, covered-only, complete, long-content, English/Dutch, light/dark, keyboard, and
  desktop behavior remain correct.

## Existing-system inventory

| Concern | Current owner | Plan consequence |
|---|---|---|
| Page identity and week context | `WeekNav.svelte`, `KitchenPageHeader.svelte`, `KitchenWeekNavigator.svelte` | Preserve identity, navigation, and textual counts; remove the visual progress track on every viewport |
| Filter, sort, sheet sequencing, focus | `list-controller.svelte.ts` | Extend the per-instance controller; do not add module-global rune state |
| List controls and rows | `ShoppingLists.svelte` | Recompose only the control region and true-empty action area; retain the 50px row contract |
| Weekly manager | `RecurringShoppingList.svelte` | Reuse its existing owner sheet and exported `openManager()` entry point |
| Recipe-rule manager | `ShoppingLists.svelte` rule sheet | Reuse the existing sheet and close-before-open handoff pattern |
| Dialog behavior | `BottomSheet.svelte` | Reuse native-dialog focus trap, Escape close, return focus, and reduced-motion behavior |
| Horizontal rails | `app.css` `ui-scroll-rail` | Use the shared continuation/focus treatment instead of a page-local overflow recipe |
| Fixed mobile actions | `/shopping/+page.svelte` | Derive the compact dock from the existing `visibleToBuyCount`; do not create new AH eligibility logic |
| Browser coverage | `responsive-parity.e2e.ts`, `kitchen-flows.e2e.ts` | Extend the isolated seeded fixture at 320/375 and retain desktop parity checks |

## Scope

### In

- A mobile-only, single-row control composition with a scrollable filter rail and a pinned
  `List options` trigger.
- A mobile list-options bottom sheet containing the existing sort choices plus entry points for
  weekly items and shopping rules.
- Controller-owned close-then-open sequencing from list options into weekly/rule owner sheets.
- State-aware control visibility for true empty weeks, while preserving a secondary maintenance
  entry point beside the empty-state recovery action.
- A mobile dock variant that omits the disabled AH action when there are zero eligible items.
- Removal of the Shopping header's visual progress track on mobile and desktop while preserving
  the textual left/basket status.
- English/Dutch copy for the new disclosure and accessible labels.
- Focus, Escape, long-label, high-zoom, reduced-motion, theme, and responsive regression coverage.

### Out

- Changes to shopping aggregation, bought state, recurring or recipe-rule mutation semantics.
- AH preview, push eligibility, Dutch search terms, favorites, or push-history behavior.
- Schema, auth, runtime configuration, dependencies, persistence, or migrations.
- A redesign of the shared Kitchen Ledger header beyond removing the Shopping progress track, or
  changes to 50px shopping rows, notices, desktop context rail, bottom navigation, or other routes.
- Persisting filter, sort, or options-sheet state across visits.

These exclusions are inert: no caller, migration, rename, or future data cleanup depends on them.

## Option comparison

| Option | Benefit | Cost | Decision |
|---|---|---|---|
| Tighten padding and font sizes only | Lowest code change; keeps every action visible | Cannot remove the 320px three-control stack without shrinking touch targets; equal-weight choices remain | Rejected |
| Keep filters direct; move sort and maintenance behind one mobile disclosure | Saves roughly `102–157px` before the first row, preserves all capabilities, and keeps the repeated action in front | Sort and maintenance take one extra tap on mobile | **Chosen** |
| Remove management from mobile or move it to Settings | Maximum visual reduction | Breaks contextual access and the shipped one-list maintenance contract | Rejected |

## Chosen approach

### Populated and recoverable list states

Below `48rem`, render one row:

1. a horizontally scrollable filter rail for `All`, meal filters, and `Weekly`;
2. a pinned 44px `List options` button that never scrolls out of reach.

`List options` opens one `BottomSheet` with:

- the existing `List order`, `A–Z`, and `Store route` choices;
- `Manage weekly items`;
- `Manage shopping rules`, disabled only when there are genuinely no recipe-owned rules.

The controller owns the options-sheet state and any pending handoff. Choosing weekly items or
shopping rules first closes the options sheet, waits for the existing settle boundary, then opens
the destination owner. This preserves the repository rule that controllers own request and state
transition sequencing and prevents stacked native dialogs.

At `48rem` and above, keep the current direct sort and management controls. The change is a mobile
priority treatment, not a desktop redesign.

### True empty states

When `viewMode === 'empty'`, do not render `All`, sort, or disabled rule controls. Keep the existing
primary recovery link (`Plan meals` or `View stock`) and add a quieter `List options` action for
weekly/rule maintenance. Keep the fixed Add action.

Do not apply this hiding to `filter-empty`: the filter row must remain visible so the user can
clear or change the active filter.

### Fixed dock

Continue using `visibleToBuyCount` as the sole UI input. On mobile:

- count above zero: keep Add + Review AH;
- count equal to zero: show Add as the single dock action and omit the disabled AH button.

Desktop AH context and the actual AH review/push contract remain unchanged.

### Header counts without a progress track

Remove the Shopping header's `progressbar` role, percentage calculation, and visual track at every
viewport. Keep `items left` and `in basket` as plain text status beside the existing week
navigation. Remove the now-unused `totalCount` prop and page-level aggregate rather than leaving
dead progress-only data flow.

## Phase plan

### Phase 1 — State and handoff contract

Add the list-options state and close-before-open transitions to the shopping controller, with
focused unit tests for open, cancel, weekly handoff, rules handoff, and per-instance isolation.

### Phase 2 — Mobile composition

Replace the stacked mobile tools with the one-row filter/options composition, reuse the shared
scroll-rail treatment, make true-empty controls state-aware, add the single-action mobile dock,
remove the shared Shopping progress track, and add English/Dutch copy. Preserve current desktop
control behavior.

### Phase 3 — Browser proof and simplification

Extend authenticated browser coverage for populated, filter-empty, true-empty, covered-only, and
complete states; verify dialog focus and no stacking; run the full repository gate; remove any
obsolete page-local mobile control CSS left by the new composition.

## Execution tickets

### SHOP-MOB-1 — Own list-options transitions in the shopping controller

- **Observable behavior:** Opening mobile list options, cancelling, or continuing to weekly/rule
  management produces exactly one open dialog and correct focus placement.
- **Scope in:** options open state; pending destination; close → settle → open sequencing;
  per-instance and cancellation tests.
- **Scope out:** recurring/rule mutation logic, filter/sort projection, persistence.
- **Target files:** `src/lib/components/shopping/list-controller.svelte.ts`,
  `src/lib/components/shopping/list-controller.svelte.test.ts`.
- **Risk tier:** R1.
- **Impact / effort / confidence:** 4 / S / high.
- **Dependencies:** none.
- **Verification:** focused Vitest coverage for options open/close, Escape/no pending action,
  weekly handoff, rules handoff, and two-controller isolation.
- **Rollback:** revert the controller state and tests; no persisted state or cleanup exists.

### SHOP-MOB-2 — Replace stacked mobile tools with one filter/options row

- **Observable behavior:** At 320px and 375px, populated shopping has one 44px control row; filters
  remain directly usable and sort/maintenance remain available through `List options`.
- **Scope in:** responsive control markup, mobile options sheet, desktop parity, shared
  `ui-scroll-rail`, English/Dutch labels, 44px target sizes.
- **Scope out:** row density, header geometry, filter/sort algorithms, other routes.
- **Target files:** `src/lib/components/shopping/ShoppingLists.svelte`, `messages/en.json`,
  `messages/nl.json`.
- **Risk tier:** R1.
- **Impact / effort / confidence:** 5 / M / high.
- **Dependencies:** SHOP-MOB-1.
- **Verification:** 320/375 browser geometry, filter scrolling and selection, all three sorts,
  options focus/Escape, weekly/rule handoffs, 1280 direct-tool parity.
- **Rollback:** revert the responsive composition and copy; the controller ticket can remain inert
  or be reverted with it.

### SHOP-MOB-3 — Remove inert chrome from mobile no-list states

- **Observable behavior:** A true empty week leads with its recovery card and one available Add
  dock action; list maintenance remains reachable without showing inert sort/filter controls.
- **Scope in:** `viewMode === 'empty'` control suppression, secondary empty-state list-options
  action, single-action mobile dock when `visibleToBuyCount === 0`.
- **Scope out:** filter-empty, AH eligibility, empty-state wording, desktop AH context.
- **Target files:** `src/lib/components/shopping/ShoppingLists.svelte`,
  `src/routes/shopping/+page.svelte`.
- **Risk tier:** R1.
- **Impact / effort / confidence:** 4 / S / high.
- **Dependencies:** SHOP-MOB-1, SHOP-MOB-2.
- **Verification:** no-meals and nothing-needed states, excluded-rule recovery, complete state,
  Add-item reachability, mobile/desktop dock parity.
- **Rollback:** restore unconditional controls and two-column dock; no data rollback.

### SHOP-MOB-4 — Remove the Shopping progress track at every viewport

- **Observable behavior:** Mobile and desktop show the textual left/basket status without a visual
  track or progressbar semantic.
- **Scope in:** remove percentage calculation, progress-only prop/data flow, track markup, and
  track CSS.
- **Scope out:** remaining/done counts, week navigation, shared headers on other routes.
- **Target files:** `src/lib/components/shopping/WeekNav.svelte`,
  `src/routes/shopping/+page.svelte`.
- **Risk tier:** R1.
- **Impact / effort / confidence:** 3 / S / high.
- **Dependencies:** none.
- **Verification:** browser assertions at 375 and 1280 for visible counts and absent progressbar;
  Svelte diagnostics for removed props.
- **Rollback:** restore the percentage prop and track markup/CSS; no data rollback.

### SHOP-MOB-5 — Lock the density and access contract into browser coverage

- **Observable behavior:** Automated checks fail if mobile controls restack, a destination sheet
  stacks, an action becomes unreachable, or desktop behavior changes.
- **Scope in:** stable semantic and geometry assertions for the changed states; English/Dutch,
  light/dark, 320/375/768/1280, keyboard, reduced motion, console/network checks.
- **Scope out:** visual snapshot tooling or a new test dependency.
- **Target files:** `tests/e2e/responsive-parity.e2e.ts`,
  `tests/e2e/kitchen-flows.e2e.ts` only where the journey assertion belongs.
- **Risk tier:** R1.
- **Impact / effort / confidence:** 4 / M / high.
- **Dependencies:** SHOP-MOB-2, SHOP-MOB-3, SHOP-MOB-4.
- **Verification:** focused primary e2e during development, then `npm test`,
  `npm run test:e2e:secondary`, and `git diff --check`.
- **Rollback:** revert only the new assertions if the product change is also reverted; never
  weaken existing shopping or responsive coverage to make the gate pass.

## Risk tier and verification matrix

Overall risk: **R1** — localized shopping UI and interaction-state changes with no schema, auth,
data, provider, or external-write change. The beta-stage R3 staging gate does not apply.

| Area | Audit / proof | Required result |
|---|---|---|
| UI audit | **Run** at 375 × 900 and 320 × 900, populated long list; 375 × 900 empty week | Control block and empty-state overload are reproduced with runtime geometry; rows and header remain stable |
| UX audit | **Run** for the repeated mobile shopping task and empty recovery | Frequent check-off/filter actions stay direct; low-frequency maintenance remains recognizable behind one disclosure |
| Plan critique | **Run**, GO after mitigations below | No unresolved P0/P1 planning gap |
| Harden / stack discipline | **Skipped as not applicable** | No security, data, deployment, legal, dependency, or service boundary changes |
| Controller | Focused Vitest | One dialog, correct pending action, cancellation safety, per-instance isolation |
| Mobile rendering | Playwright at 320 and 375 | No horizontal overflow; controls stay one row; first seeded row begins above 300px; 44px targets |
| State coverage | Populated, filter-empty, no-meals, nothing-needed, covered-only, complete | Relevant controls only; recovery and Add remain visible |
| Interaction | Pointer + keyboard | Filters select; options opens/closes; Escape returns focus; weekly/rules open after options closes |
| Responsive parity | 768 and 1280 | Existing direct desktop sort/manage controls and AH context remain intact |
| Header status | 375 and 1280 | Left/basket text remains; no progressbar role or visual track exists |
| Content resilience | English/Dutch, light/dark, long meal names, 200% zoom | No clipping, inaccessible option, illegible state, or accidental extra row |
| Motion | Reduced-motion emulation | Existing global and BottomSheet reduced-motion behavior remains effective |
| Repository gate | `npm test`, `npm run test:e2e:secondary`, `git diff --check` | All diagnostics, unit tests, authenticated browser tests, build, and whitespace checks pass |

## Failure-mode critique

| Failure mode | Trigger | Impact | Detectability | Mitigation | Residual risk |
|---|---|---|---|---|---|
| Options and destination sheets stack | Weekly/rules opens before native dialog close settles | Broken focus trap and obscured content | High in browser and `dialog[open]` assertion | Controller-owned close → settle → open sequence, matching the existing action/rule handoff | Low |
| Low-frequency tools become undiscoverable | Icon-only or scrolling options trigger | User cannot find sort or maintenance | Medium | Pinned 44px trigger with visible `List options` label where width permits and an accessible name at every width | Low |
| Empty-state cleanup removes recovery | All controls are hidden when rules or weekly items still matter | User cannot restore a needed source | High in state tests | Keep a secondary `List options` action inside the true-empty recovery card | Low |
| Filter options disappear at 320px | Meal chips overflow behind the pinned trigger | A meal filter appears missing | High in 320px browser check | Shared scroll-rail continuation treatment, scroll padding, and keyboard focus visibility | Low |
| Desktop tools regress | Mobile CSS hides the existing direct controls too broadly | Desktop gains unnecessary taps | High at 1280px | Explicit `<48rem` / `≥48rem` visibility contract and desktop browser assertion | Low |
| Dock UI diverges from AH eligibility | A second condition is invented for hiding Review AH | Eligible items cannot be reviewed | High in state assertions | Reuse the current `visibleToBuyCount` that already drives disabled state; no new business rule | Low |

**Steelman:** The strongest objection is that moving sort and maintenance behind a disclosure adds
a tap and could hide useful capabilities. The chosen approach is still the right trade: checking
items and switching meal filters are the repeated phone task, while sort and maintenance are
occasional setup. The options trigger stays pinned and named, the empty state keeps a secondary
entry point, desktop keeps direct controls, and explicit close-before-open tests protect the only
new interaction risk. CSS-only tightening cannot recover the 102–157px of vertical space without
shrinking touch targets or leaving the same equal-weight choice overload.

Plan-readiness result: **GO**. Scope, failure modes, verification, and rollback are explicit; there
is no stage gate or unresolved dependency.

## Shipped evidence

- At 320px and 375px, the control region is `44px` tall and the first checkable row begins at
  `262px`, down from the `198px`/`148px` stacked controls and `425px`/`373px` row positions.
- Mobile keeps meal filters direct and moves sort, weekly items, and shopping rules behind the
  pinned `List options` sheet. Weekly/rule handoffs keep exactly one dialog open and return focus
  correctly.
- True-empty mobile states suppress inert controls and the disabled AH action while preserving
  recovery, Add item, and list-maintenance access. Desktop retains its direct tools and AH context.
- The Shopping header keeps its left/basket text at every viewport and no longer renders a visual
  track or `progressbar` semantic.
- Manual light/dark and English/Dutch checks passed at 320px, 375px, and 1280px with no horizontal
  overflow or console errors.
- `npm test` passed with 0 Svelte diagnostics, 555 unit tests, 19 primary-account browser tests,
  and the production build. The 19-test secondary-account suite passed with one retry for a local
  Chromium `browser.newContext` crash; both the affected test and all Shopping tests also passed
  independently without retries.

## Rollout and rollback

- Land controller sequencing before the responsive composition so the options sheet cannot create
  stacked dialogs.
- Land the populated toolbar before the empty/dock treatment, then add browser assertions against
  the finished behavior.
- No feature flag or data migration is needed. Rollback is a scoped code revert by ticket.
- Before each commit, inspect the dirty worktree and stage only files changed for this feature.

## Open Questions

None. The evidence supports progressive disclosure as the durable default: filters remain direct,
low-frequency controls move behind one named mobile entry point, and all existing capabilities
remain available.

## Resume pack

- **Goal:** shipped. `/shopping` is phone-first, the first checkable row starts above 300px, and the
  progress track is gone at every viewport without removing left/basket status.
- **Current state:** all five R1 tickets are complete and the feature list is terminal.
- **Verification:** focused controller and Shopping browser coverage, authenticated primary and
  secondary suites, manual responsive/theme/locale checks, Svelte diagnostics, unit tests, and the
  production build are complete.
- **Open questions:** none.
