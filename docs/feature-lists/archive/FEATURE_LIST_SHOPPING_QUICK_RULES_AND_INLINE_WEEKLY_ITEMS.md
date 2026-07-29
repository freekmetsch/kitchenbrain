# Feature List: Shopping Quick Rules and Inline Weekly Items

_Status: Shipped - exact-main production healthy (2026-07-29)_

## Problem framing

The Source Ledger makes the Shopping page calmer, but the remaining editing model still feels
separate from the list it controls.

“Shopping rules” is one umbrella label for four different facts:

- whether a recipe ingredient is always needed or nice to have;
- whether the ingredient is usually stocked through Inventory;
- which approved Dutch recipe term should be bought this run;
- whether that substitute should replace the canonical recipe ingredient.

The header opens a manager, the manager opens a source, and only then do these individual choices
appear. The shopping row also opens the same form in a side sheet. That is more ceremony than a
repeated one-choice correction needs.

Weekly items have the same separation problem. Their definitions are already represented by the
Weekly section, but Add, Edit from this week, Skip this week, and Stop from this week all live in a
multi-view bottom sheet. The household loses the list context and must navigate back through the
manager after each change.

The next refinement should put the editable fact beside the item it affects: direct pills for
recipe need and substitute state, and an inline Weekly editor that temporarily replaces the Weekly
run rows instead of opening a modal or duplicating the same items.

## Intent brief

- **Objective:** make the two remaining Shopping configuration tasks feel like part of the list:
  tap a visible pill to change an ingredient choice, or edit a weekly definition in place.
- **Primary occasion:** Freek or Ylfa notices the wrong need, substitute, quantity, or recurring
  item while planning or scanning the Shopping page on a phone.
- **Entry:** a recipe-owned Shopping row, the compact `Not this run` shelf, the Weekly section
  header, or the `Weekly items` source filter.
- **Outcome:** the changed state is visible where it was changed, survives refresh, and remains
  recoverable after failure or an accidental one-tap write.
- **Exit:** normal Shopping rows resume with focus on the changed source or weekly item; no
  nested manager or value menu remains open.

## Observed evidence

The authenticated post-deploy canary for the shipped Source Ledger verified both narrow and desktop
layouts without retaining household content:

| Current surface | Observed behavior | Friction |
| --- | --- | --- |
| Green header | One `Shopping rules` control sits below the week selector and above source pills. | The label hides several unrelated choices behind one entry point. |
| Recipe-owned row | A summary pill opens a side sheet with three need choices, a substitute select, optional recipe promotion, and Save/Cancel. | A binary need correction or known substitute still becomes a form journey. |
| Global rules manager | A source row expands the same full editor inside the manager. | Off-list recovery works, but the user must first enter a separate rules mode. |
| Weekly section | `Manage` opens a bottom sheet, then Add/Edit/Actions replace one another inside it. | The weekly definition disappears from its list context while it is being edited. |

Source evidence:

- `WeekNav.svelte` owns the umbrella Shopping-rules trigger and count.
- `ShoppingLists.svelte` owns the row summary, global rules sheet, Weekly section, and manager
  trigger.
- `ShoppingRuleEditor.svelte` couples need, term, recipe promotion, and explicit Save.
- `SourceDecisionSheet.svelte` disambiguates aggregate rows through another sheet.
- `RecurringShoppingList.svelte` owns a four-view bottom-sheet state machine.
- `choose-shopping-source.ts` currently accepts one required tri-state `need` plus a `term`; any
  non-`stocked` write can clear Inventory staple state.
- `data.sources` retains excluded recipe sources, while aggregate shopping rows omit them.
- `data.recurring` retains included and skipped weekly definitions, while active ledger rows omit
  skipped occurrences.

No new browser write was exercised during planning. Current rendered behavior comes from the
immediately preceding authenticated structural canary; mutation behavior comes from source and
existing isolated tests.

## Existing-system inventory and invariants

