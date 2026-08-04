# Feature List: Shopping and Meal Plan Completion

_Status: Shipped (2026-08-04)_

## Outcome

Finish the remaining Shopping and Meal Plan work with a targeted completion pass rather than a
second wholesale redesign.

Shopping keeps its Market Run behavior but removes the unhelpful `Ready to shop` card, compresses
the unresolved Albert Heijn (AH) recovery block, and replaces the overloaded `Not this run` area.
Desktop uses the selected Split composition: Required and Optional are separate aisles. Optional
recipe ingredients are always visible and join Required/AH only when added; manually removed items
remain recoverable in a collapsed `Removed this week` control at the very bottom. The center is
neutral paper, with green limited to the side rails, top ribbon, and bottom navigation.

Meal Plan keeps the selected-week ledger and current row design. Recipe titles follow the household
recipe-language preference, category filters are derived from the recipes that actually exist and
use localized labels, and the already implemented freezer-portion rule receives the missing
browser-level proof.

One shared repair removes the recurring Svelte runtime warning from `SegmentedControl` while
preserving its measured indicator, keyboard behavior, resize response, caller styling, and
reduced-motion behavior.

## Why there is work left

The previous redesigns solved the large structural problems. Current authenticated local evidence
shows three smaller but recurring gaps:

1. With an unresolved AH result, Shopping still renders an attention card, a second `Sent to AH`
   history button, the readiness row, filters, and `Not this run` before the active list. At
   375 x 812 the first item begins around y = 532; at 1280 x 900 it begins around y = 566.
2. Meal Plan's add sheet uses seven hard-coded English category slugs. Dutch mode therefore shows
   English labels, categories with no recipe can appear, categories that do exist can be omitted,
   and linked recipe titles prefer English regardless of the configured recipe language.
3. `SegmentedControl` writes each button reference through `bind:this={optionElements[index]}`.
   Svelte reports `binding_property_non_reactive` for every option: 20 warnings in the Shopping
   audit and 8 in Meal Plan. The screen still works, but the shared primitive is not runtime-clean.

The current freezer issue is different: the source-aware helper and both callers are already fixed
and unit-tested, but the issue remains in `docs/known_issues/current/` because no isolated browser
journey proves a recipe with yield 16 and frozen stock 6 persists 6 for freezer and 16 for fresh.

## Intent brief

- **Users:** Freek and Ylfa, usually repeating Shopping on a phone and editing one Meal Plan week.
- **Shopping job:** see the next item and adjust or complete it while remaining safe after an
  uncertain AH handoff.
- **Meal Plan job:** add and adjust meals in the household's chosen recipe language without
  guessing which categories are available.
- **Success:** an unresolved AH result remains explicit but the first active item returns to the
  first screen; Dutch and English recipe/category display agree with settings; freezer servings are
  proven end to end; both audited pages produce zero Svelte runtime warnings.
- **Failure:** hiding AH uncertainty, moving recovery out of reach, rewriting stored meal names,
  changing AH/shopping derivation, or turning the pass into another page-wide redesign.

## Evidence and existing-system inventory

### Shopping

- `src/routes/shopping/+page.svelte` renders `PushHistory` in attention mode and then a separate
  history trigger. The same history data powers both.
- `src/lib/components/shopping/PushHistory.svelte` already owns unknown, pending, partial, and
  confirmed result language; item details and the Open AH recovery action must remain there.
- `src/lib/components/shopping/ShoppingLists.svelte` renders both `Not this run` disclosures before
  notices and active groups. The first combines optional recipe sources with stocked recipe sources;
  the second contains items manually removed from the week. Freek rejected that combined model.
- The readiness strip repeats counts and planning context that Freek does not need while shopping.
  Its Adjust access still needs a compact home, but the card itself is deleted.
- The fixed phone action shelf, in-flow desktop actions, direct removal, Undo, focus advance,
  stale-write restoration, filters, empty states, source details, and AH review safeguards remain
  constraints.

