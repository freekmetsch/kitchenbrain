# App house style

Keukenbrein uses Soft Utility inside a Deep Grove chassis: quiet content hierarchy, a compact
green identity ribbon, clean sans-serif type, warm paper/charcoal working surfaces, and clay
primary actions. The same exact Grove material (`#344f3e`) joins the header, utility band, narrow
page frame, and bottom navigation in light and dark themes. Pages keep their own information
architecture while controls with the same job use the same semantic recipe.

The shared visual recipes live in `src/app.css`. Small behavior components live in
`src/lib/components/ui/`. Prefer native buttons, links, inputs, and selects with semantic classes.
Do not add a universal component whose variants reproduce page-local drift.

## Component roles

| Role | Use | Contract |
|---|---|---|
| App chassis | The stable material around household work | `ui-grove-page` joins route-level green; `ui-grove-surface` draws the warm work surface with a 6 px Grove reveal and 14 px corners |
| Primary action | The next committed action in a region | `ui-action ui-action-primary`; flat terra; normally one per region |
| Secondary action | A useful action that does not commit the main task | `ui-action ui-action-secondary`; transparent with a quiet Grove outline |
| Tertiary action | A quiet or reversible action | `ui-action ui-action-tertiary`; use `ui-action-icon` only for a familiar icon |
| Danger or warning action | Destructive work or a deliberate warning step | `ui-action-danger` or `ui-action-warning`; severity must also be clear from the label |
| Page identity | The stable route title | `KitchenPageHeader`; solid Green Ribbon, one H1, optional Back/leading navigation, and normally at most one highest-value action. Use `layout="contextual"` only when Back and a primary action share the ribbon. Meal plan has the one named compact-action exception below |
| Page utilities | Route context and working controls immediately below the ribbon | `ui-page-utility` with `ui-page-utility-inner`; the band uses the exact Grove material with no divider from the ribbon. Metrics, week navigation, search, sort, filters, and secondary actions stay here |
| Filter | A selectable compact option | `FilterChip`; real button, `aria-pressed`, 44 px target with a 32 px visual. Long or dynamic filter families use labeled native selects inside a responsive grid rather than a horizontal rail |
| Exclusive choice | One value from a small set | `SegmentedControl`; `radiogroup`/`radio` semantics, roving arrow-key focus, and one measured sliding paper indicator. Disabled choices are skipped; combinable filters remain chips |
| Status | Short passive metadata | `StatusBadge`; dot plus text, never focusable and never pressed. Shopping's AH status sits beside its top action rather than in the week band |
| Field | Generic text, search, number, date, select, or textarea input | `ui-field` or `ui-field-shell`; cream paper, 44 px single-line height, and visible focus, invalid, disabled, busy, and dark states |
| Connected rows | One tightly related ledger | `ui-list-group`; internal dividers, 14 px outer corners, and Soft Lift separation from other boards |
| Object cards | Recipes, Stock items, or Meals that need their own boundary | Separate bordered cards with modest 8–12 px gaps. Repeated household work prefers two-line identity/quantity then choice/action rhythm; disclose rare controls instead of making every card tall |
| Anchored compact choice | A secondary choice needed beside repeated work | `CompactPopover`; native top-layer popover, viewport clamp/flip, focus return, and a shared segmented choice inside |
| Green Ribbon disclosure | Filters, view choices, or overflow actions opened from the page header | `CombinedFilterMenu` uses `BottomSheet` whenever its compact trigger is present. `HeaderActionMenu` uses the same modal drawer below 768 px and a true `role="menu"` action list from 768 px upward; it stays separate from `CompactPopover` because it runs commands or navigation instead of choosing one value |
| Focused form | A form section that needs a deliberate working boundary | `ui-form-card`; do not use it for explanatory copy or every page section |
| Section title | A meaningful body section | `ui-section-title`; sentence-case sans-serif, with weight and spacing rather than a display face |
| Notice | Contextual info, success, warning, or error | `KitchenNotice`; a Warm Wash tonal field with a quiet semantic border. The caller retains its icon, copy, role/live region, recovery action, and input state |
| Recipe category | Recipe-index categorization | Keep it as optional text. Imagery is optional and no placeholder block appears when a recipe has no image |
| Bottom navigation | The primary app destinations | One Green Anchor with a cream 14 px active pill; Shopping's phone Paper Shelf occupies its own reserved row directly above it |

## Boundaries

- Use the 4/8/12 spacing rhythm, 8 px control corners, and 14 px work-surface/board corners. Every
  interactive target remains at least 44 CSS pixels even when its visible treatment is smaller.
- The work surface reaches to 6 px from the screen edge at phone and desktop widths. Green is a
  narrow structural reveal on desktop, never a large gutter around a centralized panel.
- Shared header and utility content use a focused 52 rem measure. Repeated work may use the wider
  route canvas when a context rail or responsive Recipe grid needs it.
- Keep primary actions terra, secondary actions in a quiet Grove outline, and tertiary actions quiet. Do not
  choose accents by route.
- The Green Ribbon is normally 64 CSS px below 768 px and 72 CSS px from 768 px upward. Long
  English/Dutch copy and 200%-equivalent text may grow it instead of clipping.