- Recipe-source writes are revision-bound by shopping-entry and recipe revisions. Keep that
  concurrency boundary.
- `included`, recipe `optional`, and Inventory `isStaple` are independent stored facts even though
  the current editor projects them into `required | optional | stocked`.
- A substitute term must be one of the entry's approved Dutch terms. AH search and basket push
  continue to read Dutch fields only.
- A term-only Shopping choice must not change recipe optionality, Inventory staple state, or the
  canonical recipe ingredient.
- Need changes may intentionally update recipe optionality and remove an Inventory staple when the
  user chooses `Always` or `Nice to have`.
- Excluded recipe sources are present in `shopping.sources`, not in aggregate `items`.
- Recurring edits are effective-dated. Editing after a definition's start week closes the old
  range and creates a new recurring row.
- A skipped weekly occurrence remains present in `shopping.recurring` with `included: false`, but
  it is absent from active aggregate shopping rows.
- Past captured weeks remain read-only.
- No schema, auth, dependency, AH provider, or external push change is required.

## Scope

### In

- Remove the umbrella Shopping-rules block from the green week header.
- Replace the full recipe-rule editor with a reusable direct-control component:
  - one need-state pill that cycles between `Always`, `Nice to have`, and `Usually stocked`;
  - one adjacent Buy pill that opens an approved Dutch shopping-term menu when alternatives exist.
- Make each pill selection an immediate revision-bound write with per-source busy state, visible
  success/failure, stale recovery, focus recovery, and Undo where a successful write moves the
  source out of its current row.
- Split term-only and need-only writes at the server seam so a substitute tap cannot change need
  or pantry-staple state.
- Render multi-recipe aggregate controls per source without guessing ownership.
- Add a compact, source-derived `Not this run` disclosure for excluded recipe sources; apply the
  current All/recipe filter to it and reuse the same direct controls.
- Remove Shopping's `Use in recipe` checkbox. A Shopping substitute pill changes this run only;
  canonical recipe promotion remains owned by the existing recipe/cook ingredient-swap path.
- Replace the Weekly bottom sheet with an inline Weekly edit mode inside the Weekly ledger section.
- Render Weekly edit mode from `data.recurring`, never from aggregate shopping rows.
- Keep Weekly run rows and Weekly definition rows mutually exclusive so included items are not
  duplicated.
- Add/edit weekly definitions inline with explicit Save/Cancel and the existing `From this week`
  semantics.
- Add a direct included/skipped pill for the selected week and an inline two-step Stop action.
- Add server-derived read-only state for past weeks.
- Delete superseded sheet/controller/copy paths and update English/Dutch messages and tests.

### Out

- Showing three separate need-state pills at once.
- Changing how Inventory items are marked or unmarked as staples outside the Shopping need
  workflow.
- Automatically promoting a Shopping substitute into the canonical recipe.
- Adding arbitrary substitute text; only approved recipe terms remain selectable.
- Changing recurring schemas, history, effective-date rules, week reconciliation, or captured past
  weeks.
- Showing Weekly definition rows and Weekly shopping rows at the same time.
- Changing AH product preferences, lookup terms, preview, push, history, or provider behavior.
- Adding drag-and-drop, bulk editing, another settings route, or a dependency.

## Option comparison

| Direction | Interaction | Strength | Cost |
| --- | --- | --- | --- |
| **Inline quick controls + section edit mode** | Need and term pills live with each source; Weekly `Edit` swaps the section from run rows to recurring-definition rows. | Lowest recall, no duplicate rows, no modal, and every write remains tied to its source. | Shared recipe rows become taller and immediate writes need strong recovery. |
| Header control board | Keep a compact header panel with separate Need, Substitute, and Weekly blocks. | Preserves one management entry and keeps list rows short. | Still disconnects a choice from the item it changes and recreates a configuration mode. |
| Always-open inline forms | Render all need, substitute, and weekly fields continuously. | Maximum discoverability. | Overwhelms the repeated shopping run, especially with long recipes and many alternatives. |