### Meal Plan

- `src/routes/meal-plan/+page.svelte` defines `DRAWER_CATEGORIES` as seven raw slugs and prints each
  slug directly.
- `src/lib/food_categories.ts` already owns category normalization, aliases, localized labels,
  accents, and canonical categories. The add sheet should reuse this authority.
- `src/lib/components/meal-plan/controller.svelte.ts` returns `titleEn ?? title` and
  `categoryEn ?? category` regardless of `recipeLang`. Rotation candidate copy has the same bias.
- The root layout already supplies `recipeLang` in the merged Meal Plan `PageData`, but
  `MealPlanControllerData` does not retain it and the page therefore never uses it for display.
- Stored `meal.dinner` remains a historical or custom snapshot. Linked meals can display their live
  recipe title without rewriting that snapshot or changing the API.
- `src/lib/meal_source_choice.ts` already selects frozen portions for freezer and recipe yield for
  fresh; both Meal Plan and recipe-detail planning callers use it and focused unit tests pass.

### Shared control

- `src/lib/components/ui/SegmentedControl.svelte` owns radio-group semantics, roving focus, arrow
  keys, indicator measurement, option resize observation, grid modes, and house-style classes.
- Its callers include Shopping, Meal Plan, Stock, Recipe, and Settings. The repair must be
  backwards-compatible and tested at the component boundary before page work proceeds.

### Audit evidence and limits

- Audited with isolated authenticated Playwright fixtures at 375 x 812 and 1280 x 900 in English;
  Dutch add-sheet rendering was also inspected. No real household database was opened.
- Shopping states included a populated ledger and unresolved AH history. Meal Plan included the
  normal selected week and Add Meal sheet.
- No live AH preview/push, provider request, Suggest action, or production write was triggered.
- Current screenshots are local ignored evidence only and are not public artifacts.

## Fixed product and safety decisions

- Keep Shopping ready-first and Meal Plan one-week focus; do not recompose either page from scratch.
- Keep the Green Ribbon, week navigation, Add/Review action shelf, filters, active grouped ledger,
  direct removal, Undo, source editing, and all existing recovery. Delete the readiness card.
- An uncertain AH outcome remains inline and persistent. It cannot be reduced to a toast, badge, or
  hidden history entry. `Open AH` remains its primary action; Details and History remain accessible.
- Replace the separate Shopping history trigger with one secondary History action inside the
  compact attention component. The full history sheet stays unchanged.
- **Selected desktop composition:** Split/Two Aisles. Required is the wider primary ledger;
  Optional is a narrower companion ledger. Phone keeps the same order by stacking them.
- **Optional has one meaning:** recipe ingredients explicitly marked optional. Render them as a
  visible Optional list with Add actions. Add promotes the source to Required and makes it eligible
  for AH review; it does not mark the item bought.
- Stocked recipe sources remain under the existing In stock behavior and never appear as Optional.
- Manually removed items are not Optional. Keep them in a collapsed `Removed this week` recovery at
  the very bottom, after both ledgers and any setup disclosure.
- Restrict the large green field to outer desktop rails, the top ribbon, and bottom navigation. The
  central Shopping canvas is neutral paper/card color in light and dark themes.
- Meal recipe titles follow `recipeLang`; interface controls and category labels follow the current
  interface locale. Custom/unlinked meal text remains exactly as stored.
- Linked meals use the live recipe only for visible and accessible copy. Existing and new
  persistence keeps the current meal snapshot policy; display helpers must not leak into request
  payloads or rewrite `meal.dinner`.
- Category filters are derived from normalized categories present in the loaded recipe library,
  ordered by the canonical category order, and never write translated values.
- Freezer planning persists available frozen portions; fresh planning persists recipe yield. The
  browser proof uses only the isolated test database.
