# Feature List: Shopping One-List Refinement

_Status: Shipped - 2026-07-27_

## Approved outcome

Implement **A1 — Quiet Ledger** as the default `/shopping` experience, with **Store Route** as an
optional sort/grouping inside the same list. Preserve the current olive-green Shopping utility
band.

The binding product contract is:

1. `Shopping` is the sole page identity. Remove `Weekly shop · Household run`, `Market run`,
   `Run`, and the visible `Run / meals / Every week` switch.
2. Keep one compact, divided, checkable list. A meal selection filters that same list; it never
   creates another bought state or another copy of a shared item.
3. Default to the quiet original list order. Offer one sort control with `List order`, `A–Z`, and
   `Store route`.
4. Store Route is an opt-in, display-only best-effort projection. It never changes shopping data,
   recipe data, AH terms, AI output, or the default A1 view.
5. Keep week range, delivery date, progress, meal-plan access, and AH state as compressed support
   inside the green band.
6. Keep recipe context exceptional: show it for shared items, incompatible quantities, and the
   shopping-rule surface—not below every ingredient.
7. Replace `Change` with the exact command `Edit shopping rule`. A shared item first asks which
   recipe-owned rule will change.
8. Move recurring maintenance behind `Manage weekly items`; keep excluded optional/stocked recipe
   sources reachable through a secondary `Manage shopping rules` surface.
9. Preserve Add item, AH review, completed recovery, covered disclosure, warnings, notices,
   English/Dutch, 44 CSS-pixel targets, and the Dutch-canonical AH seam.

## Problem framing

The shipped page repeats one identity three times: `Weekly shop · Household run`, `Market run`,
and `Run`. Its peer tabs also mix unlike jobs:

- `Run` is the household's checkable acquisition task.
- `{count} meals` is ingredient-rule maintenance.
- `Every week` is recurring-item maintenance.

The Meals panel renders one row per recipe source, so a recipe title is repeated below every
ingredient by construction. Its `Change` action actually edits required/optional/stocked state,
the effective weekly term, and an optional canonical recipe substitution. The label does not
describe that consequence.

The list is also not meaningfully filterable or sortable. Its minimum row height is `3.6rem`, even
when an item has no exceptional context. On desktop, a `Run context` card repeats counts already
communicated by the green progress band.

One backend detail is more important than the visual symptoms: `shopping_view.aggregateRows`
currently creates separate rows for the same selected Dutch term when source quantities cannot be
summed. That contradicts the accepted “show each shopping item once” rule. The implementation must
repair that canonical projection before layering filters or Store Route on top.

## Existing-system inventory

| Concern | Current owner | Plan consequence |
|---|---|---|
| Aggregated shopping identity | `src/lib/server/shopping_view.ts` | Make one normalized selected Dutch term equal one row, including incompatible quantities |
| Source ownership | `ShoppingListItem.sources` / `ShoppingSourceView` | Retain every entry ID, revision, recipe, meal, amount, and rule behind the row |
| Meal membership | `item.sources[].mealNames` | Use this current truth; `ShoppingListItem.forMeals` is not populated by the page load |
| Purchase form | `item.sources[].purchaseForm` | Use only as a conservative Store Route hint when contributing recipe sources agree |
| Bought state | `shoppingWeekEntries.bought` through aggregated `entryIds` | Checking one row updates every contributing source exactly once |
| AH preview/push | `ah-preview`, preview token binding, `ah-push` | Keep the full unfiltered canonical pending list and the exact Dutch term/entry binding |
| AI shopping tool | `src/lib/server/ai/executors/shopping.ts` | Update projection tests because it consumes `getShoppingWeekView` |
| Row and tab UI | `ShoppingLists.svelte` | Remove peer tabs; add one filter/sort/list surface |
| Recipe rule editing | `SourceDecisionSheet.svelte` | Keep the revision-checked mutation; clarify title/context and add source selection |
| Recurring maintenance | `RecurringShoppingList.svelte` | Recompose as one focused manager without stacked bottom sheets |
| Header | `WeekNav.svelte` | Keep its existing olive gradient; simplify to the sole title `Shopping` |
| Supporting actions | `/shopping/+page.svelte`, `AddItemForm`, `AhSheet`, `PushHistory` | Preserve Add/AH dock, AH desktop action, and send history |
| Inventory `section` | `inventory_items.section` | Do not reuse it: it means storage (`freezer`/`pantry`), not a store aisle |
| Food class | `src/lib/food_class.ts` | Do not grow it into a store dictionary; its contract explicitly avoids that |