**Chosen:** Inline quick controls + section edit mode. It follows the household's mental model:
change the fact next to the item; enter a dedicated edit state only for text fields that need a
draft.

## Chosen interaction contract

### Recipe need and substitute controls

- On mobile, the recipe item name, one need-state pill, and one Buy pill share a compact horizontal
  source line.
- The need-state pill shows the current value and changes in one tap: `Always` → `Nice to have` →
  `Usually stocked` → `Always`. It does not expose three simultaneous choices.
- The Buy pill shows the selected Dutch term and opens a compact menu of the canonical Dutch name
  and saved Dutch alternatives. Alternatives are not all rendered as pills.
- The Buy pill is omitted when there is only one approved term.
- One need tap immediately applies the next state. Choosing a Buy menu option immediately applies
  that term. No Save button or dialog follows.
- A term tap submits a term-only patch and preserves `included`, recipe `optional`, Inventory
  `isStaple`, and the canonical recipe ingredient.
- A need tap submits a need-only patch:
  - `Always` sets recipe optional false, includes the source, and clears matching Inventory staple
    state when present.
  - `Nice to have` sets recipe optional true, excludes the source, and clears matching Inventory
    staple state when present.
  - `Usually stocked` keeps the source out of the current run, marks the matching Inventory item as
    a staple through the existing Shopping workflow, and leaves the canonical recipe ingredient
    otherwise intact.
- Each source carries `sourceKey` in the client view. Pending state, post-refresh focus, Undo, and
  regroup recovery key on `sourceKey`, not transient entry ID or aggregate-row key.
- Need writes that bump a recipe revision disable other need controls for the same recipe until
  refreshed. A 409 receives distinct stale copy and reloads current state.
- A term change can split or merge an aggregate row. Focus follows the source-keyed control group
  after reconciliation.
- Multi-source aggregate rows render one compact source line per recipe, labelled by recipe and
  component, each with its own accessible pill groups.
- The compact source line stays on one horizontal row at 320 px without page-level overflow. The
  Buy menu is a bounded popover/listbox rather than a rail of visible alternatives.

### `Not this run`

- A quiet disclosure appears below the source filters only when excluded recipe sources exist.
- It is built from `data.sources`, not aggregate items.
- All shows every excluded recipe source; a recipe filter shows only sources whose meal/recipe
  context matches that filter; Weekly hides the recipe shelf.
- Opening the disclosure renders the same source lines and quick controls as active rows.
- Choosing `Always` can move the source into the active ledger. The disclosure announces the move,
  sends focus to the source's newly rendered control group, and offers Undo using revisions
  returned by the successful write.
- Choosing `Nice to have` while already selected is a no-op, not another request.

### Weekly inline edit mode

- Normal mode retains the current Weekly shopping rows and checkboxes.
- `Edit weekly` in the Weekly section header swaps only that section's body into edit mode. It does
  not open a dialog and does not render shopping rows underneath.
- Selecting the `Weekly items` source pill keeps normal run mode; the section header remains the
  single edit entry point. This preserves shopping/check-off as the default meaning of a source
  filter.
- Edit mode is rendered from `data.recurring`, so included and skipped definitions both have one
  row.
- `Add weekly item` expands an inline composer in the section.
- `Edit` expands name, amount, and unit fields in that definition row. Save retains
  `effectiveWeek: data.weekStart`; Cancel discards the draft.
- On a successful effective-dated edit, close the old editor and focus the returned new recurring
  row because its ID may have changed.
- A direct `This week` / `Skipped` pill updates the selected occurrence. It uses the occurrence
  revision and refreshes the normal ledger after success.
- `Stop from this week` expands an inline confirmation before mutating future recurrence. It never
  shares the one-tap behavior of reversible pills.
