# Feature List: Primary Page UI Unification

_Status: Shipped - 2026-07-27_

## Problem framing

Stock, Meal planning, Market run, and Recipes already share the Kitchen Ledger palette, serif
display face, warm paper, icons, empty states, chips, list cards, and bottom navigation. They do
not yet share a page-header contract. Each route owns its own gradient, inner gutter, identity
row, title scale, contextual hierarchy, buttons, and responsive rules.

That drift is visible even with equivalent empty data:

| Route | 375 px rendered evidence | 1280 px rendered evidence | Source owner |
|---|---|---|---|
| `/inventory` | 157 px band; 28 px H1 | 117 px band; 40 px H1 | `src/routes/inventory/+page.svelte:835`, `:1179` |
| `/meal-plan` | 171 px band; 19.2 px H1 plus a second 19.2 px week heading | 74 px band; same two-heading structure | `src/routes/meal-plan/+page.svelte:664`, `:1047`, `:1109` |
| `/shopping` | 134 px band; 16.8 px H1 wraps between the long eyebrow and AH status | 110 px band; identity begins far from the common left gutter | `src/lib/components/shopping/WeekNav.svelte:63`, `:162`, `:219` |
| `/recipes` | 125 px band; 18.4 px H1 | 75 px band; 18.4 px H1 | `src/routes/recipes/+page.svelte:341`, `:570` |

Runtime evidence came from an isolated, authenticated, empty fixture database in the light theme
at 375 × 812 and 1280 × 800. None of the four routes produced page-level horizontal overflow.
Populated, Dutch, dark-theme, loading, mutation, and provider-backed states were not exercised in
this planning audit; their source paths are included in the execution matrix.

The goal is not four identical pages. It is one unmistakable page-header grammar with bespoke,
job-specific payloads. Similar controls must share one owner and one visual treatment; unique
content may remain unique.

## Scope

### In

- The route-level olive header frame for `/inventory`, `/meal-plan`, `/shopping`, and `/recipes`.
- One identity-row contract: H1, optional shared eyebrow structure, top actions, gutters,
  gradient, type scale, spacing, focus treatment, and narrow-screen behavior.
- A shared previous/next week navigator for Meal planning and Market run.
- Shared visual recipes for header actions and search fields while keeping page-specific handlers
  local.
- Common body gutters and first-content spacing where all four routes already intend the same
  74-rem centered shell.
- Stock's three mutually exclusive scopes through the existing `SegmentedTabs` primitive, with
  Filters separated as an action because it is not a fourth scope.
- English and Dutch copy adjustments needed to prevent identity-row collisions.
- Light/dark, responsive, keyboard, long-copy, empty, populated, and route-specific status proof.

### Out

- Making all green bands the same height regardless of payload.
- Redesigning Stock stats, Meal planning actions, Market run progress, Recipe filters, list rows,
  empty states, sheets, fixed docks, the bottom navigation, or the Assistant.
- Changing navigation destinations, URL/query semantics, mutations, persisted data, auth, schema,
  AH behavior, shopping derivation, or Dutch canonical lookup fields.
- A new dependency, a global typography replacement, or a redesign of detail/settings routes.
- Journey or information-architecture changes beyond removing false visual equivalence between
  Stock scopes and its Filters action.

## Existing-system inventory

| Existing owner | Keep / change |
|---|---|
| `src/app.css` Kitchen Ledger tokens | Keep palette, display font, contrast floor, motion tokens, and z-scale; add only shared header/action/search/layout recipes. |
| `EmptyState.svelte`, `SegmentedTabs.svelte`, `ui-list-card`, `ui-chip*`, `Icon.svelte` | Reuse. Do not restyle these working primitives as part of the sweep. |
| Four page-local header CSS blocks | Replace with one shared frame plus small route-payload CSS. Remove obsolete copies only after parity. |
| Meal planning and Shopping previous/next markup | Replace with one shared week-navigation component; href construction remains route-owned. |
| Inventory and Recipes search markup | Keep behavior local; apply one shared search-field visual recipe. |
| `NavBar.svelte` | No change. Its active-location behavior and bottom safe area remain authoritative. |

