# App House Style — Soft Utility Green Ribbon Implementation

_Status: Shipped - 2026-07-30 (Soft Utility Green Ribbon implemented and fully browser-verified)_

## Planning sources and approval

This is the executable implementation plan for the approved visual direction in
`docs/feature-lists/archive/FEATURE_LIST_APP_HOUSE_STYLE_DESIGN_SHOTGUN_V2.md`.

- **Primary direction:** Direction A — Soft Utility.
- **Approved refinement:** Refinement A — Green Ribbon.
- **Recommendation status:** Recommended and approved.
- **Cross-refinement carry-forward:** None.
- **Prototype version:** `2.1-soft-utility-green-header-refinement`.
- **Prototype:** `docs/artifacts/archive/2026-07-29-design-shotgun-app-house-style-v2-soft-utility-refinement.html`.

User note, reproduced verbatim:

> I still love the green headers and the way that was originally set up that we had though. Lets keep those

The prototype is a visual reference, not a second source of product behavior. Production behavior,
copy, data shape, and accessibility semantics remain authoritative in the Svelte application and
its tests.

## Problem framing

The shipped Ledger Compact pass made component meanings consistent, but it also made too many
parts of the app compete as bordered objects. The current green header uses a gradient, decorative
ring, serif title, paired-action rail, and route payloads inside the green surface. That combination
is visually heavy during repeated phone use. On desktop, Stock and Recipes still distribute content
poorly. In dark mode, olive-on-olive surfaces and secondary actions do not separate reliably.

The implementation must preserve the green header as Keukenbrein's recognizable page signature
while making it a slim identity ribbon. Content, not the header or a stack of frames, becomes the
primary reading surface.

### Objective

Implement Soft Utility with the Green Ribbon across Stock (`/inventory`), Meal plan, Shopping,
the Recipes index/detail/edit family, the Settings index and panels, and Login. The result uses
clean sans-serif typography, warm chalk and charcoal bases, restrained herb and clay accents,
low framing, balanced desktop layouts, and deliberate dark-theme surfaces.

### Success criteria

1. Every in-scope page has exactly one H1 and a recognizable herb-green identity ribbon.
2. At normal text size, the ribbon is 64 CSS px on phone and 72 CSS px on desktop; it may grow
   under long copy or 200%-equivalent text rather than clipping.
3. The ribbon contains eyebrow, title, and at most one highest-value action. Route controls,
   metrics, week navigation, search, filters, status, and secondary actions sit immediately below
   it on a neutral surface.
4. Stable in-scope UI uses one sans-serif family. No Georgia, Times, or
   `--kitchen-display` declaration remains in the stable source contract.
5. Repeated content is grouped primarily through spacing, dividers, and headings. A border may
   communicate a real state or contain a focused form, but ordinary row groups are not all cards.
6. Stock uses the 1280 px canvas as a balanced work area, and Recipes does not render a stretched
   row of miniature cards or large empty placeholders.
7. Dark Shopping keeps the uncertain AH result, list rows, secondary action, and dock visually
   distinct without increasing semantic color noise.
8. Existing routes, URLs, actions, mutations, focus behavior, responsive navigation, fixed docks,
   auth, provider behavior, AH behavior, and canonical Dutch ingredient use remain unchanged.
9. The provider-free unit, browser, diagnostics, and production-build gates pass for both isolated
   household test accounts.

## Scope

### In

- Shared Soft Utility color, type, spacing, surface, divider, and layout tokens used only by stable
  household-management surfaces.
- `KitchenPageHeader` as the one Green Ribbon owner, including optional leading navigation and one
  action slot.
- Neutral page-utility rows directly below the ribbon.
- Stock, Meal plan, Shopping, Recipes, Settings, and Login composition.
- Recipes index, detail, and edit headers/surfaces; Recipe Cook Mode remains an explicit exception.
- Settings index plus Account, Advanced, AI, Connections, Data, Display, Meal plan, and Recipes
  panels.
- Light/dark, English/Dutch, long content, keyboard, touch target, and responsive state coverage.
- Focused source guards, Playwright contracts, the house-style document, rollback evidence, and
  normal beta delivery.

### Out

- Assistant, Chat, Cook Mode, timers, bottom navigation, and their interaction or visual systems.
- Route additions/removals, navigation behavior changes, information-model changes, or copy
  rewrites unrelated to fit.
- Database/schema changes, migrations, household data reads, auth/session changes, provider calls,
  AI prompts/models, runtime configuration, and secret handling.
- Albert Heijn request logic, preview/push behavior, tokens, result interpretation, or Dutch lookup
  fields.
- New fonts, component libraries, visual-regression services, dependencies, or image assets.
- Decorative motion. Existing functional transitions remain unless a layout change makes a
  transition incorrect; reduced-motion behavior remains mandatory.

## Existing-system inventory

