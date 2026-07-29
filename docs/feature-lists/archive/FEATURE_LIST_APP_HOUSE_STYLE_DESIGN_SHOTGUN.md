# Design Shotgun: App House Style

_Status: Shipped_

## Decision to make

Choose a component-level house style that makes Keukenbrein feel like one app without forcing its
routes into one layout.

The current visual direction is good. The four primary routes now share the Kitchen Ledger palette,
paper background, olive utility header, serif route title, common page gutters, icon family, and
bottom navigation. The remaining problem is smaller but repeated: body sections, cards, buttons,
pills, fields, and local states use several nearby visual recipes. Those differences make a route
change feel slightly more like a product change than it should.

The output of this review is a visual-system direction and a set of explicit component rules. It is
not an implementation pass.

## Grounded evidence

Repository and synthetic authenticated fixture evidence was inspected on 2026-07-29 at a common
393 × 852 viewport.

### What is already shared and should remain

- `KitchenPageHeader.svelte` owns the olive identity frame for Stock, Meal plan, Shopping, and
  Recipes.
- `KitchenWeekNavigator.svelte` shares week navigation between Meal plan and Shopping.
- `src/app.css` owns the Kitchen Ledger palette, paper/card materials, display face, motion, shared
  gutters, header actions, search, list cards, form cards, and three chip recipes.
- The route bands remain job-specific: Stock shows stock summaries, Meal plan shows week and
  planning actions, Shopping shows week/AH context, and Recipes shows retrieval and creation tools.
- The existing rule remains binding: green is useful working space, not decorative ceremony.

### Where the remaining drift is visible

| Surface | Current variation |
|---|---|
| Sections | Stock uses ruled ledger groups; Meal plan uses one rounded bordered ledger; Shopping mixes result panels, accordions, source groups, and a fixed dock; Recipes uses rounded tiles; Settings uses a single grouped list. |
| Buttons | Terra filled, olive filled, white-on-green outline, paper outline, ghost, icon-only, square multiplier controls, and dock actions all use nearby but not identical silhouettes and emphasis. |
| Pills | Filters, availability, warnings, source selectors, recipe links, AH state, counts, and short metadata sometimes use capsules and sometimes small cards. |
| Fields | Header search, body search, selects, steppers, and segmented tabs have multiple heights, corner radii, and border treatments. |
| Type | Serif route titles are consistent; body section headings alternate between serif display, uppercase micro-label, sentence-case sans, and card-title treatments. |
| Density | Stock and Shopping are dense operational surfaces; Recipes is more spacious and tiled; Settings is quiet and list-led; Meal plan mixes roomy cards with compact controls. |

These route-specific compositions are intentional. The mismatch to solve is when two components do
the same job but look slightly different, or when the same silhouette means different things.

## Users and jobs

Freek and Ylfa use the app repeatedly on phone-sized screens while planning, cooking, checking
stock, and shopping. They need:

- immediate recognition of primary, secondary, and quiet actions;
- filters that look selectable and status that does not falsely look clickable;
- dense household information that remains calm and scannable;
- familiar component behavior across route changes;
- 44 CSS pixel touch targets without visually oversized chrome;
- light/dark, English/Dutch, long-content, empty, warning, error, loading, disabled, and selected
  states.

## Five directions

All five directions preserve the current information and actions. The comparison artifact renders
the same synthetic Stock specimen and edge states at the same viewport.

### A — Ledger Grammar

**Visual thesis:** Keep Kitchen Ledger almost exactly as it feels today, but reduce it to a strict
grammar: ruled lists for repeated rows, framed panels for focused work, and capsules only for
compact selection or status.

- Layout: route-specific composition inside a shared 8/12/16 rhythm.
- Typography: serif route and section headings; sans-serif controls and metadata.
- Palette: existing paper, olive, terra, honey, and semantic colors.
- Density: balanced and operational.
- Interaction emphasis: terra primary, olive outline secondary, quiet tertiary.
- Main strength: highest continuity with the current app and lowest visual migration cost.
- Main trade-off: consistency comes from rules rather than making every surface literally alike.
- Optimizes: frequent users who already like the app and want drift removed.

### B — Ledger Compact

**Visual thesis:** Treat the app as a dense household instrument: flatter surfaces, tighter rhythm,
small-radius controls, and strong separators carry hierarchy.

- Layout: stacked flat sections and divided rows; fewer freestanding cards.
- Typography: serif retained for route identity, compact sans-serif elsewhere.
- Palette: olive and ink dominate; terra is used sparingly.
- Density: highest of the five.
- Interaction emphasis: row actions and compact toolbars.
- Main strength: fits the most information with the least visual furniture.
- Main trade-off: can feel administrative if whitespace and type hierarchy are not carefully
  protected.
- Optimizes: rapid scanning during shopping and stock triage.

### C — Prep Counter

**Visual thesis:** Build from sturdy work surfaces: squared panels, inset tool strips, clear grid
alignment, and controls that feel like physical kitchen equipment.

- Layout: modular work panels and aligned control groups.
- Typography: sans-serif section headings with serif reserved for route identity.
- Palette: darker olive, parchment, restrained honey, and terra only for committed actions.
- Density: compact-medium.
- Interaction emphasis: explicit pressed states and grouped controls.
- Main strength: clearest distinction between tools, information, and committed actions.
- Main trade-off: the firmer geometry is a visible change from current soft recipe cards.
- Optimizes: error-resistant action under time pressure.

### D — Recipe Folio

**Visual thesis:** Lean into the warm paper identity with editorial headings, generous rules, quiet
outlined controls, and content-led sections rather than card-led layout.

- Layout: paper sheets, headings, rules, and selective framed callouts.
- Typography: strongest serif presence of the five.
- Palette: warm paper and ink lead; olive/terra act as annotations.
- Density: medium with generous reading rhythm.
- Interaction emphasis: text and hierarchy before control chrome.
- Main strength: most distinctive and calm; recipes and meal content feel authored.
- Main trade-off: operational screens need disciplined controls to avoid feeling too delicate.
- Optimizes: browsing, reading, and recipe-led use.

### E — Pantry Tiles

**Visual thesis:** Use friendly modular tiles, soft filled surfaces, larger rounding, and obvious
selected states to make household information approachable.

