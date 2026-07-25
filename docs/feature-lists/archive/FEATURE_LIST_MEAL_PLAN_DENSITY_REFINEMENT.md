# Meal Plan Density Refinement

_Status: Shipped - 2026-07-25_

## Outcome

Make `/meal-plan` feel calmer and use narrow screens more efficiently without weakening the
household's two main jobs: choosing how much to cook and moving between planning and shopping.

## Fixed decisions

- Remove the visible `×1` batch button.
- Keep `×2`, `×3`, and `×4` as toggleable batch shortcuts beside the portion control.
- Treat no batch shortcut as selected as the baseline `×1` state.
- Clicking the active `×2`, `×3`, or `×4` shortcut returns the meal to the recipe's baseline
  yield and leaves all three shortcuts off.
- Keep the exact portion stepper so a household can still plan a custom amount.
- Move Remove into the meal-title row. It must not reserve a trailing column across the full
  height of a meal.
- Preserve the current Dutch-canonical recipe and shopping seams. This is presentation and
  meal-serving interaction work only.
- Keep touch targets at least 44 px where the current app already provides them.
- Planning itself does not change the production route; the approved `$run` implements Direction B.

## Current evidence

- Authenticated browser evidence at the live `/meal-plan` route showed the populated current week
  at 360 × 640 and 372 × 806 CSS pixels.
- At phone width, the portion stepper and four 44 px batch shortcuts cannot share one row. The
  shortcuts wrap into a second full-width band, before the separate fresh/freezer band.
- `src/routes/meal-plan/+page.svelte:785` owns the portion and batch row. The current
  `[1, 2, 3, 4]` loop starts at `src/routes/meal-plan/+page.svelte:793`.
- `src/routes/meal-plan/+page.svelte:759` makes each meal one outer flex row. Remove is a trailing
  sibling at `src/routes/meal-plan/+page.svelte:846`, so it stays centered against the complete
  multi-line meal body instead of sitting beside the title it names.
- The page header contains Shopping and meal-planning Settings at
  `src/routes/meal-plan/+page.svelte:674`, even though both destinations already exist in the
  persistent bottom navigation. Shopping is also repeated in every week header.
- Show past weeks occupies a separate page row at `src/routes/meal-plan/+page.svelte:689`.
- Each week header presents date range, delivery date, Shopping, Suggest, and Add with similar
  visual weight. Four visible weeks repeat most of that chrome.
- The authenticated desktop window available during the audit reached 1098 × 881 CSS pixels. At
  that width the controls fit, which confirms that the primary problem is narrow-screen hierarchy
  rather than missing functionality.

## Ranked UI findings

### P2 — Batch shortcuts force a third control band on phones

The exact portion control plus `×1` through `×4` exceeds the meal content width. Repeated meals
therefore become much taller and slower to scan.

Smallest durable direction: omit the redundant `×1` control and let `×2`/`×3`/`×4` toggle back to
baseline. The remaining controls fit beside portions at the priority phone width.

### P2 — Remove is visually detached from the meal it removes

The trailing Remove column is aligned to the height of the entire meal body. On meals with source
choices it floats beside the batch or source controls, while also reducing the width available to
every row in the body.

Smallest durable direction: put Remove in the title row with the meal name and give the controls
below the full inner width.

### P2 — Header actions compete through duplication

Shopping and Settings appear in the page header even though the bottom navigation already
provides both destinations, and each week repeats Shopping again. The result is several
equal-weight ways to leave the page before the user reaches the plan.

Smallest durable direction: remove the page-level Shopping and Settings buttons. Preserve the
week-specific Shopping destination because it carries week context.

### P3 — Past weeks consumes its own visual row

Show past weeks is useful but infrequent. Giving it a separate line makes the top of every visit
feel more administrative.

Smallest durable direction: fold it into a quiet page-header action or the week navigator.

### P3 — Week metadata and actions read as separate fragments

Week number, Now, range, delivery, Shopping, Suggest, and Add form two clusters with five visual
treatments. The primary action is not obvious until color is considered.

Smallest durable direction: combine range and delivery into one metadata line; keep Add primary,
Suggest secondary, and week-specific Shopping tertiary.