| Seam | Current owner | Planning consequence |
|---|---|---|
| Stable palette and semantic recipes | `src/app.css` | Evolve opt-in `--kitchen-*` and `ui-*` roles; do not globally retheme DaisyUI and leak into Assistant, Cook Mode, or navigation. |
| Green page surface | `src/lib/components/ui/KitchenPageHeader.svelte` | Remove gradient, decoration, serif title, and payload slot; keep one shared ribbon owner. |
| Paired header actions | `KitchenHeaderActionRail.svelte` plus Inventory and Recipes callers | Migrate secondary controls below the ribbon and delete this component in the same foundation ticket. |
| Stock composition | `src/routes/inventory/+page.svelte` | Move metrics onto neutral content, preserve mobile-first DOM order, and rebalance the desktop grid. |
| Meal-plan composition | `src/routes/meal-plan/+page.svelte` | Move week navigation and secondary actions below the ribbon without changing week URLs, suggestions, or sheets. |
| Shopping header | `src/lib/components/shopping/WeekNav.svelte` | Split identity from week/AH context; keep the fixed repeated-task dock and AH semantics. |
| Shopping lists and AH result | `ShoppingLists.svelte`, `ShoppingNotices.svelte`, `PushHistory.svelte` | Reduce ordinary frames while retaining warning/recovery hierarchy and focus restoration. |
| Recipes index | `src/routes/recipes/+page.svelte` | Replace phone mini-card grid with content-led rows and optional imagery; keep all actions, filters, and category text. |
| Recipe detail/edit | `RecipeHeader.svelte`, recipe route files and editor components | Adopt the ribbon and sans/low-frame treatment without touching Cook Mode or recipe mutations. |
| Settings headers | `SettingsPanelHeader.svelte` and nine Settings routes | Make the Settings family visually continuous while preserving Back navigation and form behavior. |
| Login | `src/routes/login/+page.svelte` | Add the same identity ribbon around the existing auth form; do not touch the server action or session boundary. |
| Drift guard | `src/lib/ui_house_style_source.test.ts` | Replace Ledger Compact assertions with Green Ribbon ownership and retired-recipe assertions. |
| Browser contract | `tests/e2e/house-style.e2e.ts`, `responsive-parity.e2e.ts`, fixtures | Preserve behavioral tests and add geometry, composition, dark-state, and equal-content evidence. |
| Durable style guide | `docs/ui-house-style.md` | Replace the Ledger Compact contract with Soft Utility / Green Ribbon rules and exclusions. |

## Option comparison

### Chosen — evolve the existing semantic seams

Update `KitchenPageHeader`, the opt-in kitchen tokens, and existing route-owned layouts. Migrate
one route family at a time, then delete retired header, serif, and frame recipes.

- **Why:** one durable owner for shared meaning, no dependency, and the smallest long-term
  maintenance surface.
- **Consequence:** the change touches several existing callers, but each route retains its own
  information architecture and behavior.

### Rejected — global DaisyUI theme override

Changing generic DaisyUI roles would be shorter, but the same generic classes serve Assistant,
Cook Mode, navigation, dialogs, and specialized controls that are explicitly out of scope.

### Rejected — route-local visual rewrites

Local CSS would make each route easy to tune in isolation, but would immediately recreate the
visual drift the first house-style pass removed.

### Rejected — parallel `SoftUtility*` component family

A second header and surface system would make rollback superficially simple, but leave two
production owners and force future callers to choose between them. The existing semantic seams
are the correct migration boundary.

## Chosen implementation contract

### Green Ribbon

- `KitchenPageHeader` owns a solid muted-herb band with no gradient, illustration, overlap, or
  route payload.
- The normal rendered band is 64 px below 768 px and 72 px from 768 px upward.
- It uses a compact sans-serif eyebrow and title, white/off-white content, and no display serif.
- It accepts optional leading navigation and one `action` snippet. The action remains a native
  link or button with a 44 px target and visible focus.
- Long Dutch/English copy and 200%-equivalent text may increase height and wrap. Exact height is
  asserted only at normal text size.
- Route utilities use a shared `ui-page-utility` recipe outside the green element and align to
  the same 74 rem content measure.

### Soft Utility surfaces

- Warm chalk / charcoal page bases, off-white / graphite working surfaces, muted herb identity,
  and clay primary actions remain opt-in `--kitchen-*` values.
- Shared headings, card titles, row titles, form headings, and empty/result titles use the system
  sans family. Weight, size, line-height, and spacing provide hierarchy.
- Introduce one low-frame `ui-list-group` recipe: transparent or tonal group background, internal
  dividers, and no surrounding card border by default.
- Keep `KitchenNotice` semantic tone and recovery behavior, but replace the raised three-pixel
  edge with one restrained warning/error edge or tonal field. Ordinary notices are not cards
  inside cards.
