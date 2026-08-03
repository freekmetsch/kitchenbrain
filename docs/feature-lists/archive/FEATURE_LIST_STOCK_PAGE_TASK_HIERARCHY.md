# Feature List: Stock Page Task-First Hierarchy

_Status: Shipped - 2026-08-03_

## Outcome

Recompose `/inventory` as the selected **B. Shelf Ledger**: a Meals-first, alphabetically stable
stock ledger for finding an item and adjusting its quantity. The Green Ribbon keeps page identity,
Activity, and Add. A paper control deck carries scope, search, quick views, and Filters. Recipe
upkeep follows the Meals ledger.

Stock becomes date-free. It does not ask for, show, filter by, write, or rank best-before dates;
existing stored values remain untouched. Attention uses only keep-stocked target deficit, low
quantity, and automatically known stock age.

The selected design also removes the colored left-edge attention line. Polished motion is bounded
and purposeful: a sliding scope selection, smooth pressed/selected states, short staggered ledger
row entrances, quiet add/remove continuity, and immediate reduced-motion behavior. Motion never
delays a quantity write, recovery message, or usable content.

## Implementation Result

- Shipped the selected Shelf Ledger: the Green Ribbon now holds identity, Recent activity, and Add;
  the paper control deck owns scope, search, quick views, and Filters; each scope renders one stable
  alphabetical ledger; Recipe upkeep follows the Meals ledger.
- Removed best-before collection, display, filtering, writes, and ranking from Stock while preserving
  existing stored values and the server/database compatibility seam.
- Integrated live and ghost Meals in one typed ledger without duplicate recipes. Quantity, Add,
  Edit, Delete, Undo, history, deep links, relationships, staples, review, and failure recovery keep
  their existing write behavior.
- Removed the colored left-edge status line. Added capped row entrance/exit motion, quantity
  micro-feedback, smooth shared control states, and an explicit reduced-motion override.
- Verified English and Dutch, light and dark, 320/393/768/1280 layouts, keyboard focus, quantity
  focus retention, Recipes filter styling, failure paths, and primary/secondary household fixtures.

## Problem Framing

The current Stock page works, but it combines four different jobs before its rows: page identity,
page actions, detailed filtering, and recipe-relationship maintenance. It then rearranges Meals
among `Use next`, `Still plenty`, and `Cook again`, which is useful for outcome scanning but means a
quantity change can move the row a user is touching.

Freek selected Shelf Ledger while keeping the primary job `Use and adjust what we have`. The right
interpretation is one stable alphabetical ledger with attention reasons written inside the row.
The existing Stock Radar classification remains as display information and quick-view data; it no
longer determines three visible row groups. This keeps low/target/age context without moving a row
after every quantity change.

The repository also contains an optional `expiry_date`. Edit exposes it, row metadata renders it,
and the current attention model gives it first precedence, while Add never asks for it. That makes
the dataset unreliable unless someone remembers a separate maintenance step. The redesign removes
this recurring effort without deleting historical data or changing the database schema.

Finally, the current attention card draws a honey-colored pseudo-element down its left edge. Stock
scope and quick-view buttons are bespoke joined buttons even though the app already has a shared
`SegmentedControl` with a sliding selection indicator. Regular stock rows have no coordinated
entrance/removal motion. The polish pass should delete the redundant accent and reuse existing
motion primitives instead of adding decorative or page-local animation conventions.

## Intent Brief

- **Actual users:** Freek and Ylfa, commonly on a phone at the freezer, pantry, or kitchen counter.
- **Primary job:** find what is present and correct its quantity with minimum navigation or row
  movement.
- **Secondary jobs:** add an item, inspect history, filter/review data, or maintain recipe links.
- **Success:** the first ledger row is visible within a standard 393 x 852 fixture; scope/search and
  quantity controls are immediately usable; attention remains understandable without colored bars;
  interactions feel continuous without delaying work.
- **Failure:** replacing clear states with animation, hiding attention in color, losing ghost meals
  or recovery paths, or turning Stock polish into a global design-system rewrite.