## Scope

### In

- One normalized Dutch shopping term becomes one active or completed row.
- Compatible quantities still sum; incompatible quantities retain every source amount and recipe
  without fabricating one combined amount/unit.
- One horizontal filter rail: All, each contributing meal, and Weekly when weekly sources exist.
- One sort control: List order (default), A–Z, Store route.
- Static Store Route groups in this fixed order:
  `Fresh`, `Bakery`, `Chilled`, `Pantry`, `Frozen`, `Household`, `Other`.
- A conservative, code-owned, Dutch-canonical route resolver with an honest `Other` fallback.
- One compact list treatment for active, covered, and completed rows.
- A real per-row action menu with source-kind routing.
- A source chooser for shared recipe items and a secondary all-recipe `Manage shopping rules`
  surface so excluded optional/stocked sources remain editable.
- A single-owner `Manage weekly items` sheet for add/edit/skip/disable.
- Green Shopping header copy and desktop supporting-context cleanup.
- English/Dutch copy, focus behavior, announcements, long content, warnings, empty/recovery states,
  narrow reflow, high zoom, and reduced motion.

### Out

- Database columns, migrations, saved aisle/category overrides, household-specific store layouts,
  drag-and-drop route ordering, or category correction history.
- Using AH catalog categories, AH connectivity, OpenRouter, or any network call to classify a
  Store Route item.
- Reusing Inventory's freezer/pantry storage field as a store section.
- Persisting filter/sort choice across visits. Every visit starts in approved A1 List order.
- Changing recipe-rule mutation semantics, recurring mutation semantics, week calculation, auth,
  AH search terms, AH favorites, provider behavior, or push history.
- A generic cross-route filter/sort framework or redesign of other Kitchen Ledger routes.

These exclusions are inert. No schema, caller migration, or rename depends on a later follow-up.

## Architecture decision

### One canonical item projection

`getShoppingWeekView` remains the source of truth. Aggregation changes from “one compatible
quantity cluster per term” to “one row per normalized selected term”:

- append every contributing source and entry ID to the same row;
- keep first-appearance order stable;
- set bought only when every contributing source is bought;
- keep stock coverage term-based;
- sum amount/unit only when every source quantity is compatible;
- otherwise set the aggregate amount/unit to no value, mark `incompatibleQuantities`, and retain
  the full source amounts for display and AH review.

The UI, AH preview token, AH push revalidation, and AI shopping output all continue consuming this
one projection. No client-only merge may create a second identity model.

For an incompatible AH item:

- search once using the unchanged Dutch selected term;
- bind all entry IDs and revisions to the one preview item;
- show each source amount with recipe context;
- do not present a calculated pack count as trustworthy;
- require explicit confirmation of the pack count before a product decision can be sent;
- if the row falls back to free text, preserve a truthful source-amount summary rather than
  silently sending only the name;
- mark every contributing source bought only after that one decision succeeds.

### One source-derived view projection

A pure client-safe module owns:

- unique meal and weekly filter options;
- the single predicate applied to active, covered, and completed arrays;
- stable List order;
- Dutch-canonical A–Z order;
- Store Route classification, section order, and grouping;
- visible-order focus helpers after checking or restoring an item.

The projection reads `item.sources[].mealNames` and `item.sources[].purchaseForm`; it does not
assume the unused item-level convenience fields are populated.

