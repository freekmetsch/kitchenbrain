# Feature List: Kitchen Visual System Completion

_Status: Shipped - 2026-07-26_

## Problem framing

The four primary kitchen routes should feel related without spending the first viewport on
branding. Green is a working surface: it should hold current context, live status, navigation,
progress, and the next useful action. A route name may orient the user, but it must remain small
and subordinate.

Stock's compact title and density remain the right reference, but its two summary cards are
currently static `<div>` elements. They look like destinations without doing anything. The first
Kitchen Ledger refinement then copied that two-card syntax into Meal Plan and Recipes, even
though counts are not the main job of either page. That is the exact failure this refinement
removes: shared visual language must not become copied, purposeless furniture.

Market Run provides the better reasoning model. Each part of its green region has a route-specific
job: AH state, week navigation, delivery context, run progress, and basket state. The other routes
should be designed from their own jobs in the same way:

1. Stock — triage what is ready and what needs replenishment through real quick-view buttons.
2. Market Run — replace the large title treatment with a compact utility band.
3. Meal Plan — navigate a week, add meals, and work directly in the day ledger.
4. Recipes — find, filter, import, and act on recipes.

## Approved design rule

### Green is utility, not ceremony

- The route name stays single-line, small, and visually subordinate to current context.
- Every major region inside the green band must answer one of four questions: where am I, what is
  the current state, what changed, or what can I do next?
- Route jobs determine composition. Shared color, type, spacing, focus, and state language do not
  justify copying the same card, metric, or toolbar pattern between routes.
- Anything styled like a control must perform its expected action. A status without an action
  must not borrow button hover, focus, chevron, or pressed-state affordances.
- No descriptive slogan, oversized title, decorative empty space, or title-only row earns green
  space.
- On phone, useful controls remain at least 44 CSS pixels and the primary action stays reachable.
- On desktop, the same information compacts horizontally; the band must not grow merely because
  the canvas is wider.
- Green-band height is content-driven rather than one fixed token. Stock may remain taller when
  its two quick-view buttons earn that space.
- The content immediately below the band starts the task: stock tools, run tabs/list, the week
  ledger, or recipe filters/index.

The fully worked visual specification is
`docs/artifacts/archive/2026-07-25-plan-kitchen-visual-system-completion.html`.

## Existing-system inventory

| Route | Current evidence | Kitchen Ledger treatment |
|---|---|---|
| `/inventory` | Compact title and useful Add/activity actions; ready-meal and below-target summaries are static `<div>` elements | Keep the compact composition, but turn positive summaries into clear quick-view buttons with real filtered outcomes |
| `/shopping` | 393 and 1280 px; useful week/progress/AH state, but large Market Run title consumes prime band space | Replace title column with a small route label; let week, progress, basket, and AH own the band |
| `/meal-plan` | Generic narrow column and equal-weight Shopping/Suggest/Add controls | Put week navigation and Add in the band; let gaps and meal state live in the ledger instead of copied summary cards |
| `/recipes` | Generic narrow search/filter/card page | Put retrieval and creation in the band: search, sort context, Import, and New meal; no copied stock summaries |
| Home/chat | Conversation-led workspace | Preserve |
| Recipe detail/cook/edit | Task-specific detail and editor surfaces | Preserve |
| Settings/Login | Lower-frequency index and logged-out form | Out of this four-route execution |

Source seams:

- Shared theme and visual vocabulary: `src/app.css`.
- Stock composition: `src/routes/inventory/+page.svelte`.
- Market Run band: `src/lib/components/shopping/WeekNav.svelte`; page shell:
  `src/routes/shopping/+page.svelte`.
- Meal planning interactions: `src/routes/meal-plan/+page.svelte`.
- Recipe URL-backed filters and focused actions: `src/routes/recipes/+page.svelte`.
- Existing primitives: `BottomSheet`, `EmptyState`, `Toast`, recipe action sheets, and the bottom
  navigation.

## Scope

### In

- Canonical light/dark `--kitchen-*` palette and display-type tokens in `src/app.css`.
- Stock quick-view buttons for Ready meals and Below target, including active and zero-result states.
- A compact utility-first Market Run band.
- A compact utility-first Meal Plan band and route-specific week ledger.
- A compact utility-first Recipes band and route-specific recipe index.
- Empty, populated, complete, no-results, loading, offline/error, long-content, current/past week,
  and focused-sheet states.