- `ui-form-card` remains only for a genuinely focused form group. Settings pages must not wrap
  every explanatory block separately.
- Recipe category color remains textual and optional; remove the generic full-height leading
  stripe if it competes with the new low-frame row treatment.

### Route composition

| Route family | Phone | Desktop |
|---|---|---|
| Stock | Ribbon, neutral metrics/tools, use-next first, then remaining groups | Main repeated inventory work gets roughly two-thirds of the usable canvas; compact coverage/use-next context uses the remaining rail only when present. DOM order stays mobile-first. |
| Meal plan | Ribbon with Add meal; week navigator and other actions below; unframed day/meal rows | A bounded main plan column gains a context rail only while suggestions or related context are present. |
| Shopping | Ribbon; week/AH context below; filters, warning, groups, and thumb-reachable dock | Main list and AH history/context use a balanced content/rail grid. No real AH request runs during verification. |
| Recipes index | One content-led row per recipe; show a compact thumbnail only when an image exists and no large placeholder when absent | Two columns at tablet and three balanced columns at wide desktop; never four stretched mini-cards. |
| Recipe detail/edit | Ribbon with Back and one primary action; remaining controls/status below | Wider readable measure without changing Cook Mode, sheets, or mutations. |
| Settings | Ribbon on index and detail panels; Back remains leading navigation | Centered readable settings measure with low-frame form sections. |
| Login | Green identity ribbon above a simple form surface; language controls and errors remain visible | Calm centered form with deliberate whitespace, not a floating shadow-heavy card. |

## Phase plan

### Phase 1 — shared seam and invariant lock

1. Record baseline selectors/action counts used by existing browser journeys.
2. Implement the Green Ribbon and neutral utility recipe.
3. Migrate the four current `KitchenPageHeader` route families to the new slot contract.
4. Retire the paired header rail before moving to route composition.

### Phase 2 — repeated household work

5. Migrate Stock.
6. Migrate Meal plan.
7. Migrate Shopping, including the difficult dark uncertain-result state.
8. Migrate the Recipes index, detail, and edit family.

### Phase 3 — supporting surfaces and drift deletion

9. Migrate the Settings family.
10. Migrate Login.
11. Remove retired serif, frame, gradient, decorative-ring, and leading-marker recipes after the
    final caller is gone.
12. Update the source guard and durable style guide in the same change.

### Phase 4 — full verification and beta delivery

13. Run the complete viewport/theme/locale/state matrix for both isolated accounts.
14. Run the repository gate and production build.
15. Deliver as one code-only PR, supervise the Railway deployment after merge, and run the
    privacy-safe authenticated canary.

## Execution tickets

### GR-1 — Green Ribbon foundation and header migration

- **Observable behavior:** Inventory, Meal plan, Shopping, and Recipes show a solid herb ribbon
  with one H1, normal 64/72 px geometry, clean sans type, and no route payload inside the green
  element. Secondary controls appear immediately below on a neutral utility surface.
- **Scope in:** opt-in Soft Utility palette/type/surface tokens; new `KitchenPageHeader` leading
  and single-action contract; `ui-page-utility`; migration of current callers; deletion of the
  paired header rail.
- **Scope out:** route list/card composition, data behavior, settings/login adoption, global
  DaisyUI tokens, navigation, Assistant, and Cook Mode.
- **Target files:** `src/app.css`,
  `src/lib/components/ui/KitchenPageHeader.svelte`,
  delete `src/lib/components/ui/KitchenHeaderActionRail.svelte`,
  `src/routes/inventory/+page.svelte`,
  `src/routes/meal-plan/+page.svelte`,
  `src/lib/components/shopping/WeekNav.svelte`,
  `src/routes/shopping/+page.svelte`,
  `src/routes/recipes/+page.svelte`,
  `src/lib/ui_house_style_source.test.ts`,
  `tests/e2e/house-style.e2e.ts`.
- **Risk tier:** R2. `wide_sweep: true`. `requires_stage_gate: false`.
- **Dependencies:** approved design brief only.
- **Verification:** `npm run check`; focused source test; Playwright at 320/393/768/1280; exact
  normal-text ribbon height; long Dutch wrap; 200%-text growth; one H1; at most one action inside
  each ribbon; old action pair still exists below where behavior requires both actions; no
  horizontal overflow; header and utility focus visible in both themes.
- **Rollback:** revert this ticket before dependent route tickets, restoring the old component
  API and paired rail together. After later tickets, revert dependents in reverse order or revert
  the whole feature PR.
- **Impact / effort / confidence:** 5 / L / high.

### GR-2 — Stock content-led workspace

- **Observable behavior:** Stock places metrics and controls on neutral content, keeps Use next
  first on phone, and uses the desktop canvas as a main work area plus a compact contextual rail.
  Fourteen long ready-meal rows remain scannable without a stack of framed cards.