- Contextual Recipe ribbons keep that same material, type, measure, and 64/72 px normal geometry.
  Below 23 rem, their full accessible action label becomes an icon treatment; the text returns at
  wider viewports. Do not use contextual layout as a general compact-header option.
- The ribbon owns identity, not route payload. Put at most one primary action in it. Back is
  leading navigation, not a second action.
- Keep direct actions direct. A Green Ribbon control that reveals choices opens a modal bottom
  drawer in the compact layout, so the page behind it is inert and focus returns to the trigger.
  Overflow actions use an anchored menu at 768 px and above, with arrow-key navigation and Escape
  dismissal.
- Do not use an options menu for one command. Render a single non-destructive action directly. A
  destructive action may stay direct on an editable active ledger row only when the write is
  immediately reversible with Undo; omit it from completed, covered, and read-only rows. Actions
  that are irreversible or high-consequence still require a labelled confirmation step.
- Meal plan is the sole three-affordance ribbon exception: clay Add meal, a delivery-labelled
  Shopping destination, and quiet overflow form one compact action group. At 320 px that group may
  occupy a second ribbon row; other standard ribbons retain the normal 64/72 px geometry.
- Recipe Edit is Recipe First: the recipe name is the H1 and the editing label is the eyebrow.
  A clean Save stays quiet/disabled; a dirty Save becomes the clay commit.
- Shopping keeps AH status as passive dot-plus-text metadata in the Green Ribbon. Its Paper Shelf
  owns the only Add item action and reserves real scrollport space on phone; desktop keeps the
  shelf in normal document flow so rows never pass beneath it.
- Filters and statuses are different roles. If a user can change it, use a button with a selected
  state. Grove Fill is the shared selected treatment. If it only reports state, use passive
  dot-plus-text markup.
- Recipe and Stock filter families stay visible in their continuous green utility bands. Status
  filters may wrap; long or dynamic food, dish, storage, class, and review choices use labeled
  native selects. Do not restore a horizontal filter rail or a catch-all Stock filter sheet.
- Use connected ledgers only when the rows form one compact record set. Stock items, Meals, and
  Recipe cards are independent objects, so each keeps its own boundary and a modest gap. Never
  connect forms, notices, or unrelated actions just to reduce gaps.
- Stock keeps quantity controls visible and reserves warning wash for real risk. An ordinary Stock
  card uses words for section, class, staple, expiry, and recipe relationship, with at most one
  leading urgency marker. Recipe relationships are summarized once and expanded into a focused
  review instead of repeated icon or dot chains on every row.
- Shopping uses one centered 52 rem work column and leads with the current run: compact unresolved
  AH attention, a direct Setup action in the Paper Shelf, filters, then item rows. Do not add a
  readiness summary that repeats list state. Planned-meal portions and weekly-item definitions live
  in the setup sheet. Recipe-source defaults live in item details,
  while active rows keep only name, quantity/source cue, completion, and their immediate action.
  The latest unresolved AH outcome remains inline; successful and previous sends live in the
  on-demand history sheet.
- Review AH order is triage-first: unresolved, unconfirmed, and unreviewed low-confidence choices
  stay expanded under Needs a look; settled choices collapse under Confirmed. Selected product,
  price, and pack count remain visible, alternate/favorite controls use Details disclosure, and the
  product/text/skipped summary plus Send action stays sticky.
- A notice shares material, not behavior. Do not move request state, validation, recovery, or
  announcements into `KitchenNotice`.
- Stable headings use the system sans family. Do not restore Georgia, Times,
  `--kitchen-display`, a decorative header ring/gradient, a paired header rail, or a full-height
  Recipe-category stripe.
- At desktop width, the paper surface uses the canvas while the useful content remains focused.
  Context rails exist only when context is present. Recipes use separate cards in two columns at
  tablet width and three at wide desktop; phone uses one content-led row.

## Explicit exceptions

Checkboxes, radios, quantity steppers, drag/reorder controls, Shopping completion controls, Cook
Mode, and Assistant work keep their purpose-built interaction patterns. The Grove chassis may
surround them without restyling their behavior. Inline field validation stays next to its field.
These are role boundaries, not permission to introduce a second recipe for actions, filters,
statuses, fields, lists, or notices.

## Adding a caller

1. Name the element's job before choosing its appearance.
2. Reuse the semantic recipe or narrow behavior component for that job.
3. Preserve the native element, accessible name, pressed/busy/invalid state, and route behavior.
4. Check 320, 393, 768, and 1280 px; light and dark; English and Dutch; keyboard focus; long copy;
   exact Grove continuity; fixed-shelf clearance; and horizontal overflow.
5. Run `npm run check`, `npm run test:unit`, and the relevant Playwright test. The complete gate is
   `npm test`.

`src/lib/ui_house_style_source.test.ts` rejects retired same-role recipes, serif/display tokens,
header payloads, decorative ribbons, and recipe markers. `tests/e2e/house-style.e2e.ts` checks the
rendered ribbon geometry, action ownership, list treatment, Recipe columns, notice edge, focus,
and overflow contract.