## Evidence and Existing-System Inventory

- `src/routes/inventory/+page.svelte` currently renders `KitchenPageHeader` with Activity/Add,
  search, ready/below-target quick views, Meals/Ingredients/All scope, detailed filters, recipe
  coverage, then the three meal groups.
- The same route owns `.stock-card-attention::before`, the colored left-edge line Freek rejected,
  plus page-local joined-button and card styling.
- `InventoryController` owns scope, quick views, search, filtering, Add reveal, immediate quantity
  changes, rollback, delete/Undo, deep links, review, recipe linking, ghosts, and Activity.
- `groupMealStock()` currently computes the three meal groups. `stockRows` already demonstrates a
  stable list projection for non-meal scopes. Shelf Ledger needs one pure display projection that
  alphabetizes live Meals and keep-stocked ghost rows while retaining their attention reason. Once
  that projection is proven, obsolete group types/getters/CSS should be deleted rather than kept as
  a second hidden page model; the reusable `stockAttention()` classification remains.
- `ItemRow.svelte` and `QtyControl.svelte` correctly keep the repeated quantity action on the row.
  Countable units use minus/plus; measured units use tap-to-type.
- `GhostRows.svelte` renders multiple ghost `<li>` elements and is the only inventory row surface
  already using a Svelte slide transition. Shelf Ledger may extract one ghost-row renderer so live
  and ghost entries can share one alphabetic list without duplicating write behavior.
- `ItemEditor.svelte` asks for an expiry date; `FacetChips.svelte` renders it; the controller maps
  it into edit writes; and `shared.ts` ranks/sorts it. The database, assistant tools, and import
  compatibility also know the nullable field. No schema change is required to stop the Stock page
  using it.
- `SegmentedControl.svelte` already supplies native radio-group semantics, arrow-key behavior, a
  measured sliding indicator, resize handling, and the house-style classes needed for scope tabs.
- `CombinedFilterMenu.svelte` and `BottomSheet.svelte` already use the app's transition timings and
  restore focus. The filter trigger currently assumes a green background and needs an explicit
  paper tone rather than Stock overriding its private styles.
- `src/app.css` defines `--motion-micro: 150ms`, `--motion-content: 240ms`, the standard/emphasized
  easing curves, action press feedback, and a global reduced-motion guard. `src/lib/motion.ts`
  mirrors those durations for Svelte transitions.
- Five isolated Chromium cases passed on 2026-08-03 at phone and desktop: long rows, empty search,
  failed-write rollback, deep links, header controls, and filter/scope reachability. These are the
  current-behavior baseline, not evidence for the unimplemented Shelf Ledger or motion.

```powershell
$env:PLAYWRIGHT_HTML_OPEN='never'; npx playwright test tests/e2e/responsive-parity.e2e.ts --project=chromium-primary --grep 'Stock covers|Joined Stock'
```

## Fixed Product and Safety Decisions

- **Selected layout:** B. Shelf Ledger. This overrides the initial A recommendation.
- **Primary job:** use and adjust what is present.
- **Default scope:** Meals.
- **Control placement:** scope, search, ready/below-target quick views, and Filters live in one paper
  control deck; Activity and Add remain visible in the Green Ribbon.
- **Ledger order:** each scope is alphabetic and stable. Needs-review state and attention do not
  move a row ahead of its alphabetical position.
- **Meal meaning:** date-free `Use next` classification remains available as inline reason data:
  below target, then low stock, then automatically known stock age. Zero-stock keep-stocked meals
  and ghost meals read `Cook again`. Rows without attention remain ordinary stock.
- **Recipe upkeep:** coverage and unresolved-link review follow the Meals ledger. In relationship
  review mode, the filtered review ledger remains the main content.
- **No best-before tracking:** Stock does not ask for, display, filter by, write, or rank dates.
  Existing stored values are preserved and ignored by this page; implementation must not clear,
  rewrite, or migrate them.
- **No colored left-edge line:** attention, zero state, and review meaning use text, weight, and an
  optional icon; no `::before`, `border-inline-start`, or asymmetric colored border marks a row.