- Layout: stacked or gridded modules with tinted groups.
- Typography: friendly sans-serif with selective serif headings.
- Palette: broader use of olive, honey, terra, and pale semantic tints.
- Density: roomiest of the five.
- Interaction emphasis: large tap areas, filled selections, and progressive disclosure.
- Main strength: most approachable and easiest to parse at a glance.
- Main trade-off: tile and pill overuse could recreate inconsistency through excess visual
  furniture.
- Optimizes: low-friction casual use and clear touch interaction.

## Sub-decisions

The selected direction does not silently decide every component. The artifact exposes these
independent choices and preselects the recommendations below.

### 1. Surface grammar

**Question:** What should make sections feel related?

- **Mixed by job — recommended:** ruled list for repeated rows, framed panel for focused work,
  tinted inset for notices. This preserves route-specific composition while standardizing meaning.
- One framed container: every major section uses the same card shell. This is easiest to apply but
  risks making the app feel like a dashboard.
- Flat dividers: sections rely on spacing and rules with very few containers. This is calm and
  dense but needs stronger hierarchy for sheets and warnings.

### 2. Control silhouette

**Question:** How round should interactive controls be?

- **Balanced 12 px — recommended:** fields and buttons share a moderate corner; only filters and
  short status use full capsules.
- Compact 8 px: clearer tool-like geometry and more density.
- Soft 16 px: friendlier touch expression but closer to the current tile/card silhouette.

### 3. Pill contract

**Question:** What is allowed to use a capsule?

- **Selection + short status — recommended:** filters, selected scope, connection state, and short
  noninteractive status; interactivity must remain visually distinguishable.
- Selection only: statuses become inline text or badges, giving pills one unambiguous meaning.
- Broad metadata: filters, status, counts, sources, and metadata may all use capsules; expressive
  but most likely to create pill noise.

### 4. Action hierarchy

**Question:** Which visual treatment should mean “the next committed action”?

- **Terra primary — recommended:** terra fill for one committed action, olive outline for secondary,
  quiet text/ghost for tertiary.
- Olive primary: olive fill is the default action; terra is reserved for attention or irreversible
  consequences.
- Contextual primary: each route chooses its accent. This can reinforce route context but weakens
  cross-app predictability.

### 5. Section typography

**Question:** How should body sections announce hierarchy?

- **Serif title + sans metadata — recommended:** sentence-case serif for meaningful sections,
  uppercase micro-label only for small categories/status strips.
- Sans throughout: route title keeps the serif; all body hierarchy uses sans-serif.
- Editorial serif: serif extends to card titles and selected content labels, producing the
  strongest folio character.

### 6. Density rhythm

**Question:** How much breathing room should the default component recipe use?

- **Balanced 8/12/16 — recommended:** 8 px inside compact groups, 12 px within controls/rows, 16 px
  between sections.
- Tight 4/8/12: best information density, with touch targets maintained through invisible padding.
- Roomy 12/16/24: easiest casual scanning, but primary operational pages show less content.

## Recommendation

Start from **A — Ledger Grammar** with all six recommended sub-options.

This directly matches the brief: the current atmosphere is already successful, so the highest-value
move is to define meanings and owners for existing visual materials. It also gives implementation a
clear simplification test: a local recipe should either become a shared semantic primitive or remain
route-specific because its job is genuinely unique.

The main uncertainty is whether the current app feels too dense during real shopping and stock use.
If it does, Direction E's larger interaction targets may be worth borrowing without adopting its
tile-heavy surface system. If the app instead feels too card-heavy, Direction B's flatter sections
are the stronger refinement.

## Round 1 decision — approved 2026-07-29

The user selected **B — Ledger Compact**, overriding the initial Ledger Grammar recommendation.
The binding component contract is:

| Decision | Approved outcome | Practical meaning |
|---|---|---|
| Base character | Ledger Compact | Flatter surfaces, tight rhythm, compact controls, strong separators, and little visual furniture |
| Surface grammar | Mixed by job | Ruled repeated rows, framed focused work, and tinted notices; routes keep their own composition |
| Control silhouette | Compact 8 px | Tool-like controls remain visually distinct from larger section containers |
| Pill contract | Selection + short status | Filters and compact status may use capsules, but interactive and informational states must remain unmistakable |
| Action hierarchy | Terra primary | One terra committed action, olive outline secondary, and quiet tertiary |
| Section typography | Serif title + sans metadata | Warm section identity with compact, scannable controls and supporting copy |
| Density rhythm | Tight 4/8/12 | Highest visual density while every touch target remains at least 44 CSS pixels |

The user also set a binding exception rule:

- Remove the leading vertical stripe from general components and repeated rows.
- Keep a leading stripe only where it communicates **recipe categorization**. The stripe is category
  data, not decoration, and must not appear on Stock, Shopping, Meal plan, Settings, notice, or
  generic list-row components.

## Focused refinement round — compact actions

The remaining question is not whether the app should be compact. It is which compact button and
action treatment should carry the approved hierarchy without making the app feel administrative.
Every refinement below keeps the approved contract and shows equivalent content at the same
viewport.

### 1 — Flat Keys

**Visual thesis:** Use crisp flat fills, one-pixel outlines, and quiet text actions with no depth
effect.

- Primary: flat terra fill.
- Secondary: paper fill with olive outline.
- Tertiary: borderless text or icon action.
- Filter: olive-filled active capsule.
- Strength: clearest hierarchy and closest to the approved compact direction.
- Trade-off: least expressive of the five.
- Optimizes: immediate recognition across every route.

### 2 — Inset Keys

**Visual thesis:** Give compact buttons a small inset edge and pressed movement so they feel like
durable physical controls.

- Primary: terra fill with a darker lower/inset edge.
- Secondary: pale raised surface with an olive edge.
- Tertiary: contained icon key.
- Filter: compact capsule with a subtle inset selected state.
- Strength: strongest touch feedback without increasing footprint.
- Trade-off: extra depth can feel slightly mechanical or dated if overused.
- Optimizes: confident tapping while shopping or cooking.

### 3 — Joined Rail

**Visual thesis:** Align related actions into compact attached rails with divided cells and one
terra commitment cell.

- Primary and secondary actions share one bounded rail.
- Filters may use a compact segmented track when they are mutually exclusive.
- Independent actions must retain separators and labels that prevent a false toggle meaning.
- Strength: most space-efficient alignment for repeated action pairs.
- Trade-off: attached controls can imply mutual exclusivity when the actions are actually
  independent.
