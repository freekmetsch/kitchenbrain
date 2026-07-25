# Feature List: Stock Radar Fidelity Recovery

_Status: Shipped - 2026-07-25 (Responsive Radar Band restored the meals-first Stock Radar)_

## Problem framing

The shipped inventory page preserves the Stock Radar's data and recipe-relationship behavior, but
does not preserve the approved interface. It renders as a generic white dashboard with a narrow
filter sidebar and kind-based shelves. The approved direction is an outcome-first meal radar with
an olive attention surface, editorial headings, a compact searchable ledger, and explicit
`Use next` / `Still plenty` grouping.

The next implementation must rebuild the composition, not layer more styling over the current
shelves.

## Scope

### In

- Faithful responsive Stock Radar composition at 375, 768, and 1280 CSS pixels.
- Meals-first scope with Ingredients, All stock, and Filters available from the same screen.
- Explainable attention rules, priority cards, compact ledger rows, and quiet recipe state.
- Existing search, inventory writes, recipe relationship management, editing, activity, review,
  ghost-row, undo, staple, deep-link, empty-state, English, Dutch, light-theme, and dark-theme
  behavior.
- Browser comparison against the approved Stock Radar design artifact.

### Out

- Database migrations, inventory-write changes, authentication changes, Albert Heijn changes, AI
  behavior, or a global redesign of unrelated routes.
- New dependencies or a global font/theme replacement.

## Chosen product behavior

### View model

- Default scope: `Meals`.
- `Use next`: positive-stock meals that are below target, have at most 2 portions, expire within
  7 days, or have been stored for at least 21 days.
- Attention-copy precedence: expiry/use-soon, below target, then low stock.
- `Use next` sorting: quantity ascending, nearest expiry, oldest stock, then name.
- `Still plenty`: remaining positive-stock meals.
- `Cook again`: zero-stock keep-stocked meals and existing ghost rows.
- `Below target` keeps the existing definition: a linked keep-stocked recipe with a target above
  current portions.
- Search remains case- and accent-insensitive and filters the priority cards and current ledger
  from the same dataset.
- Recipe coverage is calculated once from visible meals.

### Shared visual contract

- Light palette: olive `#334638`, honey `#d3a046`, terracotta `#a84d2a`, warm paper surfaces.
- Serif display headings; sans-serif controls and row content.
- Immediate quantity controls stay outside sheets.
- Settled recipe relationships are icon-only; unresolved remains textual.
- The coverage legend and row controls use one shared relationship-status component.
- The assistant and bottom navigation may not cover quantity or recipe controls.

## Design directions

The accompanying design-shotgun artifact renders all three directions with the same fixture,
viewport, search state, recipe state, and empty state.

### A. Prototype Literal — recommended

Restores the approved refinement almost literally: substantial olive radar panel on desktop,
paper ledger beside it, compact mobile header and summary, and bordered `Use next` cards.

- Best fidelity to the already-approved direction.
- Most page-specific composition and styling.
- Default for `$run` unless Freek selects another direction.

### B. Responsive Radar Band — selected

Uses an olive summary band across the top at every breakpoint, followed by a full-width dense
ledger. It keeps the radar identity while giving the ledger more desktop width.

- Strongest continuity between mobile and desktop.
- Weaker match to the approved split-panel desktop.
- Implementation note: omit the redundant `What can we use next?` headline while preserving the
  full-width outcome band, statistics, search, scope controls, coverage, and responsive ledger.

### C. Editorial Pantry

Uses a warm paper field, large serif group headings, and an editorial card stack with olive used
as an accent rather than a full panel.

- Calmest reading experience and clearest group rhythm.
- Least faithful to the approved desktop silhouette.

## Phase plan

### Phase 1 — Pure Stock Radar model

- Add internal scope and attention types and pure grouping/sorting helpers.
- Return Amsterdam-local `todayIso` in page data.
- Lock low-stock, expiry, aging, below-target, zero/ghost, search, scope, and coverage behavior
  with unit tests.

### Phase 2 — Selected responsive composition

- Replace the generic `max-w-6xl` dashboard and default kind shelves with the chosen direction.
- Mobile: compact context/header, summary, search, scope controls, recipe coverage, and meal
  groups.