- No schema, migration, API, AI, AH request, shopping-list derivation, auth, provider, secret, or
  production-configuration change.
- Dutch ingredient fields remain the only source for AH search and shopping derivation.
- Add Meal uses Search plus a Filters button; category chips are not permanently visible.
- Motion and visual styling stay within the existing Green Ribbon house style and reduced-motion
  rules. No new dependency or animation convention.

## Scope

### In

- Repair shared `SegmentedControl` reference registration so dynamic option lists measure and
  observe their buttons without Svelte binding warnings.
- Compact unresolved AH attention and integrate its History action.
- Remove the Shopping readiness card while preserving planning/weekly-item access in the selected
  compact placement.
- Implement Split on desktop and stacked Required/Optional ledgers on phone.
- Replace off-list rendering with strict Optional, In stock, and Removed-this-week destinations.
- Replace the green central field with a neutral canvas while retaining green rails/ribbons.
- Retain merged `PageData.recipeLang` in Meal Plan's controller and localize linked recipe titles
  and category labels without rewriting meal records or changing persistence payloads.
- Derive add-sheet category filters from normalized categories actually present in the recipes.
- Add the missing frozen-6/fresh-16 browser journey and close the current known issue only after it
  passes.
- Add focused unit, component, source-contract, and authenticated browser coverage; run the full
  repository gate and production canary during `$run`.

### Out

- Another Meal Plan, bottom-navigation, action-shelf, or Add Meal visual redesign beyond the
  selected Search plus Filters control.
- Removing AH uncertainty, changing push triage, sending to AH, or altering push-history records.
- Changing planned-serving calculations, Shopping item grouping, recipe source defaults, or
  lasting source write behavior.
- Rewriting existing `meal.dinner`, translating stored recipes, migrating categories, or adding a
  persisted Meal Plan filter preference.
- New data fields, best-before data, schema/API changes, AI suggestions, Suggest copy, or provider
  calls.
- Refactoring unrelated English-first recipe display on Inventory or other pages; sibling findings
  remain outside this completion plan unless a shared helper change makes them direct callers.

Overall risk is **R2**: the shared segmented control has several callers and Shopping's hierarchy
changes across multiple states. It is code-only and reversible; there is no R3 work.

## Options considered

| Approach | Benefit | Cost | Decision |
| --- | --- | --- | --- |
| Declare both pages complete | No churn after two successful redesigns | Leaves a first-screen Shopping obstruction, Dutch inconsistency, runtime warnings, and an unclosed freezer issue | Rejected |
| **Targeted completion pass** | Removes the observed recurring gaps while preserving proven journeys | Requires shared-control regression coverage and several state fixtures | **Selected** |
| Redesign both pages again | Could produce a new visual concept | Reopens settled hierarchy, URL, focus, write, and recovery decisions without evidence | Rejected |

The selected pass is the smallest complete architecture, not a temporary patch. It deletes the
duplicate history trigger and warning-producing reference pattern, reuses existing category and
language authorities, and closes the only related current issue with executable evidence.

### Prototype decisions

| Decision | Selected | Rejected |
| --- | --- | --- |
| AH uncertainty | Compact amber strip with visible Open AH, Details, History | Neutral row or action-dock warning |
| Optional behavior | Visible list; Add promotes to Required/AH | Checkable-but-excluded rows or always included |
| Removed behavior | Collapsed `Removed this week` at the very bottom | Mixing with Optional or Undo-only |
| Add Meal discovery | Search first with a Filters button | Permanent category chips or search-only |
| Desktop Shopping | Split/Two Aisles | Quiet Shelf and Market Ticket |
| Readiness | Delete the card | Reword or retain it |
| Color field | Neutral central canvas; green at sides/top/bottom | Full green central field |
| Preparation access | Header Tool: compact Adjust plan in the top ribbon | Paper Deck and Quiet Setup |