The predicate is exact and deterministic:

- collapse duplicate meal names into one filter option;
- a meal filter matches a row when any source has that exact meal name;
- Weekly matches a row when any source has `sourceKind === 'weekly'`;
- a manual-only row matches only All, unless it is aggregated with a matching meal/weekly source;
- a shared row still appears once even when several sources match;
- apply that same predicate before computing active, covered, and completed disclosure counts;
- preserve the server's first-appearance index as the final stable tie-breaker for every sort.

The page-level `pending` array stays canonical and unfiltered for WeekNav progress, the Add/AH
dock count, `AhSheet`, and preview entry IDs. Filter/sort state changes only the visible projection.

### Conservative Store Route

Store Route is useful only if false confidence is minimized. The resolver therefore uses this
fixed precedence:

1. If contributing recipe sources contain conflicting non-`any` purchase forms, return `Other`.
2. Unanimous `frozen` maps to Frozen.
3. Unanimous `preserved` or `dried` maps to Pantry.
4. Unanimous `fresh` may be refined by an explicit Bakery or Chilled lexical rule; otherwise it
   maps to Fresh.
5. When there is no explicit form, use an explicit Dutch phrase or whole-token-signature
   allowlist for unambiguous Bakery, Chilled, Household, and common Fresh/Pantry/Frozen terms.
6. Return `Other` for every unknown or ambiguous case.

No loose substring matching is allowed. Dutch compounds require an explicit allowed compound or
token signature, with false-positive tests. Manual and weekly rows may use the same exact lexical
allowlist, but missing metadata is never treated as evidence; otherwise they land in `Other`.

The classifier is display-only. It accepts the Dutch canonical selected term, never a translated
display name, and its output never reaches AH, recipe writes, inventory writes, or the AI tool.

### One list, secondary maintenance

The core list contains unique shopping rows. Its 44-pixel overflow action opens a real menu:

| Row ownership | Menu outcome |
|---|---|
| One recipe source | Open `Edit shopping rule` directly for that ingredient + recipe |
| Several recipe sources | Open a recipe-source chooser, then `Edit shopping rule` for one source |
| One or more manual sources | Offer an exact remove-this-week action per manual source, with undo |
| One or more weekly sources | Offer `Manage weekly items`; do not send a weekly source to the recipe API |
| Mixed recipe/manual/weekly | Show each applicable source-owned command; never collapse owners |
| Unresolved legacy source | Keep the existing attach/manual/dismiss review outcome |

Because optional and usually-stocked recipe sources can be excluded from the aggregate list, a
compact `Manage shopping rules` entry remains available outside the rows. It is backed by all
recipe sources and defaults to excluded sources when opened from the “not on this list” disclosure.
This is maintenance, not a peer shopping mode.

Recurring management uses one modal owner. The manager changes between list/add/edit/action
states inside one BottomSheet instead of opening BottomSheets on top of another BottomSheet.

## Options considered

| Option | Disposition | Reason |
|---|---|---|
| A1 Quiet Ledger only | Partially selected | Correct default and density, but it would omit the requested physical-store route |
| A1 + conservative Store Route projection | **Selected** | Useful offline physical grouping, no schema, no recurring household maintenance, and safe `Other` fallback |
| Persisted per-item store category + correction UI | Rejected | R3 schema/data ownership plus ongoing household maintenance before measured need |
| AH catalog/category lookup | Rejected | Makes physical shopping depend on one digital store, connection state, and an unofficial API |
| Reuse Inventory section or food class | Rejected | Storage and food taxonomy do not represent store position |
| AI-generated categories | Rejected | Metered, network-dependent, nondeterministic, and requires persistence/correction ownership |

## Phase plan

### Phase 1 — Repair the canonical item contract

1. Merge every identical normalized selected term into one server row.
2. Preserve compatible sums and expose incompatible source quantities honestly.
3. Update AH preview/push and AI consumer contracts before changing the page.