- English/Dutch, dark mode, reduced motion, keyboard focus, 320 px reflow, tablet, and desktop.

### Out

- Schema, auth, recipe storage, meal mutations, AI prompts, shopping derivation, AH behavior, new
  dependencies, or new saved preferences.
- Home/chat, Recipe detail, cook mode, recipe edit, Settings, or Login.
- New illustration/image assets, analytics, telemetry, or personalization.

The excluded routes are inert: no new shared caller, migration, or rename depends on them.

## Design convergence

The earlier shotgun compared Market Family, Kitchen Ledger, Prep Board, and Sunday Table. The user
selected **Kitchen Ledger**, then rejected the first refinement's copied metric cards. The binding
direction is now: fully work Kitchen Ledger through all four primary routes, use green for useful
UI rather than large headers, and derive each composition from the page's actual job.

| Direction | Disposition | Reason |
|---|---|---|
| **Kitchen Ledger** | Selected | Shares palette, type, state language, and utility-band rules while preserving route-specific hierarchy |
| Market Family | Rejected | Literal masthead reuse over-invests in repeated page identity |
| Prep Board | Rejected | Repeated tiles become noisy with real household content |
| Sunday Table | Rejected | Oversized editorial composition spends too much space and breakpoint complexity |

### Kitchen Ledger across all four routes

#### Stock

**Page job:** decide what can be used now and what needs replenishment, then act on an item.

**Green band**

- Small `Stock` heading and household-stock context.
- Activity and Add actions.
- `Ready meals` is a quick-view button. Pressing it selects the Meals scope, filters to leftovers
  with portions on hand, keeps search and compatible filters applied, and announces the result
  count. Pressing the active button again clears that quick view.
- `Below target` is a quick-view button. Pressing it selects the Meals scope, filters to freezer
  staples whose on-hand portions are below target, keeps compatible search/filters applied, and
  announces the result count. Pressing it again clears that quick view.
- Each actionable summary uses native button semantics, a visible chevron, hover/focus feedback,
  and `aria-pressed`. Only one quick view is active at a time; focus stays on the control while a
  polite status message announces the filtered result.
- A zero count becomes honest status rather than a false control: `No meals ready` or `Targets
  covered`, with no chevron/pressed affordance. The normal Meals scope remains available.

**Below the band**

- Search, scope switcher, filters, and stock groups begin immediately.
- An active quick-view chip appears beside the scopes with a clear action. Results retain their
  existing Use next / Still plenty / Cook again ordering where applicable.
- Search and compatible filters narrow the active quick view. Choosing Ingredients or All stock
  clears the meal-only quick view before changing scope.

**Responsive behavior**

- Phone keeps the accepted two-row density, but the second row clearly reads as two tappable
  destinations rather than passive metric tiles.
- Desktop compacts identity/actions and quick views horizontally; it does not repeat the same
  counts in a sidebar.

#### Market Run

**Green band**

- Small `Groceries` or `Market Run` route label in the top utility row.
- AH status and the current week/delivery context.
- Previous/next week controls.
- Items left, basket count, and progress.
- Meal-plan deep link remains visible but secondary.

**Removed**

- No large standalone `Market run` title and no reserved title column.

**Below the band**

- Run/Meals/Every week tabs and the active list start immediately.
- Add and AH review actions retain the existing bottom dock.

**Responsive behavior**

- Phone uses two dense utility rows: identity/status, then week/progress.
- Desktop places route label/AH, week navigation, and progress in one bounded horizontal band;
  no oversized left title region.

#### Meal Plan

**Page job:** choose the active week, place meals on days, and resolve open days.

**Green band**

- Small `Meal plan` route label and overflow menu.
- Current week range with previous/next navigation.
- Add meal as the primary action.
- Delivery context and the Shopping deep link sit with the week because they describe that week.
- No planned/open metric cards. Planned meals and open days are already visible in the ledger and
  should not be duplicated above it.

**Below the band**

- Day-by-day ledger starts immediately; empty days show their next action inline.
- Suggest remains a secondary planning aid near the ledger, not a peer of Add and not a green
  summary tile.
- Suggestion results use the context rail on desktop and a focused disclosure/sheet on phone.

**Responsive behavior**

- Phone uses identity/action plus one week-navigation row, then one chronological ledger.
- Desktop puts identity, week navigation, delivery/Shopping context, and Add on one horizontal
  working band. The ledger uses the available width; no copied count sidebar.