- **Immediate quantity behavior:** optimistic feedback (the screen changes before server
  confirmation), write coalescing, rollback, zero-stock actions, and focus remain intact.
- **Motion uses existing conventions:** 150 ms micro feedback, 240 ms content changes, existing
  easing, and the global reduced-motion guard. No animation dependency or new global motion system.
- **No motion-blocked work:** controls are usable immediately; errors and busy states appear without
  stagger; no skeleton or fake loading delay is introduced for server-rendered stock.
- Add, edit, delete, Undo, history, deep links, recipe linking, review fixes, staples, ghost meals,
  measured units, empty recovery, English/Dutch, light/dark, keyboard, 44 px targets, 200% reflow,
  safe areas, and 320/393/768/1280 px behavior remain release requirements.
- No schema, API, AI, Albert Heijn, Shopping derivation, auth, provider, or production configuration
  change.

## Scope

### In

- Implement the selected Shelf Ledger hierarchy and alphabetical display projection.
- Keep Green Ribbon identity/Activity/Add and build the paper control deck.
- Reuse `SegmentedControl` for the three scope tabs and add a supported paper tone to the existing
  combined filter trigger if needed.
- Keep ready/below-target quick views in the paper deck with clear pressed states and short
  token-based transitions.
- Render inline meal attention, review, and cook-again text without a colored left-edge marker.
- Integrate live Meals and keep-stocked ghost rows into one alphabetically stable ledger while
  preserving their distinct actions and keys.
- Delete unused three-group view helpers, messages, selectors, and CSS after Shelf Ledger tests
  replace their callers; keep only reusable attention classification and quick-view rules.
- Place recipe upkeep after the Meals ledger.
- Remove the Stock best-before editor, badge, attention reason, and expiry sorting while preserving
  stored values.
- Add bounded ledger-row entrance/removal motion, quantity-value feedback, focus continuity, and
  reduced-motion coverage using existing tokens and primitives.
- Update only necessary English/Dutch copy and focused unit/source/browser tests.

### Out

- Dropping, clearing, migrating, importing, exporting, or reinterpreting `expiry_date`; assistant
  and import compatibility remain outside this page redesign.
- Database, API, server command, history, undo, auth, AI, AH, Shopping, provider, or deployment
  changes.
- New priority rules, stock categories, storage locations, automatic shopping actions, automatic
  recipe links, or persisted page preferences.
- A global app-motion audit or redesign; only Stock and any backwards-compatible shared primitive
  variant it needs are in scope.
- An animation library, skeleton loader, parallax, large zoom/translation, infinite motion, or
  bespoke page-navigation transition.
- Redesigning Add, Edit, Activity, recipe-link, or filter-sheet bodies beyond removing the rejected
  date field and applying existing shared states.
- Replacing the Green Ribbon, bottom navigation, fonts, or global theme.

Overall risk is **R2** (page-wide code risk requiring unit, diagnostic, build, and browser
verification). No R3 schema/auth/destructive work is present.

## Design Shotgun Decision

| Variant | Decision | Reason |
| --- | --- | --- |
| A. Use Next First | Rejected after initial recommendation. | Best outcome hierarchy, but rows move between groups and the composition is less ledger-like than Freek selected. |
| **B. Shelf Ledger** | **Selected.** | Stable alphabetic position, dense direct quantities, and the calmest base for polished repeated adjustment. |
| C. Household Dashboard | Rejected. | Status is glanceable but adds summary height before the row action. |
| D. Split Stock Desk | Rejected. | Uses wide screens well but adds a responsive rail and more layout rules. |
| E. Task Switcher | Rejected. | Separates use/count clearly but adds a mode users must remember. |

### Selected composition: B. Shelf Ledger

1. **Green Ribbon:** `Household / Stock`, Recent activity, and clay Add. Nothing else competes with
   page identity.
2. **Paper control deck:** an equal-width Meals/Ingredients/All stock `SegmentedControl`; Search;
   ready/below-target quick views; and Filters with active summary/count.
