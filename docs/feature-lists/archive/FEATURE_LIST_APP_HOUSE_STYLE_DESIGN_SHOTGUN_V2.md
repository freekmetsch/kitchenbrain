# App House Style — Design Shotgun V2

_Status: Shipped - 2026-07-30 (Green Ribbon selected, implemented, and fully verified)_

This is the authoritative source for the second App House Style design comparison. The HTML
workspace is a temporary review surface; implementation must start from this brief plus the
workspace's generated handoff.

The separate executable plan is
`docs/feature-lists/archive/FEATURE_LIST_APP_HOUSE_STYLE_GREEN_RIBBON.md`.

## Purpose

The first house-style pass made component meanings consistent, but the rendered app still feels
assembled rather than art-directed. This pass chooses a coherent visual direction before another
implementation begins.

The target is the stable household-management app used repeatedly on a phone and occasionally on a
desktop: Stock, Meal plan, Shopping, Recipes, Settings, and Login. Assistant, Cook Mode, navigation
behavior, database behavior, authentication, provider calls, and Albert Heijn behavior remain
outside this visual decision.

## UI audit evidence

The current seeded app was inspected in a real browser at 375 × 812 and 1280 × 900 in light and
dark themes. Stock, Meal plan, Shopping, Recipes, and Settings were covered with long synthetic
content; Shopping also included its uncertain AH-result warning state.

| Priority | Finding | Observed consequence |
|---|---|---|
| P2 | Desktop composition does not use the canvas | Stock collapses into a narrow left rail and Recipes ends after one stretched row, leaving most of the viewport empty. |
| P2 | Dark surfaces lose useful contrast | Recipe actions and Stock secondary guidance become hard to distinguish from their olive backgrounds. |
| P2 | Too many regions are framed | Lists, rows, notices, filters, cards, and docks compete at the same visual weight. |
| P3 | Display serif is used too broadly | Dense card and row titles wrap awkwardly and clash with tiny utilitarian labels. |
| P3 | The gradient header dominates routine work | Page identity takes more visual weight than the list, plan, or shopping action beneath it. |

The redesign should therefore fix composition, typography, surface hierarchy, and dark-theme
contrast together. Recoloring the existing components is not enough.

## Comparable render contract

Every direction uses the same synthetic content and viewport:

- **Shopping phone — 390 × 844:** week context, AH offline status, four filters, an uncertain
  previous AH result, two recipe groups, other items, and the Add item / Connect AH dock.
- **Recipes phone — 390 × 844:** the same four soup recipes, no photos, search, sort, and filters.
- **Stock desktop — 1280 × 900:** fourteen ready meals, coverage status, search, scope controls,
  and long use-next rows.
- **Dark state:** the same Shopping content and hierarchy, not an easier empty state.

The review workspace may scale the frames to fit, but it must not give one direction easier content
or omit the warning state.

## Direction A — Soft Utility

**Thesis:** a calm contemporary household tool where content leads and decoration stays quiet.

- **Layout:** slim page bar; content-led phone lists; a balanced desktop work area with a useful
  secondary rail only when context exists.
- **Typography:** one clean sans-serif family; weight and spacing establish hierarchy.
- **Palette:** warm chalk, charcoal, muted herb, and one restrained clay action color.
- **Density:** comfortable but operational; fewer containers and more whitespace between groups.
- **Interaction emphasis:** the next household action is obvious; secondary controls remain calm.
- **Main strength:** easiest to scan repeatedly without feeling clinical.
- **Main trade-off:** less visually distinctive than the editorial direction.
- **Optimizes:** frequent Stock and Shopping use on a phone.

**Recommendation:** start here. It directly resolves every P2 audit finding with the least ongoing
visual maintenance.

## Direction B — Cookbook Studio

**Thesis:** a warm food-led interface that feels closer to a contemporary cookbook than an admin
tool.

- **Layout:** editorial section rhythm, prominent recipe imagery or illustrated placeholders, and
  wider content moments between dense task lists.
- **Typography:** expressive serif for large titles only; clean sans-serif for controls and rows.
- **Palette:** cream, aubergine, brick, olive, and soft apricot.
- **Density:** relaxed; card groups are selective and visually generous.
- **Interaction emphasis:** food and meal context lead, with actions attached to the relevant item.
- **Main strength:** the most characterful and inviting direction.
- **Main trade-off:** shows fewer items at once and depends more on strong image treatment.
- **Optimizes:** browsing Recipes and choosing what to cook.

## Direction C — Modern Grocer

**Thesis:** a crisp, high-contrast household operations console inspired by excellent grocery and
logistics tools.

- **Layout:** compact mobile toolbar; desktop side navigation; aligned data rows and clear context
  panels.
- **Typography:** bold geometric sans-serif with tabular numbers and compact labels.
- **Palette:** white and cool slate with saturated produce green and coral action accents.
- **Density:** highest of the three while retaining usable touch targets.
- **Interaction emphasis:** fast scanning, filtering, checking off, and moving to the next task.
- **Main strength:** strongest desktop use and fastest operational scanning.
- **Main trade-off:** less warm and domestic than the other directions.
- **Optimizes:** large Stock and Shopping lists.

## Primary direction decision