#### Recipes

**Page job:** retrieve the right recipe quickly or add a new recipe/meal.

**Green band**

- Small `Recipes` route label.
- Import recipe is the primary creation action; New meal stays available as a secondary action.
- Search input as the largest useful control.
- Current sort may sit beside search where space allows.
- No ready-now or below-target metric cards. Those are filter facets, so they stay in the filter
  rail and communicate state through `aria-pressed` plus the result set.

**Below the band**

- Sort and filter rail start immediately.
- Compact recipe index entries show title, image/fallback, stock coverage, freezer/review state,
  and the existing Plan/Make actions.

**Responsive behavior**

- Phone stacks identity/actions over search, followed immediately by the horizontal filter rail.
- Desktop places route label/actions, search, and sort in one compact horizontal band. The recipe
  index uses the available canvas; no repeated summary-count sidebar.

## Phase plan

### Phase 1 - Establish the utility-band contract

1. Promote the repeated palette and display type to canonical `--kitchen-*` tokens.
2. Define the utility-band rule as small visual recipes, not one universal page component.
3. Turn Stock's two summaries into honest quick-view controls without restyling the accepted
   compact identity/actions.

Checkpoint: Stock keeps its accepted density while Ready meals and Below target visibly and
accessibly filter the ledger.

### Phase 2 - Recover space in Market Run

1. Remove the oversized/title-column treatment from `WeekNav`.
2. Recompose AH status, week navigation, delivery context, progress, and basket count as the band.
3. Preserve the existing run tabs, context rail, bottom dock, and AH recovery states.

Checkpoint: the list starts higher without losing any week, AH, progress, or navigation context.

### Phase 3 - Build the Meal Plan ledger

1. Add the compact week-navigation/Add band without copied metric cards.
2. Recompose empty and populated day rows without changing optimistic mutations.
3. Place suggestion/context states responsively without changing AI or apply behavior.

Checkpoint: week navigation, add/edit/remove, servings, notes, suggestions, and Shopping handoff
retain their outcomes.

### Phase 4 - Build the Recipes index

1. Add the compact search/sort/creation band without copied metric cards.
2. Recompose filters and recipe entries without changing URL or data contracts.
3. Preserve Import, New meal, Plan, Make, and Freeze focused journeys.

Checkpoint: URL-backed filters, browser history, long titles, missing images, content states, and
all recipe actions remain intact.

### Phase 5 - Cross-route verification and simplification

1. Verify the complete state and viewport matrix in both languages and themes.
2. Remove duplicate palette aliases and visual markup that no longer earns space.
3. Run the complete repository checks and browser release gates.

## Execution tickets

### KVS-1 - Canonical kitchen tokens and utility-band contract

- **Observable behavior:** all four routes can consume one visual contract without a universal
  page component.
- **Targets:** `src/app.css`; page-local aliases in Stock and Shopping.
- **Scope out:** theme persistence or global interaction behavior.
- **Risk:** R2. Shared CSS can regress multiple primary routes.
- **Impact / effort / confidence:** 5 / M / high.
- **Verification:** light/dark token inspection, `npm run check`, `npm run build`.
- **Rollback:** restore page-local aliases.

### KVS-2 - Stock actionable quick views

- **Observable behavior:** Stock retains its accepted compact heading and actions; pressing Ready
  meals or Below target applies the matching exclusive quick view, updates the ledger, exposes a
  pressed state and clear path, and announces the result. Zero counts render as status rather
  than false controls.
- **Targets:** `src/routes/inventory/+page.svelte`;
  `src/lib/components/inventory/shared.ts` and `shared.test.ts` for one predicate shared by counts
  and filtering; English/Dutch messages as needed.
- **Scope out:** writes, server data, group derivation, URL persistence, and new saved preferences.
- **Risk:** R2. This adds local filter behavior to a primary route.
- **Impact / effort / confidence:** 5 / M / high.
- **Verification:** unit tests prove counts and filters use the same predicate; button/zero
  states; Ready/Below/clear/toggle; interaction with search, scope, and filters; result
  announcement and retained focus; keyboard; 320/393/1280 light/dark screenshots; Add/activity
  parity.
- **Rollback:** remove quick-view state/filters and restore the summaries as noninteractive
  status while retaining token migration.

### KVS-3 - Market Run utility-first band