Checkpoint: shared and incompatible terms produce one stable row/ref, retain all source IDs, and
cannot silently push a guessed quantity.

### Phase 2 — Establish filtering, sorting, and Store Route

1. Add the pure source-derived view module.
2. Prove one predicate scopes active, covered, and completed rows.
3. Add the conservative Dutch Store Route resolver and `Other` fallback.

Checkpoint: a shared item appears once under each applicable meal filter, every state agrees with
the filter, and Store Route cannot mutate canonical data or AH input.

### Phase 3 — Build the Quiet Ledger shell

1. Simplify the green header to the sole Shopping identity.
2. Remove the three peer tabs and duplicate desktop Run context.
3. Add the filter rail, sort control, compact rows, section headings, and visible-order focus.

Checkpoint: List order is the default, the first item starts higher, and every active row remains
checkable at 44 CSS pixels in all view states.

### Phase 4 — Preserve maintenance without modes

1. Add source-kind row actions and the recipe-source chooser.
2. Add the all-recipe `Manage shopping rules` surface.
3. Recompose recurring maintenance into one non-stacked manager.
4. Keep legacy review and notices available as exceptional disclosures.

Checkpoint: every current recipe/manual/weekly/legacy outcome remains reachable without restoring
the old mode switch or repeating recipes in the main list.

### Phase 5 — Simplify and release

1. Remove dead tab state, tab markup/styles, unused message keys, and obsolete comments.
2. Run the complete source, browser, language, accessibility, and recovery matrix.
3. Run repository gates and review the final diff for unrelated work.

## Execution tickets

### SHOP-1 — Canonical one-row aggregation and AH/AI contract

- **Observable behavior:** one normalized selected Dutch term renders as one shopping item even
  when source quantities are incompatible; every source remains owned and recoverable.
- **In:** compatible sum, incompatible source details, bought/covered rules, stable order, all
  entry IDs/revisions, AH preview/push behavior, AI shopping output.
- **Out:** schema, source mutation rules, AH product search/ranking, provider calls.
- **Targets:** `src/lib/server/shopping_view.ts`, `shopping_view.test.ts`,
  `src/lib/shopping_ah.ts`, `src/routes/api/shopping/ah-preview/+server.ts`,
  `src/routes/api/shopping/ah-push/+server.ts` and tests,
  `src/lib/server/ai/executors/shopping.test.ts`, quantity presentation in `AhSheet.svelte`, and
  English/Dutch warning copy.
- **Dependencies:** none.
- **Risk:** R2. This shared projection feeds the page, AH, and AI, but does not write a migration.
- **Impact / effort / confidence:** 5 / L / medium-high.
- **Verification:** compatible and incompatible unit fixtures; one term/ref; all IDs/revisions;
  Dutch term unchanged; one product search; no trusted calculated pack quantity; explicit pack
  confirmation; truthful free-text summary; stale preview rejection; full-success and partial/
  uncertain marking; AI returns one item with `incompatible_quantities`.
- **Rollback:** revert the projection and its consumer-contract changes together. No stored data
  needs restoration.

### SHOP-2 — Source-derived filters, sorts, and Store Route

- **Observable behavior:** All, meal, and Weekly filters scope one deduplicated list; A–Z and Store
  Route reorder it without changing identity or bought state.
- **In:** shared-item membership, scoped active/covered/completed projections, stable original
  order, Dutch A–Z, fixed section order, exact allowlist, agreed purchase-form hints, `Other`.
- **Out:** saved preferences, manual section correction, custom route order, AH/AI classification.
- **Targets:** new `src/lib/shopping_list_view.ts` and
  `src/lib/shopping_list_view.test.ts`; shopping component types only if the pure contract needs
  a narrower shared shape.
