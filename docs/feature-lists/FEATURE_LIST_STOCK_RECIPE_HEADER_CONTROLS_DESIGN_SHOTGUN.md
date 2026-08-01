# Stock and Recipe Header Controls — Focused Design Shotgun

**Status:** ten-direction comparison ready for selection or combination
**Date:** 2026-08-01
**Scope:** `/inventory`, `/recipes`, and `/recipes/[slug]` header controls only
**Supersedes:** the palette-varying header directions in
`FEATURE_LIST_STOCK_RECIPE_HEADER_DESIGN_SHOTGUN.md`

## Corrected intent

The Keukenbrein green header aesthetic is set in stone. This redesign must not reduce, replace, or
reinterpret it. Every direction uses the same established olive gradient, honey eyebrow, serif page
identity, warm paper transition, terra primary action, and translucent on-green secondary controls.

The problem is control composition:

- organise header buttons into an obvious hierarchy;
- reduce accidental visual competition between identity, actions, status, search, sort, and filters;
- make repeated filter use coherent and comfortable;
- use materially less vertical space on phones where composition allows it;
- keep every current page action visible on mobile;
- preserve the current behavior, state, labels, and recovery paths.

Meal Plan and Groceries already feel right. They are reference surfaces for the existing house style,
not implementation targets and not callers of a new contract. The redesign is deliberately local to
Stock, Recipes, and recipe detail.

## Fixed interaction inventory

| Surface | Always-visible page actions | Header-adjacent controls |
|---|---|---|
| Stock | Activity, Add | Ready-meal quick view, target-status quick view, Search, Meals / Ingredients / All stock, Filters |
| Recipes | New meal, Import | Search, Sort, Have all / Freezer staple / Below target, food class, dish type |
| Recipe detail | Back, Plan, Edit, conditional More | Servings/time/freezer metadata; Cooking / Original; NL / EN; translation recovery when present |

The primary actions remain Add, Import, and Plan. Existing secondary actions remain visibly labelled;
More remains visible when its current conditional actions exist. Filter state must remain recognizable,
URL-backed Recipe filter behavior must survive, and selected controls must not rely on color alone.

## Variation axes

The comparison intentionally crosses these axes instead of treating each direction as a recolor:

1. **Placement:** title-row, attached lower rail, right-side dock, or lower-edge seam.
2. **Grouping:** individual buttons, contiguous segmented group, task/context lanes, or compact grid.
3. **Hierarchy:** equal cells, proportional primary weighting, isolated primary anchor, or progressive rows.
4. **Geometry:** rounded rectangles, joined segments, square icon-label tiles, or tab-like controls.
5. **Filter structure:** one scroll rail, grouped quick/category lanes, wrapped matrix, labelled fieldsets,
   or progressive disclosure with an active summary.
6. **Responsive composition:** same-row compression, deterministic stacking, wrapped groups, or a
   breakpoint-specific dock while keeping every page action visible.
7. **Information density:** operationally dense, balanced, or deliberately spacious within the same
   green material.

Typography and palette are not variation axes because the user declared them invariant.

## Ten complete directions

### A. Proportional Workrail — recommended starting bet

Identity stays on the first row. Every page action sits in a distinct lower rail, with the primary
action receiving more width. Filters use two labelled lanes: quick household outcomes first, food or
scope choices second.

- **Strength:** clearest primary action and reliable 320 px behavior without hiding anything.
- **Trade-off:** the extra rail is explicit and can feel formal.
- **Optimizes:** repeated phone use, long Dutch labels, and predictable cross-route hierarchy.

### B. Joined Command Bar

All page actions form one contiguous segmented control. The primary segment uses terra while the
others remain translucent. Filters use matching joined groups separated by semantic labels.

- **Strength:** actions read as one compact family.
- **Trade-off:** adjacent actions can appear mutually exclusive unless boundaries and labels are precise.
- **Optimizes:** density and clean alignment.

### C. Utility + Commit

Secondary utilities occupy a compact leading group; the primary action is an independent trailing
button. Filters remain individually tappable but are grouped under small plain-language labels.