- Optimizes: dense docks, card footers, and repeated operational rows.

### 4 — Marked Keys

**Visual thesis:** Pair each label with a small contained icon block so action type is recognizable
before the full label is read.

- Primary: terra key with a darker icon cell.
- Secondary: paper key with a pale olive icon cell.
- Tertiary: compact icon-only key only when the icon is already established and an accessible
  name remains.
- Strength: fastest visual differentiation between action types.
- Trade-off: long Dutch labels and weak icons can create clutter rather than clarity.
- Optimizes: repeated actions whose icons are already familiar.

### 5 — Quiet Commit

**Visual thesis:** Let content lead by filling only the one committed action and reducing every
other action to a low-chrome treatment.

- Primary: flat terra fill.
- Secondary: borderless olive text with a generous hit area.
- Tertiary: muted text or icon.
- Filter: outlined capsules with one olive active state.
- Strength: calmest and visually lightest compact system.
- Trade-off: secondary actions may become too easy to miss.
- Optimizes: content-led pages such as Recipes and Settings.

## Compact-action sub-decisions

The focused comparison exposes independent choices rather than making the selected version silently
decide every caller.

### A. Primary width

- **Content-fit — recommended:** the primary uses only the width its label needs; preserves room for
  context and secondary actions.
- Proportional: the primary receives roughly two-thirds of a paired row.
- Full row: the primary spans the available width and secondary actions move above or below.

### B. Secondary emphasis

- **Outline — recommended:** paper fill and olive border; clear without competing with terra.
- Tonal: pale olive fill with no strong border.
- Text: borderless olive label with a full 44 px hit area.

### C. Icon role

- **Leading line icon — recommended:** established icons may precede labels without gaining their own
  container.
- No icon: labels carry the full meaning.
- Contained icon cell: the icon occupies a distinct leading block inside the key.

### D. Paired-action grouping

- **Separate — recommended:** independent actions keep their own boundaries and spacing.
- Joined rail: related actions share an outer boundary with a clear cell divider.
- Responsive stack: compact row on wide screens and full-width stack on narrow screens.

### E. Pressed feedback

- **Tint + 1 px movement — recommended:** pressed state darkens slightly and moves one pixel without
  changing layout.
- Inset edge: a dark lower edge collapses on press.
- Tint only: color changes without movement.

The focused comparison workspace is:

`docs/artifacts/2026-07-29-design-shotgun-app-house-style-compact-actions.html`

## Component configurator refinement

The bundled action-system comparison did not provide enough useful variety. It also made the
independent sub-decisions feel disconnected from the specimen that they changed. The active
focused workspace is therefore a component configurator rather than another theme comparison.

The following requirements are binding for this refinement:

- Ledger Compact remains the fixed base; the configurator does not reopen overall density,
  palette, type pairing, or corner-radius direction.
- Every option is shown as a real mini-preview, and selecting it immediately changes the same
  component in one persistent live app specimen.
- Choices are independent by component family. A joined rail may be selected for content actions
  without also joining header actions, fields, filters, or unrelated controls.
- Compact pills are restored as the recommended filter treatment: the visible pill may be 32 px
  high inside a 44 px interactive target.
- Each family offers five to ten visibly and behaviorally meaningful options. Cosmetic duplicates
  do not count as variety.
- The workspace includes useful whole-system starting points, but presets never replace
  mix-and-match control.
- Every family supports a verbatim note and explicit deferral. The untouched recommended state is
  valid.
- Saved-state schema is versioned so the former bundled-theme selections cannot silently map onto
  unrelated component choices.

### Families and option breadth

| Component family | Options | Recommended starting point |
|---|---:|---|
| Primary action | 8 | Flat terra key |
| Secondary action | 8 | Olive outline key |
| Tertiary and icon action | 6 | Text + leading icon |
| Filters and compact pills | 10 | Compact outline pills |
| Header action grouping | 5 | Separate keys |
| In-content action grouping | 7 | Separate pair |
| Search, select, and fields | 7 | Compact outline field |
| Sections and repeated rows | 6 | Flat ruled ledger |
| Notices and short states | 6 | Tinted inset notice |
| Recipe category marker | 5 | Category-only left stripe |

The category marker is the only family where a leading stripe is a recommended option. Generic
rows, cards, notices, and buttons must not acquire a left stripe.

### Configurator usability

- The active family is chosen from a compact, scannable family rail with completion state.
- The option gallery keeps each radio control, visible specimen, name, and short consequence in
  one selectable card.
- A sticky live specimen remains visible beside the options on wide screens and moves below them
  on narrow screens.
- Preview controls cover phone/desktop width, light/dark, normal/long-content, disabled, selected,
  warning, and loading stress.
- The selection summary names every family and can reopen that family directly.
- The generated handoff records fixed contracts, selected options, accepted recommendations,
  overrides, deferrals, notes verbatim, uncertainty, and the implementation consequence of each
  choice.

## Boundaries for a later implementation plan

- Keep route-specific information architecture and green-band payloads.
- Do not change navigation, mutations, stored data, schema, auth, AH behavior, AI behavior, or
  Dutch canonical lookup fields.
- Do not create one universal component that accepts enough variants to reproduce all current
  drift.
- Prefer a small semantic family: action, field, filter, status, section, repeated row, notice,
  empty state, and overlay.
- Consolidate callers completely when two existing recipes have the same role.
- Verify 320/393/768/1280 px, light/dark, English/Dutch, keyboard, reduced motion, long copy,
  empty/populated, warning/error, loading, disabled, and selected states.

## Review output

The companion artifact is:

`docs/artifacts/2026-07-29-design-shotgun-app-house-style.html`

The active focused-refinement artifact is:

`docs/artifacts/2026-07-29-design-shotgun-app-house-style-compact-actions.html`

Its generated handoff must record:

- selected direction;
- every sub-decision, including accepted recommendations and overrides;
- notes verbatim under the decision they address;
- assumptions or evidence the reviewer believes should change;
- requested follow-up work.

## Final component selection — approved 2026-07-29

The component configurator handoff contains no deferrals and no reviewer notes. The final house
style is:

| Component family | Decision | Status | Implementation reading |
|---|---|---|---|
| Primary action | Flat terra key | Accepted recommendation | One flat terra commit action per region; do not force a primary where the region has no commit action. |
| Secondary action | Olive outline key | Accepted recommendation | Paper/olive outline for useful non-committing actions. |
| Tertiary and row action | Ghost square | Override | Use a borderless tonal 44 px square for established icon actions; unfamiliar actions retain a visible label rather than becoming mystery icons. |
| Filters and compact pills | Compact square chips | Override | Six-pixel visual chip inside a 44 px interactive target; selection and short status get separate semantics. |
| Header action grouping | Proportional split rail | Override | A 42/58 joined rail only for a genuine fixed action pair. Stock and Recipes qualify; Meal plan's single overflow action and Shopping's AH status do not. |
| In-content action grouping | Separate pair | Accepted recommendation | Related content actions keep independent 8 px boundaries and compact spacing. |
| Search, select, and fields | Olive tonal field | Override | Pale olive editable surface with an explicit focus, disabled, error, and dark-theme contract. |
| Sections and repeated rows | Framed list | Override | One light outer frame contains a repeated row group; standalone content cards and working panels remain distinct. |
| Notices and short states | Raised paper alert | Override | Paper notice with a tactile lower edge; severity remains explicit through icon, copy, and restrained semantic color. |
| Recipe category marker | Category left stripe | Accepted recommendation | Recipe cards retain a textual category and gain a category-derived stripe. No other generic component may use a leading stripe. |

The final implementation must also preserve every fixed contract from the handoff:

- Ledger Compact base, 4/8/12 visual rhythm, 8 px controls, and 44 px interaction targets;
- terra primary, olive secondary, and quiet tertiary hierarchy;
- serif meaningful section titles with sans-serif metadata and controls;
- 32 px compact visuals are allowed only inside a 44 px target;
- no generic leading stripes;
- route-specific information architecture and useful green-band payloads remain unchanged.

## Implementation intent

Implement the approved house style across stable household-management surfaces without creating a
second styling layer. The seam is **semantic opt-in recipes plus narrow behavior components**:

- `src/app.css` owns tokens and visual recipes for primary, secondary, tertiary, field, section,
  and recipe-marker roles.
- A small component owns behavior only where native markup otherwise drifts: a two-action header
  rail, selectable filter chip, noninteractive status badge, and raised notice.
- Native buttons, links, inputs, selects, and the existing `PendingButton` consume the semantic
  recipes directly. Do not wrap every element in a universal component.
- Same-role callers migrate completely within their ticket and the retired recipe is deleted.
  Do not keep aliases or compatibility variants that preserve the old drift.

### Stable implementation scope

**In scope**

- Stock, Meal plan, Shopping, Recipes, recipe detail/edit, Settings and Settings children.
- Their stable sheets, forms, empty states, repeated rows, status badges, and action regions.
- The Login button and fields because they are the same generic action/field roles.
- Shared presentation primitives in `src/lib/components/ui/`.
- Shared classes used by stable inventory, meal-plan, shopping, recipe, and settings components.
- A durable source guard, browser contract suite, and `docs/ui-house-style.md`.

**Out of scope**

- Navigation destinations, route/query meaning, mutations, persistence, schema, auth behavior,
  AH behavior, AI behavior, and Dutch canonical lookup fields.
- The in-flight request-driven Assistant correction, including `ButlerBrief.svelte`,
  `ChatView.svelte`, and Outcome Docket work. Its final stable controls may adopt this house style
  when that plan owns them; this plan must not edit a surface that is concurrently being replaced.
- Cook Mode's timeline, counter board, timers, and timer chips. These are purpose-built cooking
  controls, not generic filters, fields, notices, or rows.
- Bottom navigation, `SegmentedTabs`, checkboxes, radios, quantity steppers, drag handles, and
  shopping completion checkboxes. Their interaction pattern is not one of the selected families.
- A global DaisyUI override, a new dependency, a typography replacement, or one universal
  component with visual-variant props.

The exclusions are role boundaries, not deferred duplicate callers. In-scope primary, secondary,
tertiary, filter, status, field, repeated-list, notice, and recipe-marker callers must all migrate
in this run.

## Existing-system inventory

| Current owner | Evidence | Plan treatment |
|---|---|---|
| Kitchen Ledger tokens and motion in `src/app.css` | Palette, contrast floor, safe areas, z-scale, and reduced-motion guard are already shared. | Preserve; add semantic tokens/recipes after the DaisyUI theme layer. |
| `KitchenPageHeader.svelte` | All four primary routes already share identity geometry and route-owned payloads. | Preserve the frame; add only responsive placement needed by the selected action rail. |
| `KitchenWeekNavigator.svelte` | Meal plan and Shopping already share route-owned week navigation. | Preserve unchanged unless class adoption is required. |
| `.ui-kitchen-header-action*` | Stock and Recipes have two actions; Meal plan has one overflow action; Shopping passes AH status through the action slot. | Replace paired actions with a narrow rail; classify overflow as tertiary and AH state as status. |
| `.ui-chip*` | The same utilities currently style interactive filters and noninteractive metadata/status. | Split into selectable `FilterChip` and noninteractive `StatusBadge`; retire the overloaded utilities in stable scope. |
| `.ui-list-card` | Used by repeated row groups, Settings navigation, Meal plan, and standalone Recipe cards. | Replace repeated groups with `ui-section-frame`; keep recipe/content cards separately named. |
| `.ui-kitchen-search`, DaisyUI input/select classes, and local field CSS | Rendered fields currently use 12 px, 16 px, capsule, and underline-like silhouettes. | Consolidate generic inputs/selects/search to one tonal 8 px field recipe; keep role-specific checkboxes/steppers. |
| `PendingButton.svelte` | Correctly owns busy/disabled behavior but every caller passes a local DaisyUI visual class. | Keep behavior; migrate stable callers to semantic action classes and make its default semantic. |
| Existing notice components and inline alert blocks | Severity and recovery behavior are route-owned, while materials vary. | Reuse behavior/copy; render material through one raised notice component. Inline field validation remains inline. |
| `food_categories.ts` and Recipe index card | Category has normalized text but no display-accent mapping; the Recipe card currently uses a generic list-card surface. | Add a pure category-accent projection with a tested fallback; keep the textual category and apply the stripe only to Recipe cards. |
| `src/app.css` documentation comment | It points to missing `docs/v2-ui-primitives.md`. | Replace the stale reference with durable `docs/ui-house-style.md`. |