- Only one add/edit/stop draft is open at a time. Unrelated source refreshes do not erase a valid
  weekly text draft.
- Past weeks show the definitions read-only with a short explanation; no control waits for the
  server to reject an impossible write.

## Phase plan

### Phase 1 — Separate write semantics and stable identities

Split recipe-choice input into term-only and need-only patches, return refreshed revisions and
stable identity, expose `sourceKey`/`recurringItemId` to the client, and add server-derived
editability. Pin the independent state matrix before changing UI.

### Phase 2 — Put recipe choices on source lines

Build the direct pill component, source-keyed mutation controller, same-recipe write guard, stale
handling, focus/Undo recovery, and responsive alternative rail.

### Phase 3 — Preserve shared and off-list reachability, then delete the manager

Compose multi-source lines and the source-derived `Not this run` shelf, verify filter behavior, and
only then remove the green umbrella trigger, global rules sheet, source decision sheet, full
editor, controller state, and obsolete copy.

### Phase 4 — Replace Weekly's bottom sheet with one inline edit mode

Render recurring definitions from `data.recurring`, add inline Add/Edit drafts, direct
include/skip, guarded Stop, past-week read-only behavior, and focus recovery across effective-dated
ID changes.

### Phase 5 — Simplify and prove the repeated task

Delete dead manager routing, tighten English/Dutch copy, run the full authenticated responsive
matrix for both accounts, and supervise exact-main production delivery without retaining
household evidence.

## Execution tickets

### SHOP-QI-1 — Change a substitute without changing need or pantry state

- **Observable behavior:** tapping an approved Buy pill changes only that source's shopping term
  for the selected run; the need, inclusion, Inventory staple, and canonical recipe remain
  unchanged.
- **In:** discriminated term-only recipe-choice request, approved-term validation, stable
  `sourceKey`, refreshed entry revision response, immediate pill state, per-source busy/error/focus.
- **Out:** recipe promotion, arbitrary text, AH product preference.
- **Targets:** `src/routes/api/shopping/recipe-choice/+server.ts`,
  `src/lib/server/workflows/choose-shopping-source.ts`,
  `src/lib/server/workflows/choose-shopping-source.test.ts`,
  `src/lib/components/shopping/types.ts`,
  new `src/lib/components/shopping/ShoppingSourceQuickControls.svelte`,
  `src/routes/shopping/+page.svelte`.
- **Risk:** R2; a coupled write could silently clear a real Inventory staple or change a recipe.
- **Verification:** required/optional/stocked sources; current/alternative term; invalid term;
  stale entry; aggregate split/merge; canonical recipe and Inventory rows unchanged; Dutch term
  remains the AH-facing source.
- **Rollback:** restore the existing combined endpoint and explicit editor together; do not leave a
  term pill wired to the coupled tri-state command.

### SHOP-QI-2 — Cycle Always, Nice to have, or Usually stocked in one tap

- **Observable behavior:** one Need-pill tap advances through `Always`, `Nice to have`, and
  `Usually stocked`, visibly completes, and can be reversed even when the source moves between the
  ledger and `Not this run`.
- **In:** need-only request with all three states, recipe optional update, intentional staple
  setting/clearing, inclusion update,
  same-recipe pending guard, refreshed revisions, live announcement, source-key focus, Undo.
- **Out:** three simultaneously visible need-choice pills.
- **Targets:** recipe-choice route/workflow/tests, `ShoppingSourceQuickControls.svelte`,
  `ShoppingLists.svelte`, `+page.svelte`, messages, e2e.
- **Risk:** R2; need writes mutate canonical recipe behavior and may remove the current row.
- **Verification:** Always→Nice→Stocked→Always; row disappearance and reappearance; Undo with
  refreshed revisions; concurrent 409; failed write rollback; second ingredient of the same
  recipe refreshes before re-enable; past week disabled.
- **Rollback:** restore explicit Save for need changes and keep the old editor until every quick
  write caller is removed.