3. **Meals ledger:** one alphabetical list. Each live or ghost entry appears once. Attention is a
   short inline reason such as `2 below target`, `1 portion left`, `Stored for a while`, or `Cook
   again`; settled rows use only ordinary metadata.
4. **Ingredients/All ledger:** the same dense row rhythm and stable alphabetic order, with food,
   storage, staple, recipe-match, and review metadata preserved.
5. **Recipe upkeep:** linked/planned/not-needed counts and unresolved review follow the complete
   Meals ledger. Review-only mode replaces the ordinary ledger with matching review rows and a
   clear close action.
6. **Sheets and recovery:** Add, Edit, Activity, Filters, and recipe linking retain their existing
   sheet bodies, focus return, writes, and recovery.

The existing date-free Stock Radar rules remain pure helpers, but their output becomes row metadata
rather than three visible groups. This preserves explainability without fighting Shelf Ledger's
stable alphabetical promise.

## Motion and Polish Contract

### Scope and quick views

- Reuse the shared sliding `SegmentedControl` for scope; do not recreate the indicator in the
  inventory page.
- The indicator moves with `--motion-micro` and `--ease-emphasized`; label color uses the standard
  easing. Arrow keys, roving focus, selected state, and resize measurement remain owned by the
  shared component.
- Quick-view pressed, hover, focus, disabled, and active states transition only background, border,
  color, and the existing one-pixel press translation. State never relies on motion or color alone.
- The filter chevron, sheet, scrim, and focus return reuse `CombinedFilterMenu` and `BottomSheet`.
  The paper tone must be an explicit backwards-compatible component option; Recipes keeps the
  existing default ribbon tone.

### Ledger rows

- Remove the colored left-edge pseudo-element and its compensating padding. Neutral row dividers
  or symmetric borders may remain; the left edge cannot carry a special status color.
- Initial and newly inserted rows use one 240 ms opacity plus at most 6 px vertical entrance. Delay
  is `min(row index, 8) × 24 ms`, so the stagger is visible but capped at 192 ms.
- Stagger applies only to real row insertion: initial route content, newly revealed filter/scope
  rows, Add, and Undo restore. Changing a quantity or selected control must not re-run the entire
  ledger entrance.
- Removal may use the existing 150 ms Svelte fade/slide convention. Failure restoration uses the
  same short entrance and keeps the alert immediate.
- Quantity text may use a 150 ms opacity/scale micro-feedback inside its existing button. The
  button element and focus do not get replaced, and the optimistic write begins immediately.
- Alphabetical order means a quantity change updates inline attention without moving the row.
  Search/filter/scope changes may replace rows but must return focus to the initiating control.
- No persistent `will-change`, height animation across the full ledger, blur, large scale, or
  expensive shadow animation.

### Reduced motion and continuity

- The existing global `prefers-reduced-motion` guard reduces every Stock transition/animation to an
  effectively immediate state. No delayed opacity may leave content invisible.
- The first row and all controls are present in the accessibility tree and usable throughout the
  entrance sequence.
- Empty, loading, busy, success, error, and rollback status appear immediately and never wait for a
  stagger queue.
- Long lists animate only the first nine delay positions; later rows share the capped delay. This
  prevents list size from extending the time to usable content.

## Interaction Contracts

### Control deck

- Scope is one exclusive radio group. Changing away from Meals clears only incompatible Meals-only
  quick/review state, exactly as the controller does today.
- Search remains case/accent-insensitive; `/` focuses it; Escape clears it and preserves focus.
- Ready and below-target retain current semantics and force Meals scope. The selected button has
  pressed text/state in addition to visual styling.
- Phone Filters opens the labelled sheet; desktop may expose detailed selects. Active count and
  summary remain visible.

### Stable ledger

- Live rows use stable item IDs. Ghost rows use stable recipe slugs. No item appears twice.
- Meals are alphabetical by localized display title after filtering; attention never reorders them.
- Zero-stock keep-stocked live rows and recipe ghosts remain visible as `Cook again`; zero-stock
  non-staple meal behavior remains unchanged.