The archived `FEATURE_LIST_KITCHEN_VISUAL_SYSTEM_COMPLETION.md` is shipped historical input. It
correctly established that green is a working surface and that route payloads should be bespoke.
This successor tightens the shared frame that the shipped pass left page-local.

## UI audit findings carried into execution

1. **P2 — Four page-header dialects.** The same route-identity role uses four title sizes, three
   top-row compositions, four padding recipes, and separate button rules. The user must re-parse
   hierarchy on every primary-route switch.
2. **P2 — Meal planning presents a double header.** Page identity and selected week are both
   display headings in the same band. The selected week should remain prominent content, but not
   compete with the sole route H1.
3. **P2 — The same week navigator has two owners.** Meal planning and Shopping duplicate the
   three-column 44 px previous/center/next pattern with different gaps, type, labels, and states.
4. **P2 — Shopping identity collapses on a normal phone.** At 375 px, the long eyebrow, title,
   and AH status share one baseline; “Market run” wraps into a narrow middle column.
5. **P2 — Stock's Filters action looks like a fourth scope.** Its three result scopes and the
   separate Filters launcher share one segmented track even though only the first three are
   mutually exclusive.
6. **P3 — Similar chrome drifts by small local constants.** Header buttons use 0.70, 0.72, and
   0.75-rem radii; inner horizontal padding uses 0.75, 0.875, and 1 rem; action text ranges from
   0.70 to 0.80 rem.
7. **P3 — Reuse intent and implementation disagree.** `SegmentedTabs.svelte` explicitly names
   Inventory as an intended consumer, while Inventory still hand-rolls its scope bar.

## Design shotgun

All three directions preserve the four routes' content and actions. They differ in structure,
typography, density, and interaction emphasis rather than color alone.

| Direction | Visual thesis | Strength | Trade-off | Decision |
|---|---|---|---|---|
| **A — Shared Frame, Bespoke Payload** | One exact olive identity row and shared chrome, followed by a route-owned working payload inside the same band. | Fixes repeated-component drift while preserving Stock stats, week context, progress, and Recipe search where they are useful. | Green bands retain different natural heights. | **Selected by user — 2026-07-27** |
| **B — Quiet Title Rail** | A compact flat-green, sans-serif title bar is identical everywhere; all contextual tools move onto paper below it. | Maximum literal consistency and the smallest green region. | Splits context from identity, duplicates another surface boundary, and weakens the established “green is working UI” rule. | Rejected |
| **C — Working Headline** | Route title becomes a small label; the current task or state becomes the large editorial headline. | Strongest task focus and most expressive hierarchy. | Largest visual change, more copy/state branching, and less literal page-title consistency. | Rejected |

### Header-copy 5 × 5 refinement

Direction A is fixed. The remaining copy choice is rendered as a 25-cell matrix in the companion
HTML:

- **Rows — voice:** Plain, Home, Action-led, Kitchen editorial, and Minimal.
- **Columns — structure:** Title only, Context → route, Route → task, Task → route, and one
  contextual title.
- Every cell shows the complete four-route set at the same header size; a choice applies to all
  four routes, never one route in isolation.
- The user selected **P2 — Plain × Context → route** on 2026-07-27. Apply the complete system:
  `Household → Stock`, `This week → Meal plan`, `This week → Shopping`, and
  `Cookbook → Recipes`. The Dutch strings must preserve meaning and fit rather than mirror the
  English word for word. Do not mix cells route by route.

### Chosen contract: Direction A

- The frame owns the olive gradient, decorative wash, 74-rem maximum, 16 px phone / 24 px wide
  gutters, identity spacing, H1 style, the selected shared copy structure, and shared action
  states.
- Every route renders exactly one H1 in the identity row at the same size and weight.
- All four routes use the selected eyebrow-plus-H1 structure. Routes may not mix structures:
  `Household → Stock`, `This week → Meal plan`, `This week → Shopping`, and
  `Cookbook → Recipes`.
- The payload slot has a shared top gap but no fixed height. It may contain Stock status tiles,
  the shared week navigator, Market run progress, Meal actions, or Recipe search/sort.