### SHOP-QI-3 — Keep shared and excluded recipe sources directly editable

- **Observable behavior:** aggregate rows never guess a recipe source, and every excluded source is
  reachable through `Not this run` with the same one-tap controls.
- **In:** per-source recipe/component labels, source-derived excluded shelf, All/recipe filtering,
  accessible labelled quick controls, fully opaque filter pills, empty/closed/open states.
- **Out:** bulk rules, a dedicated settings route, Weekly sources in the recipe shelf.
- **Targets:** `ShoppingLists.svelte`, `shopping_list_view.ts` only if a pure filter helper is
  warranted, controller/component tests, messages, responsive e2e.
- **Risk:** R2; a missing source host can permanently hide the only way to restore an optional or
  stocked ingredient.
- **Verification:** single recipe, multi-recipe aggregate, same ingredient in two recipes, excluded
  optional, excluded stocked, excluded required legacy state, All/recipe/Weekly filters, long
  recipe names, many substitutes, keyboard group labels, 320 px and 200% layout.
- **Rollback:** keep the existing Rules manager until the excluded shelf passes the full fixture
  matrix.

### SHOP-QI-4 — Remove the Shopping-rules mode after direct controls have parity

- **Observable behavior:** the green header has no Shopping-rules block, rows have no edit-rule
  side sheet, and no rule-management state or copy remains.
- **In:** delete WeekNav counts/callback/styles, `ShoppingRuleEditor.svelte`,
  `SourceDecisionSheet.svelte`, global rules BottomSheet, row summary trigger, manager/controller
  state, `Use in recipe` Shopping copy, dead tests/messages/CSS.
- **Out:** the recipe/cook ingredient-swap path.
- **Targets:** `WeekNav.svelte`, `ShoppingLists.svelte`, `list-controller.svelte.ts` and tests,
  `+page.svelte`, deleted components, `messages/en.json`, `messages/nl.json`, e2e.
- **Risk:** R1 after SHOP-QI-1 through SHOP-QI-3 prove replacement parity.
- **Verification:** repository search finds no removed symbols/messages; active, shared, and
  excluded sources remain editable; focus and screen-reader labels have one owner.
- **Rollback:** revert deletion while preserving the independent server patch seam.

### SHOP-QI-5 — Add and edit Weekly definitions inline

- **Observable behavior:** `Edit weekly` replaces Weekly run rows with one definition row per
  recurring item; Add/Edit fields expand in place and Save/Cancel never open a dialog.
- **In:** inline mode state, `data.recurring` projection, explicit Add/Edit forms,
  effective-week copy, one draft at a time, returned-ID focus after range split, past-week
  read-only mode.
- **Out:** changing recurring schema or effective-date semantics.
- **Targets:** replace `RecurringShoppingList.svelte` with
  `InlineWeeklyItemsEditor.svelte`, `ShoppingLists.svelte`,
  `list-controller.svelte.ts`, `+page.svelte`, recurring domain tests, messages, e2e.
- **Risk:** R2; effective-dated edits can create a new recurring row and stale an editor keyed to
  the previous ID.
- **Verification:** add; edit at start week; edit in later week; returned new ID; cancel; failed
  save retains draft; unrelated refresh retains draft; empty editor; included and skipped appear
  once; normal mode restores aggregate rows and focus.
- **Rollback:** restore the bottom-sheet component and existing callbacks; recurring data is
  unchanged.

### SHOP-QI-6 — Make Weekly occurrence and stop actions direct but safe

- **Observable behavior:** `This week` / `Skipped` changes in one tap inside Weekly edit mode;
  `Stop from this week` requires one inline confirmation and then removes future recurrence.
- **In:** include/skip request with occurrence revision, direct pending/rollback state, guarded
  stop confirmation, focus after reconciliation, disabled past state.