## Focused UI and UX audit

The planning audit used the repository's isolated, authenticated E2E household fixture and a real
Chromium browser. It made no provider request, AH push, real database read, or production write.

### Rendered baseline

| Surface | 393 px evidence | 1280 px evidence | Preserve |
|---|---|---|---|
| Stock | One H1, no page overflow; header actions use 11.2 px corners, search 12 px, and repeated controls mix 6/8 px and capsules. | Same hierarchy and no overflow. | Radar payload, scopes, filters, quick view, and row behavior. |
| Meal plan | One H1, no overflow; header controls mix 8/11.5 px, section frame is 16 px, and action groups use local joined and separate recipes. | Same hierarchy and no overflow. | Week navigation, proposal/add actions, URL state, and meal editing. |
| Shopping | One H1, no overflow; filters/selects use full capsules while row actions use 9.6/10.4 px corners. | Same hierarchy and no overflow. | One-list source semantics, focus stability, dock, AH boundaries, and week state. |
| Recipes | One H1, no overflow; header uses 11.2 px, filters are capsules, list cards use 16 px, and Recipe card titles are sans-serif. | Same hierarchy and no overflow. | Search/query state, filters, sort, Plan/Make actions, and card navigation. |
| Settings | One H1, no overflow; the root grouped list uses a 16 px generic list-card. | Same hierarchy and no overflow. | Settings navigation and child-route form behavior. |

The browser audit confirms the task is recurrent component drift rather than current responsive
breakage. Runtime dark/Dutch, warning/error, and mutation states were not exercised during
planning; they are mandatory execution evidence below.

### Ranked audit findings

1. **P2 — One visual class carries two meanings.** `.ui-chip*` styles both selectable filters and
   passive metadata/status. This creates false affordance and prevents the selected square-chip
   contract from being implemented safely.
2. **P2 — Same-role actions have several silhouettes.** The primary routes and stable sheets mix
   local DaisyUI keys, page-specific action classes, shared header classes, joined footer cells,
   and borderless text actions. The same “commit” or “secondary” meaning must be re-read per route.
3. **P2 — Generic list-card ownership is overloaded.** Repeated rows and standalone Recipe cards
   share one 16 px rounded surface, blocking the selected framed-list grammar and the recipe-only
   category marker.
4. **P2 — Compact visuals and target size are coupled.** The shared chip utility is 36 px and some
   callers override it to 44 px. The selected compact square needs a deliberate 32 px visual
   inside a 44 px target rather than page-local height overrides.
5. **P2 — Field affordance drifts.** Search, selects, sheet fields, and Settings inputs use several
   backgrounds, radii, heights, and focus treatments. The tonal field must remain unmistakably
   editable in light, dark, disabled, and invalid states.
6. **P2 — Header content is not all the same role.** Stock and Recipes have a fixed action pair,
   Meal plan has one overflow action, and Shopping has noninteractive AH status. A global joined
   header rule would turn status into a control and misrepresent a single action as a pair.
7. **P3 — The intended primitive documentation is missing.** `src/app.css` references a nonexistent
   `docs/v2-ui-primitives.md`, so future callers cannot verify the intended semantic contract.

### UX preservation rules

- Filter migration preserves existing URL state, `aria-pressed`, selection, keyboard order,
  horizontal scroll, and clear/reset behavior.
- Busy buttons preserve their label, spinner, disabled state, duplicate-submit protection, and
  visible success/error result.
- Header rails stack below route identity on narrow or long-copy layouts; the primary remains
  reachable and the route title never competes for the rail's width.
- Status badges are not focusable and have no hover/pressed treatment. Selection chips are real
  buttons with an accessible pressed state.
- Raised notices preserve severity, live-region behavior where present, recovery action, and
  valid user input after failure.
- Framed lists contain repeated rows only. They do not wrap every route section, fixed dock,
  Recipe content card, Bottom Sheet, or bespoke working panel.

## Approach comparison

| Approach | Strength | Failure | Decision |
|---|---|---|---|
| **Semantic opt-in recipes + narrow behavior components** | Centralizes same-role appearance and semantics while native elements and route behavior stay local. | Requires a complete caller migration and a source guard. | **Chosen** |
| Global restyle of DaisyUI `.btn`, `.input`, `.badge`, and `.card` | Smallest initial diff. | Would restyle Cook Mode, Assistant, navigation, checkboxes, and bespoke controls that do not share the selected roles. | Rejected |
| One universal `HouseComponent` with type/context/size/tone/shape props | Makes every variation technically reusable. | Recreates the current drift as an API, hides native semantics, and becomes hard to delete. | Rejected |
| Page-by-page class cleanup with no shared contract | Low local coordination. | Leaves multiple owners and guarantees another round of minor variation. | Rejected |

## Phase plan

### Phase 1 — Establish action meaning

1. Add semantic action tokens/classes and a narrow responsive `KitchenHeaderActionRail`.
2. Apply the proportional rail to Stock and Recipes only.
3. Classify Meal plan overflow as ghost-square tertiary and Shopping AH state as status.
4. Migrate all stable in-content actions to flat terra, olive outline, or justified tertiary
   treatment; preserve separate grouping and busy behavior.

### Phase 2 — Separate selection, status, and input

1. Add `FilterChip.svelte` with a 44 px button and 32 px square visual.
2. Add `StatusBadge.svelte` with no interactive behavior.
3. Migrate every stable filter/status caller and retire `.ui-chip*` in scope.
4. Add the tonal field contract and migrate generic search/input/select/textarea callers while
   keeping specialized controls explicit.

### Phase 3 — Consolidate surfaces

1. Replace repeated-row uses of `.ui-list-card` with the framed-list and serif-title contract.
2. Add the raised paper notice component and migrate stable notice blocks without changing their
   state or recovery behavior.
3. Split Recipe cards from generic sections, add the tested category accent, keep the text label,
   and apply the only permitted leading stripe.

### Phase 4 — Delete drift and prove the system

1. Remove retired stable-scope recipes and page-local duplicates; add a source guard against
   reintroduction.
2. Write `docs/ui-house-style.md` with semantic roles, examples, exceptions, and ownership.
3. Run the full responsive/state/language/theme/keyboard matrix and repository gate.
4. Ship as one code-only PR; supervise Railway and run the privacy-safe authenticated canary.