- Relationship review filters to unresolved Meals and stays alphabetic. Closing returns to ordinary
  Meals without losing data.
- Ingredients and All stock use the same alphabetic contract. Needs-review status remains inline
  rather than being sorted first.

### Writes and recovery

- Quantity changes remain immediate and coalesced; failures restore the confirmed value and announce
  the error without moving focus.
- Add clears only the filters needed to reveal the new item, selects its proper scope, and gives the
  inserted row one entrance animation.
- Delete, swipe, Undo, activity/item history, undo conflict, review fixes, recipe status, staple
  add-to-shopping, and ghost opt-out keep their current actions and messages.
- Deep links reveal and open the requested row. Smooth scrolling is disabled automatically under
  reduced motion through the existing global guard.
- Editing name/quantity must not clear a legacy expiry value even though the field is absent from
  the page.

## Phase Plan

### Phase 1 — Lock selected behavior before layout work

Add failing tests for Shelf Ledger order, one live/ghost entry each, inline date-free attention,
no colored left-edge marker, legacy-date preservation, focus continuity, and reduced-motion
immediacy. Preserve all existing write/recovery journeys.

### Phase 2 — Build the paper control deck

Keep identity/Activity/Add in the Green Ribbon. Move scope, search, quick views, and Filters to one
paper deck. Reuse `SegmentedControl`; add a backwards-compatible paper tone to the combined filter
trigger rather than overriding private component CSS.

### Phase 3 — Make Stock date-free

Remove the expiry editor, row badge, attention union branch, and expiry sort. Keep the database
field and all legacy values untouched. Revise pure tests to below-target, low-stock, aging, and
alphabetic tie behavior.

### Phase 4 — Implement Shelf Ledger projection

Create one pure, typed ledger-entry projection for live/ghost Meals and the existing non-meal rows.
Render one alphabetical ledger per scope, inline attention, and recipe upkeep after Meals. Preserve
review-only, quick-view, empty, and deep-link behavior. Delete superseded group-only getters, types,
markup, messages, and CSS in the same phase so two competing view models do not remain.

### Phase 5 — Apply bounded Stock polish

Delete the left-edge accent. Add token-based control transitions, capped staggered row entrances,
short insert/remove continuity, and quantity micro-feedback. Reuse shared motion and honor reduced
motion. Do not animate layout on quantity changes.

### Phase 6 — Bilingual responsive and repository gate

Verify 320/393/768/1280 px, English/Dutch, light/dark, keyboard/pointer, long text, reduced motion,
initial/add/remove/Undo/filter transitions, failure rollback, focus, overlays, and no overflow. Run
the full secret-free gate and the second isolated browser account.

## Execution Tickets

### STK-1 — Preservation, selection, and motion tests

- **Scope in:** Write failing unit/source/browser assertions for selected B order, stable alphabetic
  rows, live/ghost uniqueness, inline attention, no date UI/ranking, stored-date preservation, no
  colored left marker, stagger cap, immediate controls, focus, and reduced motion.
- **Scope out:** Production changes.
- **Targets:** `src/lib/components/inventory/{shared,controller}.test.ts`;
  `src/lib/ui_house_style_source.test.ts`;
  `tests/e2e/{responsive-parity,kitchen-flows,house-style}.e2e.ts`.
- **Risk tier:** R1 test-only.
- **Impact / effort / confidence:** 5 / M / High.
- **Verification:** Old code fails selection/hierarchy/date/accent/motion assertions while existing
  write and recovery tests stay green.
- **Rollback:** Revert test-only changes; no data or provider interaction.

### STK-2 — Paper control deck and smooth scope state

- **Scope in:** Move scope/search/quick views/Filters out of the Green Ribbon; use the shared sliding
  scope control; support a paper-toned filter trigger while preserving default callers.