- **Out:** undoing a stopped recurring range automatically or editing historical captures.
- **Targets:** `InlineWeeklyItemsEditor.svelte`, Shopping API command wiring, domain tests,
  `ShoppingLists.svelte`, messages, e2e.
- **Risk:** R2; the wrong occurrence or effective date could hide future weekly items.
- **Verification:** included→skipped→included; missing occurrence; stale occurrence; stop on start
  week; stop on later week; cancelled confirmation; current/future captures; normal ledger agrees
  after leaving edit mode.
- **Rollback:** restore the current manager action view; no schema rollback.

### SHOP-QI-7 — Complete responsive, two-account, and production acceptance

- **Observable behavior:** the Shopping page stays compact and recoverable across realistic rule,
  substitute, off-list, and Weekly edit states.
- **In:** focused unit/domain tests, Svelte diagnostics, production build, primary and secondary
  authenticated e2e, English/Dutch, phone/tablet/desktop, light/dark, long content, error/stale/
  pending states, dead-code trim, deployment canary.
- **Out:** real AH preview/push or authenticated screenshots.
- **Targets:** `tests/e2e/kitchen-flows.e2e.ts`,
  `tests/e2e/responsive-parity.e2e.ts`, focused changed tests, docs/log/archive during `$run`.
- **Risk:** R1 verification/delivery.
- **Verification:** `npm test`; `npm run test:e2e:secondary`; `git diff --check`; Gitleaks; Railway
  `SUCCESS` on exact remote `main`; authenticated 320/1280 structural canary; zero app-origin
  console/HTTP errors.
- **Rollback:** normal revert of the complete UI/workflow commits. No migration, variable, or AH
  rollback is needed.

## Execution result

| Ticket | Result | Evidence |
| --- | --- | --- |
| SHOP-QI-1 | Complete | The recipe-choice API has a discriminated term-only path; domain tests prove the Dutch shopping term changes without touching need, inclusion, Inventory, canonical recipe state, sibling sources, or other weeks. |
| SHOP-QI-2 | Complete | One source-keyed Need pill cycles Always → Nice to have → Usually stocked → Always; writes serialize per recipe and 409 recovery is distinct. |
| SHOP-QI-3 | Complete | Active, shared, and excluded recipe sources use the same controls; `Not this run` is projected from every recipe source and respects All/recipe/Weekly filtering. |
| SHOP-QI-4 | Complete | The umbrella rules block, rule sheet, weekly manager, controller state, routes, copy, and obsolete components are removed; repository search is clean. |
| SHOP-QI-5 | Complete | `Edit weekly` replaces run rows with recurring definitions; inline add/edit retains failed drafts and restores focus to returned recurring IDs. |
| SHOP-QI-6 | Complete | Weekly include/skip is direct, stop requires inline confirmation, later-week ranges retain effective-week semantics, and past weeks are read-only. |
| SHOP-QI-7 | Complete | PR #33 merged as `69b0ca6`; Railway deployment `9ef0f712-8370-4542-9ef8-b31156c77f1b` reached `SUCCESS` on that exact remote `main`, and the privacy-safe authenticated canary passed. |

## Risk tier and rollout

Overall risk is **R2**. There is no schema, auth, destructive data operation, or new dependency.
The risk comes from turning explicit form submissions into immediate writes against canonical
recipe optionality, Inventory staple state, shopping inclusion, and effective-dated recurring
definitions.

- Land and verify independent term/need commands before exposing any quick pill.
- Keep the old manager reachable until active, shared, and excluded sources pass replacement
  parity.
- Keep Weekly run/edit modes mutually exclusive from the first inline implementation.
- Use isolated authenticated fixtures; do not exercise a real AH action.
- Ship through GitHub `main`, wait for Railway terminal `SUCCESS`, prove deployed commit equals
  remote `main`, then run a privacy-safe authenticated canary.
- Beta staging is not required because the plan has no R3 ticket. A normal code revert restores
  the prior UI and commands.

## Failure-mode table