The first UI spread established Split because it uses desktop width well while preserving a clear
Required-first phone order. Freek selected Header Tool from the focused refinement spread. Adjust
plan therefore remains visible and upstream in the top ribbon while the neutral shopping canvas
contains only information and actions needed during shopping. On narrow phones the visual label may
compact to `Plan`, while the accessible name remains `Adjust plan`.

## Target page composition

### Shopping

1. Green top ribbon and week navigation; desktop keeps narrow green outer rails and the existing
   green bottom navigation.
2. Compact unresolved AH attention, only when needed: outcome + one-line recovery; Open AH,
   Details, and History in one component.
3. Neutral shopping controls: filters plus Add/Review/Connect in their current responsive behavior.
   A compact Adjust plan action lives in the top ribbon; no readiness summary or planning counts
   remain in the central shopping canvas.
4. Notices required for the active view.
5. Desktop Split: wider Required ledger and narrower Optional ledger. Phone stacks Required then
   Optional. Optional rows have Add, not bought checkboxes.
6. Existing In stock, completed, basket, and sheets.
7. Collapsed `Removed this week` recovery at the absolute bottom.

At a fixed 375 x 812 unresolved-AH fixture, the first Required row should begin no lower than y = 360
and remain above the action shelf. Without an AH warning it should begin no lower than y = 270.
Treat these as fixture targets backed by stronger relational assertions: warning before controls,
controls before Required, Required before Optional, and Removed after every working section, with no
row/action-shelf overlap.

### Meal Plan

The visible page composition does not change. Only display data changes:

- linked title: Dutch canonical title when `recipeLang = nl`; English cache/fallback when
  `recipeLang = en`;
- custom/unlinked title: stored dinner text;
- category chips: normalized present categories, canonical order, interface-locale label;
- recipe cards and rotation candidates: the same linked-title projection;
- source actions: unchanged labels and serving behavior.

## Interaction and data contracts

### Compact AH attention

- Unknown, pending, and partial outcomes retain distinct title and explanatory text.
- Open AH remains visible without expanding Details. History opens the existing full history sheet
  and returns focus to its trigger on close.
- The compact form may use one row on desktop and two rows on phone, but text can wrap at 200%
  without clipping or horizontal scroll.
- Confirmed history that does not need attention must not create an alert; its History access
  remains available through the selected compact route action or existing review entry as defined
  by the current data state.

### Optional, stocked, and removed destinations

- `optional === true` and not included renders in Optional. `staple === true`/covered renders only
  through In stock. Manual week exclusion renders only in `Removed this week`.
- Adding Optional calls the existing week-entry `update_source` command with `included: true`, moves
  the row into Required after the saved response, announces/focuses it, and offers Undo through
  `included: false`. The recipe ingredient remains optional for future weeks.
- Optional stays outside visible-to-buy counts and AH review until promoted. It has no bought
  checkbox while optional.
- Restoring a removed item uses the existing restore command, moves it into Required, announces the
  destination, and preserves focus/Undo behavior.
- Filter-empty and complete views keep their primary recovery. Optional remains visible when it
  matches the selected meal/filter; Removed remains last whenever it contains recoverable rows.
- Deep links, weekly edit mode, live announcements, stale-write rollback, and source-term controls
  keep their current controller commands.

### Recipe-language projection

- Extend `MealPlanControllerData` with the `recipeLang` already present in merged `PageData`; do not
  add a second setting query or change the server workflow.
- Put title/category selection behind controller or pure helpers used by linked meals, add-sheet
  recipe cards, and rotation candidates.
- Do not use display titles in create/update payloads and do not mutate loaded recipes or meal
  records to achieve display language.
- If an English title/category is absent, fall back to the Dutch canonical value. Unknown
  categories use the existing normalized title-case fallback.

### Dynamic categories

- Normalize every loaded recipe category with `normalizeFoodCategory`.
- De-duplicate normalized values and order known values by the exported canonical recipe-category
  order; append unknown normalized categories deterministically.