- A payload may use strong text or a labelled group, but it does not introduce a second
  route-level display heading.
- Header action variants are `primary`, `secondary`, and `icon`; all keep a 44 px target, shared
  radius, weight, focus, disabled, hover, and dark-theme treatment.
- Meal planning and Market run reuse one previous/next component. Routes still construct their
  own URLs and center content, so navigation behavior does not migrate into a generic state
  machine.
- Inventory and Recipes retain their search handlers but share one field geometry and typography
  recipe.
- Shared grammar ends at the payload boundary. Page-specific status tiles, progress, and action
  group layout do not become a prop-heavy universal component.

The companion HTML records Direction A as selected, renders the 5 × 5 header-copy matrix, retains
the earlier direction evidence, and carries the selected copy and natural-height decision into
`$run`.

## Phase plan

### Phase 1 — Establish the seam through Recipes

1. Add `KitchenPageHeader.svelte` with identity, actions, and payload snippets.
2. Add shared header-action, header-search, and centered-layout recipes to `src/app.css`.
3. Migrate Recipes as the reference route because its header has one identity row and one
   self-contained search/sort payload.
4. Prove English/Dutch, empty/populated, phone/wide, keyboard, and dark-theme parity before
   removing Recipes' old frame CSS.

### Phase 2 — Migrate Stock without flattening its payload

1. Move Stock identity and top actions into the shared frame.
2. Keep the two actionable status tiles as Stock-owned payload content.
3. Apply the shared search recipe.
4. Render Meals / Ingredients / All stock through `SegmentedTabs`; place Filters beside or below
   the control as a clearly separate action.
5. Preserve quick-view selection, Add, Activity, slash focus, filter state, and result grouping.

### Phase 3 — Unify week-based routes

1. Add a shared `KitchenWeekNavigator.svelte` that owns 44 px previous/next geometry, disabled
   state, focus, and center alignment while receiving route-owned hrefs and center content.
2. Migrate Meal planning: apply the selected copy structure, keep one H1, render selected week as
   context rather than a second display heading, and preserve its overflow and
   Shopping/Suggest/Add actions.
3. Migrate Market run: apply the selected copy structure so identity no longer collides with AH
   status, reuse the week navigator, and retain AH status, delivery/meal-plan links, progress,
   tabs, and fixed dock.
4. Verify Back/Forward, focused/past week, current/future week, AH offline/connected, empty,
   populated, and complete states.

### Phase 4 — Cross-route closure

1. Apply the common content gutter/first-gap contract without disturbing Shopping's desktop
   context rail or any fixed overlay clearance.
2. Remove obsolete per-route frame, H1, week-button, action, and search CSS after all consumers
   have migrated.
3. Check the heading outline and the “one H1 per primary route” invariant.
4. Run responsive English/Dutch, light/dark, keyboard, long-content, 200%-equivalent reflow, and
   no-overflow stories across all four routes.
5. Run repository verification, simplify the diff, update lifecycle records, and ship as one
   code-only PR.

## Execution tickets

### Ticket 1 — Shared frame proven on Recipes

- **Observable behavior:** Recipes uses the selected shared identity row, action styling, search
  styling, and gutters without changing search, sort, filter, import, or new-meal behavior.
- **Scope in:** shared frame API; CSS recipes; Recipes migration; required English/Dutch copy.
- **Scope out:** Recipe result cards, filters, mutations, and detail routes.
- **Target files:** `src/lib/components/ui/KitchenPageHeader.svelte`, `src/app.css`,
  `src/routes/recipes/+page.svelte`, `messages/en.json`, `messages/nl.json`.
- **Risk tier:** R2 — a new cross-route primitive is introduced and proven on one live route.
- **wide_sweep:** true.
- **Verification:** `npm run check`; browser empty/populated, long action labels, search/sort,
  keyboard focus, light/dark, 320/375/768/1280, and Dutch; source heading outline.
- **Rollback:** revert the Recipes migration and new unused primitive together; no data or server
  contract changes.
- **Effort / confidence:** M / high.

### Ticket 2 — Stock frame, search, and scope semantics