- **Dependencies:** SHOP-1.
- **Risk:** R2. New repeated-task view logic and a best-effort classifier.
- **Impact / effort / confidence:** 5 / L / medium-high.
- **Verification:** shared item in two meal filters but once per projection; weekly/mixed/manual
  sources; active/covered/done agreement; stable ties; Dutch diacritics; exact phrases and Dutch
  compounds; substring false positives; mixed forms; all-Other route; display-only invariant;
  visible-order next-focus helper.
- **Rollback:** remove the view module and retain canonical List order.

### SHOP-3 — Green Shopping utility band and page-shell cleanup

- **Observable behavior:** the olive band says only `Shopping` while retaining week navigation,
  delivery, meal-plan link, AH state, weekly progress, and current-week recovery.
- **In:** existing gradient, responsive band, global weekly counts, English/Dutch copy, removal of
  the duplicate desktop Run context card.
- **Out:** week calculation, AH connection logic, progress semantics, PushHistory.
- **Targets:** `src/lib/components/shopping/WeekNav.svelte`,
  `src/routes/shopping/+page.svelte`, shopping message keys.
- **Dependencies:** SHOP-1 for final global counts.
- **Risk:** R1.
- **Impact / effort / confidence:** 4 / S / high.
- **Verification:** current/other week, delivery/no delivery, AH online/offline, empty/populated/
  complete at 375/768/1280; only one visible page identity; green retained; no duplicated Run copy.
- **Rollback:** restore prior markup/copy while retaining SHOP-1.

### SHOP-4 — Quiet Ledger list surface

- **Observable behavior:** the old mode switch is gone; one compact list exposes meal/weekly
  filters, one sort control, Store Route groups, covered recovery, and completed recovery.
- **In:** 44-pixel filter/checkbox/action targets, compact default rows, exceptional shared/
  warning context, static group headings, scoped counts, notices slot, empty and filter-empty
  states, visible-order focus/undo, Add/AH dock parity.
- **Out:** maintenance internals handled by SHOP-5/6/7.
- **Targets:** `src/lib/components/shopping/ShoppingLists.svelte`,
  `src/routes/shopping/+page.svelte`, `format.ts`, shopping messages.
- **Dependencies:** SHOP-1, SHOP-2, SHOP-3.
- **Risk:** R2. This replaces the primary repeated shopping interaction.
- **Impact / effort / confidence:** 5 / L / high.
- **Verification:** check/undo/restore under every filter and sort; shared item once; Store Route
  static headings; all-Other route; long item/meal names; incompatible details; scoped done/
  covered disclosures; no-results clear path; keyboard, focus, live announcement, reduced motion;
  AH receives unfiltered canonical pending regardless of visible state.
- **Rollback:** restore the prior list markup/tabs while keeping SHOP-1 consumer-safe.

### SHOP-5 — Shopping-rule and manual source routing

- **Observable behavior:** every visible row has honest source-owned actions; `Edit shopping rule`
  identifies the ingredient and recipe before a revision-checked save; excluded sources remain
  reachable through `Manage shopping rules`.
- **In:** single-source direct edit, shared-source chooser, all recipe sources, excluded-source
  default view, required/optional/stocked/term/substitution outcomes, manual remove/undo/restore,
  mixed-source action routing, stale failure recovery.
- **Out:** mutation semantics, recipe schema, automatic source merging.
- **Targets:** `ShoppingLists.svelte`, `SourceDecisionSheet.svelte`, a focused recipe-source
  chooser/manager component if separation reduces state coupling, shopping messages.
- **Dependencies:** SHOP-4.
- **Risk:** R2. A wrong source selection could edit the wrong recipe rule.
- **Impact / effort / confidence:** 5 / M / high.
- **Verification:** one and multiple recipe sources; same ingredient across long recipe names;
  excluded optional/stocked source; mixed manual/recipe source; exact affected ingredient +
  recipe in chooser and editor; cancel/failure/stale/success; focus return; manual undo.
- **Rollback:** restore the prior recipe-source panel temporarily; source data is unchanged.

### SHOP-6 — Single-owner weekly-item manager