- Render only categories with at least one matching recipe and retain canonical values for filter
  state and matching.
- Use `foodCategoryLabel` with the interface locale for visible labels.

### Segmented control

- Replace indexed property binding with stable reference registration keyed by option value, or an
  equivalent Svelte-safe mechanism.
- Re-observe buttons when the option set changes; disconnect removed nodes.
- Preserve selected indicator measurement after value, options, font/layout, and track-size changes.
- Preserve radio semantics, disabled-option skipping, wraparound arrows, roving tab stop, click
  change, grid widths, and all existing caller classes.
- Runtime console must remain warning-free in Shopping and Meal Plan normal and dynamic-option
  states.

## Phase plan

### Phase 1 - Characterize the remaining contracts

Add failing coverage for the shared warning, Shopping DOM order/geometry/focus, recipe-language
projection, present-category derivation, and the 16-yield/6-frozen journey. Do not alter layout until
the current safe behaviors have explicit assertions.

### Phase 2 - Repair the shared segmented control

Implement stable button-reference registration, dynamic observation, and measurement. Run focused
component tests and the existing Stock, Recipe, Settings, Shopping, and Meal Plan segmented-control
stories before changing either page.

### Phase 3 - Finish Shopping hierarchy

Integrate History into compact AH attention and delete the route-level duplicate trigger/CSS.
Delete the readiness card, implement the selected neutral Split/stacked ledgers, route only explicit
recipe optionals into Optional, retain In stock separately, and put Removed this week last. Verify
promotion/restore, every result/view mode, phone action shelf, Undo/focus, dark mode, Dutch copy,
reduced motion, and 200% text.

### Phase 4 - Finish Meal Plan display and freezer proof

Retain root `recipeLang` in the page controller, centralize linked recipe display without changing
stored snapshots, derive localized category filters, and run the synthetic freezer/fresh persistence
journey. Move the freezer issue from `current` to `solved` only when the browser proof passes.

### Phase 5 - Simplify, gate, and deliver

Delete obsolete category constants, duplicate history wrapper/CSS, and stale tests. Run `npm test`,
review the scoped diff, archive this shipped plan, update `docs/log.md`, deliver automatically to
`main`, supervise Railway to the exact commit, and run the authenticated canary on Shopping and
Meal Plan without retaining household content.

## Execution tickets

### SMP-01 - Lock current behavior and failing evidence

- **Observable result:** focused tests reproduce the warning, overloaded off-list semantics,
  readiness/list displacement, incorrect language selection, category mismatch, and missing freezer
  browser proof while preserving AH and write recovery.
- **In:** test fixtures, component harnesses, DOM-order assertions, display-helper cases, isolated
  recipe yield 16/frozen 6 data.
- **Out:** production code changes.
- **Targets:** Shopping/Meal Plan unit and Playwright tests, `SegmentedControl` component tests,
  source-contract tests.
- **Risk:** R0 tests.
- **Verification:** new tests fail only for the intended reason; current recovery tests remain green.
- **Rollback:** remove only new characterization cases.
- **Impact / effort / confidence:** high / M / high.

### SMP-02 - Runtime-clean `SegmentedControl`

- **Observable result:** no `binding_property_non_reactive` warning; indicator and keyboard behavior
  remain correct when options change or resize.
- **In:** button reference lifecycle and focused component coverage.
- **Out:** appearance, public prop, role, or caller behavior changes.
- **Targets:** `src/lib/components/ui/SegmentedControl.svelte` and its tests.
- **Risk:** R2 shared component.
- **Verification:** dynamic add/remove/reorder, selected/disabled, arrows, ResizeObserver,
  reduced-motion, and caller smoke stories.
- **Rollback:** revert the reference-registration commit; no data change.
- **Impact / effort / confidence:** high / M / high.

### SMP-03 - One compact AH recovery component