- **Scope in:** Stock stats, search/scope controls, coverage, quick view, group rhythm, row
  dividers, empty/filtered states, and desktop grid areas.
- **Scope out:** inventory controller logic, query parameters, mutations, history/undo semantics,
  sheets, recipe linkage logic, and persistence.
- **Target files:** `src/routes/inventory/+page.svelte`,
  `src/lib/components/inventory/ItemRow.svelte`,
  `src/lib/components/inventory/GhostRows.svelte`,
  `src/lib/components/inventory/RecipeRelationshipStatus.svelte`,
  `tests/e2e/fixtures.ts`,
  `tests/e2e/house-style.e2e.ts`,
  `tests/e2e/responsive-parity.e2e.ts`.
- **Risk tier:** R2. `wide_sweep: true`. `requires_stage_gate: false`.
- **Dependencies:** GR-1.
- **Verification:** fourteen-row fixture; zero/nonzero metrics; Use next, Still plenty, Cook again,
  All items, empty search, active quick view, deep-link editor, failed mutation rollback;
  mobile DOM/keyboard order; 1280 px main/rail geometry; long row names; light/dark; English/Dutch;
  44 px controls; fixed-nav clearance; no document overflow.
- **Rollback:** revert Stock markup/styles and its focused expectations without touching the
  shared ribbon or inventory data/controller code.
- **Impact / effort / confidence:** 5 / L / medium-high.

### GR-3 — Meal-plan hierarchy and balanced work area

- **Observable behavior:** Add meal is the one ribbon action. Week navigation, Shopping, Suggest,
  and secondary controls form a calm utility/work row below it. Meal rows use headings, spacing,
  and dividers rather than one dominant frame.
- **Scope in:** selected-week header, week navigation placement, action hierarchy, meal-row
  grouping, suggestion context, empty state, and desktop measure.
- **Scope out:** week URLs, Back/Forward behavior, day planning, suggestion provider contract,
  optimistic state, portion mutations, sheets, and recipe selection semantics.
- **Target files:** `src/routes/meal-plan/+page.svelte`,
  `src/lib/components/ui/KitchenWeekNavigator.svelte`,
  `src/lib/components/meal-plan/MealSourceChoice.svelte`,
  `tests/e2e/house-style.e2e.ts`,
  `tests/e2e/responsive-parity.e2e.ts`,
  `tests/e2e/kitchen-flows.e2e.ts`.
- **Risk tier:** R2. `wide_sweep: true`. `requires_stage_gate: false`.
- **Dependencies:** GR-1.
- **Verification:** current/past/future week navigation and URL state; Back/Forward; long meal
  names; empty plan; day planning; suggestion loading/error/success through provider-free mocks;
  failed mutation recovery; Add meal sheet focus return; action count/order; 320/393/768/1280;
  200% text; light/dark; English/Dutch; no overflow.
- **Rollback:** revert Meal-plan presentation and focused tests only; controller and API behavior
  remain unchanged.
- **Impact / effort / confidence:** 4 / M / high.

### GR-4 — Shopping low-frame list and dark-state clarity

- **Observable behavior:** Shopping keeps the Green Ribbon, moves week/AH context below it, and
  renders filters, the uncertain AH result, recipe groups, other items, and the fixed dock with
  clear hierarchy in light and dark modes. Ordinary list groups no longer read as stacked cards.
- **Scope in:** `WeekNav` utility placement, Add item header trigger, AH status placement, filter
  rail surface, Shopping groups/rows, notices, push history, responsive context rail, and dock
  contrast.
- **Scope out:** item/source mutations, focus-restoration logic, list ordering, AH request logic,
  preview/push, result interpretation, Dutch source fields, Settings connection behavior, and
  stored push history.
- **Target files:** `src/routes/shopping/+page.svelte`,
  `src/lib/components/shopping/WeekNav.svelte`,
  `src/lib/components/shopping/ShoppingLists.svelte`,
  `src/lib/components/shopping/ShoppingNotices.svelte`,
  `src/lib/components/shopping/PushHistory.svelte`,
  `src/lib/components/shopping/AddItemForm.svelte`,
  `src/lib/components/shopping/AhSheet.svelte`,
  `src/lib/components/shopping/AhPushResult.svelte`,
  `tests/e2e/house-style.e2e.ts`,
  `tests/e2e/responsive-parity.e2e.ts`.
- **Risk tier:** R2. `wide_sweep: true`. `requires_stage_gate: false`.
- **Dependencies:** GR-1.
- **Verification:** exact approved 390 × 844 evidence state and 320/393/768/1280 matrix;
  uncertain/success/partial/failed/pending push-history surfaces from fixtures; connected/offline;
  filters and long meal labels; weekly/shared/meal/other groups; empty/completed/covered states;
  dock clearance; keyboard/pointer focus preservation after row moves; Dutch dark mode; warning
  and secondary/dock tonal separation; request counter proves zero real AH calls.