## Execution tickets

### AHS-1 — Proportional header action rails

- **Observable behavior:** Stock and Recipes show one responsive 42/58 action rail; at narrow or
  long-copy widths the rail moves below identity without clipping. Meal plan retains one
  ghost-square overflow action and Shopping's AH state remains visibly noninteractive.
- **Scope in:** header action classification, rail layout, focus/disabled/pressed states, English
  and Dutch labels.
- **Scope out:** header identity, route payloads, action handlers, navigation, and AH connection
  behavior.
- **Target files:** `src/lib/components/ui/KitchenPageHeader.svelte`, new
  `src/lib/components/ui/KitchenHeaderActionRail.svelte`, `src/app.css`,
  `src/routes/inventory/+page.svelte`, `src/routes/recipes/+page.svelte`,
  `src/routes/meal-plan/+page.svelte`, `src/lib/components/shopping/WeekNav.svelte`,
  `messages/en.json`, `messages/nl.json`.
- **Risk tier:** R2. `wide_sweep: true`. `requires_stage_gate: false`.
- **Verification:** 320/393/768/1280 px; 200%-equivalent reflow; English/Dutch; light/dark;
  keyboard/focus; disabled and pressed states; exact title/action bounding boxes; existing handler
  smoke paths.
- **Rollback:** restore the four header action snippets and remove the unused rail together.
- **Impact / effort / confidence:** 4 / M / high.

### AHS-2 — Stable action hierarchy and separate content pairs

- **Observable behavior:** stable household-management screens use one flat terra commit action,
  olive outline secondary, and justified tertiary treatment; paired content actions keep separate
  boundaries and busy labels remain visible.
- **Scope in:** generic actions in Stock, Meal plan, Shopping, Recipe index/detail/edit, Settings,
  Login, their stable sheets/forms, `PendingButton`, `EmptyState`, and fixed action bars.
- **Scope out:** Assistant/Butler/Outcome Docket work, Cook Mode controls, bottom navigation,
  checkboxes, quantity steppers, and drag controls.
- **Target files:** `src/app.css`, `src/lib/components/ui/PendingButton.svelte`,
  `src/lib/components/ui/EmptyState.svelte`, `src/lib/components/ui/FixedBottomBar.svelte`,
  stable callers under `src/lib/components/{inventory,meal-plan,shopping,recipe-detail,recipe-edit,settings}/`,
  `src/routes/{inventory,meal-plan,shopping,recipes,settings,login}/**/*.svelte`.
- **Risk tier:** R2. `wide_sweep: true`. `requires_stage_gate: false`.
- **Verification:** primary/secondary count and hierarchy per region; anchors and buttons; hover,
  focus, active, pending, disabled, error, and success; duplicate-submit guards; existing E2E
  journeys; `npm run check`.
- **Rollback:** revert semantic action classes and their stable callers as one commit; behavior and
  server state are unchanged.
- **Impact / effort / confidence:** 5 / L / medium-high.

### AHS-3 — Square filter chips and passive status badges

- **Observable behavior:** every stable filter uses a compact six-pixel square visual inside a
  44 px button, while short status/metadata is visibly passive and absent from the tab order.
- **Scope in:** Recipes filters, Stock facets, Shopping list filters/source status, Meal-plan
  short status, Recipe metadata, and Settings short status where the roles match.
- **Scope out:** `SegmentedTabs`, timers, checkboxes, radios, quantity controls, and recipe
  direction tags.
- **Target files:** new `src/lib/components/ui/FilterChip.svelte`, new
  `src/lib/components/ui/StatusBadge.svelte`, `src/app.css`,
  `src/lib/components/inventory/FacetChips.svelte`,
  `src/lib/components/inventory/RecipeRelationshipStatus.svelte`,
  `src/lib/components/shopping/{ShoppingSourceQuickControls,ShoppingLists,ShoppingNotices}.svelte`,
  `src/lib/components/recipe-detail/{RecipeMetaChips,FreezerStockPanel,RoleCoverage}.svelte`,
  `src/routes/{inventory,meal-plan,recipes,settings}/**/*.svelte`.
- **Risk tier:** R2. `wide_sweep: true`. `requires_stage_gate: false`.
- **Verification:** exact 44/32 bounding boxes; `aria-pressed`; keyboard order; selected,
  unselected, disabled, count, long Dutch, horizontal overflow/focus reveal, and passive-status
  tab exclusion; existing filter URL/state tests.
- **Rollback:** restore old chip markup/classes and remove both unused components together.
- **Impact / effort / confidence:** 5 / L / medium-high.

### AHS-4 — Tonal fields

- **Observable behavior:** generic search, input, select, and textarea controls use the same olive
  tonal 8 px field with a clear label/focus/error/disabled/busy contract in light and dark mode.
- **Scope in:** stable primary routes, recipe sheets/editing, Settings forms, Login, and shopping
  embedded selects that perform the same field role.
- **Scope out:** checkboxes, radios, toggles, steppers, code inputs, chat composer, Cook Mode
  counters, and native file input mechanics.
- **Target files:** `src/app.css`, stable form callers under
  `src/lib/components/{inventory,shopping,recipe-detail,recipe-edit,settings}/`,
  `src/routes/{inventory,meal-plan,shopping,recipes,settings,login}/**/*.svelte`.
- **Risk tier:** R2. `wide_sweep: true`. `requires_stage_gate: false`.
- **Verification:** label association; input type/inputmode/autocomplete preservation; 44 px
  single-line height; textarea resize/content; focus-visible; invalid/error recovery; disabled;
  long values; dark contrast; mobile keyboard metadata; existing form submit/recovery paths.
- **Rollback:** revert field classes/callers; no values, actions, or server validation change.
- **Impact / effort / confidence:** 4 / L / medium.

### AHS-5 — Framed repeated lists and section typography

- **Observable behavior:** repeated row groups share one light 8 px frame and meaningful
  sentence-case serif section title, while metadata/category labels stay sans-serif and
  route-specific composition remains intact.
- **Scope in:** Stock row groups, Meal-plan week rows, Shopping ledger groups, Settings grouped
  navigation/forms, and repeated Recipe detail/edit groups.
- **Scope out:** Recipe content cards, Bottom Sheets, fixed docks, empty states, hero/payload
  panels, chat cards, Cook Mode steps, and one-off focused work panels.