- **Observable behavior:** the green band centers week, AH, progress, and basket context; the
  active list begins higher and no large title column remains.
- **Targets:** `src/lib/components/shopping/WeekNav.svelte`; messages only if the compact route
  label needs copy.
- **Scope out:** shopping derivation, AH preview/push, mutation APIs, tabs, and the bottom dock.
- **Risk:** R2. This changes the primary orientation surface for a repeated task.
- **Impact / effort / confidence:** 5 / M / high.
- **Verification:** current/other week, delivery/no delivery, AH online/offline, empty/populated/
  complete, 320/393/768/1280, light/dark, keyboard, no dock overlap.
- **Rollback:** restore the current `WeekNav` composition.

### KVS-4 - Meal Plan utility band

- **Observable behavior:** week navigation, delivery/Shopping context, overflow, and Add have a
  clear hierarchy without large identity or copied planned/open cards; the ledger itself shows
  planned and open days.
- **Targets:** top composition of `src/routes/meal-plan/+page.svelte`; messages as needed.
- **Scope out:** week calculation and mutation logic.
- **Risk:** R1.
- **Impact / effort / confidence:** 5 / M / high.
- **Verification:** current/future/past weeks at 320/393/768/1280; focus and overflow menu.
- **Rollback:** revert the band composition.

### KVS-5A - Meal Plan day ledger

- **Observable behavior:** empty and populated days scan chronologically; long meals, notes,
  serving controls, edit, and removal retain their outcomes.
- **Targets:** meal rows and empty state in `src/routes/meal-plan/+page.svelte`.
- **Scope out:** API handlers and optimistic helpers.
- **Risk:** R2.
- **Impact / effort / confidence:** 5 / L / medium-high.
- **Verification:** safe fixture add/edit/remove/recovery, servings, notes, long content, and
  Shopping deep link.
- **Rollback:** revert route markup/styles; data is unaffected.

### KVS-5B - Meal Plan suggestion context

- **Observable behavior:** suggestion pending, failure, retry, applied, and dismissed states remain
  secondary to planning and agree with the underlying state.
- **Targets:** suggestion region in `src/routes/meal-plan/+page.svelte`.
- **Scope out:** prompts, spend controls, API behavior, and apply mutations.
- **Risk:** R2.
- **Impact / effort / confidence:** 4 / M / medium-high.
- **Verification:** safe mocked loading/error/retry/apply/dismiss at 393 and 1280; focus/status
  agreement.
- **Rollback:** revert suggestion composition.

### KVS-6 - Recipes utility band and filter hierarchy

- **Observable behavior:** route identity, Import/New meal, search, sort, filters, and result state
  form one compact hierarchy without a title-only masthead or copied summary cards.
- **Targets:** header/filter composition in `src/routes/recipes/+page.svelte`; messages as needed.
- **Scope out:** filter/query contracts and server load logic.
- **Risk:** R1.
- **Impact / effort / confidence:** 5 / M / high.
- **Verification:** search, sort, every filter, active result state, browser history, 320 px
  reflow, and 1280 px horizontal composition.
- **Rollback:** revert header/filter composition.

### KVS-7A - Recipes index and content states

- **Observable behavior:** populated recipes, missing images, long titles, stock/freezer/review
  signals, empty library, and no results stay legible without card noise.
- **Targets:** recipe entries, empty/no-results, and desktop context in
  `src/routes/recipes/+page.svelte`.
- **Scope out:** recipe actions, detail, image endpoints, and data shapes.
- **Risk:** R2.
- **Impact / effort / confidence:** 5 / L / medium-high.
- **Verification:** long English/Dutch, missing images, loading/error, empty/no-results, pointer,
  and keyboard states.
- **Rollback:** revert route markup/styles.

### KVS-7B - Recipe action parity

- **Observable behavior:** Import, New meal, Plan, Make, and Freeze still open the correct focused
  surface and preserve pending/error/recovery/focus behavior.
- **Targets:** action placement and sheet integration in `src/routes/recipes/+page.svelte`.
- **Scope out:** sheet mutation logic and API endpoints.
- **Risk:** R1.
- **Impact / effort / confidence:** 4 / M / high.
- **Verification:** every sheet at 393/1280, keyboard open/cancel/error, focus return, and
  duplicate-submit prevention.
- **Rollback:** restore previous action placement.

### KVS-8 - Cross-route release gate