## Design question

After the fixed meal-row optimizations, how much of the repeated page and week header should be
removed or reorganized?

## Direction A — Quiet week cards (recommended)

**Visual thesis:** Keep the familiar multi-week page, but strip the page header to title plus a
quiet Past action and give every week one compact metadata line.

- Remove page-level Shopping and Settings.
- Keep `Past weeks` as a small history action beside the page title.
- Keep week-specific Shopping as an icon action because it opens that exact week's list.
- Keep Suggest as a secondary text action and Add as the only filled action.
- Put checkbox, meal title, and Remove on the first meal row.
- Put portions and `×2`/`×3`/`×4` on the second row; put source choices on the third only when
  needed.

**Strength:** Delivers most of the space and hierarchy improvement without changing how households
scan several weeks.

**Trade-off:** Repeated week headers and empty future-week cards remain visible.

**Optimizes for:** Fast refinement with low relearning cost.

## Direction B — One-week focus

**Visual thesis:** Replace the long stack of week cards with a prominent week switcher and show
one planning canvas at a time.

- Use Previous and Next controls around the selected week.
- Put date and delivery directly below the week switcher.
- Use one compact toolbar for Shopping, Suggest, and Add.
- Put Past weeks and Settings in a low-frequency overflow menu.
- Use the same fixed meal-row controls as Direction A.

**Strength:** Removes repeated headers and gives meal content the strongest focus.

**Trade-off:** Comparing or planning across several weeks takes more taps, and empty future weeks
are no longer visible at a glance.

**Optimizes for:** Deliberate planning of one delivery cycle at a time.

## Direction C — Week rail and lean agenda

**Visual thesis:** Turn weeks into a compact horizontal rail and meals into flatter agenda rows,
using dividers instead of large nested cards.

- Keep several week numbers visible in a scrollable rail, with the current week selected.
- Place delivery and the three weekly actions in a slim toolbar under the rail.
- Use flatter meal rows with fewer borders and shadows.
- Keep source as a restrained status/action line rather than another raised button group.
- Put Past at the start of the week rail and remove page-level Shopping and Settings.

**Strength:** Highest information density while preserving direct access to nearby weeks.

**Trade-off:** The flatter agenda has less visual containment, and the horizontal rail introduces
another scrollable region.

**Optimizes for:** Power users who routinely plan several weeks and value scan speed over card
separation.

## Design recommendation (overridden)

Choose **Direction A — Quiet week cards**.

It fixes every reported issue and removes the clearest duplicates while preserving the screen's
current mental model. Direction B is calmer but changes multi-week planning behavior. Direction C
is efficient but adds a week rail before there is evidence that switching weeks is the main
friction.

Practical consequence:

- the page opens with `Meal plan` and a quiet Past action;
- a week reads as identity and timing first, then Shopping, Suggest, and Add in decreasing visual
  emphasis;
- every meal starts with checkbox, title, and Remove;
- portions plus three optional batch multipliers fit on one phone row;
- no selected multiplier means the recipe's normal yield.

The user reviewed the comparison board and explicitly selected **Direction B — One-week focus**.
That choice overrides the design recommendation and accepts the extra interaction required to
compare adjacent weeks.

## Interaction details for the fixed batch controls

- `×2`, `×3`, and `×4` remain buttons with `aria-pressed`.
- If a multiplier is inactive, activating it sets portions to recipe yield × multiplier.
- If a multiplier is active, activating it sets portions to the recipe yield and clears the
  pressed state.
- A custom portion count that is not an exact multiplier leaves all three shortcuts unpressed.
- While a serving update is pending, every portion and multiplier action for that meal is
  unavailable and the existing live-region update remains authoritative.
- Fixed-batch recipes keep the same target calculation and unavailable-over-99 behavior.

## Assumptions

- The persistent bottom navigation remains present for authenticated users.
- Most meal-plan work starts on the current or next week, but several weeks still matter enough
  to keep visible in Direction A.
- Week-specific Shopping is more valuable than the duplicate current-week Shopping button in the
  page header.