| Priority | Failure mode | Trigger | Impact | Detectability | Mitigation | Residual risk |
| --- | --- | --- | --- | --- | --- | --- |
| P1 | Substitute tap clears Inventory staple | Current coupled endpoint receives a non-stocked need with the term | An unrelated one-tap substitution changes pantry behavior | High in DB transaction test | Term-only command never accepts or writes need/staple/inclusion fields | Low |
| P1 | Nice-to-have success removes the focused row | Need write sets `included: false` | The control disappears and the user cannot tell whether it worked | High in e2e | Source-derived shelf, live announcement, source-key focus, refreshed-revision Undo | Low |
| P1 | Excluded source has no control host | UI is built only from aggregate shopping rows | Optional/stocked ingredients cannot be restored | High in fixture | Build `Not this run` from all recipe `sources`, filtered by current source context | Low |
| P1 | Skipped weekly item cannot be edited | Weekly editor is built from active ledger rows | Skipped definitions disappear from management | High in projection test | Build edit mode only from `data.recurring` | None expected |
| P1 | Included weekly item appears twice | Definition rows render above unchanged shopping rows | The section becomes confusing and excessively tall | High in DOM count | Weekly run and edit bodies are mutually exclusive | None expected |
| P1 | Another source in the same recipe becomes stale | Need write bumps recipe revision | Next quick tap receives 409 | High in same-recipe e2e | One need write per recipe at a time, refresh all recipe sources, distinct stale recovery | Low across two accounts |
| P1 | Term change splits an aggregate and loses focus | Selected term no longer aggregates with sibling sources | Item appears to jump or duplicate | High in projection/e2e | Key interaction state and focus by `sourceKey`, not aggregate item key | Low |
| P1 | Effective-dated edit leaves focus on dead recurring ID | Later-week edit closes old range and inserts new row | Editor appears lost after successful Save | High in domain/e2e | Return new ID/source identity, close draft, focus returned definition | Low |
| P1 | Past-week pills appear writable | User browses a captured historical week | Every tap fails with generic error | High in browser test | Server-derived editability disables controls with explanatory copy | None expected |
| P2 | Many substitutes overwhelm 320 px | Recipe contains several long approved terms | Rows become too tall or page overflows | High in long fixture | One compact Buy menu per labelled source line; alternatives stay collapsed until opened | Low |
| P2 | Immediate tap is repeated during network delay | Double tap before invalidate completes | Duplicate/stale requests and flicker | High in routed delay test | Disable the affected source and same-recipe need controls while pending | Low |
| P1 | Quick Undo overwrites a concurrent change | Another account edits before Undo | Old state could replace newer intent | High via revision conflict | Undo uses refreshed revisions and fails closed on 409, then reloads | Low |
| P1 | UI removes only route to recipe promotion | `Use in recipe` is deleted without an alternative owner | Permanent substitution appears impossible | High in source search | Preserve existing recipe/cook ingredient-swap path and name Shopping choice as `this run` | Low |
| P1 | Public verification captures household content | Production canary saves a screenshot/body | Private list data reaches the public repo | High in artifact review | Synthetic visuals only; production structural counts and errors, no retained content | Low |

## Verification matrix