- Desktop: the selected radar/ledger composition with no ingredient shelves under default Meals.
- Keep page-specific visual tokens local to inventory.

### Phase 3 — Rows, sheets, and preservation

- Refactor the existing inventory row into shared card/ledger presentations without duplicating
  write behavior.
- Replace the main-screen facet rail with a Filters sheet, then delete the unused FacetBar.
- Move full item editing/history and Add item into responsive sheets; retain the existing recipe
  and activity sheets.
- Preserve deep links, add recovery, zero/ghost rows, swipe delete, undo, review fixes, staples,
  measured units, and recipe matches.

### Phase 4 — UI/UX proof and release

- Run the same representative fixture through every required state and viewport.
- Compare light-theme 375 and 1280 screenshots directly with the approved design.
- Verify dark theme, long Dutch text, keyboard focus, sheet recovery, no overflow, and no overlay
  collisions.
- Run unit tests, Svelte checks, build, diff check, then the post-deploy canary.

## Verification matrix

| Surface | Required proof |
|---|---|
| Pure rules | Unit tests for attention, sorting, search, scope, coverage, and zero/ghost behavior |
| Mobile | 375 × 812 light/dark; browse, search, recipe sheet, filters, empty, long content |
| Tablet | 768 px single-column geometry and reachable controls |
| Desktop | 1280 × 900 selected composition, priority/ledger agreement, compact density |
| Journeys | Quantity, add, edit, activity, relationship, deep-link, empty recovery, undo |
| Accessibility | Keyboard `/`, Escape, focus restoration, accessible status names, no overlap |
| Repository | `npm run test:unit`, `npm run check`, `npm run build`, `git diff --check` |

## Risk and rollback

Risk tier: **R2**. This is a page-wide UI and shared display-logic change without schema or auth
work.

- Arbitrary priority: every attention card names its reason and the rules are unit-tested.
- Mobile/desktop drift: both use one view model, row component, and relationship-status component.
- Lost legacy behavior: the preservation journeys above are release gates.
- Hidden added/deep-linked rows: selecting an item clears conflicting scope and filters.
- Visual drift: 375 and 1280 screenshot comparison is a mandatory release gate.

Rollback is a code revert. No persisted data requires restoration.

## Shipped outcome

- Implemented direction B as a full-width olive outcome band with one responsive ledger below it.
- Removed the redundant `What can we use next?` headline and the generic desktop sidebar/shelves.
- Added deterministic Use next, Still plenty, and Cook again grouping with localized reasons.
- Kept quantity writes immediate while moving add, edit/history, recipe, activity, and filters into
  focused sheets.
- Reused one recipe-relationship status component in rows and coverage, leaving settled meal rows
  icon-only.
- Preserved scope/search recovery, deep links, ghost rows, review fixes, swipe delete, undo,
  staples, measured units, English/Dutch, light/dark themes, and assistant-safe controls.

### Verification evidence

- Pure model: 9 focused inventory tests; 460 repository unit tests passed.
- Repository: `npm run check` and `npm run build` passed.
- Browser: authenticated fixture at 375 × 812, 768 × 900, and 1280 × 900.
- Journeys: accent-insensitive search, scopes, filters, quantity regrouping, recipe/add/edit sheets,
  deep link, empty recovery, delete/undo, Escape, `/`, and focus restoration passed.
- Visual states: light, dark, and long Dutch copy passed without document overflow.
- Final fresh browser session reported 0 console errors and 0 warnings.

## Decision record

> **Q: Which visual direction should `$run` implement?** - Answered 2026-07-25:
> **B. Responsive Radar Band**. This intentionally prioritizes breakpoint continuity over the
> approved split-panel silhouette. No elements are borrowed from the other directions.

## Resume pack

- Goal: ship a Stock Radar that visibly matches the approved direction while preserving all
  current inventory behavior.
- Current state: the behavior exists, but the composition is generic and visually divergent.
- First command: `$run`.
- First files: `src/routes/inventory/+page.svelte`,
  `src/lib/components/inventory/shared.ts`, and `src/lib/components/inventory/`.
- Selected direction: B. Responsive Radar Band.
- Verification: complete; evidence recorded above.