- Suggest remains a deliberate paid AI action and should keep a visible text label rather than
  becoming an unexplained icon.
- The cook/freezer source choice remains visible only when the meal has linked frozen stock.

## Uncertainty

- The live audit did not exercise multiplier, source, delete, or Suggest actions because they
  write household data or can incur provider cost.
- The authenticated Chrome window was physically limited below 1280 CSS pixels. The comparison
  board therefore renders the app's 672 px maximum content width directly for the wide view.
- Direction B may outperform the recommendation if households rarely compare adjacent weeks.

## Problem framing

The current page renders every loaded week as a separate card. On a phone, every card repeats
week identity, timing, Shopping, Suggest, and Add before the meal content. Linked meals then
repeat three control bands. The result is a long page whose visual weight is concentrated in
navigation and controls rather than the plan.

Direction B must make one week the clear planning context without weakening:

- the existing `?week=` deep-link contract used by Shopping and recipe flows;
- browser Back and Forward orientation;
- access to historical meal weeks;
- optimistic meal writes and their recovery;
- selected-week screen context for the assistant;
- exact custom portions, recipe-batch shortcuts, and fresh/freezer source behavior.

## Scope

### In

- Render one selected week at a time on `/meal-plan`.
- Use real Previous and Next week links around the selected week.
- Keep the selected week in `?week=` so deep links and browser history remain meaningful.
- Move past-week visibility and meal-planning Settings into a keyboard-accessible overflow menu.
- Put Shopping, Suggest, and Add in one selected-week toolbar.
- Remove the page-level Shopping and Settings actions.
- Remove visible `×1`; make active `×2`/`×3`/`×4` return to recipe baseline.
- Move Remove into the title row and give portion controls the remaining meal width.
- Keep assistant screen facts aligned to the selected week.
- Add English and Dutch copy, pure helper tests, and responsive browser verification.

### Out

- Database, migration, auth, recipe, shopping derivation, Albert Heijn, and provider changes.
- Changing meal-plan horizon preferences or the definition of a planning week.
- Triggering paid Suggest calls or write actions against production household data.
- Redesigning the add-meal sheet, source-choice component, bottom navigation, or assistant panel.
- Adding a next-week teaser below the selected week.

## Existing-system inventory

- `src/routes/meal-plan/+page.server.ts` already returns `focusWeek` from `?week=` and guarantees
  that a focused empty or historical week exists in `weeks`.
- The server returns the configured current/future horizon, plus historical meal weeks only when
  `?past=1` is present. This is sufficient for bounded Previous/Next navigation without a data
  contract change.
- `src/routes/meal-plan/+page.svelte` keeps a mutable local copy of all loaded weeks so optimistic
  add, edit, cooked, source, and remove flows can update in place.
- The current `onMount` scrolls to a focused card. One-week focus makes that behavior obsolete.
- The assistant screen context currently identifies `currentWeekStart` and counts every loaded
  week. It must identify and count only the rendered week.
- `src/lib/meal_batch.ts` owns recipe-yield multiplication and the 99-portion ceiling.
- `messages/en.json` and `messages/nl.json` own all visible and accessible meal-plan copy.
- `src/app.css` already provides the list-card, chip, action-target, motion, and contrast rules
  needed for this layout.

## Option comparison and chosen approach

| Approach | Benefits | Costs | Decision |
|---|---|---|---|
| A — Quiet week cards | Preserves direct multi-week scan | Repeats week chrome and empty cards | Rejected by user |
| B — One-week focus | Calmest hierarchy; clear selected-week actions | Adjacent weeks require navigation | **Chosen** |
| C — Week rail and lean agenda | Dense multi-week access | Adds a horizontal navigation region and flatter containment | Rejected |

Implementation uses ordinary links with `?week=` rather than a client-only carousel. The server
already owns normalization, empty focused weeks, past filtering, and deep links. Reusing that
contract keeps Back/Forward behavior, avoids a second source of week-navigation truth, and makes
selected-week URLs shareable.

## Phase plan

### Phase 1 — One-week orientation and navigation