- **Observable behavior:** Stock, Market Run, Meal Plan, and Recipes share one compact working
  language; green space always carries useful context or controls.
- **Targets:** targeted fixes and English/Dutch messages surfaced by verification.
- **Scope out:** product behavior beyond the approved Stock quick views.
- **Risk:** R2.
- **Impact / effort / confidence:** 5 / M / high.
- **Verification:** `npm run check`, `npm run test:unit`, `npm run build`, `git diff --check`, and
  the browser matrix below.
- **Rollback:** revert the visual-system commits; no migration or data restore.

## Risk and verification

Overall risk: **R2**. This is code-only shared visual work over four rendered routes. It does not
touch schema, auth, destructive actions, provider calls, or external writes, so the beta stage
does not require an R3 stage gate.

### Failure-mode critique

| Failure mode | Trigger | Impact | Detectability | Mitigation | Residual risk |
|---|---|---|---|---|---|
| Utility band becomes cramped | Too many controls are forced into green | Labels wrap or targets shrink | High at 320/393 | Prioritize one primary action, use route-specific stacking, retain 44 px targets | Low |
| Stock quick views disagree with the ledger | Button count and filter predicate drift or other scopes leave stale state | The control promises the wrong result | High in state-driven tests | Reuse the same derived predicates; make quick views exclusive; clear incompatible state; announce count | Low |
| Stock summaries remain false affordances | Visual treatment changes but semantic elements/handlers do not | Repeated taps appear broken | High by pointer/keyboard inspection | Native buttons for positive counts; chevron, focus, pressed state, and explicit zero-status variant | Low |
| Market context disappears with title removal | Title-column rewrite also drops week/AH/progress data | User loses orientation | High in state matrix | Explicit utility inventory; each current context item has a new location | Low |
| One shared component flattens four routes | Reuse is based on shape, not semantics | Routes become awkward variants of one shell | Medium | Share tokens and rules only; keep route markup specific | Low |
| Copied summary cards return during implementation | Visual consistency is mistaken for identical composition | Meal Plan and Recipes waste space on duplicated state | High in route screenshots | Route-job checklist in every ticket; explicitly ban planned/open and ready/below summary cards outside Stock | Low |
| First viewport still wastes space | Band is smaller but decorative copy replaces title | Task content remains pushed down | High in screenshot comparison | Ban slogans/title-only rows; record content start position | Low |
| Dutch or long context overflows | English labels define geometry | Controls or meaning become inaccessible | High in bilingual pass | Long-content fixtures and intentional wrapping/disclosure | Low |
| Recipe search loses focus contrast on green | Input styling is optimized only for light paper | Search becomes hard to use | High in keyboard/theme pass | Use a high-contrast card input within the band; visible focus gate | Low |
| Fixed actions cover the ledger | Mobile band/dock changes ignore overlay variables | Final rows or focus are obscured | High at 320/393 | Reuse overlay clearance tokens and test final-row focus | Low |
| Market/meal/recipe behaviors regress | Markup movement drops handlers or pending states | Core repeated tasks fail | High in vertical journey tests | Preserve behavior ownership; verify one ticket at a time | Low |
| Desktop geometry drives mobile DOM order | Context rails become the source structure | Phone scan/focus order degrades | High in responsive keyboard pass | Keep phone DOM order authoritative; enhance at breakpoints | Low |

### UI audit findings carried into execution

- **UI P2:** At 393 px, Market Run's title wraps to 52 px and consumes about 42% of the 124-pixel
  band while the useful week/progress region is 74 px high.
- **UI P2:** At 1280 px, Market Run reserves a 408-pixel title column and a taller band than Stock,
  despite week/progress/AH being the repeated task context.
- **UI P2:** Meal Plan and Recipes remain narrow generic columns with large unused desktop canvas.
- **UI P2:** Stock's `ready meals` and `below target` summaries are rendered as static `<div>`
  elements in `src/routes/inventory/+page.svelte`; they visually resemble destinations but have
  no pointer, keyboard, pressed, or result behavior.
- **UI P2:** The first Kitchen Ledger artifact copied Stock's two-summary pattern into Meal Plan
  and Recipes even though both values duplicate state already available in the ledger/filter
  rail. This is an artifact finding confirmed by the user's review, not a shipped-app regression.
- **UI P2:** Green currently communicates a strong identity, but the reusable rule is not yet
  encoded; adding more route-local mastheads would compound inconsistent space use.