| Layer | Required proof | Result |
| --- | --- | --- |
| State separation | Term-only write preserves `included`, recipe optionality, Inventory staple, canonical recipe, and other sources | Complete — workflow/domain tests |
| Need mapping | Required, optional, stocked, included+stocked, and excluded-required legacy combinations map honestly to UI state | Complete — workflow and browser cycle |
| Revision safety | Entry stale, recipe stale, same-recipe sequential need taps, two-account conflict, refreshed Undo | Complete — focused unit/e2e plus both account matrices |
| Active/source projection | Single source, multi-source aggregate, row split/merge, source-key focus, All/recipe/Weekly filters | Complete — source-ledger browser story |
| Off-list shelf | Optional, stocked, and excluded-required sources; closed/open/empty; move to ledger and Undo | Complete — filter and recovery browser coverage |
| Weekly definitions | Included/skipped, add, same-start edit, later effective edit/new ID, stop, cancel, stale, past read-only | Complete — domain and inline-editor browser coverage |
| Responsive UI | 320, 375, 768, 1280 px; 200% effective layout; long recipe/term strings; many terms; EN/NL; light/dark | Complete — responsive matrix |
| Accessibility | Labelled controls per recipe source, selected/busy state, 44 px project target, keyboard/focus/live announcements | Complete — semantic locators, focus assertions, and layout checks |
| Repository gate | `npm test`; `npm run test:e2e:secondary`; `git diff --check`; Gitleaks | Complete — 125 files/672 unit tests, 23 primary and 23 secondary browser tests; static gates clean |
| Production | Railway exact `main`, authenticated narrow/desktop structural canary, zero console/HTTP errors, no retained household evidence | Complete — exact `69b0ca6`, authenticated 320/1280 checks, zero console/runtime/HTTP errors |

Context7 is not required: this plan changes internal Svelte composition and existing application
commands, not an external framework/library/API contract.

## Plan critique

The first draft was **NO-GO**. Independent review identified four load-bearing failures:

1. a substitute tap could not preserve Inventory staple state through the coupled endpoint;
2. a successful Nice-to-have write could remove the focused row without recovery;
3. excluded recipe sources had no concrete host after deleting the rules manager;
4. skipped weekly definitions had no host if inline editing used ledger rows.

The selected approach now separates term and need commands, keys focus and Undo by `sourceKey`,
builds `Not this run` from all recipe sources, and renders a mutually exclusive Weekly edit body
from recurring definitions. It also adds same-recipe write serialization, stale-specific feedback,
past-week read-only state, and returned-ID focus after effective-dated recurring edits.

**Steelman:** Keeping a compact header control board would reduce row height and retain one familiar
management entry. It remains the weaker repeated-task model because it asks the household to find
an item in the ledger, remember its recipe/source, then find it again in a separate control board.
Direct source lines use more height only where a real choice exists, preserve ownership on shared
rows, and let one-tap changes show their result in context. Weekly edit mode avoids the strongest
counterargument—duplicate list and editor rows—by replacing the section body rather than stacking
another list.

Plan-readiness recommendation: **GO**. The revised tickets resolve all four critique blockers and
name a rollback and observable verification path for each write boundary. No R3 stage gate applies.

## Open Questions

> **Q: Where should `Usually stocked` be changed?** — Accepted: keep it as the third Shopping
> quick-choice state, but show only one state pill at a time. A tap cycles the pill rather than
> exposing three simultaneous choices.

> **Q: Should a Shopping substitute become the recipe default?** — Default: no; a Buy pill changes
> this run only and the existing recipe/cook ingredient-swap path owns permanent promotion. Reason:
> a one-tap shopping correction should not silently rewrite the canonical recipe.

> **Q: Should the Weekly filter open edit mode automatically?** — Default: no; the filter remains a
> shopping/check-off view and `Edit weekly` replaces that section body inline. Reason: filtering
> should not unexpectedly turn the repeated shopping task into configuration mode.

## Resume pack

- **Goal:** replace the remaining Shopping rules and Weekly-item managers with direct source pills
  and a single inline Weekly edit mode.
- **Current state:** all seven execution tickets are shipped. The provider-free repository gate,
  both authenticated test-account matrices, exact-main Railway deployment, and privacy-safe
  production canary pass.
- **Continue with:** session complete; `$plan` the next item.
- **Do not retain:** household screenshots, bodies, cookies, list contents, or other authenticated
  evidence.
- **Accepted decisions:** one cycling need-state pill including `Usually stocked`; one adjacent Buy
  pill opens an approved-term menu and applies to this run only; Weekly filter remains run mode and
  `Edit weekly` swaps the section inline.