**Selected:** Direction A — Soft Utility

**Recommendation status:** Recommended
**Carry-forward from other directions:** None

The selection directly answers the audit evidence: repeated phone use, excessive framing, wasted
desktop canvas, broad serif use, and muddy dark surfaces.

User note, reproduced verbatim:

> I still love the green headers and the way that was originally set up that we had though. Lets keep those

The focused refinement therefore keeps a recognizably green page header in every option. The
choice is no longer whether the app uses a green header, but how that header establishes identity
without dominating routine work.

## Focused refinement round — Soft Utility with green headers

Every refinement keeps Soft Utility's clean sans-serif typography, quiet content hierarchy,
restrained herb/clay palette, balanced desktop composition, and low framing. Each one uses the
same Shopping phone, Recipes phone, Stock desktop, and dark Shopping evidence states. Their
differences are structural rather than simple palette changes.

### Refinement A — Green Ribbon

**Thesis:** keep the familiar green page identity in one slim, continuous band, then let content
begin immediately.

- **Header structure:** one 72 px desktop / 64 px phone herb band containing eyebrow, title, and
  the single highest-value page action.
- **Content relationship:** the first control row sits directly below the band without a card or
  overlap.
- **Desktop composition:** the ribbon spans the balanced work area while summary and use-next
  content share a deliberate two-column grid.
- **Dark treatment:** deep pine header above distinct charcoal content surfaces; clay is reserved
  for the primary action.
- **Strength:** strongest continuity with the original green-header setup while directly reducing
  its height and visual weight.
- **Trade-off:** the page transition is the most conventional of the five.

**Recommendation:** approve this refinement. It keeps the green header as a clear house signature
without allowing it to compete with the household task beneath it.

### Refinement B — Split Canopy

**Thesis:** separate green page identity from frequently changed controls so both remain compact.

- **Header structure:** a 48 px green identity strip followed by a white utility row for search,
  filters, status, or actions.
- **Content relationship:** list content aligns tightly to the utility row and reads as one
  continuous workspace.
- **Desktop composition:** identity spans the page; the utility row follows the main content grid.
- **Dark treatment:** pine identity strip over a graphite utility row with crisp field outlines.
- **Strength:** clearest distinction between where the user is and what they can do.
- **Trade-off:** creates two horizontal bands and can feel more system-like.

### Refinement C — Framed Grove

**Thesis:** make the green header a warm, contained object within the same centered content measure
as the page.

- **Header structure:** inset rounded green panel with title and short context, surrounded by a
  quiet page background.
- **Content relationship:** controls and lists align to the panel edges, with generous unframed
  group spacing.
- **Desktop composition:** the header and main workspace share a centered maximum width rather
  than extending edge to edge.
- **Dark treatment:** softened moss panel on charcoal with warm off-white type.
- **Strength:** most domestic and welcoming expression of Soft Utility.
- **Trade-off:** the inset header is another visible container and needs disciplined spacing.

### Refinement D — Working Header

**Thesis:** let the green header earn its space by integrating the page's most-used status and
control.

- **Header structure:** a compact green work rail combining title with a count, search, or primary
  filter.
- **Content relationship:** secondary filters move into a minimal text row; operational content
  starts higher on the page.
- **Desktop composition:** summary metrics sit inside the header rail while the full-width list
  uses the remaining canvas.
- **Dark treatment:** deep green work rail, neutral content rows, and high-contrast controls.
- **Strength:** fastest and densest option for large Stock and Shopping lists.
- **Trade-off:** the header changes more from route to route because its useful control differs.

### Refinement E — Layered Leaf

**Thesis:** preserve the green-header memory through a soft upper field and a content sheet that
gently overlaps it.

- **Header structure:** a taller but visually quiet green field with title and context; the first
  white content section overlaps its lower edge.
- **Content relationship:** the overlap creates one intentional layer transition, while rows
  within the sheet remain mostly unframed.
- **Desktop composition:** the green field establishes the full page; a wide offset work sheet
  creates stronger asymmetry.
- **Dark treatment:** forest field behind a raised graphite sheet with clear tonal separation.
- **Strength:** most distinctive and crafted option.
- **Trade-off:** the layered composition is less utilitarian and requires the most responsive
  tuning.

## Refinement decision

Choose one refinement as the production planning reference. Exact named elements may be carried
forward from another refinement, but an undefined hybrid is not an approval.

The default decision is **Refinement A — Green Ribbon**. It most directly preserves the requested
green headers while correcting the earlier header dominance, framing, desktop balance, type, and
dark-surface issues.

## Fixed product constraints

- Keep every current route, action, query parameter, mutation, keyboard behavior, and responsive
  navigation path.
- Keep 44 px minimum primary touch targets and visible keyboard focus.
- Keep light and dark themes; neither may be a palette inversion afterthought.
- Keep Dutch and English long-copy resilience.
- Do not read household data, call a provider, preview or push to AH, or change persisted state.
- Do not implement the selected direction during the design-shotgun workflow.

## Shipped implementation

The separate Green Ribbon plan shipped on 2026-07-30. The implementation preserved every fixed
product constraint and passed the full dual-account provider-free gate plus three iterative
real-browser UI audit rounds with no remaining P1-P3 finding.