- **Observable result:** unresolved AH information and Open AH remain visible, while Details and
  History live in the same compact component and the duplicate route button is gone.
- **In:** attention-mode component API/markup, history callback, responsive layout, focus return.
- **Out:** AH API, result classification, push behavior, or full history-sheet body.
- **Targets:** `src/lib/components/shopping/PushHistory.svelte`,
  `src/routes/shopping/+page.svelte`, messages and focused tests.
- **Risk:** R1 localized recovery UI.
- **Verification:** unknown/pending/partial/confirmed fixtures, long Dutch text, dark, keyboard,
  200%, 375/768/1280, History close focus, no live AH call.
- **Rollback:** restore separate route history trigger; history data is unchanged.
- **Impact / effort / confidence:** high / M / high.

### SMP-04 - Neutral Split ledgers with strict Optional and Removed meanings

- **Observable result:** the readiness card is gone; desktop shows wider Required and narrower
  Optional ledgers on a neutral canvas; phone stacks them; Add promotes Optional into Required/AH;
  In stock stays separate; Removed this week is the final collapsed control.
- **In:** selected layout, readiness deletion, Adjust access placement, source classification,
  promotion/restore focus and announcements, neutral/green color boundaries, state tests.
- **Out:** Shopping derivation, source-write commands, filters, basket behavior, phone shelf
  position, AH payload logic.
- **Targets:** `src/lib/components/shopping/ShoppingLists.svelte` and focused tests.
- **Risk:** R2 multi-state page order.
- **Verification:** required/optional/stocked/manual-removed combinations; Add/Undo, restore,
  stale/failure rollback, active/weekly/filter-empty/empty/covered/complete, 320/375/768/1280,
  dark/light, Dutch/English, deep-link, focus, and shelf-overlap stories.
- **Rollback:** restore the old rendering; server data and commands are unchanged.
- **Impact / effort / confidence:** high / M / high.

### SMP-05 - Meal Plan recipe language and present categories

- **Observable result:** linked recipe titles honor `recipeLang`; Dutch and English category chips
  are localized and include only normalized categories present in the loaded recipes.
- **In:** merged `PageData.recipeLang`, pure display/category helpers, controller and rotation
  display callers, add-sheet chips.
- **Out:** stored meal text, recipe translation, API/schema, custom meal display.
- **Targets:** Meal Plan controller/page, `src/lib/food_categories.ts`, focused unit/browser tests.
- **Risk:** R2 shared display projection.
- **Verification:** en/nl recipe preference crossed with en/nl interface locale, missing English
  fallback, aliases, unknown/empty categories, rotation/add/linked-meal display, reload.
- **Rollback:** revert display projection; no record was rewritten.
- **Impact / effort / confidence:** high / M / high.

### SMP-06 - Freezer portions browser proof and issue closure

- **Observable result:** Add Meal and recipe-detail Plan persist 6 portions for freezer and 16 for
  fresh in isolated fixtures; the known issue moves to `solved` with evidence.
- **In:** synthetic recipe/stock fixture, both planning journeys, reload/API assertion, issue update.
- **Out:** household confirmation, production write, source-choice logic change unless the test
  exposes a regression.
- **Targets:** authenticated Playwright tests and
  `docs/known_issues/current/ISSUE_FREEZER_MEAL_PORTIONS_20260724-1915.md`.
- **Risk:** R1 test and lifecycle documentation; R2 only if a shared regression is found.
- **Verification:** freezer/fresh source, visible pre-commit copy, persisted servings/source after
  reload, both household test accounts where practical.
- **Rollback:** revert fixture and issue move; no production data touched.
- **Impact / effort / confidence:** medium / M / high.

### SMP-07 - Full gate, archive, and automatic production delivery

- **Observable result:** complete repository tests pass, runtime warnings are zero, the plan and
  resolved issue are archived correctly, remote `main` matches Railway `SUCCESS`, and the
  authenticated canary passes.