1. Select the rendered week from `data.focusWeek ?? data.currentWeekStart`.
2. Derive bounded Previous and Next neighbors from the loaded, date-sorted `weeks`.
3. Replace the page and repeated week headers with title/overflow, week switcher, timing, and one
   Shopping/Suggest/Add toolbar.
4. Preserve `past=1` in neighbor URLs and preserve the selected week when toggling past visibility.
5. Make assistant screen identity and counts describe only the selected week.
6. Verify current, future, focused-empty, focused-past, past-visible, and navigation-boundary
   states before changing meal controls.

### Phase 2 — Meal-row density and batch toggles

1. Extend the batch helper with the active-toggle-to-baseline rule and focused unit tests.
2. Render only `×2`, `×3`, and `×4`, with effect-matching accessible labels.
3. Restructure meal rows to checkbox + title/Remove, then full-width controls.
4. Preserve day planning, cooked metadata, source choice, pending behavior, and optimistic rollback.
5. Verify linked/unlinked, cooked, long-title, custom, active, pending, and unavailable states.

### Phase 3 — Full verification, simplification, and lifecycle update

1. Run responsive English and Dutch browser stories at the required viewports and effective zoom.
2. Run repository checks and repair in-scope failures.
3. Remove obsolete focus-scroll and duplicated header code.
4. Mark this feature shipped, archive it with its design artifact, log the archive, then commit
   and push only this feature's files.

## Execution tickets

### Ticket 1 — Selected-week navigation

- **Observable behavior:** `/meal-plan` renders one week; Previous/Next, deep links, Back/Forward,
  and past visibility agree on the selected week.
- **Scope in:** selection helpers, one-week render, URL construction, overflow menu, assistant
  screen context.
- **Scope out:** server data-shape changes and infinite week creation.
- **Target files:** `src/routes/meal-plan/+page.svelte`,
  `src/lib/meal_plan_navigation.ts`, `src/lib/meal_plan_navigation.test.ts`,
  `messages/en.json`, `messages/nl.json`.
- **Risk tier:** R1 — localized screen and navigation behavior.
- **Verification:** helper tests; source check; browser current/future/empty/past/boundary and
  Back/Forward stories; English/Dutch at 375 and 1280 px.
- **Rollback:** revert the one-week render and helper/copy additions; the server contract is
  unchanged.
- **Effort:** M.
- **Confidence:** high; `?week=` and focused empty weeks already exist.

### Ticket 2 — Toggleable batch shortcuts

- **Observable behavior:** only `×2`/`×3`/`×4` render; activating sets the multiple, activating
  the selected multiple returns to baseline, and custom counts leave all unpressed.
- **Scope in:** pure toggle target, labels, pressed/disabled/pending semantics.
- **Scope out:** recipe yield and scaling-mode calculation changes.
- **Target files:** `src/lib/meal_batch.ts`, `src/lib/meal_batch.test.ts`,
  `src/routes/meal-plan/+page.svelte`, `messages/en.json`, `messages/nl.json`.
- **Risk tier:** R1 — localized optimistic serving update behavior.
- **Verification:** active/inactive/custom/null/over-99 unit cases; browser selected and
  unavailable states without production writes.
- **Rollback:** revert helper and render loop; no persisted data or API shape changes.
- **Effort:** S.
- **Confidence:** high.

### Ticket 3 — Compact meal title and controls

- **Observable behavior:** Remove sits beside the title, while portions and three batch buttons
  fit on one 375 px row when applicable.
- **Scope in:** meal row structure and responsive classes.
- **Scope out:** add sheet, source-choice internals, and day-planning behavior.
- **Target files:** `src/routes/meal-plan/+page.svelte`.
- **Risk tier:** R1 — localized responsive rendering.
- **Verification:** populated, empty, cooked, linked, unlinked, long-title, source-choice, and
  day-planning source inspection; browser 375/768/1280/effective-200% geometry and keyboard focus.
- **Rollback:** revert the meal-row markup; all handlers and APIs remain intact.
- **Effort:** M.
- **Confidence:** high.

### Ticket 4 — Closure and delivery

- **Observable behavior:** all declared checks pass and the active lane contains no completed
  feature artifact.