- **Rollback:** revert Shopping presentation and its focused assertions. No AH token, basket,
  shopping entry, or push-history data requires rollback.
- **Impact / effort / confidence:** 5 / L / medium-high.

### GR-5 — Recipes content-led index and family headers

- **Observable behavior:** The Recipes phone index shows one readable row per recipe, uses an
  image only when one exists, and does not allocate a large placeholder to recipes without photos.
  Tablet/desktop use two/three balanced columns. Detail and edit use the same ribbon hierarchy
  without changing Cook Mode or recipe actions.
- **Scope in:** index search/sort/filter utility, list/card geometry, optional thumbnail,
  metadata/action placement, Recipe detail header, edit header, and in-scope recipe surfaces.
- **Scope out:** recipe query/sort semantics, images storage, import/enhancement/provider behavior,
  recipe mutations, translation workflow, Cook Mode, timers, and ingredient data.
- **Target files:** `src/routes/recipes/+page.svelte`,
  `src/routes/recipes/[slug]/+page.svelte`,
  `src/routes/recipes/[slug]/edit/+page.svelte`,
  `src/lib/components/recipe-detail/RecipeHeader.svelte`,
  `src/lib/components/recipe-detail/RecipeHero.svelte`,
  `src/lib/components/recipe-detail/RecipeMetaChips.svelte`,
  `src/lib/components/recipe-edit/IngredientListEditor.svelte`,
  `src/lib/components/recipe-edit/DirectionListEditor.svelte`,
  `tests/e2e/fixtures.ts`,
  `tests/e2e/house-style.e2e.ts`,
  `tests/e2e/kitchen-flows.e2e.ts`.
- **Risk tier:** R2. `wide_sweep: true`. `requires_stage_gate: false`.
- **Dependencies:** GR-1.
- **Verification:** four soup fixtures with no photos plus image/no-image mixed content; one
  column at 320/393, two at 768, three at 1280; no placeholder block when image is absent; long
  titles/metadata; category text retained; search/sort/filters; empty results; Plan/Make/Import/New
  meal actions; detail Back/Edit/Plan/overflow keyboard behavior; edit dirty/save/pending states;
  translation status; Cook Mode smoke proves its controls remain unchanged; light/dark;
  English/Dutch; no overflow.
- **Rollback:** revert the Recipes presentation and fixture/assertion additions. Recipe images,
  translations, cook progress, and database rows are untouched.
- **Impact / effort / confidence:** 5 / L / medium.

### GR-6 — Settings family adoption

- **Observable behavior:** Settings index and every Settings panel use the same Green Ribbon and
  a calm, readable content measure. Back navigation, form state, and warnings behave exactly as
  before.
- **Scope in:** Settings index header/navigation rows, panel header owner, form-section spacing,
  and visible focus/invalid/disabled/pending/result states.
- **Scope out:** Settings API calls, saved preferences, imports/exports/resets, model/provider
  behavior, passwords, sessions, and Login.
- **Target files:** `src/lib/components/settings/SettingsPanelHeader.svelte`,
  `src/lib/components/settings/MealPlanSettingsPreview.svelte`,
  `src/routes/settings/+page.svelte`,
  `src/routes/settings/{account,advanced,ai,connections,data,display,meal-plan,recipes}/+page.svelte`,
  `src/lib/components/ui/PendingButton.svelte`,
  `tests/e2e/house-style.e2e.ts`.
- **Risk tier:** R2. `wide_sweep: true`. `requires_stage_gate: false`.
- **Dependencies:** GR-1.
- **Verification:** every Settings route has one H1/ribbon and working Back link; index rows and
  long summaries; form labels, focus, invalid, disabled, pending, success/error, and destructive
  warning surfaces; theme/locale switching; no plaintext secret or provider call.
- **Rollback:** revert Settings markup/styles and focused assertions. No preference or
  imported/exported data rollback is required.
- **Impact / effort / confidence:** 4 / L / high.

### GR-7 — Login Green Ribbon adoption

- **Observable behavior:** Login uses the Green Ribbon above a simple, calm form surface.
  Language, submit, invalid-credential, pending, focus, and redirect behavior remain unchanged.
- **Scope in:** unauthenticated page shell, Green Ribbon identity, language-control placement,
  form surface hierarchy, and visible error/focus states.
- **Scope out:** login server action, password handling, session cookies, redirect rules, account
  seeding, and every authenticated route.
- **Target files:** `src/routes/login/+page.svelte`,
  `src/lib/components/ui/PendingButton.svelte`,
  `tests/e2e/house-style.e2e.ts`,
  `tests/e2e/auth.e2e.ts`.
