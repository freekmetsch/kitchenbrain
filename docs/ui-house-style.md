# App house style

Keukenbrein uses Soft Utility for stable household work: quiet content hierarchy, a slim
herb-green identity ribbon, clean sans-serif type, warm chalk/charcoal working surfaces, and clay
primary actions. Pages keep their own information architecture while controls with the same job
use the same semantic recipe.

The shared visual recipes live in `src/app.css`. Small behavior components live in
`src/lib/components/ui/`. Prefer native buttons, links, inputs, and selects with semantic classes.
Do not add a universal component whose variants reproduce page-local drift.

## Component roles

| Role | Use | Contract |
|---|---|---|
| Primary action | The next committed action in a region | `ui-action ui-action-primary`; flat terra; normally one per region |
| Secondary action | A useful action that does not commit the main task | `ui-action ui-action-secondary`; paper with olive outline |
| Tertiary action | A quiet or reversible action | `ui-action ui-action-tertiary`; use `ui-action-icon` only for a familiar icon |
| Danger or warning action | Destructive work or a deliberate warning step | `ui-action-danger` or `ui-action-warning`; severity must also be clear from the label |
| Page identity | The stable route title | `KitchenPageHeader`; solid Green Ribbon, one H1, optional Back/leading navigation, and at most one highest-value action |
| Page utilities | Route context and working controls immediately below the ribbon | `ui-page-utility` with `ui-page-utility-inner`; metrics, week navigation, search, sort, filters, status, and secondary actions stay here |
| Filter | A selectable compact option | `FilterChip`; real button, `aria-pressed`, 44 px target with a 32 px visual |
| Status | Short passive metadata | `StatusBadge`; never focusable and never pressed |
| Field | Generic text, search, number, date, select, or textarea input | `ui-field` or `ui-field-shell`; 44 px single-line height with visible focus, invalid, disabled, busy, and dark states |
| Repeated rows | One related row group | `ui-list-group`; open inline edges, internal dividers, and no surrounding card border by default |
| Focused form | A form section that needs a deliberate working boundary | `ui-form-card`; do not use it for explanatory copy or every page section |
| Section title | A meaningful body section | `ui-section-title`; sentence-case sans-serif, with weight and spacing rather than a display face |
| Notice | Contextual info, success, warning, or error | `KitchenNotice`; a tonal field with one restrained inset semantic edge. The caller retains its icon, copy, role/live region, recovery action, and input state |
| Recipe category | Recipe-index categorization | Keep it as optional text. Imagery is optional and no placeholder block appears when a recipe has no image |

## Boundaries

- Use the 4/8/12 spacing rhythm and 8 px control corners. Every interactive target remains at
  least 44 CSS pixels even when its visible treatment is smaller.
- Keep primary actions terra, secondary actions olive outline, and tertiary actions quiet. Do not
  choose accents by route.
- The Green Ribbon is normally 56 CSS px below 768 px and 64 CSS px from 768 px upward. Long
  English/Dutch copy and 200%-equivalent text may grow it instead of clipping.
- The ribbon owns identity, not route payload. Put at most one primary action in it. Back is
  leading navigation, not a second action.
- Filters and statuses are different roles. If a user can change it, use a button with a selected
  state. If it only reports state, use passive markup.
- Group ordinary rows with headings, whitespace, and dividers. A surrounding border is reserved
  for a real state, focused form, fixed dock, sheet, or other meaningful boundary.
- A notice shares material, not behavior. Do not move request state, validation, recovery, or
  announcements into `KitchenNotice`.
- Stable headings use the system sans family. Do not restore Georgia, Times,
  `--kitchen-display`, a decorative header ring/gradient, a paired header rail, or a full-height
  Recipe-category stripe.
- At desktop width, let repeated work use the canvas. Context rails exist only when context is
  present. Recipes use two columns at tablet width and three at wide desktop; phone uses one
  content-led row.

## Explicit exceptions

Bottom navigation, segmented tabs, checkboxes, radios, quantity steppers, drag/reorder controls,
Shopping completion controls, Cook Mode, and Assistant work keep their purpose-built interaction
patterns. Inline field validation stays next to its field. These are role boundaries, not permission
to introduce a second recipe for actions, filters, statuses, fields, lists, or notices.

## Adding a caller

1. Name the element's job before choosing its appearance.
2. Reuse the semantic recipe or narrow behavior component for that job.
3. Preserve the native element, accessible name, pressed/busy/invalid state, and route behavior.
4. Check 320, 393, 768, and 1280 px; light and dark; English and Dutch; keyboard focus; long copy;
   and horizontal overflow.
5. Run `npm run check`, `npm run test:unit`, and the relevant Playwright test. The complete gate is
   `npm test`.

`src/lib/ui_house_style_source.test.ts` rejects retired same-role recipes, serif/display tokens,
header payloads, decorative ribbons, and recipe markers. `tests/e2e/house-style.e2e.ts` checks the
rendered ribbon geometry, action ownership, list treatment, Recipe columns, notice edge, focus,
and overflow contract.