- **Observable behavior:** Stock shares the exact identity/action/search grammar; its status tiles
  remain useful; three scopes read as one selection while Filters reads as a separate launcher.
- **Scope in:** frame migration, shared search recipe, `SegmentedTabs` adoption, Filters placement,
  obsolete CSS removal.
- **Scope out:** stock calculations, quick-view logic, item grouping, add/edit/filter sheets, and
  inventory mutations.
- **Target files:** `src/routes/inventory/+page.svelte`,
  `src/lib/components/ui/SegmentedTabs.svelte` only if a compatible consumer fix is required,
  `src/app.css`, `messages/en.json`, `messages/nl.json`.
- **Risk tier:** R1 — localized UI structure and keyboard semantics on one route.
- **wide_sweep:** true.
- **Verification:** Activity/Add; empty/populated; ready/below-target zero and nonzero; quick-view
  toggle/clear; three scope selections; Filters open/close; slash/Escape search; arrow-key scope
  navigation; 320/375/768/1280; Dutch; dark mode.
- **Rollback:** restore the page-local frame/scope markup while leaving shared primitives used by
  Recipes intact.
- **Effort / confidence:** M / high.

### Ticket 3 — Shared week navigator and Meal planning hierarchy

- **Observable behavior:** Meal planning has one route H1 and one shared previous/next navigator;
  week URLs, boundaries, Back/Forward, selected-week context, and actions remain unchanged.
- **Scope in:** shared navigator; Meal frame migration; selected heading/copy system; old
  week-button CSS removal.
- **Scope out:** meal data, suggestion prompts/spend, servings, source choice, optimistic writes,
  and settings behavior.
- **Target files:** `src/lib/components/ui/KitchenWeekNavigator.svelte`,
  `src/routes/meal-plan/+page.svelte`, `src/app.css`, `messages/en.json`, `messages/nl.json`.
- **Risk tier:** R2 — a shared navigation primitive touches URL-driven route behavior.
- **wide_sweep:** true.
- **Verification:** navigation helper tests already present; browser current/future/empty/past,
  boundary, Back/Forward, overflow menu, Shopping link, Add sheet, keyboard focus, long Dutch,
  320/375/768/1280, light/dark.
- **Rollback:** restore Meal's local navigator and frame; the shared component remains unused
  until Ticket 4 or can be reverted with this ticket.
- **Effort / confidence:** M / high.

### Ticket 4 — Market run migration

- **Observable behavior:** Market run shares the identity row and week navigator without title
  wrapping or losing AH, delivery, progress, tabs, run, Add, or Review AH context.
- **Scope in:** `WeekNav.svelte` split/migration, selected heading/copy system, shared frame and
  navigator use, old header CSS removal.
- **Scope out:** shopping projection, list/source semantics, AH preview/push, recurring items,
  mutations, and the active Shopping one-list feature.
- **Target files:** `src/lib/components/shopping/WeekNav.svelte`,
  `src/routes/shopping/+page.svelte`, `src/app.css`, `messages/en.json`, `messages/nl.json`.
- **Risk tier:** R2 — shared responsive/navigation chrome around a domain-critical route.
- **wide_sweep:** true.
- **Verification:** offline/connected; empty/populated/complete; current/future week;
  Back/Forward; progress 0/partial/complete; tabs; fixed dock/nav clearance; long Dutch;
  320/375/768/1280; light/dark. Do not trigger a real AH push.
- **Rollback:** restore Shopping's local hero while keeping the route data and Dutch AH seam
  untouched.
- **Effort / confidence:** M / high.

### Ticket 5 — Four-route parity and delivery

- **Observable behavior:** all four routes share one identity-row geometry and heading hierarchy,
  retain their bespoke payloads, and pass the full verification matrix with no obsolete header
  dialect left in source.
- **Scope in:** common gutters, CSS deletion, browser matrix, repository commands, lifecycle
  updates, scoped PR and post-deploy canary.
- **Scope out:** new UI features or opportunistic detail/settings-page redesign.
- **Target files:** the four route files, the shared primitives, `src/app.css`, this feature list,
  its HTML artifact, and `docs/log.md`.