- **Observable behavior:** `Manage weekly items` opens one focused surface where the household can
  add, edit, skip, or stop a recurring item without a tab or stacked modal.
- **In:** internal list/add/edit/action states, pending lock, success/failure, focus entry/return,
  empty recurring state, current-week occurrence state.
- **Out:** recurring schema and mutation APIs.
- **Targets:** refactor/replace `RecurringShoppingList.svelte`; integration in
  `ShoppingLists.svelte`; shopping messages.
- **Dependencies:** SHOP-4.
- **Risk:** R2. Focus and pending state can regress during the modal-state refactor.
- **Impact / effort / confidence:** 4 / M / high.
- **Verification:** add/edit/skip/disable, cancel, invalid input, double-submit prevention, API
  failure, no nested dialogs, Escape/backdrop/focus return, 320 px and 200% reflow.
- **Rollback:** restore the existing recurring component and temporarily expose it in a single
  non-nested surface.

### SHOP-7 — Legacy/notices preservation and dead-mode deletion

- **Observable behavior:** unresolved legacy rows, meal/freezer notices, AH disconnected guidance,
  and quantity warnings remain visible without peer modes; no old tab or vague action copy remains.
- **In:** LegacyShoppingReview outcome parity, notice placement, warning semantics, source-context
  labels, dead import/style/message cleanup.
- **Out:** legacy resolution mutation, freezer derivation, AH connection behavior.
- **Targets:** `ShoppingLists.svelte`, `LegacyShoppingReview.svelte`,
  `ShoppingNotices.svelte`, English/Dutch messages, comments and unused imports.
- **Dependencies:** SHOP-5, SHOP-6.
- **Risk:** R2. Removing the tabs can accidentally remove an exceptional recovery path.
- **Impact / effort / confidence:** 4 / M / high.
- **Verification:** unresolved/attach/manual/dismiss; meals without recipes; freezer meal and
  missing fresh-info warnings; AH offline guidance; no `Run / meals / Every week / Change`
  remnants in the rendered Shopping page; no dead message callers.
- **Rollback:** restore the affected disclosure independently; no data rollback.

### SHOP-8 — Cross-state release gate

- **Observable behavior:** A1 is the quiet default, Store Route is an honest optional projection,
  and every acquisition/maintenance/recovery journey works in English and Dutch.
- **In:** the matrix below, source audit, responsive/a11y browser proof, repository gates,
  `git diff --check`.
- **Out:** unrelated route polish and new product scope found during verification.
- **Targets:** targeted fixes only in files already named by SHOP-1 through SHOP-7.
- **Dependencies:** SHOP-1 through SHOP-7.
- **Risk:** R2.
- **Impact / effort / confidence:** 5 / M / high.
- **Verification:** `npm run check`, `npm run test:unit`, `npm run build`, `git diff --check`, then
  the complete browser matrix.
- **Rollback:** revert by ticket or revert the feature as one code-only change set.

## Risk and verification

Overall risk is **R2**. This changes a primary repeated-task UI and its shared read projection, but
does not change schema, auth, destructive writes, secrets, or external providers. The beta-stage
R3 advisory gate does not apply.

### Failure-mode critique