- **Scope in:** `npm run check`, `npm run test:unit`, `npm run build`, browser stories,
  simplification, status/archive/log, scoped commit and push.
- **Scope out:** deployment mutations beyond the repository's push-driven Railway build.
- **Target files:** this feature list, its linked design artifact, and `docs/log.md`.
- **Risk tier:** R0 documentation and delivery mechanics after R1 verification.
- **Verification:** clean scoped diff, archive lane check, exact staging list, successful push.
- **Rollback:** revert the feature commit; no migration rollback is needed.
- **Effort:** M.
- **Confidence:** high.

## UI and UX audit findings carried into execution

- **P2 responsive hierarchy:** keep portions and remaining batch shortcuts on one phone row; the
  title row must surrender no width to a full-height Remove column.
- **P2 orientation:** selected week, URL, Previous/Next state, page metadata, Shopping target, and
  assistant context must agree after every navigation.
- **P2 recovery:** past-week visibility must not eject the selected week or make browser Back
  return to a different planning context.
- **P2 cognitive load:** Add remains the only filled weekly action; Suggest keeps text because it
  can spend provider credit; Shopping remains week-specific.
- **P3 menu semantics:** use native details/summary behavior and visible focus for Past and
  Settings rather than a custom popover state machine.
- **Coverage limitation:** production write actions and paid Suggest remain unexercised; local
  browser states, unit tests, and source/API invariants cover them without household mutations.

## Plan critique

| Failure mode | Trigger | Impact | Detectability | Mitigation | Residual risk |
|---|---|---|---|---|---|
| Selected week disappears after a load/resync | URL focus is absent from refreshed `weeks` | Blank canvas or wrong week | High in helper and deep-link tests | Server already inserts focused empty weeks; helper falls back to current then first | Low |
| Past toggle appears to do nothing | One-week view reloads past data but retains no navigable neighbor | Historical access is effectively lost | High in past-visible browser story | Preserve selected `week`, load `past=1`, derive neighbor from expanded sorted list | Low |
| Browser history and UI disagree | Client-only index changes without URL state | Back returns to the wrong week | High in Back/Forward story | Use ordinary `?week=` links, not a parallel carousel state | Low |
| Assistant acts on the current week while another is shown | Screen context keeps `currentWeekStart` | Wrong-week suggestions or actions | Medium; invisible until assistant use | Publish selected week id and selected meal count | Low |
| Active batch button does nothing or reports the wrong effect | Existing label and handler always set the multiplier target | Toggle-off expectation fails | High in unit test and accessible-name inspection | Pure toggle helper plus separate reset label | Low |
| Custom portions look like baseline | No multiplier is pressed for both custom and baseline | Mild interpretation ambiguity | High; exact portion count remains visible | Keep exact count adjacent and do not claim that unpressed always means baseline | Low |
| Dutch toolbar wraps or clips | Longer Shopping/Add labels at 375 px | Primary action becomes harder to scan | High in Dutch phone story | Three-column toolbar with constrained padding and wrapping check | Low |
| Long title loses Remove or controls wrap | Title and action share insufficient width | Recurrent phone friction | High in long-title story | Dedicated title row; controls receive the remaining full content width | Low |
| Pending serving updates allow a second action | Toggle handler bypasses `pendingServings` | Racing writes or stale pressed state | High in source inspection | Route every multiplier through existing guarded `setServings` | Low |

**Steelman:** The strongest objection to Direction B is that it hides the multi-week overview.
It is still the right implementation for the accepted goal because the existing server already
supplies a normalized selected-week URL, adjacent loaded weeks, focused empty weeks, and optional
past history. Ordinary week links preserve orientation and recovery without introducing a new
carousel state model. The accepted extra tap buys a materially calmer repeated mobile task while
keeping every adjacent context directly reachable.

**Plan critique recommendation:** GO. No P0/P1 blockers remain; the failure modes have direct
mitigations and verification. Context7 exception: internal-only Svelte markup and existing
application contracts; no external API behavior or dependency change.

## Risk tier and verification matrix

Overall risk is **R1**: localized UI, navigation, screen-context, and optimistic-control behavior.
There is no R3 staging gate.