- **In:** simplification, `npm test`, English/Dutch/light/dark/reduced-motion browser stories,
  archive/log, scoped commit, `main`, deployment truth, canary.
- **Out:** production config or real AH/provider actions.
- **Targets:** all task files, this feature list, known-issue lane, `docs/log.md`.
- **Risk:** R0 delivery after R2 verification.
- **Verification:** exact command and exit status, scoped diff, names-only Railway truth, canary
  without retained household evidence.
- **Rollback:** forward fix or `git revert` task commits through `main`, then supervise recovery and
  rerun canary under `AGENTS.md`.
- **Impact / effort / confidence:** high / M / high.

## Verification matrix

| Signal | Required evidence |
| --- | --- |
| Shared control | Dynamic refs, indicator, ResizeObserver, click, disabled, arrow wrap, roving tab stop |
| Runtime cleanliness | Zero Svelte warnings/errors on Shopping and Meal Plan audited states |
| Shopping hierarchy | Compact AH before controls; no readiness card; Required before Optional; Removed last |
| Shopping first screen | First Required row y <= 360 with unresolved AH and y <= 270 without at 375 x 812 |
| Desktop Split | Required wider than Optional at 1280; both visible without a full green center |
| Optional meaning | Only explicit recipe optionals; Add promotes/focuses/announces/Undo; excluded from AH until added |
| Other exclusions | Stocked appears through In stock; manual exclusions appear only under final Removed recovery |
| Shelf safety | No item, toast, sheet action, or focus target hidden by the phone action shelf/navigation |
| AH recovery | Unknown/pending/partial copy, Open AH, Details, History, focus return, no duplicate send |
| Shopping writes | bought/focus-next, Add, remove/Undo, restore, weekly edit, source edit, stale rollback |
| Meal language | Recipe preference en/nl crossed with interface locale en/nl; linked/custom fallback |
| Categories | present-only, alias normalization, canonical order, unknown and empty cases |
| Freezer source | 16 fresh / 6 frozen visible choice, request, stored result, and reload in both callers |
| Responsive | 320, 375/393, 768, 1280, effective 200%; no horizontal overflow or clipped action |
| Themes/accessibility | light/dark, reduced motion, keyboard, screen-reader labels, 44 px targets |
| Repository | `npm test`, `git diff --check`, scoped status, archive scan |
| Production | exact remote-main Railway `SUCCESS` and authenticated Shopping/Meal Plan canary |

## Plan critique

| Failure mode | Trigger | Impact | Detectability | Mitigation | Residual |
| --- | --- | --- | --- | --- | --- |
| Compact AH hides uncertainty | Copy/actions are collapsed too aggressively | Unsafe duplicate resend | High in outcome fixtures | Keep outcome and Open AH visible; only detail/history disclose | Low |
| History becomes unreachable for confirmed pushes | Route trigger is deleted without another entry | Lost audit/recovery access | High in confirmed-history story | Component/API must expose History whenever history exists | Low |
| Optional still mixes stocked/removed sources | Rendering continues to filter only `included` | Labels remain misleading and AH eligibility is unclear | High in classification fixtures | Classify by explicit optional/staple/manual exclusion before rendering | Low |
| Optional Add changes future recipes | Lasting need mutation is reused instead of week-entry inclusion | A shop-time choice changes later lists unexpectedly | High in next-week fixture | Use existing `update_source included` only; assert recipe `optional` stays true | Low |
| Removing readiness also removes planning access | Card deletion drops its only Adjust trigger | Portions/weekly basics become unreachable | High in route action test | Keep one compact selected placement without counts/card | Low |
| Neutral canvas loses dark-mode boundaries | Paper/card tokens collapse to one tone | Two aisles become visually muddy | High in dark 1280 screenshot | Use existing paper/card/line tokens and retain only narrow green rails | Low |
| Shared ref repair breaks the indicator | New nodes are not observed after options change | Selection loses visible position | High in component tests | Keyed registration plus observe/unobserve lifecycle | Low |
| Shared control keyboard regression reaches other pages | Focus uses stale indexes after reorder | Arrow keys select wrong option | High in dynamic and caller tests | Query current enabled DOM buttons and preserve value keys | Low |
| Recipe language rewrites history | Display helper is reused in persistence payloads | Stored dinner text changes silently | Medium in API fixture | Separate display and persisted-snapshot helpers; assert linked/custom payloads remain unchanged | Low |
| Category aliases create duplicate chips | Raw and normalized values are mixed | Confusing or ineffective filters | High in pure helper test | Normalize, de-duplicate, canonical-sort before render | Low |
| Freezer proof mutates household data | Test uses production URL/database | Real meal-plan change | High in server config | Repository isolated Playwright server and test account only | Very low |
| Pixel target flakes with translated text | Exact geometry is overfitted | Noisy CI/local gate | High | Pair tolerant fixed-fixture bound with DOM-order/no-overlap assertions | Low |
| Completion pass expands into sibling cleanup | English-first code is found elsewhere | Scope and regression growth | High in diff review | Change only direct Meal Plan/shared callers named here | Low |