- **Scope out:** Filter semantics, new preferences, or shared header redesign.
- **Targets:** `src/routes/inventory/+page.svelte`;
  `src/lib/components/ui/{SegmentedControl,CombinedFilterMenu}.svelte` only where the caller or
  backwards-compatible paper tone requires it; `messages/{en,nl}.json`; focused tests.
- **Risk tier:** R2 because page-wide controls move beside direct writes.
- **Impact / effort / confidence:** 5 / M / High.
- **Dependencies:** STK-1.
- **Verification:** Arrow/pointer scope changes, sliding final/intermediate state, quick-view state,
  filter open/close/focus, Recipes default tone unchanged, 320/393/768/1280 containment.
- **Rollback:** Restore the current header payload and default filter caller; controller/data remain
  compatible.

### STK-3 — Date-free attention and editor

- **Scope in:** Remove date input/display/attention/sort and the Stock edit payload field; preserve
  nullable stored values and non-date attention.
- **Scope out:** Schema migration, legacy deletion, assistant/import compatibility, or server
  command changes.
- **Targets:** `src/lib/components/inventory/{ItemEditor,FacetChips}.svelte`;
  `src/lib/components/inventory/{shared,controller.svelte}.ts`; `messages/{en,nl}.json`; tests.
- **Risk tier:** R2 because ranking and edit payload shape change while stored data must survive.
- **Impact / effort / confidence:** 5 / M / High.
- **Dependencies:** STK-1.
- **Verification:** No date field/badge; below-target → low-stock → aging precedence; quantity/age/name
  tests; seeded expiry survives name/quantity edits and never affects displayed order.
- **Rollback:** Restore page-level date handling; schema and stored values never changed.

### STK-4 — Shelf Ledger and ghost integration

- **Scope in:** Add a pure ledger-entry projection; render one alphabetic ledger per scope; integrate
  live and ghost Meals; keep inline attention and post-ledger recipe upkeep; remove superseded
  group-only types, getters, markup, copy, and CSS after replacement tests pass.
- **Scope out:** Inventory write behavior, new grouping rules, or duplicated live/ghost components.
- **Targets:** `src/lib/components/inventory/{shared,controller.svelte}.ts`;
  `src/lib/components/inventory/{ItemRow,GhostRows,RecipeRelationshipStatus}.svelte` plus a focused
  single ghost-row component only if needed; `src/routes/inventory/+page.svelte`; tests.
- **Risk tier:** R2 because every display state is recomposed.
- **Impact / effort / confidence:** 5 / L / Medium-high.
- **Dependencies:** STK-1 and STK-3.
- **Verification:** Alphabetic Meals/Ingredients/All; no duplicate/missing live or ghost row; quick
  views, review-only, Add reveal, deep link, zero/empty/filter recovery, recipe actions, and long
  localized names.
- **Rollback:** Restore the three-group route rendering and existing GhostRows caller; no stored
  state changes.

### STK-5 — Left-edge removal and bounded motion polish

- **Scope in:** Delete asymmetric status accents; implement capped entrance/insert/remove motion,
  quantity micro-feedback, and complete hover/focus/pressed/selected/disabled/busy states using
  existing tokens and reduced-motion behavior.
- **Scope out:** Global motion changes, new animation dependency, fake loading, or quantity-driven
  row reordering.
- **Targets:** `src/routes/inventory/+page.svelte`;
  `src/lib/components/inventory/{ItemRow,QtyControl,GhostRows}.svelte`;
  existing motion/source/browser tests.
- **Risk tier:** R1 localized presentation, under the R2 page plan.
- **Impact / effort / confidence:** 4 / M / High.
- **Dependencies:** STK-2 and STK-4.
- **Verification:** No colored `::before`/left border; symmetric computed borders; capped monotonic
  delays; transform/opacity-only entrances; add/remove/Undo/failure continuity; no focus jump;
  reduced motion has no invisible delay; dark/light and long rows remain clear.
- **Rollback:** Remove Stock-specific animation classes/directives and restore instant transitions;
  data and controls remain functional.

### STK-6 — Full responsive and repository gate

- **Scope in:** Finish bilingual/responsive/accessibility polish; run focused and complete gates;
  delete obsolete Stock card/group/joined-control CSS and selectors after replacements pass.