- **Risk tier:** R2 — cross-route closure and shared-CSS deletion.
- **wide_sweep:** true.
- **Verification:** full matrix below plus `git diff --check`, `npm run check`,
  `npm run test:unit`, and `npm run build`.
- **Rollback:** revert route migrations in reverse order or revert the code-only feature commit;
  no database, auth, provider, or asset restoration is needed.
- **Effort / confidence:** M / high.

## Risk tier, rollout, and rollback

Overall risk is **R2**: four primary routes and shared presentation primitives change, but there
is no schema, auth, persisted-data, external-write, or AH-domain change. `requires_stage_gate` is
false. Beta staging is not required by the repository's R3 rule.

Implement seam-first in route-sized commits, keeping old page-local CSS until each migrated route
passes matched browser evidence. Do not ship a mixed production state; merge the four migrations
as one PR after parity. Rollback is a code revert. If one route fails late, revert only that
migration on the branch while retaining the already-proven shared frame consumers; do not add a
temporary compatibility API that would become a fifth dialect.

## Verification matrix

| Signal | Required evidence |
|---|---|
| Shared identity | Same H1 size/weight, selected H1-only or eyebrow-plus-H1 structure, left gutter, action geometry, gradient, and payload gap on all four routes |
| Heading semantics | Exactly one H1 per route; Meal selected week remains clear without a competing display heading |
| Phone | 375 × 812 plus 320 px stress; no title/action collision, clipping, or document overflow |
| Intermediate | 768 px transition; Stock scopes/Filters and Recipe search/sort remain coherent |
| Wide | 1280 × 800; header/content alignment and Shopping context rail agree |
| Effective zoom | 200%-equivalent narrow layout; no clipped controls or hidden primary action |
| Languages | English and Dutch, including long route labels, AH status, action labels, and week copy |
| Themes | Light and dark; shared frame/search/action contrast and visible focus |
| States | Empty and populated on every route; route-specific quick-view, selected week, progress, complete, filter, and status states |
| Keyboard | Header actions, overflow, shared week nav, `SegmentedTabs`, Filters, and search clear/focus order |
| Behavior preservation | Back/Forward and week URLs; Add/Import sheets; no provider call or AH push; existing mutation owners unchanged |
| Source reuse | No page-local H1/header-button/week-button/search geometry remains where the shared owner applies |
| Repository | `git diff --check`, `npm run check`, `npm run test:unit`, `npm run build` |
| Post-deploy | `deploy-canary`: primary routes render, no new console errors or failed requests |

## Plan critique

| Failure mode | Trigger | Impact | Detectability | Mitigation | Residual risk |
|---|---|---|---|---|---|
| Shared frame becomes a prop-heavy universal page builder | Route payload rules leak into frame props | Harder future changes and a new source of drift | High in API review | Limit the frame to identity, actions, and payload snippets; route content stays local | Low |
| Natural payloads are forced to one height | “Consistency” is measured as equal band height | Empty space or compressed controls | High in matched screenshots | Unify identity geometry, not payload height | Low |
| Dutch identity/action text collides | Longer labels meet three-column top rows | Wrapped title or unreachable action | High at 320/375 | Apply one four-route copy structure, reserve identity width, allow action grouping, and test Dutch first-class | Low |
| Meal planning still reads as two headers | Week context retains H2 display treatment | Recurrent hierarchy ambiguity | High in DOM outline and screenshot | One H1 invariant; render week as labelled context/strong text | Low |
| Shared week nav changes URL ownership | Component computes dates or query strings | Broken past/current/Back behavior | High in browser history stories | Component accepts complete hrefs; route helpers remain authoritative | Low |
| Stock Filters still looks selected | Filters stays inside the segmented track | False current-state cue | High in phone capture | Three scopes in `SegmentedTabs`; Filters is a separate labelled button with pressed state only for active filters | Low |
| Shopping loses domain-critical context | Frame migration drops AH/progress/delivery links | Run becomes unsafe or harder to orient | High in state matrix | Treat `WeekNav` split as composition-only; preserve all inputs and source paths | Low |
| Shared CSS leaks into detail/settings pages | Generic selectors replace scoped recipes | Unrelated visual regressions | Medium in full build, low in four-route checks | Use explicit `ui-kitchen-*` classes/component-local CSS, never global H1/button selectors | Low |
| Mixed branch state obscures regressions | Four migrations land before route-level proof | Failure source becomes unclear | Medium | Migrate and verify route by route; delete old CSS only after each parity checkpoint | Low |
| The plan expands into a global redesign | Similar-looking nearby controls invite opportunistic cleanup | Scope and review become unbounded | High in diff review | Keep the reuse inventory explicit; leave working EmptyState/chip/list/nav primitives unchanged | Low |

