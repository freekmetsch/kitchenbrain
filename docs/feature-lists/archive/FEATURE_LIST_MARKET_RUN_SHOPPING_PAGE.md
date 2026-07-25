# Feature List: Market Run Shopping Page

_Status: Shipped — 2026-07-25_

## Outcome

Turn `/shopping` into the approved Market Run direction: a fast phone-first picking surface with
clear week context, compact progress, source-aware rows, persistent Add/AH actions, and a useful
desktop context rail.

## Fixed decisions

- Preserve the existing shopping data model, mutation ownership, recipe decisions, recurring
  items, legacy review, push history, and AH preview/push contracts.
- Keep every AH search and push term sourced from canonical Dutch shopping fields.
- Run is the foreground task. Meal choices, recurring maintenance, one-off item actions, and AH
  recovery use focused sheets or secondary panels.
- Use the approved olive, warm-paper, honey, and terracotta visual system with editorial display
  headings and compact sans-serif controls.
- Hide stock-covered rows from the active run by default and exclude them from AH review.
- Keep completed rows out of the active run while retaining an explicit basket disclosure and
  accessible recovery.
- Manual-item removal moves behind a row action and remains recoverable with Undo.
- Phone actions sit above the six-tab app navigation without covering the final list row.
- At 700 CSS pixels and above, add a context rail for AH status, run totals, stock coverage, and
  the latest send.
- Interactive targets remain at least 44 CSS pixels. Checking an item announces the result and
  focuses the next unchecked row.

## Scope

### In

- Market Run page header, week switcher, progress, tabs, notices, list rows, completion state,
  action dock, and desktop rail.
- Responsive presentation of Meals, Every week, Add item, item actions, AH review/results, and
  push history.
- Existing error, loading, empty, stock-covered, incompatible-quantity, disconnected, stale AH
  review, partial-success, and uncertain-write states.
- English and Dutch copy needed by the composition.
- Browser proof at 375, 768, and 1280 CSS pixels, plus 320-pixel reflow stress.

### Out

- Schema, authentication, shopping derivation, recipe storage, AH matching/push behavior, or new
  dependencies.
- A global redesign of unrelated routes.

## Implementation sequence

1. Build the page shell, integrated week hero, progress, run dock, and responsive context rail.
2. Recompose Run rows, covered/completed disclosures, manual-item actions, and focus/Undo behavior.
3. Recompose Meals and Every week without changing their source-owned mutations.
4. Restyle Add, AH preview/results, and push history as focused Market Run surfaces.
5. Verify source-backed edge states and all required viewports, then simplify and ship.

## Verification

| Surface | Required proof |
|---|---|
| Repository | `npm run check`, `npm run test:unit`, `npm run build`, `git diff --check` |
| Phone | 375 × 812 populated run, completion, covered, conflict, notes, Add, AH review/result |
| Reflow | 320 px without document overflow or inaccessible actions |
| Tablet | 768 px two-column transition and reachable sheets |
| Desktop | 1280 × 800 run/context rail agreement and dock/nav clearance |
| Interaction | Check/rollback/focus, basket recovery, manual remove/Undo, tabs, sheet focus |
| Accessibility | 44 px targets, visible focus, live status, keyboard/escape, reduced motion |

## Risk and rollback

Risk tier: **R2**. This is a page-wide UI and interaction composition change without schema,
authentication, or shopping-domain changes.

- Lost source behavior: existing callbacks and server revision checks remain the only mutation
  paths.
- AH-language drift: no display translation is introduced into preview or push inputs.
- Overlay collisions: phone and desktop viewports are browser release gates.
- Rollback is a code revert; no persisted data restoration is required.

## Shipped evidence

- Rebuilt `/shopping` as the responsive Market Run picking flow, including the fixed phone action
  dock, desktop context rail, source-aware sheets, next-item focus, live announcements, and Undo.
- Preserved the Dutch AH lookup seam and added explicit recovery for disconnected, stale,
  uncertain, and locked in-flight push states.
- Exercised real add, check, focus, Undo, remove, recurring, and disconnected flows at 320, 393,
  768, 1180, and 1280 CSS pixels with no horizontal overflow or real console errors.
- Exercised mocked AH product review, bonus/quantity/favorites, locked sending, stale-review
  rematching, and uncertain-result behavior.
- Passed `npm run check`, all 429 unit tests, `npm run build`, and `git diff --check`.