- **Target files:** `src/app.css`, `src/routes/{inventory,meal-plan,shopping,settings,recipes}/**/*.svelte`,
  stable repeated-row components under `src/lib/components/{inventory,shopping,recipe-detail,recipe-edit,settings}/`.
- **Risk tier:** R2. `wide_sweep: true`. `requires_stage_gate: false`.
- **Verification:** short/long/multiline rows, empty/single/populated groups, row alignment,
  keyboard links, 320/393/768/1280 px, 200%-equivalent reflow, English/Dutch, light/dark, and no
  document overflow.
- **Rollback:** restore previous list classes per migrated group; no content/data rollback.
- **Impact / effort / confidence:** 5 / L / medium.

### AHS-6 — Raised paper notices

- **Observable behavior:** stable contextual warnings/errors/status notices share one raised paper
  material while severity, recovery action, announcement behavior, and valid form input survive.
- **Scope in:** Shopping notices/AH results, Recipe import/enhancement notices, Inventory
  reconciliation messages, Settings connection/data warnings, and sheet-level actionable errors.
- **Scope out:** inline field validation, toasts, chat tool results, Cook Mode timer completion,
  and decorative helper copy.
- **Target files:** new `src/lib/components/ui/KitchenNotice.svelte`, `src/app.css`,
  `src/lib/components/shopping/{ShoppingNotices,AhPushResult,AhSheet}.svelte`,
  `src/lib/components/recipe-detail/{ImportReviewBanner,RecipeEnhancementSheet}.svelte`,
  stable notice callers under `src/lib/components/inventory/` and
  `src/routes/settings/**/*.svelte`.
- **Risk tier:** R2. `wide_sweep: true`. `requires_stage_gate: false`.
- **Verification:** info/success/warning/error; role/status/live-region behavior; recovery action;
  long Dutch; failed request preserving values; disabled/loading; light/dark; 320/1280.
- **Rollback:** restore notice markup and remove the unused component; server outcomes remain
  untouched.
- **Impact / effort / confidence:** 4 / M / medium-high.

### AHS-7 — Recipe-only category stripe

- **Observable behavior:** Recipe index cards show a normalized category-derived leading stripe
  plus the existing textual category; no generic row, card, notice, button, or other route shows a
  leading stripe.
- **Scope in:** pure category-to-accent projection, fallback, Recipe card surface split, and
  source/browser guard.
- **Scope out:** schema, stored category values, translations beyond display labels, Recipe detail
  information architecture, and AH lookup data.
- **Target files:** `src/lib/food_categories.ts`, focused unit test,
  `src/routes/recipes/+page.svelte`, `src/app.css`.
- **Risk tier:** R1. `wide_sweep: false`. `requires_stage_gate: false`.
- **Verification:** known/alias/unknown/null category mapping; text label remains; stripe computed
  from normalized category; light/dark; image/no-image; long title; source assertion that no
  generic leading marker exists.
- **Rollback:** remove accent projection/stripe and restore the Recipe card class; no persisted data
  changes.
- **Impact / effort / confidence:** 3 / S / high.

### AHS-8 — Drift deletion, contract tests, documentation, and delivery

- **Observable behavior:** the stable app has no retired same-role visual dialect, the complete
  state matrix passes, and future duplicate recipes fail a source guard.
- **Scope in:** delete retired in-scope CSS/local variants, add a narrow source guard, add
  `tests/e2e/house-style.e2e.ts`, write `docs/ui-house-style.md`, run the repository gate, PR,
  Railway supervision, and privacy-safe authenticated canary.
- **Scope out:** opportunistic redesign, screenshot baselines containing household data, real AH
  preview/push, provider calls, and Assistant/Cook restyling.
- **Target files:** `src/app.css`, new focused guard test under `src/lib/`,
  `tests/e2e/house-style.e2e.ts`, `docs/ui-house-style.md`, this feature list, its plan artifact,
  and `docs/log.md`.
- **Risk tier:** R2. `wide_sweep: true`. `requires_stage_gate: false`.
- **Verification:** matrix below; `git diff --check`; `npm run check`; `npm run test:unit`;
  `npm run test:e2e`; `npm run test:e2e:secondary`; `npm run build`; final `npm test`; privacy-safe
  post-deploy canary.
- **Rollback:** revert the code-only feature PR. No database, auth, provider, AH token, or asset
  restoration is needed.
- **Impact / effort / confidence:** 5 / M / high after tickets 1–7.

## Risk, rollout, and verification

Overall risk is **R2**: shared CSS and stable presentation primitives change across many routes,
but there is no schema, auth, persistent-data, provider, or AH-domain change. Beta's R3 stage gate
does not apply. This is a wide UI sweep, not a schema/auth wide sweep.

Implement seam-first in ticket-sized commits. Keep an old recipe only until every same-role caller
within that ticket has migrated and its browser seam passes; delete it before the ticket closes.
Do not merge a production state that mixes old and new component meanings. Rollback is a feature
commit/PR revert.

### Verification matrix

| Dimension | Required evidence |
|---|---|
| Viewports | 320, 393, 768, and 1280 px; plus 200%-equivalent reflow |
| Themes | Light and dark, including tonal field focus/error and ghost-square contrast |
| Languages | English and Dutch with long header, filter, field, status, notice, and action copy |
| Actions | Primary/secondary/tertiary hierarchy; separate content pairs; proportional header rail; hover/focus/pressed/loading/disabled/success/error |
| Filters/status | 44 px target + 32 px visual; selected/unselected/disabled/count; `aria-pressed`; passive status absent from tab order |
| Fields | Label, focus, invalid, disabled, busy, long value, textarea, search, select, and mobile metadata |
| Sections | Empty, single, populated, long/multiline rows, links/buttons, no clipping or false card nesting |
| Notices | Info/success/warning/error, long copy, live region, recovery, preserved valid input |
| Recipe marker | Known/unknown/null category, text label, image/no image, light/dark, recipe-only stripe |
| Route invariants | One H1, no document overflow, green payload unchanged, week URLs/Back/Forward, filters/search/query state, fixed dock/nav clearance |
| Domain safety | No provider request, real AH preview/push, schema/auth change, household DB read, or Dutch canonical ingredient lookup change |
| Repository gates | Focused unit/E2E during tickets; both household accounts; complete `npm test` before PR |