**Persona check:** The narrow value wedge is the shared primary-route frame and truly duplicated
week/search/action chrome, not every card. Engineering integrity comes from route-owned behavior
and one visual owner. Mobile quality depends on Dutch 320/375 evidence. Developer experience
improves only if obsolete page-local rules are removed in the same plan rather than retained as
aliases.

**Steelman:** Quiet Title Rail is the strongest alternative because it makes the green region
literally identical and removes the temptation to compare unlike payloads. Shared Frame is still
the better fit: the shipped Kitchen Ledger decision intentionally uses green for live working
context, and moving week, progress, status, and search onto a second paper surface would add
another boundary without reducing behavior. A narrow frame API plus route-owned payload slot
delivers exact consistency where roles match and preserves meaningful differences where they do
not.

**Plan critique recommendation:** GO. No P0/P1 blocker or high-residual-risk failure mode remains.
No external model cross-check fired because every residual risk is low. Context7 is not needed:
the plan uses existing Svelte 5 snippet patterns and repository-owned components, with no new
framework/API/dependency claim.

## Resolved decisions

- **Header copy:** P2 — Plain × Context → route. Use the complete four-route system recorded
  above; do not mix voices or structures route by route.
- **Total green-band height:** natural payload height. Keep identity geometry, gutters, actions,
  gradient, and payload spacing identical while useful route-owned content sets total height.

## Delivery evidence

- `KitchenPageHeader.svelte` now owns the shared olive surface, decorative wash, 74-rem frame,
  16/24 px gutters, eyebrow/H1 geometry, top-action slot, and payload gap for all four routes.
- `KitchenWeekNavigator.svelte` now owns previous/next geometry for Meal plan and Shopping;
  both routes still supply complete route-owned hrefs and bespoke center payloads.
- Stock now uses the existing `SegmentedTabs` component for its three scopes, with Filters
  separated as an action. Stock and Recipes share search geometry; all four content areas share
  the same centered gutters.
- The selected P2 copy ships in English and meaning-first Dutch:
  `Household → Stock`, `This week → Meal plan`, `This week → Shopping`,
  `Cookbook → Recipes`; `Huishouden → Voorraad`, `Deze week → Maaltijdplan`,
  `Deze week → Boodschappen`, `Kookboek → Recepten`.
- Browser verification passed 48/48 cases: four routes × 320/375/1280 px × English/Dutch ×
  light/dark. It asserted one H1, exact copy, identical identity height/H1/gutters/payload gap/
  gradient, no horizontal overflow, 44 px repeated targets, Stock scope semantics, and
  route-owned week hrefs. Populated-state, keyboard scope navigation, search, filter-sheet, and
  week-link interactions also passed with no console errors or HTTP failures.
- `git diff --check`, `npm run check` (0 errors/warnings), `npm run test:unit`
  (73 files/445 tests), and `npm run build` passed. No provider request, real AH push, schema,
  auth, or household-data mutation was performed.

## Resume pack

- **Goal:** unify the four primary Kitchen Ledger pages through one shared identity frame and
  truly shared week/action/search/layout chrome while preserving bespoke route payloads.
- **Current state:** shipped; Direction A and P2 — Plain × Context → route are implemented.
  Total green-band height follows each natural route payload.
- **Implementation owners:** `src/lib/components/ui/KitchenPageHeader.svelte`,
  `src/lib/components/ui/KitchenWeekNavigator.svelte`, and shared recipes in `src/app.css`.
- **Pending verification:** post-deploy canary only.
- **Open questions:** none.
