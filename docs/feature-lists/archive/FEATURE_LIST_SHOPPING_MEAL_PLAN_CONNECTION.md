# Shopping and Meal Plan Connection

_Status: Shipped - 2026-08-04 (selected-week continuity, truthful portion feedback, freezer shortages, and centered Shopping setup)_

## Goal

Make Meal Plan and Shopping agree about the selected week, planned portions, freezer availability,
and the effect of edits, with truthful failure recovery at phone and desktop widths.

## Delivered

1. Failed portion writes revert the control and show an in-dialog error; the post-AH warning appears
   only after a saved change.
2. Shopping projects current frozen portions and warns when a freezer meal exceeds them.
3. Meal Plan, Shopping, primary navigation, and empty-state actions preserve the selected week and
   label current, upcoming, and past weeks accurately in English and Dutch.
4. The former partial plan editor is now **Shopping setup**, with separate selected-week Meal Plan
   and weekly-item actions.
5. Setup is centered on desktop, remains a bottom sheet on phones, and wraps long meal controls.
6. Meals without a chosen day say **Unplanned** / **Niet ingepland**.
7. Meal deletion is explicitly named as a Meal Plan change; in-dialog Undo stays reachable and the
   message warns when previously sent AH items remain unchanged.
8. The shared portion registry exposes successful and failed settlement outcomes so callers never
   report a failed write as saved.

## Delivery

- **Risk:** R2 — shared client state and navigation changed; no schema, authentication, provider, or
  household data migration.
- **Safety:** isolated seeded test users only; no real AH request or paid model call.
- **Rollback:** revert the task commit; persisted data and database schema are unchanged.

## Verification

- `npm run check`: 0 errors and 0 warnings.
- Focused unit checks: 15/15 passed.
- Focused Shopping and house-style browser checks: 6/6 passed at phone and desktop widths.
- Repository unit gate: 744/744 passed.
- Repository browser gate: 50 passed, 1 skipped; two unrelated load flakes passed immediately in
  focused retry (4/4), and a later Stock/Recipe retry passed 3/3.
- `npm run build`: production adapter build passed.

## Resume pack

- **Goal:** shipped in this feature list.
- **Current state:** implementation and local verification complete; deployment evidence belongs in
  the task handoff and Git history.
- **Next action:** none.
- **Open questions:** none.
