# App house style

Keukenbrein uses a compact ledger style for household work. Pages keep their own information
architecture, while controls with the same job use the same semantic recipe.

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
| Header pair | A genuine fixed pair in a green page header | `KitchenHeaderActionRail`; secondary 42%, primary 58%; do not use for a single action or status |
| Filter | A selectable compact option | `FilterChip`; real button, `aria-pressed`, 44 px target with a 32 px visual |
| Status | Short passive metadata | `StatusBadge`; never focusable and never pressed |
| Field | Generic text, search, number, date, select, or textarea input | `ui-field` or `ui-field-shell`; 44 px single-line height with visible focus, invalid, disabled, busy, and dark states |
| Repeated rows | One related row group | `ui-section-frame` around the rows; use dividers inside the frame |
| Section title | A meaningful body section | `ui-section-title`; sentence-case serif. Keep micro categories and field labels sans-serif |
| Notice | Contextual info, success, warning, or error | `KitchenNotice`; raised paper shell. The caller retains its icon, copy, role/live region, recovery action, and input state |
| Recipe category | Recipe-index categorization | `ui-recipe-card` with `data-category-accent`; keep the textual category badge |

## Boundaries

- Use the 4/8/12 spacing rhythm and 8 px control corners. Every interactive target remains at
  least 44 CSS pixels even when its visible treatment is smaller.
- Keep primary actions terra, secondary actions olive outline, and tertiary actions quiet. Do not
  choose accents by route.
- Filters and statuses are different roles. If a user can change it, use a button with a selected
  state. If it only reports state, use passive markup.
- A framed list contains repeated rows. It does not wrap every section, content card, fixed dock,
  empty state, hero, sheet, or focused working panel.
- A notice shares material, not behavior. Do not move request state, validation, recovery, or
  announcements into `KitchenNotice`.
- The leading Recipe-category stripe is the only generic-looking vertical marker in stable app
  UI. Stock aging, Shopping sources, notices, buttons, and ordinary cards use dots, rules, text,
  or semantic color instead.

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

`src/lib/ui_house_style_source.test.ts` rejects retired same-role recipes and generic leading
markers. `tests/e2e/house-style.e2e.ts` checks the rendered role contract.