- **Risk tier:** R2. `wide_sweep: false`. `requires_stage_gate: false`.
- **Dependencies:** GR-1.
- **Verification:** unauthenticated 320/393/768/1280 layouts; one H1/ribbon; English/Dutch;
  light/dark; 44 px fields/actions; labels/autocomplete preserved; keyboard focus and invalid
  state; pending button; invalid login creates no session; valid isolated test-account redirect
  and authenticated boundary remain.
- **Rollback:** revert Login markup/styles and focused assertions. No credential, session, or auth
  data rollback is required.
- **Impact / effort / confidence:** 3 / M / high.

### GR-8 — Retired-recipe deletion and complete browser contract

- **Observable behavior:** no stable caller uses the paired header rail, gradient/decorative
  header, display serif, framed-list dialect, or competing recipe marker. Source and browser
  contracts fail if those recipes return.
- **Scope in:** delete final retired CSS/classes/components; consolidate fixture evidence; extend
  source guard and house-style Playwright contract; preserve existing behavioral E2E assertions.
- **Scope out:** screenshot baselines, visual-regression SaaS, brittle pixel matching outside the
  approved header/layout seams, and unrelated test refactors.
- **Target files:** `src/app.css`,
  `src/lib/ui_house_style_source.test.ts`,
  `tests/e2e/fixtures.ts`,
  `tests/e2e/house-style.e2e.ts`,
  `tests/e2e/responsive-parity.e2e.ts`,
  `tests/e2e/auth.e2e.ts`,
  `tests/e2e/kitchen-flows.e2e.ts`.
- **Risk tier:** R2. `wide_sweep: true`. `requires_stage_gate: false`.
- **Dependencies:** GR-2 through GR-7 complete.
- **Verification:** source guard owns all stable roots; every route/state in the matrix below;
  computed ribbon geometry, column counts, action ownership, sans font family, surface distinction,
  focus visibility, target size, document overflow, fixed-overlay clearance, and excluded-surface
  smoke. Run `npm run check`, `npm run test:unit`, both focused E2E projects, and `npm run build`.
- **Rollback:** revert cleanup and contract changes together only while the prior route tickets are
  also reverted; otherwise revert the complete feature PR.
- **Impact / effort / confidence:** 5 / M / high after GR-2 through GR-7.

### GR-9 — Documentation, complete gate, and beta delivery

- **Observable behavior:** the durable style guide describes the shipped Soft Utility / Green
  Ribbon contract, the full repository gate is green, and production is verified at the deployed
  `main` revision without retaining household evidence.
- **Scope in:** update style documentation and append-only log; `git diff --check`; complete
  repository tests; code-only PR; Railway revision supervision; privacy-safe authenticated canary.
- **Scope out:** Railway variable reads, `railway up`, configuration writes, household screenshots,
  response bodies, cookies, real AH preview/push, and provider turns.
- **Target files:** `docs/ui-house-style.md`, this feature list, the design brief, the plan HTML
  artifact lifecycle, and `docs/log.md`.
- **Risk tier:** R2. `wide_sweep: false`. `requires_stage_gate: false`.
- **Dependencies:** GR-1 through GR-8.
- **Verification:** `git diff --check`; `npm run check`; `npm run test:unit`;
  `npm run test:e2e`; `npm run test:e2e:secondary`; `npm run build`; final `npm test`; then
  `node scripts/production/railway-deployment-truth.mjs` and the repository's privacy-safe
  authenticated canary after merge.
- **Rollback:** revert the feature PR. Because there are no schema, auth, runtime-config, provider,
  AH, or persisted-data changes, no database, secret, token, volume, or config restoration is
  required.
- **Impact / effort / confidence:** 5 / M / high.

## Risk, rollout, and rollback

Overall risk is **R2**: shared presentation primitives and every stable household route change,
but behavior, schema, auth, persistent data, provider configuration, and AH integration do not.
This is a wide UI sweep, not an R3 schema/auth sweep. At beta, `requires_stage_gate` is false.

### Rollout

1. Implement GR-1 through GR-8 as dependency-ordered, ticket-sized commits on one feature branch.
2. Keep focused tests green after each ticket. Do not retain compatibility aliases once the final
   same-role caller migrates.
3. Before PR, run both account projects and the full repository gate with the isolated E2E data
   directory.
4. Merge the code-only PR to `main`; the configured GitHub source triggers Railway.
5. Supervise until Railway reports `SUCCESS`, the source branch is `main`, and the deployed commit
   equals remote `main`.
6. Run the privacy-safe authenticated canary without provider/AH calls or retained household
   content.

### Rollback

- Before merge, revert a ticket before its dependents or reset only through ordinary non-destructive
  git reverts; do not use a destructive worktree reset.
- After merge, revert the whole feature PR and supervise the resulting Railway deployment.
- No data rollback, migration down, auth recovery, provider rollback, AH token recovery, or config
  rollback exists because those surfaces are unchanged.