- **Scope out:** Deployment, household data, provider/AH calls, or unrelated cleanup.
- **Targets:** all changed Stock/shared primitive files; `messages/{en,nl}.json`;
  `tests/e2e/{responsive-parity,kitchen-flows,house-style}.e2e.ts`; this plan and log for run evidence.
- **Risk tier:** R2 verification.
- **Impact / effort / confidence:** 5 / M / High.
- **Dependencies:** STK-1 through STK-5.
- **Verification:** focused unit/browser stories, `npm test`, `npm run test:e2e:secondary`, production
  build, `git diff --check`, and no retained authenticated artifacts.
- **Rollback:** Revert the code-only implementation as one change; no migration or data restoration.

## Failure-Mode Critique

| Failure mode | Trigger | Impact | Detectability | Mitigation | Residual risk |
| --- | --- | --- | --- | --- | --- |
| Shelf Ledger hides what should be used next. | Alphabetical order replaces outcome groups. | Attention can be deep in a long list. | Phone fixture and quick-view journey. | Keep ready/below-target quick views visible and every date-free attention reason inline; search remains immediate. | Low-medium: low-stock/age has no dedicated quick view, accepted with B. |
| Live and ghost meals duplicate or disappear. | Two existing render paths merge into one ledger. | Incorrect stock/cook-again picture. | Pure key/order tests plus browser fixture. | Typed union with item ID or recipe slug key; explicit collision tests; one renderer per entry kind. | Low. |
| Removing the date editor clears stored data. | Edit draft omits a field but payload construction changes broadly. | Silent historical data loss. | Seed-and-edit server assertion. | Remove only the page field/payload branch; never send `expiry_date`; no migration. | Low. |
| Attention loses meaning when the left line disappears. | Visual accent is deleted without replacement. | Users miss below-target/review/cook-again state. | Light/dark, color-disabled/source, and text assertions. | Inline reason plus weight/icon; no color-only status. | Low. |
| Stagger makes rows feel slow or briefly invisible. | Delay grows with list size or applies to errors. | Repeated task becomes slower. | Computed delay/duration and reduced-motion browser tests. | Cap at index 8, 192 ms maximum delay, controls/status unstaggered, no fake loading. | Low. |
| Animations replay after every quantity click. | Each update remounts the row/list. | Distracting motion and focus risk. | Mutation motion sample and DOM-key assertion. | Stable row keys/elements; animate insertion only; alphabetic position unchanged. | Low. |
| Shared filter/segmented changes regress Recipes. | Paper tone or styling changes default behavior. | Cross-route visual/control regression. | Existing joined Stock/Recipe and house-style stories. | Default ribbon tone unchanged; additive prop only; reuse SegmentedControl without behavior edits if possible. | Low. |
| Removal animation fights fast rollback. | Failed delete restores before exit finishes. | Flicker, missing focus, unclear result. | Routed 500 response during delete/quantity story. | Keep alert immediate; short keyed exit; restoration cancels/reverses safely; focus returns by stable key. | Low-medium until browser-proven. |
| Reduced motion leaves an opacity delay. | Global 0.01 ms duration but nonzero stagger remains. | Content appears absent for motion-sensitive users. | Emulated reduced-motion load and filter story. | Explicitly zero Stock animation-delay in reduced mode in addition to the global duration guard. | Low. |
| Long Dutch copy breaks the moving indicator or row density. | Labels wrap at 320/393 px. | Clipping or wrong indicator geometry. | Long-copy fixture at all breakpoints and resize. | Equal-width scope grid, existing ResizeObserver measurement, multiline-safe row metadata, no hidden meaning. | Low. |

## Plan Critique Result

**Verdict: GO.** All high-impact failure modes have an implementation seam and explicit proof.
There is no R3 action, new dependency, unresolved architecture choice, or destructive data step.