## Failure-mode critique

| Failure mode | Trigger | Impact | Detectability | Mitigation | Residual risk |
|---|---|---|---|---|---|
| Specialized controls inherit generic restyling | Global `.btn/.input/.badge/.card` override | Cook, Assistant, navigation, or checkboxes regress outside scope | Browser matrix may miss a rare specialized state | Use opt-in semantic classes only; never globally restyle DaisyUI roles | Low |
| Split rail collides with route title | 320 px, Dutch, 200% text, or long labels | Primary action clips or becomes unreachable | Bounding-box and overflow assertions | Rail stacks below identity when fit is constrained; 42/58 applies inside its own row | Low |
| Status still looks selectable | Old chip class remains on metadata | False affordance and extra tab stops | Role/tab-order E2E plus source guard | Separate `FilterChip` and `StatusBadge`; no shared interactive base component | Low |
| Compact visual shrinks target | Caller applies visual size to the button itself | Missed taps during repeated mobile work | Exact bounding-box assertion | Two-layer 44 px hit / 32 px visual contract owned by `FilterChip` | Low |
| Ghost square hides meaning | Unfamiliar text action converted to icon-only | User cannot discover the action | Accessible-name scan cannot prove icon familiarity | Use only established icons; retain visible labels for unfamiliar tertiary actions | Low |
| Tonal field loses edit/focus/error affordance | Pale fill blends into a tinted section or dark theme | Input looks disabled or validation is missed | Focus/invalid/dark browser stories | Explicit border/focus/error/disabled tokens; never rely on fill alone | Low |
| Framed list becomes a universal card | Caller wraps every section for consistency | Ledger Compact becomes a dashboard and route composition flattens | Source ownership review and route screenshots | Restrict frame to repeated rows; named exclusions are documented and guarded | Low |
| Raised notice flattens severity | Material replaces semantic role/copy | Warning/error urgency or recovery is missed | Role/live-region and tone state tests | Material is shared; icon, label, role, and restrained semantic accent remain | Low |
| Recipe stripe becomes decorative or color-only | Hard-coded terra on every card or category label removed | Violates the exception and weakens accessibility | Pure mapping tests plus DOM/source guard | Derive accent from normalized category, keep text, fallback explicitly | Low |
| Partial migration preserves two dialects | Compatibility alias or missed caller survives | Drift returns immediately and future callers copy the wrong owner | Source guard and stable-scope caller inventory | Migrate all same-role callers in-ticket, then delete old recipe | Low |
| CSS specificity defeats semantic classes | DaisyUI utility order or page-local class wins | Selected option appears inconsistently | Computed-style E2E on representative callers | Keep semantic layer ordering explicit and delete conflicting local rules | Low |
| In-flight Assistant work overlaps the sweep | House-style run edits `ChatView`/`ButlerBrief` concurrently | Merge conflict or styles a surface scheduled for removal | Worktree/active-plan check at `$run` intake | Keep those files out of this plan; adopt primitives only in the Assistant-owned final surface | Low |

### Persona lenses

- **Scope/value:** the narrowest complete wedge is stable household-management UI; including the
  in-flight Assistant or specialized Cook Mode would add conflict without improving cross-page
  recognition.
- **Architecture/integrity:** opt-in semantics preserve Svelte/native behavior and the Dutch AH
  seam; source guards prove retired generic roles are not reintroduced.
- **Design quality:** the highest mobile risk is the proportional rail under Dutch/zoom, so it gets
  an explicit stack rule and first-ticket browser proof.
- **Developer experience:** four narrow behavior components plus documented CSS roles replace
  dozens of caller recipes; no dependency or preview framework is added.

### Steelman

The strongest alternative is a global DaisyUI theme adjustment because it would change far fewer
files. That simplicity is deceptive: the same DaisyUI classes currently serve navigation,
checkboxes, Cook Mode, Assistant controls, one-off dialogs, and the household components selected
here. A global override would make unlike roles look alike and move drift into exceptions.
Semantic opt-in recipes are the better long-term fit because they centralize only proven same-role
callers, preserve native behavior, and let the final guard delete the old dialect rather than
layer over it.

**Plan critique recommendation:** GO. The plan has no unresolved P0/P1 blocker or high-residual-risk
failure mode. No external model cross-check fired. Context7 is not needed because the plan adds no
framework, library, API, or dependency behavior; it reuses the repository's existing Svelte 5 and
native-control patterns.

## Open Questions

None. The exported component handoff has no deferrals and no reviewer notes. The responsive header
fallback, semantic exceptions, and stable-surface boundary above are implementation readings that
follow directly from the approved contract.

## Resume pack

- **Goal:** implement the approved Ledger Compact component house style across stable household
  surfaces while preserving route composition and behavior.
- **Current state:** all eight tickets are implemented and the provider-free gate is green.
- **First command:** `$run`
- **First files:** `src/app.css`, `src/lib/components/ui/KitchenPageHeader.svelte`,
  `src/routes/inventory/+page.svelte`, `src/routes/recipes/+page.svelte`.
- **Pending verification:** Railway revision truth and the privacy-safe authenticated canary are
  delivery checks after merge.
- **Open questions:** none.

## Implementation outcome — 2026-07-29

Implemented the ten approved component decisions across stable household-management surfaces.
Semantic actions, the proportional header rail, filter/status separation, tonal fields, framed
lists, serif section titles, raised notices, and the Recipe-only category stripe now have shared
owners. Retired same-role recipes were deleted rather than aliased. Assistant, Cook Mode,
navigation, mutations, persistence, auth, providers, AH behavior, and Dutch canonical lookup
fields were not changed.

The new source guard rejects retired recipes and generic leading markers. The dedicated browser
contract covers 320/393/768/1280 px, exact 42/58 rails, 44/32 chips, passive status, tonal field
focus/error, light/dark, English/Dutch, raised notices, and the category stripe. The complete gate
passed 125 unit-test files / 690 tests, 28 primary and 28 secondary authenticated browser stories,
clean Svelte diagnostics, and the production build. Each browser account retained one expected
opt-in connected-AH skip; no provider request, real AH preview/push, household database read, or
authenticated evidence artifact was used.

Context7 was not used because this internal presentation change did not alter an external library,
framework, API, or dependency contract.