## Verification matrix

| Dimension | Required evidence |
|---|---|
| Viewports | 320, 393, 768, and 1280 px; 375 × 812 and 390 × 844 evidence states; 200%-equivalent text reflow |
| Routes | `/inventory`, `/meal-plan`, `/shopping`, `/recipes`, representative recipe detail/edit, `/settings`, all Settings panels, `/login` |
| Header | One H1; solid herb ribbon; 64/72 px normal geometry; long-copy growth; optional leading nav; at most one action; no payload/gradient/ring/serif |
| Typography | Computed sans family for ribbon, section, row, recipe, result, and form headings; no stable Georgia/Times/`--kitchen-display` source |
| Themes | Light and dark on every route; difficult dark Shopping state; focused/disabled secondary controls and notices remain distinct |
| Languages | English and Dutch; long header/action/filter/status/form/notice/list copy; no meaning-losing truncation |
| Stock | Fourteen ready meals; zero/nonzero metrics; coverage; long Use next; quick view; search/filter/empty; desktop main/context grid |
| Meal plan | Current/past/future week; Back/Forward; empty/populated; long meals; suggestions loading/error/success; sheet focus recovery |
| Shopping | Connected/offline; uncertain/partial/failed/success/pending history fixtures; filters; long recipe/other groups; covered/done/empty; fixed dock; zero real AH calls |
| Recipes | Four no-photo soups; image/no-image; one/two/three columns; filters/search/sort/empty; index actions; detail/edit header and keyboard menu; Cook Mode unchanged |
| Settings/Login | Index and every panel; Back; forms; warnings; theme/locale; invalid/valid isolated login; session boundary unchanged |
| Interaction | Native semantics; 44 px primary targets; visible and unobscured focus; tab order follows DOM; pressed/disabled/busy/error/success; no duplicate-submit regression |
| Layout | No document overflow; fixed dock/nav/timer clearance; no hidden primary action; desktop main/context ratios; mobile-first reading order |
| Domain safety | No household DB, provider, real AH preview/push, schema/auth/config, or Dutch canonical ingredient lookup change |
| Repository gates | Focused tests per ticket; `git diff --check`; diagnostics; unit tests; primary and secondary E2E; build; final `npm test` |
| Delivery | Railway revision truth and privacy-safe authenticated canary after merge; no retained authenticated evidence |

## Audit records

| Audit | Result | Planning consequence |
|---|---|---|
| UI | Applicable. Existing real-browser evidence at 375 × 812 and 1280 × 900 found header dominance, excessive framing, broad serif, desktop canvas waste, and muddy dark surfaces. | GR-1 through GR-8 directly own those findings and require browser evidence at the source and design viewports. |
| UX | Applicable as repeated mobile work. Stock/Shopping action reach, orientation, fixed-dock clearance, focus restoration, week state, and failure recovery are load-bearing. | DOM order and behavior stay unchanged; existing journey tests remain and gain geometry assertions. |
| Harden | Not triggered. No security, data-integrity, schema, auth, secret, or runtime-config change is planned. | Ordinary beta deployment truth and canary still run in GR-8. |
| Stack discipline | Not triggered. No dependency, service, font, test framework, or platform boundary is introduced. | Reuse Svelte, native controls, Tailwind/DaisyUI, Vitest, and Playwright already in the repository. |
| Context7 | Not needed. The plan does not depend on a new or changed external framework/library/API behavior. | Repository source and tests define the implementation contract. |

## Failure-mode critique