**Steelman:** The strongest objection is that A. Use Next First better matches “use what we have”
because urgent rows appear first. B is still the right selected implementation because Freek chose
the stable ledger, and stability materially improves the repeated quantity task: a row stays where
the user found it while its inline state updates. Visible quick views, search, and written attention
preserve decision support without reintroducing three moving groups. The plan therefore honors the
selection while retaining the useful Stock Radar model as metadata.

The deletion test rejects a new animation library, a second Stock mode, persistent view settings,
a global motion rewrite, and database cleanup. It also requires removing the old three-group view
model once Shelf Ledger replaces every caller; retaining both would create drift. Existing
`stockAttention`, `SegmentedControl`, `BottomSheet`, motion tokens, reduced-motion guard, controller
writes, and row components are the durable seams.

## Audit Records

- **UI audit — passed:** implemented layouts were checked at 320/393/768/1280 px, including Dutch
  dark mode and reduced motion. The ledger has symmetric dividers, no colored left edge, capped
  stagger timing, and no clipped or delayed controls.
- **UX audit — passed:** rows remain alphabetically stable after quantity changes; direct controls,
  search, quick views, review, recovery, and post-ledger recipe upkeep stay reachable on phone and
  desktop. Quantity buttons retain focus while only the value receives micro-feedback.
- **Plan critique — passed:** selected B retains inline date-free attention and visible quick views
  without reintroducing the three moving groups. No unresolved R3 or architecture decision remains.

## Risk and Verification Matrix

| Surface | Risk | Required proof |
| --- | --- | --- |
| Date-free attention | Expiry still ranks or legacy data clears | Pure precedence/order tests; seeded value survives unrelated edit. |
| Shelf projection | Duplicate, missing, or unstable live/ghost row | Typed union tests and complete browser fixture. |
| Quantity writes | Delayed, duplicated, lost, or focus-moving write | Rapid steps, measured edit, failure rollback, stable DOM/focus. |
| Add/Delete/Undo | Insert/exit motion hides recovery | Success, routed failure, Undo, activity/item history, deep link. |
| Status without left line | Attention/review becomes color-only or weak | Inline copy/icon assertions, light/dark, color-independent meaning. |
| Controls | Indicator/filter tone drifts or loses semantics | Pointer/arrow/focus/selected/open/close; Recipes regression story. |
| Motion | Slow list, replay, layout shift, motion sickness | Capped delays, intermediate/final samples, reduced motion, no quantity replay. |
| Phone | Deck/rows crowd or clip | 320/393 px, first row, long Dutch/English, sheets, safe areas. |
| Tablet/desktop | Empty width or divergent state | 768/1280 px, one state tree, full-width ledger, no nested scroll. |
| Repository | Cross-route or build regression | Unit, Svelte diagnostics, build, primary/secondary Playwright, diff check. |

## Rollout and Rollback

This code-only R2 change is implemented on `codex/stock-shelf-ledger`. No migration, backfill,
feature flag, provider call, household-data rehearsal, or stage gate was used. Deployment remains
separate; pushing this feature branch does not make the change live.

Rollback is a normal code revert of the Stock route, inventory display helpers/components, additive
filter tone, copy, and tests. The database, APIs, inventory history, and nullable expiry field remain
compatible, so no data restoration or dual-read period is required.

## Shipped Handoff

- **Authoritative archive:**
  `docs/feature-lists/archive/FEATURE_LIST_STOCK_PAGE_TASK_HIERARCHY.md`.
- **Verification:** 718 Vitest tests passed with an isolated in-memory database; Svelte diagnostics
  and the production build passed; complete primary and secondary Playwright projects passed with
  one intentionally skipped connected-AH story each; `git diff --check` passed.
- **Harness note:** the default local `dev.db` contains unrelated historical migration drift, so the
  unit gate used `DATABASE_URL=:memory:`. Chromium also showed an intermittent immediate
  `browser.newContext` startup closure; both complete browser projects passed with one allowed retry.
- **Boundaries confirmed:** no schema, API, AI, Albert Heijn, Shopping derivation, authentication,
  production configuration, provider, deployment, or household-data change.
- **Open questions:** none.
