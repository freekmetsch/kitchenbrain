# Joined Command Bar — Responsive Refinement Shotgun

_Status: Shipped - 2026-08-01_
**Date:** 2026-08-01
**Scope:** `/inventory`, `/recipes`, and `/recipes/[slug]` header controls only
**Selected parent direction:** B. Joined Command Bar from
`FEATURE_LIST_STOCK_RECIPE_HEADER_CONTROLS_DESIGN_SHOTGUN.md`

## Fixed decisions

- Keep the existing Keukenbrein green header aesthetic exactly: olive gradient, honey eyebrow,
  serif identity, warm paper, terra primary action, and translucent on-green controls.
- Keep the Joined Command Bar treatment: related page actions share one contiguous outer boundary;
  the primary segment remains terra and every current page action remains visible.
- Change only Stock, Recipes, and recipe detail. Meal Plan and Groceries remain untouched references.
- Preserve current handlers, labels, URL-backed Recipe filter state, recovery, focus behavior, and
  minimum touch targets.

## Corrected refinement problem

The first Joined Command Bar specimen still wastes space and handles stress states weakly:

- long recipe names and long Dutch labels compete with the joined action group;
- desktop filter families occupy separate rows even when enough width exists for one composed line;
- mobile chip/toggle rows require scanning and horizontal movement instead of offering a compact
  summary and deliberate filter entry point;
- search, sort, quick household filters, categorical filters, and view/language controls need a
  responsive allocation rule rather than ad hoc stacking.

Interpret “use all available vertical space” as **use the available horizontal width before adding
height**. On desktop, search/sort and both filter families should share one elastic toolbar whenever
their labels fit. On phone, filter toggles may become selects, a dropdown, an inline disclosure, or a
bottom sheet trigger; selected state must remain visible without opening the control.

## Required long-name behavior

- Index titles keep the eyebrow and title together without forcing action labels to shrink.
- Recipe detail titles may wrap to two lines on phone and desktop; ellipsis is a last resort, not the
  default.
- The title region owns the flexible width. Joined actions and selects retain usable targets and
  readable labels.
- At 320–393 px, actions may move to a dedicated joined row but may not disappear.
- Dutch action labels may wrap inside a segment only when the complete action remains legible and the
  segment height stays consistent with its siblings.

## Six complete refinements

### A. Elastic Pair — recommended

Desktop uses one elastic toolbar: Search, Quick filters, Type, and Sort sit beside each other with
proportional widths. Phone gives the title a two-line-safe row, keeps the joined action bar beneath it,
then replaces filter toggles with two side-by-side selects: “Quick filter” and “Type”.

- **Strength:** maximum clarity with only one compact mobile filter row.
- **Trade-off:** two selects expose only one value from each family at a glance.
- **Optimizes:** repeated filtering and long-title resilience.

### B. Combined Filter Menu

Desktop keeps the same one-line elastic toolbar. Phone uses one wide `Filters` dropdown button showing
the active summary and count, beside Sort where applicable. Opening it shows labelled Quick and Type
sections without leaving the page.

- **Strength:** smallest resting footprint and strongest active-filter summary.
- **Trade-off:** every filter change takes an extra opening action.
- **Optimizes:** calm mobile browsing with occasional filtering.

**Selected refinement:** the Filters dropdown is the only mobile filter-state summary. Its closed
button shows the current selections and active count; there is no separate Active strip between the
green header and page content. Resting state reads `All` / `No filters`, while an active state names the
selection, for example `2 active · Have all · Meat`.

### C. Scope + Refine

Phone keeps the most important family as a direct select—Stock scope, Recipe household outcome, or
detail view—and puts the less frequent family behind a `Refine` dropdown. Desktop shows both joined
families inline in the same toolbar.

- **Strength:** balances direct access with compactness.
- **Trade-off:** the two families receive intentionally unequal prominence.
- **Optimizes:** users who change one filter family far more often than the other.

### D. Single “Show” Select

Phone combines both families into one select whose options are meaningful combinations such as
“Everything”, “Have all · Meat”, or “Below target · Any type”. Desktop retains independent joined
families in one line.

- **Strength:** fastest one-control mobile scan.
- **Trade-off:** combinations can multiply and may not represent every arbitrary filter state cleanly.
- **Optimizes:** a small set of common filter recipes.

### E. Inline Drawdown

Phone shows a compact summary bar. Activating it expands labelled filter groups directly under the
bar and pushes content down; closing it preserves the active summary. Desktop lays all groups beside
each other in the elastic toolbar.

- **Strength:** all options remain visible during active filtering without an overlay.
- **Trade-off:** the open state temporarily consumes substantial vertical space.
- **Optimizes:** deliberate multi-filter sessions and keyboard continuity.

### F. Filter Sheet Trigger

Phone shows one `Filters` summary button. Activating it opens a bottom sheet with search, quick filters,
types, active-state summary, Clear, and Done. Desktop shows the full one-line toolbar without a sheet.

- **Strength:** best room for long labels, many dish types, and future filter growth.
- **Trade-off:** introduces a modal layer and separates filters from results while open.
- **Optimizes:** complex filter sets and robust 320 px behavior.

## Selected direction and uncertainty

Use **B. Combined Filter Menu**. It keeps the phone header calm, makes the entire filter state available
from one obvious control, and avoids repeating that state in a separate line below the header. Desktop
continues to show the full one-line elastic toolbar, where selected segments already communicate state.

The remaining uncertainty is filter cardinality. If Recipe dish types continue growing, the combined
menu can become a bottom sheet at the narrowest breakpoint without changing its closed trigger or active
summary. That fallback should be driven by content fit rather than introduced pre-emptively.

## Comparison states

Render all six with equivalent Stock, Recipes, and recipe-detail content at 393 px and desktop widths,
normal and long Dutch names, and resting versus active/recovery states. Mobile dropdown/disclosure
controls must be interactable locally in the artifact. No preview may call an application route or
write household data.

## Implementation boundary after selection

This remains R2 presentation work. A later implementation may change only the three route headers and
their local filter/view controls while preserving behavior. It must not change Meal Plan, Groceries,
schema, auth, persisted data, provider behavior, Albert Heijn behavior, shopping derivation, or
deployment state.

## Shipped implementation

- Stock, Recipes, and recipe detail now use one green command-header family with joined route actions.
- Desktop keeps each filter family on one composed line; long labels truncate without widening it.
- Mobile exposes filter/view state through a single combined menu and has no separate active-filter strip.
- Recipe titles wrap to two lines, while existing search, sort, URL filters, translation recovery, and
  conditional recipe actions remain intact.
- Meal Plan and Groceries were not changed.

Verification completed with zero Svelte diagnostics, 678 unit tests, all 34 runnable authenticated
Playwright tests at the repository gate (one provider-dependent case skipped), manual visual review at
393 px and 1280 px, and a successful production build against an isolated migrated database.