| Failure mode | Trigger | Impact | Detectability | Mitigation | Residual risk |
|---|---|---|---|---|---|
| Soft Utility leaks into excluded surfaces | Global DaisyUI token or generic class override | Assistant, Cook Mode, navigation, or timers change outside approval | Excluded-surface smoke and source review | Change only opt-in `--kitchen-*` / `ui-*` owners; do not edit excluded component files | Low |
| Ribbon clips long copy | Fixed 64/72 px height under Dutch or 200% text | Title/action becomes unreadable or unreachable | Geometry and reflow browser assertions | Use normal-size min-height contract and allow wrapping/growth under constrained text | Low |
| A secondary action disappears during header migration | Paired rail is deleted before every caller is rehomed | Existing workflow becomes inaccessible | Action role/count and existing journey tests | Inventory, Meal plan, Shopping, and Recipes callers migrate in GR-1 before rail deletion | Low |
| Controls remain visually inside the header | Caller passes status/search/week/metrics through a compatibility slot | Header dominance survives and a second dialect remains | DOM assertion that green ribbon owns only identity/leading/action | Remove the payload slot; use sibling `ui-page-utility`; no compatibility prop | Low |
| Frame removal erases group boundaries | Borders are removed without spacing/dividers/headings | Long lists become harder to scan | Long-content browser states | Migrate to named `ui-list-group` rhythm before deleting `ui-section-frame` | Low |
| Desktop visual order conflicts with keyboard order | CSS grid repositions Stock or Meal-plan context | Keyboard focus jumps in an unexpected sequence | Tab-order assertions at 1280 px | Keep mobile-first DOM order; use grid areas only when visual order preserves task order | Low |
| Dark surfaces become olive-on-olive | Light tokens are mixed mechanically in dark mode | Warning, field, or secondary action looks disabled | Dark Shopping and Settings focus/state stories | Define explicit charcoal/graphite dark surfaces and restrained semantic accents | Low |
| Recipe no-photo treatment hides useful identity | Placeholder removal also removes title/category space | Recipes become difficult to recognize | Four no-photo and mixed-image fixtures | Make imagery optional; preserve title, category text, metadata, and actions in every row | Low |
| Settings/Login header changes auth or form behavior | Presentation refactor touches server action, enhance lifecycle, or cookie flow | Login or settings save fails | Auth E2E and path-based diff review | Restrict ticket to Svelte markup/classes; no server/API/auth files | Low |
| Existing E2E becomes structure-blind or brittle | Old `.ui-section-frame` assertions are simply deleted | Visual regression can return unnoticed | Source/browser contract review | Replace old selectors with semantic `data-house-style` seams and behavioral geometry checks | Low |
| Retired serif/frame/header code survives | Partial migration leaves old callers or compatibility CSS | Visual drift returns and compounds | Source guard across stable roots | GR-7 deletes recipes after the last caller and fails on reintroduction | Low |
| Fixed surfaces cover newly compact content | Dock/nav/timer offsets change relative to page height | Bottom rows or focus are obscured | Existing fixed-surface and shopping focus checks | Keep `--ui-*` offset ownership unchanged and assert focused content remains above overlays | Low |
| Delivery reaches the wrong revision | Feature branch is mistaken for live or Railway lags main | Unverified production state | Revision-truth script | Merge through GitHub source, supervise `SUCCESS`, compare deployed commit to remote `main`, then canary | Low |

### Persona lenses

- **Scope/value:** the narrowest complete wedge is the stable household-management family. Leaving
  Settings/Login or Recipe detail/edit on the previous dialect would create immediate visible
  drift; including Assistant/Cook/navigation would add risk without serving the approved brief.
- **Architecture/integrity:** existing opt-in semantic roles are the correct seam. Source guards,
  action inventories, and behavior E2E prove the visual refactor does not bypass auth, AH, data,
  or controller boundaries.
- **Design quality:** the hardest first-day failure would be a compact ribbon that clips Dutch copy
  or moves phone actions out of reach. The normal-height/long-copy growth rule and fixed-dock
  checks make that explicit.
- **Developer experience:** the plan removes the paired rail, display-serif token, and generic
  framed-list dialect instead of layering aliases. It adds no dependency or parallel component
  family.

### Steelman

The strongest objection is that a global theme adjustment would ship the palette and typography
with far fewer file changes. That approach is shorter only in the diff: the same generic DaisyUI
roles serve excluded Assistant, Cook Mode, navigation, sheets, and specialized controls, so a
global change would either restyle unapproved surfaces or accumulate exceptions. Evolving the
existing opt-in kitchen seams is the sustainable choice because it confines the blast radius,
preserves route behavior, supports vertical verification, and lets the run delete obsolete
recipes rather than maintain two systems.

**Plan critique recommendation:** GO. The nine tickets each own one observable behavior family,
all realistic P0/P1 execution risks have direct mitigations, rollback is code-only, and no
high-residual-risk failure mode or R3 stage gate remains. No independent model cross-check is
required.

**Deletion test:** no caller migration, compatibility alias, component rename, or source-guard
update is deferred. Assistant, Cook Mode, navigation, schema, auth, provider, and AH work is
excluded rather than postponed; this plan creates no caller or migration pressure for those
surfaces.

## Shipped result

All nine tickets shipped as one code-only visual change. Stable Stock, Meal plan, Shopping,
Recipes index/detail/edit, Settings index/panels, and Login now share the solid 64/72 px Green
Ribbon, neutral route utilities, sans-serif hierarchy, low-frame repeated groups, content-led
Recipe layouts, balanced desktop work areas, and deliberate dark secondary controls.

Three real-browser UI audit rounds covered the approved evidence states and stopped with no
remaining P1-P3 finding. The complete provider-free gate passed 125 unit-test files / 691 tests,
28 primary and 28 secondary authenticated browser stories, clean Svelte diagnostics, and the
production build. The only browser skip is the repository's deliberate connected-AH story; no
provider or real AH request ran.

Rollback remains a single code revert. No schema, auth, runtime configuration, secret, provider,
AH request behavior, persisted household data, or canonical Dutch ingredient seam changed.