- **Strength:** strongest distinction between “manage/view” and “do the main thing”.
- **Trade-off:** the composition becomes asymmetric.
- **Optimizes:** decision clarity and accidental-tap resistance.

### D. Action Tiles

Every action becomes a compact icon-plus-label tile with equal target size; the primary tile keeps its
terra material. Filter buttons use the same tile rhythm with smaller visual interiors.

- **Strength:** extremely clear touch targets and scannable icons.
- **Trade-off:** equal tile geometry weakens hierarchy and can feel app-launcher-like.
- **Optimizes:** thumb accuracy and quick visual recognition.

### E. Two-Level Ledger

A narrow utility row sits above a stronger task row. On recipe detail, Back/Edit/More form the utility
row while Plan owns the task row. Filters become compact ledger rows with labels and counts.

- **Strength:** separates navigation/maintenance from household work.
- **Trade-off:** uses more vertical space than the densest options.
- **Optimizes:** semantic clarity when three or more action types coexist.

### F. Task and Context Lanes

The header divides horizontally into a task lane and a context lane. Desktop keeps them side by side;
phone stacks the lanes in a fixed order. Filters sit in the context lane as grouped controls.

- **Strength:** scales well when status, sorting, or recovery appears.
- **Trade-off:** more layout rules and a stronger desktop/mobile transformation.
- **Optimizes:** variable state and future translation/error rows.

### G. Compact Button Matrix

Actions use a small grid on phone and one row on desktop. Primary weighting comes from position and
material rather than width. Filters use a two-column or three-column matrix instead of horizontal
scrolling.

- **Strength:** no clipped labels or invisible off-screen filters.
- **Trade-off:** rows can become taller when the available filter set grows.
- **Optimizes:** complete visibility and long-copy resilience.

### H. Inline Action Sentence

Actions sit beside short contextual copy: status or purpose first, controls immediately after. Filter
groups read as labelled sentences rather than an undifferentiated chip rail.

- **Strength:** information arrives directly before the decision it informs.
- **Trade-off:** copy quality and translation length become load-bearing.
- **Optimizes:** comprehension and lower ambiguity between status and action.

### I. Right-Side Button Dock

Desktop gives the header actions a bounded right-side dock while identity and contextual controls own
the left. Phone converts the dock into a full-width bottom rail. Filters remain below as grouped rows.

- **Strength:** fixes the current empty-middle desktop composition and gives actions a stable home.
- **Trade-off:** has the strongest breakpoint-specific change.
- **Optimizes:** desktop balance without sacrificing phone reachability.

### J. Lower-Edge Tabs + Actions

Primary and secondary actions anchor to the lower edge of the green header, while scope/filter controls
continue directly into the paper surface as tab-like buttons. Detail view/language controls use the
same lower-edge rhythm.

- **Strength:** creates the smoothest handoff from header to working content.
- **Trade-off:** action and filter styling must remain clearly distinct to avoid false equivalence.
- **Optimizes:** continuity and reduced visual fragmentation.

## Recommendation without pre-empting selection

Use **A. Proportional Workrail** as the default selection because it best satisfies the known constraints:
all actions remain visible, the primary action is unmistakable, long mobile labels have room, and quick
filters gain explicit grouping. The comparison must still make it easy to choose any whole direction or
combine axes—for example I's desktop dock, C's action hierarchy, and G's filter matrix.

## Required comparison states

The decision workspace renders every direction with equivalent content across:

- Stock, Recipes, and recipe detail;
- 393 px phone and 1280 px desktop crops;
- normal English, long Dutch, and active/attention states;
- populated filters and selected filters;
- conditional recipe More and translation-recovery states.

Interactive demo filters may change their local selected appearance only. They do not call application
routes or persist household data.

## Implementation boundary after selection

This remains R2 presentation work. Implementation may change the three route components and their local
header/control styling, while preserving handlers, URL state, focus behavior, labels, tap targets, and
the existing green design tokens. It must not change Meal Plan, Groceries, schema, auth, persisted data,
provider behavior, Albert Heijn behavior, shopping derivation, or deployment state.