### Steelman

The strongest alternative is to keep one narrow Shopping ledger: it is simpler on phone and avoids
an extra desktop column. Split remains correct because Freek explicitly values the desktop use of
space, Required retains the dominant width, phone preserves Required-first order, and Optional has a
distinct action rather than pretending to be ordinary shopping. Removing the readiness card also
earns back enough first-screen height to support that distinction without reintroducing clutter.

### Deletion and rollback test

- Delete `DRAWER_CATEGORIES`; one category authority remains.
- Delete the route-level duplicate Shopping history trigger and its wrapper styles.
- Delete the readiness card, summary calculations/messages used only by it, and combined `Not this
  run` renderer; do not leave hidden duplicate destinations.
- Delete the indexed non-reactive button binding; one reference lifecycle remains.
- Do not retain a second language or category fallback path in the page.
- Each behavior change is independently revertible; no schema or data rollback exists.

### Critique result

**GO.** No P0/P1 blocker, open product decision, or high residual risk remains. Freek selected
Header Tool for compact planning access, which changes no data or server architecture. No external
library or API behavior changes, so no Context7 research is required.

## Open questions

None.

## Implementation record

- Shopping now uses the selected neutral Split ledger on desktop and stacked order on phone. The
  readiness card is gone; Required, Optional, In stock, and the final collapsed Removed this week
  area have distinct meanings and preserve the existing week-only update, restore, focus, and Undo
  commands.
- AH recovery and History share one compact attention strip. Meal Plan projects linked recipe
  titles from the household recipe-language preference and derives localized filters only from
  categories present in loaded recipes.
- `SegmentedControl` now registers option nodes by stable value and maintains observation as options
  change without Svelte binding warnings.
- Isolated browser fixtures prove both planning callers persist 6 servings from freezer stock and
  16 servings for fresh cooking; the linked known issue is solved.
- Release gate: zero Svelte diagnostics, 120 Vitest files / 724 tests passed, primary Playwright 48
  passed / 1 intentionally skipped, and the production build completed. Focused second-account
  coverage is recorded in `docs/log.md`.

## Resume pack

- **Goal:** finish Shopping hierarchy, Meal Plan language/category consistency, shared segmented
  control cleanliness, and freezer-source verification without another redesign.
- **Current state:** implementation, the complete local release gate, and focused second-account
  verification are green; the plan is archived as shipped before automatic production delivery.
- **First command:** none; this work is complete.
- **First files:** none.
- **Pending verification:** exact-main production deployment and authenticated canary under
  `AGENTS.md`.
- **Open questions:** none.

## Continue

Session complete. Run `$plan` for the next item.