- **UI P3:** Stock's compact title is not itself a problem; route actions and two purposeful
  quick-view destinations can earn the surrounding band space.

### Browser matrix

| Route/state | 320 | 393 | 768 | 1280 | Required proof |
|---|---:|---:|---:|---:|---|
| Stock empty/populated | Yes | Yes | - | Yes | Add/activity parity; Ready/Below/clear; search/scopes; zero-status; light/dark |
| Market Run empty/populated/complete | Yes | Yes | Yes | Yes | list starts higher, week/AH/progress retained, dock clearance |
| Market Run recovery | - | Yes | - | Yes | offline, stale review, locked send, uncertain result |
| Meal Plan empty/current | Yes | Yes | Yes | Yes | week navigation, Add, Suggest, Shopping; no copied count cards |
| Meal Plan populated/long | Yes | Yes | Yes | Yes | edit/remove, servings, notes, focused sheets |
| Meal Plan suggestion failure | - | Yes | - | Yes | pending, error, retry, apply, focus |
| Recipes empty/no results | Yes | Yes | Yes | Yes | search/import, clear filters, useful next action |
| Recipes populated/long | Yes | Yes | Yes | Yes | filters/history, missing image; no copied summary cards |
| Recipe actions | - | Yes | - | Yes | New meal, Plan, Make, Freeze, cancel/recovery |
| Accessibility preferences | - | Yes | - | Yes | keyboard, visible focus, reduced motion, 200% reflow |

UI audit and Design Shotgun refinement are complete. Harden and stack discipline were not
triggered: there is no security/data-integrity change and no new dependency. Context7 exception:
the work is internal visual composition and does not depend on new external API behavior.

Plan critique result: **GO**. Tickets map to observable behavior, all realistic failure modes have
low residual risk, and no P0/P1 blocker remains.

### Steelman

The strongest objection is that four independently composed bands may drift visually and lose the
family resemblance that Kitchen Ledger was selected to create. Kitchen Ledger is still right
because the family resemblance comes from palette, display type, spacing rhythm, focus language,
and compact density—not repeated dashboard cards. Stock alone gets quick-view buttons because
triage is its job; Market keeps week/progress/AH, Meal Plan keeps week/Add, and Recipes keeps
search/creation. This makes route purpose more legible while preserving one visual voice.

## Rollout and rollback

- Execute one ticket at a time; Stock parity and Market Run compaction land before the two new
  route treatments.
- Compare content-start position before/after for each route in addition to ordinary screenshots.
- Keep behavior ownership in existing routes, stores, actions, and sheets.
- Rollback is a code revert by ticket or phase. No schema, preference, or household data needs
  restoration.

## Open Questions

None. The user selected Kitchen Ledger for all four primary routes, fixed green as useful UI,
rejected copied Stock summary cards on Meal Plan and Recipes, and required Stock's own summaries
to become real controls with expected outcomes.

## Implementation outcome

- Added canonical light/dark `--kitchen-*` material, color, and display-type tokens.
- Turned Stock's positive summaries into exclusive quick-view buttons backed by one tested
  predicate; zero counts are honest status, and active views expose pressed state, retained focus,
  result feedback, and a clear action.
- Removed Market Run's reserved title column and centered the band on week, delivery, AH state,
  progress, and basket state.
- Rebuilt Meal Plan around week navigation, Shopping, Suggest, and a clearly primary Add action,
  with the ledger beginning directly below instead of copied summary cards.
- Rebuilt Recipes around search, sort, Import, New meal, and the existing URL-backed filter rail;
  the index expands to three/four columns on larger canvases.
- Verified authenticated app renders at 320, 393, 768, and 1280 CSS pixels in English and Dutch,
  light and dark themes, with zero horizontal overflow and zero browser console errors. Exercised
  the Stock Ready view and clear path plus the Recipe Make -> Already cooked -> Freeze journey.
- Repository gates passed: 71 test files / 431 tests, zero Svelte diagnostics, production build,
  and `git diff --check`.

## Resume pack

- **Goal:** preserve the shipped Kitchen Ledger system across the four primary kitchen routes.
- **Current state:** implementation, browser validation, and repository gates are complete.
- **First command:** `$plan` for the next distinct product item.
- **First files:** none; this feature list is terminal and archived.
- **Pending verification:** none for this scope.
- **Open questions:** none.