| Signal | Required evidence |
|---|---|
| Pure behavior | Navigation helper and batch-toggle unit tests |
| Type/template integrity | `npm run check` |
| Regression suite | `npm run test:unit` |
| Production compilation | `npm run build` |
| Phone rendering | English and Dutch at 375 px; populated, empty, long title, source choice |
| Intermediate rendering | 768 px; no unintended toolbar or row wrap |
| Wide rendering | 1280 px; centered 672 px content column |
| Effective zoom | 200% equivalent; no page-level horizontal overflow or clipped controls |
| Navigation journey | current → next → Back; focused empty; past reveal/hide; boundary disabled |
| Interaction semantics | keyboard focus; overflow open/close; `aria-pressed`; unavailable/pending labels |
| Overlay safety | assistant launcher and bottom navigation do not obscure selected-week actions |
| UI audit | Post-change runtime evidence at selected states and viewports |
| UX audit | URL, week identity, Shopping target, and assistant context remain in agreement |

## Delivery record

- Shipped Direction B: one selected week behind real Previous and Next links, with timing and one
  Shopping/Suggest/Add toolbar. Past weeks and meal-planning Settings now live in the title
  overflow; the duplicate page-level destinations and repeated week headers are gone.
- Removed visible `×1`; `×2`, `×3`, and `×4` are 44 px `aria-pressed` shortcuts beside exact
  portions. Active shortcuts return to the recipe baseline, custom portions leave all shortcuts
  unpressed, and targets above 99 stay unavailable.
- Moved Remove into the 44 px meal-title row and removed the empty week's second Add action, so
  the approved toolbar remains the single weekly action cluster.
- Added pure navigation and batch-toggle coverage. `npm run check` completed with zero diagnostics,
  `npm run test:unit` passed 73 files / 460 tests, and `npm run build` completed successfully.
- Isolated authenticated browser verification covered populated, empty, cooked, linked, unlinked,
  long-title, fixed-batch, pending, custom-portion, and unavailable-over-99 states in English and
  Dutch at 375, 768, 1280, and an effective 200% layout. All widths had zero page-level horizontal
  overflow; browser Back/Forward, past reveal, boundary controls, keyboard overflow, and
  week-specific Shopping URLs stayed aligned.
- Browser console verification reported zero errors and observed requests completed with 200
  responses. Suggest, source, and delete were not triggered; multiplier writes ran only against a
  disposable local fixture database. The Dutch-canonical shopping seam was not changed.

## Open Questions

> **Q: Should the mockup's next-week teaser remain below the selected week?** - Default: omit it.
> Reason: Previous/Next already provide navigation, and the accepted outcome prioritizes a calmer
> canvas over another repeated summary.

## Resume pack

- **Goal:** Ship Direction B — one selected week, quiet selected-week actions, toggleable batch
  shortcuts, and compact meal rows.
- **Current state:** Implemented and verified; archive and publish are the remaining closeout steps.
- **First command:** Review the isolated feature diff, then commit and push.
- **First files:** `src/routes/meal-plan/+page.svelte`, `src/lib/meal_plan_navigation.ts`,
  `src/lib/meal_batch.ts`, `messages/en.json`, `messages/nl.json`.
- **Pending verification:** Post-deploy canary after the Railway build becomes available.
- **Open questions:** next-week teaser defaults to omitted.

## User note reproduced verbatim

> let's work on the https://household-brain-production.up.railway.app/meal-plan page. Let's get rid of the 1x button and have the 2x, 3x, 4x buttons that can be turned on and off (default then is 1x), That way the 2x, 3x, and 4x should be able to fit next to portions. The delete button now takes on a whole horizontal space instead of being next to the title which woudl be more space optimal. I want you to [$design-shotgun](C:\\Users\\metsc\\.agents\\skills\\design-shotgun\\SKILL.md) for more of these kinds of optimizations (show don't tell!) [$ui](C:\\Users\\metsc\\.agents\\skills\\ui\\SKILL.md)
>
> Also let's see if we can make the header section less busy feeling somehow, maybe either finding ways to show all this info in differetn ways or maybe cutting some elements and buttons.