| Failure mode | Trigger | Impact | Detectability | Mitigation | Residual |
|---|---|---|---|---|---|
| Same item still appears twice | Client filters are built over the current incompatible clusters | Core promise fails | High in projection tests | Repair server aggregation first; one normalized term per row/ref | Low |
| Incompatible amount becomes a lie | UI/AH uses one arbitrary source or concatenated fake unit | Under/over-buying | High in source fixtures | Null aggregate, show every source, require AH pack confirmation | Low |
| AH sends a filtered subset | Visible projection replaces canonical `pending` | Missing household items | High in endpoint/browser test | Keep AhSheet wired to page-level unfiltered pending | Low |
| AH/AI drift after aggregation | Shared consumer assumes old row count/amount | Stale rejection or wrong output | High in contract tests | Update preview, push, and executor tests in SHOP-1 | Low |
| Shared rule edits wrong recipe | Aggregated row bypasses source ownership | Recipe policy corruption | High in chooser tests | Explicit source chooser with ingredient + recipe and revisions | Low |
| Excluded rules become unreachable | Meals tab removed and only active rows get actions | Cannot reverse stocked/optional choice | High in source inventory | All-recipe Manage shopping rules surface | Low |
| Store Route confidently misfiles items | Loose substring or one mixed source wins | More backtracking than A1 | Medium | Exact allowlist, unanimous hints, Other fallback, opt-in only | Low-medium |
| Store grouping feeds AH or persists | Classification is added to the server/domain model | Dutch seam or data ownership drift | High in dependency/source audit | Pure client-safe display module; invariant tests | Low |
| Filter state disagrees across disclosures | Active list filters but done/covered do not | Confusing counts/recovery | High in predicate tests | One predicate for all three arrays | Low |
| Check focus jumps unpredictably | Current focus helper uses unsorted active rows | Slow keyboard/in-store flow | High in browser test | Compute next target from visible order and stable entry key | Low |
| Weekly manager stacks dialogs | Existing recurring component opens sheets inside wrapper | Focus trap/Escape failure | High in keyboard test | One modal owner with internal states | Low |
| Green header becomes redundant again | A1 prototype copy is copied literally | Identity repetition returns | High in screenshot/copy audit | Reuse shipped gradient, one `Shopping` heading only | Low |
| Dense rows shrink touch targets | Visual height reduction also reduces hit areas | Mobile accessibility regression | High with box inspection | Separate 44 px hit box from compact text layout | Low |
| Long Dutch copy hides controls | English geometry drives layout | Lost action/context | High in bilingual matrix | Intentional wrap/truncate + full accessible name | Low |

### UI/UX audit findings

- In the current source, `ShoppingLists.svelte` owns `buy / meals / weekly` state and renders the
  three peer tabs at lines 96–120 and 190–192.
- The Meals panel repeats `source.recipeTitle` below every `source.name` at lines 345–375.
- The current active row minimum is `3.6rem`; the accepted A1 prototype demonstrates a 50-pixel
  compact row while preserving 44-pixel controls.
- At a 375-pixel browser viewport, the A1 prototype had no body-level horizontal overflow and its
  meal chips, sort, recurring access, check controls, actions, Add, and AH controls all retained
  44-pixel boxes.
- The A1 prototype's header is warm paper, not the accepted final treatment. The shipped
  `WeekNav.svelte` already owns the desired olive gradient, so execution must preserve its
  background and change only hierarchy/copy.
- `WeekNav.svelte` currently renders both `shopping_market_context` and
  `shopping_market_heading`; the page title is already `shopping_title`.
- The desktop `Run context` card repeats left/basket/covered/recurring information beneath the
  global progress band.
- A signed-out isolated browser could not inspect the populated production household page. Runtime
  state conclusions therefore come from the current repository, accepted artifact, and existing
  authenticated evidence; execution must use isolated authenticated fixtures.

### Browser and state matrix

| State / journey | 375 | 768 | 1280 | 320 / 200% | Required proof |
|---|---:|---:|---:|---:|---|
| Populated A1 default | Yes | Yes | Yes | Yes | Green header, one title, List order, first item position, dock clearance |
| Meal and Weekly filters | Yes | Yes | Yes | Yes | Unique shared row, scoped active/done/covered, clear path, visible focus |
| Store Route | Yes | Yes | Yes | Yes | Fixed groups, exact classifications, Other fallback, static headings |
| Long names and shared rules | Yes | Yes | Yes | Yes | No lost action; source chooser names ingredient + recipe |
| Incompatible quantity | Yes | Yes | Yes | Yes | One row, every source amount/recipe, AH explicit quantity review |
| Covered by stock | Yes | Yes | Yes | Yes | Scoped count/disclosure and honest nothing-needed state |
| Completed / restore | Yes | Yes | Yes | Yes | Scoped basket, undo/restore, next focus, complete state |
| No meals / empty | Yes | Yes | Yes | Yes | Useful Meal plan or Stock action; recurring/manual exceptions retained |
| Recurring management | Yes | Yes | Yes | Yes | Add/edit/skip/stop, errors, one focus owner |
| Legacy and notices | Yes | - | Yes | Yes | Attach/manual/dismiss, freezer/recipe/AH guidance |
| AH disconnected | Yes | Yes | Yes | Yes | Guidance and Settings path; physical Store Route still works |
| AH stale review | Yes | - | Yes | Yes | Re-match path; no duplicate send |
| AH partial / uncertain | Yes | - | Yes | Yes | Honest result, retry protection, correct bought marking |
| English and Dutch | Yes | Yes | Yes | Yes | Labels, long copy, dates, section names, source context |
| Keyboard / reduced motion | Yes | - | Yes | Yes | Focus order/return, visible focus, pressed/expanded states, no forced motion |

All browser checks must also assert zero horizontal overflow, zero console errors, no failed
first-party requests, and no covered final row behind the fixed dock/navigation.

## Steelman and deletion test

The strongest objection is that Store Route without a manual correction model may place too many
items in `Other` and therefore feel incomplete. A persisted category field would solve that more
fully.

The selected code-only projection is still the right first implementation because A1 remains the
default, Store Route is explicitly optional, exact matches can improve a physical shop
immediately, and an honest `Other` group is less harmful than a confident wrong aisle. It also
avoids making the household maintain categories before actual usage is measured.

The deferred correction model passes the deletion test: the resolver is one isolated seam. A
future, separately approved override could be added as one higher-precedence input without
renaming current callers, migrating current UI state, or making today's code depend on that
future. If Store Route proves low value, deleting the resolver and one sort option restores pure
A1 without data cleanup.

Independent plan critique initially returned **REVISE** for five missing contracts: canonical
incompatible aggregation, AH/AI consumer coverage, excluded-rule access, source-derived filter
truth/non-stacked recurring focus, and conservative classifier guardrails. All five are now
explicit in SHOP-1, SHOP-2, SHOP-5, and SHOP-6. No P0/P1 planning gap remains.

## Rollout and rollback

- Execute SHOP-1 first and do not begin visual work until its AH/AI contract tests pass.
- Land the pure projection and classifier before composing controls.
- Add the green shell and one-list UI, then maintenance surfaces, then delete dead modes.
- No feature flag or data migration is required. List order remains the default and Store Route is
  reversible from the sort control.
- Rollback is an atomic code revert by ticket. SHOP-1 must be reverted together with its AH/AI
  consumer changes; all later UI tickets can be reverted independently.
- Before each commit, inspect the worktree and stage only files changed for this feature.

## Open Questions

None. The user selected A1 as the default, explicitly requested integrated physical Store Route,
kept the green header, accepted code-only scope, and did not request saved category maintenance or
per-store customization.

## Resume pack

- **Goal:** ship one compact Shopping list with meal filters, List/A–Z/Store Route ordering, honest
  source-owned maintenance, and the olive utility band.
- **Current state:** SHOP-1 through SHOP-8 are complete. The canonical projection emits one row per
  normalized Dutch term, AH and AI retain the full source contract, Quiet Ledger is the sole list
  surface, and Store Route remains an optional display-only projection.
- **Verification:** 73 unit-test files / 445 tests passed; `svelte-check` reported zero errors and
  warnings; the production build and `git diff --check` passed. The English/Dutch browser matrix
  passed at 375, 768, and 1280 CSS pixels, plus 320 reflow and 200% zoom, with no unexpected
  console or HTTP errors.
- **Data impact:** no schema change, migration, saved category, or maintained AH category was
  introduced.
- **Open questions:** none.
