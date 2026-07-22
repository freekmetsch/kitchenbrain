# Feature List: Shopping and Recipe Decisions
_Status: In flight - Phase 2 of 5 (Gate B approved 2026-07-22; live migration in progress)_

## Problem framing

The last recipe and shopping release added optional ingredients, substitutes, pantry staples, portion scaling, and Albert Heijn review. The data now carries most of the facts, but the shopping screen still makes several different decisions look like one:

- `optional` means the recipe works without an ingredient.
- `is_staple` means the recipe needs it, but the household normally has it.
- `included` means buy it for this one week.
- `selectedName` means use a different Dutch search term for this week.

The screen renders optional and staple rows as separate blocks before the main list, aggregates substitutes by ingredient name, and keeps only meal labels rather than the exact recipe ingredient that contributed each amount. That makes the Adam Ragusea bolognese hard to correct in place: pasta and Parmesan should become required, basil and salad can stay optional, balsamic should remain required but normally stocked, and pasta choice should name one product before Albert Heijn receives it.

Eight adjacent faults increase the friction:

- There is no weekly recurring list for milk, fruit, yoghurt, or other items bought regardless of the meal plan.
- Asking the agent to enhance a recipe calls `edit_recipe` and writes suggestions before the user can review each addition or substitute.
- Cooking mode lets one `Get ready` task reference several ingredients, step ingredient chips are plain labels, and English ingredient display keeps Dutch amount and unit text.
- Recipe cards use a full metadata row for unreliable total-time values and push status chips below the title even when horizontal space remains.
- A planned meal changes one portion per tap. Raising a 16-portion recipe to 32 takes sixteen taps even though the household thinks in whole recipe batches.
- Cooking merge cards retain split source colors, but the merged result and its later steps do not gain a new blended color.
- Recipe ingredients already carry an optional `component`, yet the main cooking checklist flattens it away. Two butter rows for a crust and sauce look identical even though they must stay separate while cooking.
- Cook-mode generation still owns the full bilingual display graph. Quantities, grouping, progress, serving changes, and color assignment are deterministic app concerns and must not add provider calls.

The target flow is:

`Plan whole recipe batches -> choose what each recipe needs -> keep component rows distinct -> add weekly buys -> review one summed list -> send exact Dutch terms to AH -> cook with ingredient-level progress and blended branch colors`.

Recording source: [Dutch transcript, 2026-07-22](../recordings/2026-07-22-shopping-recipe-decisions-transcript.md).

## Scope

### In scope

- An `Every week` shopping tab beside `N meals`, with add, edit, skip-this-week, disable, and remove actions.
- Exact shopping provenance per leaf-recipe ingredient, including stable ingredient IDs inside recipe JSON.
- Three plain need states in the shopping journey:
  - `Every time`: required recipe ingredient.
  - `Nice to have`: optional recipe ingredient.
  - `Usually stocked`: required ingredient that stays off the list unless the household is out.
- Per-week substitute selection plus an explicit `Use in recipe` action that swaps the canonical Dutch ingredient and keeps the old name as an alternative.
- Shopping changes that update recipe optionality, alternatives, translation state, and cook-cache state through one revision-checked server boundary.
- A typed recipe-enhancement proposal with a manual review gate from both the recipe button and the AI agent.
- `×1`, `×2`, `×3`, and `×4` recipe-yield shortcuts on linked planned meals, alongside exact `−` and `+` controls.
- Component-aware ingredient sections in recipe and cooking views, backed by leaf-recipe provenance; compatible same-product amounts still sum once in shopping and AH.
- One checkbox per `Get ready` item and checkable ingredient chips inside cooking steps, sharing progress with the main ingredient list.
- A deterministic cooking-color graph where a merge keeps its source labels but gives the result and later steps a tested blended palette.
- A strict cook-mode AI boundary: the model interprets steps, parallel streams, merges, and useful timers once per canonical recipe revision; the app owns quantities, language projection, ingredient grouping, progress, servings, and colors.
- Complete English display projection for ingredient amount, unit, name, preparation, component, substitute name, and substitute note.
- A denser recipe grid that keeps Plan and Make, removes total-time display and the `Quick <30m` filter, and lets title/status chips share a wrapping line.
- English and Dutch product copy for every new or renamed control.

### Out of scope

- Recurrence other than weekly, calendar rules, reminders, or automatic ordering.
- A global relational ingredient catalogue, nutrition data, barcode scanning, or stock-level prediction.
- Automatic acceptance of AI suggestions or automatic recipe rewrites after a weekly substitute choice.
- Substitute quantity conversion. A substitute inherits the source amount unless the user edits the recipe amount.
- Changes to AH authentication, product ranking, favorite products, or the explicit review-and-send step.
- Removal of the legacy `total_time_min` column. Old imports may keep writing it; the app stops treating it as trustworthy UI data.
- A new package, service, queue, AI provider, or background worker.
- Portion presets beyond four recipe batches, fractional batch shortcuts, or a second persisted multiplier field; planned servings remain the stored authority.
- A structured-directions migration. Raw recipe directions do not carry enough meaning to derive parallel work, merges, or timers safely without interpretation.

## Existing-system inventory

| Surface | Current authority | Gap |
|---|---|---|
| Recipe ingredient | `Ingredient` JSON in `src/lib/recipe_ingredient.ts` | No stable ingredient ID; `origin` cannot distinguish an unreviewed AI suggestion from a human-accepted one. |
| Shopping derivation | `deriveWeekNeeds` in `src/lib/server/shopping_needs.ts` | Aggregates by lower-case name and keeps meal labels, not source recipe/ingredient refs. |
| Weekly shopping state | `shopping_list_overrides` | One row per week and name mixes bought/manual/include/substitute state and cannot represent two recipe sources or two selected final rows separately. |
| Pantry habit | `inventory_items.is_staple` | Correct authority for `Usually stocked`; current UI labels it as a generic staple and places every row action at equal weight. |
| Substitute selection | `selectedName` in weekly override | Accepts an arbitrary string at the route boundary and changes only the week; no reviewed path updates the recipe. |
| AI recipe writes | `edit_recipe`, chat tool display, in-memory pending actions | Recipe enhancements are ordinary writes; confirmation cards only cover inventory deletion/merge and cannot show selectable proposals. |
| Cooking cache | v4 `prep_tasks[].ingredient_indexes` and `steps[].ingredient_indexes` | Prep tasks permit several ingredient refs; step refs are projected to strings and lose their control identity. |
| Planned portions | `meal_plan_meals.servings`, changed by `changeServings(meal, delta)` | The meal card has only one-step `−` and `+`; it does not expose the linked recipe yield or whole-batch shortcuts. |
| Ingredient expansion | `expandMealIngredientsForServings` returns a flat `Ingredient[]` | Leaf owner and component context disappear before recipe/cooking display and shopping provenance can use them. |
| Cooking colors | `streamPalette()` plus segmented source bars in `MergeCard.svelte` | Stream order assigns each color independently; a merge does not calculate and carry a blended result color. |
| Cook-mode AI boundary | `cook_mode.ts` v4 schema, prompt, fingerprint, and provider retries | The model must interpret the recipe graph, but deterministic UI state is not named and tested as code-owned; unreliable total time still enters the prompt and cache fingerprint. |
| Translation | `TranslatedIngredient` and `translate_recipe.ts` | Only name and substitutes are cached; amount, unit, preparation, and component remain Dutch. Composite cooking ingredients bypass the page projection. |
| Recipe cards | `src/routes/recipes/+page.svelte` | Fixed image/content/meta/button stack; time occupies its own row; chips start in another block. |

## Evidence-backed findings

| # | Priority | Audit | Finding and impact | Evidence | Cite |
|---|---|---|---|---|---|
| 1 | P1 | Correctness / harden | A weekly alternative is stored by aggregated name, not by source recipe ingredient. Two recipes that use the same base ingredient can overwrite each other's decision. | `shopping_needs.ts` contribution map and `shopping_list_overrides` unique `(week_start_date, name)`. | `[H5] [H6] [Norman]` |
| 2 | P1 | Safety / harden | `set_selected_name` accepts any client string and does not prove that it is the canonical Dutch name or a saved Dutch substitute before AH review. | `src/routes/api/shopping/+server.ts` `PostSchema` and write branch. | `[H5]` |
| 3 | P1 | UX | AI enhancement writes ingredients and substitutes before the user can accept, reject, or reclassify each suggestion. The chat result reports `Updated the recipe` even when the request asked for a manual gate. | User transcript; `edit_recipe` is a free write in `commit_risk.ts`; `tool_display.ts` has no recipe proposal kind. | `[H1] [H3] [Norman]` |
| 4 | P1 | Cooking correctness | One generated prep task may hold several ingredient indexes, so one checkbox completes several items. | `PrepTaskSchema` permits an unbounded array; `BenchSheet.svelte` checks per task. | `[H2] [H5]` |
| 5 | P1 | Language | English cooking view shows mixed labels such as `1 blik chickpeas`; only ingredient names and substitutes are translated. | Browser capture `output/playwright/20260722-ux-cooking-375.png`; `translate_recipe.ts`; recipe page display projection. | `[H4] [H8]` |
| 6 | P2 | UX | Optional, staple, and weekly inclusion are three meanings shown as list placement and checkboxes without naming the durable consequence. | `ShoppingLists.svelte`; current optional/staple groups. | `[H2] [H6] [Krug]` |
| 7 | P2 | UI | Recipe cards spend one row on unreliable total time and force category/status chips into a later block, producing uneven card heights. | Browser capture `output/playwright/20260722-ux-recipes-375.png`; `recipes/+page.svelte:500-539`. | `[H8] [Gestalt] [RUI]` |
| 8 | P2 | Cooking UX | The step has a large completion target, while each visible ingredient pill is a non-interactive span. | `ComponentCard.svelte`, `MergeCard.svelte`, and cooking browser capture. | `[Cooper] [Norman]` |
| 9 | P2 | Shopping UX | `Keep stocked` repeats at full visual weight on every row and competes with amount and bought state. | Browser capture `output/playwright/20260722-ux-shopping-filled2-375.png`. | `[H8] [VH]` |
| 10 | P2 | Planning efficiency | Planned portions change only by `delta = ±1`; moving from 16 to 32 portions needs sixteen server-backed taps. | Recording transcript `00:00–00:30`; `meal-plan/+page.svelte:535-555,766-771`. | `[H7] [Cooper] [Fitts]` |
| 11 | P2 | Cooking UI | A merge card shows segmented source colors, while its result uses the output stream's unrelated order-based palette. The visual does not show that two branches became one. | Recording transcript `00:30–01:38`; `palette.ts`; `BenchSheet.svelte:720-762`; `MergeCard.svelte`. | `[H2] [Gestalt] [Color]` |
| 12 | P2 | Cooking UX | `Ingredient.component` survives storage but the cooking checklist renders one flat sequence, so equal ingredients used for different parts lack purpose labels. | Recording transcript `02:03–03:14`; `recipe_ingredient.ts`; `BenchSheet.svelte:971-995`. | `[H2] [H6] [Gestalt]` |
| 13 | P2 | Cost / architecture | Cook mode needs AI for semantic interpretation, but deterministic quantities, grouping, progress, serving changes, and colors lack an enforced code-owned boundary; `totalTimeMin` still invalidates and enters generation despite leaving the UI. | Recording transcript `01:40–02:01`; `cook_mode.ts` fingerprint/payload; v4 prompt and projection. | `[H4] [H8]` |

## Option comparison

| Option | What it changes | Upside | Cost / risk | Decision |
|---|---|---|---|---|
| A. UI-only tabs over current overrides | Adds `Every week` and new labels but keeps name-key aggregation. | Small diff and no recipe JSON backfill. | Keeps cross-recipe substitute collisions, arbitrary selected terms, and no safe recipe update seam. | Rejected. |
| B. Source-aware shopping contributions plus a manual proposal boundary | Adds stable ingredient IDs, two additive tables, typed recipe proposals, and one recipe mutation service. | Each choice has one owner; weekly, recipe, and AH behavior remain traceable and reversible. | Additive migration and JSON backfill require a snapshot and rollback drill. | Chosen. |
| C. Relational ingredient catalogue | Normalizes every ingredient, alternative, stock habit, and recipe relation. | Strongest long-term query model. | Large rewrite with migration and matching risk far beyond the named household flow. | Rejected. |

### Chosen data and interaction model

1. Add a stable `id` to each stored recipe ingredient and a recipe `contentRevision` that changes only with canonical recipe content. Release the optional-ID/revision reader-writer first and prove that it preserves unknown/new fields on save. Only the next release backfills deterministic IDs. This makes the immediate prior release a safe rollback target.
2. Introduce one leaf-aware expansion result before shopping or cooking flattens anything. It carries the owning recipe, stable ingredient ID, stored component, and projected ingredient. Compatibility callers may map it back to `Ingredient[]`, but new shopping and cooking code reads the source-rich form.
3. Change shopping derivation to emit source contributions before aggregation:

```ts
type ShoppingSourceRef = {
  key: `recipe:${number}:${string}` | `weekly:${number}` | `manual:${number}` | `legacy:${number}`;
  recipeId?: number;
  recipeSlug?: string;
  ingredientId?: string;
  mealIds: number[];
};
```

4. Replace the name-key writable owner with `shopping_week_entries`. Each source has one stable week row holding `included`, `selectedName`, `bought`, and its source-level amount override. Manual rows get immutable integer IDs in this table. A merged display row is bought only when all contributing week entries are bought; toggling it writes the exact contributing entry IDs in one transaction. `shopping_list_overrides` remains a read-only migration input until parity passes, then loses all write paths.
5. Add `recurring_shopping_items` as the durable owner for the `Every week` tab, with `startWeek` and nullable `endWeek`. Edits close the old effective range and create a successor so past weeks do not change. A `shopping_week_entries` row can skip one occurrence without disabling the recurring item.
6. In the meals tab, each source ingredient exposes one compact decision sheet:
   - `Every time` writes `optional: false`.
   - `Nice to have` writes `optional: true`.
   - `Usually stocked` keeps `optional: false` and uses the existing household-global inventory staple boundary. The sheet states that this affects every matching Dutch item across recipe, recurring, and manual sources.
   - `This week` stores a validated weekly substitute choice.
   - `Use in recipe` swaps the Dutch canonical name and selected substitute, then invalidates translation and cooking caches.
7. Recipe and cooking views group source-rich ingredients by leaf recipe and `component`, keeping two butter uses distinct. Shopping applies inclusion and substitute choices per source, then sums only equal selected Dutch terms with compatible units. A `250 g` crust contribution plus a `250 g` sauce contribution becomes one `500 g butter` buy row while retaining both source refs.
8. AI enhancement becomes a proposal, never an `edit_recipe` shortcut. The AI-facing `edit_recipe` tool cannot mutate ingredient arrays or substitutes at all; those fields require the proposal apply boundary. A recipe-page endpoint and a chat staging tool both produce the same typed proposal. The user selects additions/substitutes and need states, then one conditional server update checks `contentRevision` and writes the accepted set.
9. Human-accepted AI additions store `origin: 'ai_accepted'`. Unaccepted proposal items never enter recipe JSON. Existing `ai_suggested` optional rows remain readable.
10. A composite contribution uses the leaf recipe ID that owns the ingredient JSON in its source key. Planned-meal IDs record occurrences only; `Use in recipe` can never target the composite parent by inference.
11. AH preview and push re-derive the current week on the server from submitted entry IDs. They ignore client names, terms, amounts, units, and source labels; the selected term must equal that leaf ingredient's canonical Dutch field or a stored Dutch substitute. Any legacy/non-normalized source without an approved Dutch shopping term is blocked from AH and sent back for correction.
12. Whole-batch controls calculate `recipe.servings × 1..4`, never `current planned servings × multiplier`, and persist the resulting absolute serving count through the existing meal-plan boundary. `−` and `+` remain for exact counts; unavailable or above-99 results are disabled rather than silently clamped.
13. Cook-mode colors are graph-derived in code. Base streams receive stable palette tokens; at a merge, source colors stay in the `From` labels, a deterministic blend token colors the result card, and that blended token follows its output stream into later steps.
14. Cook-mode AI remains limited to the meaning that raw direction strings cannot safely provide: ordered steps, parallel streams, merges, useful prep tasks, and timers. v4 quantities, translated recipe fields, component labels, progress, serving projection, and colors remain code-owned. Remove `totalTimeMin` from the provider payload/fingerprint and prove that language, portion, progress, grouping, and palette changes never call the provider.
15. Legacy override import never guesses. A manual override becomes one manual entry. A non-manual override with exactly one matching live source attaches to that source. Zero or several matches become one read-only `legacy:<overrideId>` row that preserves the original Dutch name, amount, inclusion, bought state, and selected term, carries `Needs review`, and cannot reach AH until resolved. The review sheet can atomically attach it to one live source, convert it to a manual row, or dismiss it while retaining an audit record; state transfers once and the legacy row gets `resolvedAt` plus its resolution. Record dry-run counts for all buckets and prove no input row fans out or disappears. Gate D requires zero unresolved active rows or an explicit user-approved exception list.
16. `shopping_week_entries` are bounded materialized week snapshots. Migration creates the current week and configured `planAheadWeeks`; a meal/recurring/manual write materializes its directly affected week; the first read of another nonpast week materializes it in one transaction. Writes reconcile existing nonpast snapshots plus affected weeks inside the configured horizon: create new sources, retain state only for the same stable key, refresh derived amounts, clear a choice that is no longer approved, and retire unmatched rows from display/AH. Past snapshots are immutable; a past week without a snapshot reports that history was not captured rather than rebuilding it from current recipes. Recurring edits close ranges and retire future occurrences without rewriting past entries.
17. AH preview returns a bounded, short-lived, single-use server token bound to user, week, current entry IDs/revisions, approved Dutch terms, and the product IDs offered for each entry. Push atomically consumes the token and inserts a `pending` push-attempt/history row before the external call. The client may choose only product versus free text versus exclude, one offered product ID, and a bounded pack count. A definite failure becomes `failed`; success becomes `succeeded`; a timeout, process loss, or local finalization failure remains `uncertain`. Never retry an uncertain basket write automatically; show the attempt and tell the user to check AH before starting a fresh preview. Remove arbitrary typed-term re-search; save a new Dutch source/alternative first, then preview again.
18. SRD-0 introduces separate ingredient schemas before any release reads future provenance. Live client/model mutation input cannot issue `ai_accepted`; the proposal apply service can mint it later. Trusted full-backup restore validation may preserve an existing `ai_accepted` value after archive/schema validation, so export/import round-trips do not rewrite provenance.

## Phase plan

### Phase 1 - Stable recipe and shopping identities

- First ship the compatibility reader-writer for optional ingredient IDs, `ai_accepted`, and `contentRevision`; prove a recipe edit round-trip preserves those fields.
- In that same compatibility release, split live mutation input from trusted backup restore: live paths reject `ai_accepted`, while validated full restore preserves it.
- In the next release, add ingredient IDs and the append-only backfill migration.
- Add effective-dated `recurring_shopping_items` and source-owned `shopping_week_entries`.
- Introduce leaf-aware ingredient expansion with recipe-owner and component metadata, then derive shopping contributions from it.
- Import legacy overrides once as read-only migration input, then remove their write routes before new UI writes begin.
- Dry-run legacy mapping into manual, exact-source, unmatched, and ambiguous buckets; unmatched/ambiguous rows become read-only legacy entries rather than guessed source writes.

Exit: every derived leaf-recipe ingredient, weekly item, and manual row has a stable source key; the immediately prior release preserves new fields; old databases migrate without changing visible recipe content.

### Phase 2 - Shopping choices and weekly buys

- Apply source choices before aggregation.
- Replace the pre-list optional/staple blocks with `To buy`, `N meals`, and `Every week` tabs.
- Add weekly item management and per-recipe need/substitute sheets.
- Add a legacy-review sheet with atomic `Attach to source`, `Convert to manual`, and `Dismiss` actions; unresolved rows stay AH-blocked.
- Make bought state the transaction result of the contributing week-entry IDs, not an aggregated name.
- Validate every submitted entry by re-deriving the week; AH ignores all client-supplied item facts and uses only approved Dutch canonical/substitute fields.
- Treat `Usually stocked` as a household-global setting for every matching Dutch item and say so in the sheet.
- Preserve exact source refs through AH preview, push, bought state, and history.
- Reconcile current/future week snapshots after every meal, serving, source, recipe, recurring, or manual-source change; freeze past weeks.
- Bind AH choices to a short-lived server preview token and remove arbitrary typed-term re-search.

Exit: the bolognese can express pasta and Parmesan as `Every time`, basil/salad as `Nice to have`, balsamic as `Usually stocked`, and one chosen pasta term reaches AH.

### Phase 3 - Manual recipe enhancement

- Land the compatible `ai_accepted` reader before any writer can emit it.
- Add the typed proposal schema, bounded in-memory proposal token, `contentRevision` precondition, and conditional transactional apply service.
- Add `Enhance recipe` to recipe detail and a review sheet with per-suggestion accept/reject and need-state controls.
- Add the chat staging tool and structured recipe-review card; remove ingredient/substitute writes from the AI-facing `edit_recipe` schema so the gate cannot be bypassed.
- Separate live mutation validation from trusted backup restore so `ai_accepted` cannot be forged in normal writes but survives a valid full restore.
- Invalidate translation/cook caches only after accepted recipe changes.

Exit: page and chat produce the same manual gate; rejecting everything writes nothing.

### Phase 4 - Meal planning, cooking, and recipe density

- Add `×1..×4` recipe-yield shortcuts to planned meals while retaining exact `−` and `+` controls.
- Group recipe and cooking ingredients by leaf recipe and component without changing their stable flattened index order.
- Require zero or one ingredient ref per prep task and mark only affected multi-ref v4 caches stale.
- Carry `ingredient_indexes` into the display type and render step ingredient pills as buttons outside the whole-step button.
- Share `ingredientChecks` between the main checklist and all step pills.
- Derive base and blended stream colors from the cook graph; carry a blended merge color into later result steps.
- Keep cook-mode generation interpretation-only and remove unreliable total time from its prompt and fingerprint.
- Translate every visible ingredient text field and project composite recipe ingredients through the same helper.
- Remove total-time UI and the quick filter; compact card media/content and put title/chips in one wrapping flow while preserving Plan and Make.

Exit: a 16-portion plan reaches 32 with one `×2` action; component rows stay distinct while cooking; merge colors visibly combine; deterministic cook state causes no provider call; English is complete; and the recipe grid fits more content without hiding actions.

### Phase 5 - Release proof, then cleanup

- Run migration compatibility, shopping derivation, recipe apply, proposal, translation, cook-cache, AH source-ref, and UI tests.
- Cover both new shopping tables in export, import validation, bootstrap/reset, database-copy migration, and restore tests.
- Walk the bolognese-style fixture from enhancement through shopping, AH preview, recipe reload, and cooking; add a two-component butter fixture and a 16-to-32 portion plan.
- Verify 375, 768, and 1280 px in English and Dutch with keyboard and touch paths.
- Pause for four R3 go/no-go gates: compatibility release, live migration, recipe-mutation feature enablement, and post-parity cleanup.
- After the final gate, remove superseded optional/staple/legacy projection code and obsolete time/filter copy, then update logs and archive the shipped plan.

Exit: one cost-free test pack and both rollback drills prove the full path; Freek approves cleanup; no duplicate compatibility branch remains.

## Execution tickets

### SRD-0 - Ship the compatibility reader and recipe revision

- **Observable behavior:** recipe editing behaves as before while optional ingredient IDs and `ai_accepted` values survive parse, edit, export, import, and save round-trips; live client/model input cannot submit `ai_accepted`; canonical recipe edits increment `contentRevision` atomically.
- **Scope in:** separate stored/trusted-restore/live-mutation ingredient schemas, optional-field readers/writers, `contentRevision`, one central conditional recipe mutation helper, compatibility deploy gate.
- **Scope out:** ID backfill, proposal generation, and shopping UI.
- **Targets:** `src/lib/recipe_ingredient.ts`, recipe write/ingest/edit/import/export boundaries, recipe schema, `drizzle/0019_*.sql`, focused tests.
- **Risk:** R3 compatibility gate. **Impact / effort / confidence:** 5 / M / high.
- **Verification:** seed future-shaped ingredient JSON, load and save through every writer, prove IDs/origin remain; live client/model schemas reject supplied `ai_accepted`; validated full-backup restore preserves it; two canonical writes in one second get distinct revisions; cache/image/log-only writes do not increment the revision.
- **Rollback:** ordinary code rollback is safe because this ticket emits no IDs or new origin values and performs no JSON backfill.
- **Release A result (2026-07-22):** complete. Migration `0019` adds only `content_revision`; stored, live-edit, new/model, and trusted-restore schemas are separate; canonical writers use one revision-checked update seam; meal-link writes share its transaction; Release A rejects new or duplicate ingredient IDs and cannot mint `ai_accepted`.
- **Release A proof:** 42 unit files / 302 tests, Svelte check, production build, and local browser smoke pass. The rollback fixture proves ingredient JSON stays byte-for-byte unchanged and a pre-Release-A writer can update a migrated row. Independent review found three P1 gaps in the first draft; all were fixed and the follow-up review cleared them. Gate B remains closed and no `0020` migration, ID backfill, shopping table, production snapshot, or live-data write has started.

### SRD-1A - Backfill stable ingredient IDs

- **Observable behavior:** existing recipes load unchanged and every stored ingredient has a stable ID after migration.
- **Scope in:** `Ingredient.id`, server assignment on every writer, deterministic JSON backfill, append-only migration journal/snapshot.
- **Scope out:** relational ingredient catalogue.
- **Targets:** `src/lib/recipe_ingredient.ts`, recipe write/ingest/edit boundaries, `drizzle/0020_*.sql`, `drizzle/meta/`.
- **Risk:** R3. **Impact / effort / confidence:** 5 / L / medium.
- **Verification:** migrate a copy of pre-0020 DB; compare recipe count/order/all old ingredient fields byte-for-semantic-byte; IDs unique within recipe and stable after edit/reorder; second migration run is a no-op.
- **Rollback:** deploy only after SRD-0 is the previous release. Code rollback targets SRD-0, which preserves IDs; a full rollback restores the pre-0020 snapshot.

### SRD-1B - Add recurring and week-snapshot tables

- **Observable behavior:** the database can store effective-dated weekly items, source-owned week snapshots, read-only legacy rows, and push-attempt states without changing current UI behavior.
- **Scope in:** `recurring_shopping_items`, `shopping_week_entries`, legacy source/resolution fields, additive `shopping_push_history` attempt-status fields, indexes/constraints, Drizzle schema and append-only journal.
- **Scope out:** backfill/import logic, UI, and source derivation.
- **Targets:** `src/lib/server/db/schema.ts`, `drizzle/0020_*.sql`, `drizzle/meta/`, schema tests.
- **Risk:** R3. **Impact / effort / confidence:** 5 / M / high.
- **Verification:** clean bootstrap and upgraded copy, constraints/indexes, old push rows backfill to `succeeded`, recurring ranges cannot overlap, legacy resolution is single-assignment, export/import/reset schemas cover every new field.
- **Rollback:** Release A ignores additive tables/columns; full rollback restores the pre-0020 snapshot.

### SRD-1C - Import legacy overrides without guessing

- **Observable behavior:** every legacy override imports exactly once; exact sources retain their state, ambiguous/unmatched rows show `Needs review`, and no row fans out, disappears, or reaches AH before resolution.
- **Scope in:** dry-run report, manual/exact/unmatched/ambiguous buckets, one read-only legacy row per unresolved input, idempotent import marker, atomic attach/convert/dismiss resolution service, audit fields.
- **Scope out:** the review-sheet layout.
- **Targets:** migration/import helper, shopping data service, focused import/resolution tests.
- **Risk:** R3 data-mapping gate. **Impact / effort / confidence:** 5 / M / high.
- **Verification:** 0/1/many source matches, manual row, arbitrary old selected term, state transfer exactly once, concurrent/double resolution, dismiss audit, second import no-op, dry-run counts equal committed counts, Gate D unresolved-active report.
- **Rollback:** original overrides remain untouched/read-only until Gate D; code rollback to Release A ignores imported rows, while full rollback restores the snapshot.

### SRD-2 - Preserve source refs through meal expansion and shopping aggregation

- **Observable behavior:** two recipes using the same base ingredient can hold different weekly alternatives and need states without collision.
- **Scope in:** leaf-owner source expansion, contribution model, source-level bought/amount state, compatible aggregation, read-only legacy projection during parity.
- **Scope out:** unit conversion.
- **Targets:** `src/lib/server/meal_recipes.ts`, `src/lib/server/shopping_needs.ts`, shopping types/tests.
- **Risk:** R2. **Impact / effort / confidence:** 5 / L / high.
- **Verification:** shared ingredient across two recipes, duplicate planned meal, composite leaf recipe, freezer source, optional source, staple source, weekly source, immutable-ID manual source, incompatible units, one aggregate split into two alternatives, all-versus-some bought state.
- **Rollback:** keep the old final-row projection behind a short-lived compatibility adapter until new golden fixtures pass, then delete it in SRD-17.

### SRD-3 - Preserve component identity until the final buy row

- **Observable behavior:** a recipe shows `250 g butter` under `Crust` and another `250 g butter` under `Sauce`; cooking keeps both rows and their checks separate, while shopping and AH receive one `500 g butter` row with both sources attached.
- **Scope in:** leaf-aware expanded ingredient type, owner/component fallback labels, stable flattened index order, grouped recipe/cooking projection, compatible sum after source choices, adjacent non-summable same-name rows.
- **Scope out:** unit conversion, ingredient catalogue, or merging rows inside the recipe/cooking checklist.
- **Targets:** `src/lib/server/meal_recipes.ts`, `src/lib/server/shopping_needs.ts`, recipe page load/projection, `BenchSheet.svelte`, raw cooking fallback, shopping types/tests.
- **Risk:** R2. **Impact / effort / confidence:** 5 / L / high.
- **Verification:** plain recipe with/without components, duplicate name in two components, composite child with its own component, identical and incompatible units, optional/substitute split, stable ingredient indexes before/after grouping, one summed AH term with exact source refs.
- **Rollback:** the source-rich expansion is additive; compatibility callers can retain the old flat map while grouped UI is disabled. Stored recipe and week data do not change.

### SRD-4A - Build weekly shopping mutation boundaries

- **Observable behavior:** add/edit/skip/disable/remove weekly items; reload preserves the right weekly or durable state.
- **Scope in:** Zod request schemas, auth, transaction boundaries, source membership validation, effective dates/versioned edits, optimistic response shapes.
- **Scope out:** reminders and non-weekly cadence.
- **Targets:** new server helpers, `src/routes/api/shopping/`, DB tests.
- **Risk:** R2. **Impact / effort / confidence:** 5 / L / high.
- **Verification:** foreign/expired/malformed entry IDs, arbitrary selected term rejection, concurrent edit, add while viewing a past week, skip one week, disable future weeks, versioned edit, same-name recurring/recipe/manual contribution.
- **Rollback:** additive tables can remain unused under the SRD-0 compatibility release; legacy override data remains readable but loses its write routes before new UI writes begin.

### SRD-4B - Materialize and reconcile bounded week snapshots

- **Observable behavior:** the requested week is stable after first load; current/future changes update only affected snapshots, removed sources disappear, and past weeks never change.
- **Scope in:** transactional first-read materialization, migration/current-horizon bootstrap, configured `planAheadWeeks` bound, shared reconciliation service and caller map, orphan retirement, invalid-choice clearing, past immutability, export/import/bootstrap/reset coverage.
- **Scope out:** unbounded future snapshots or reconstruction of never-captured past weeks.
- **Targets:** shopping data/reconciliation helpers, `src/routes/shopping/+page.server.ts`, meal-plan/recipe/recurring/manual writers, settings data tools, focused DB tests.
- **Risk:** R2. **Impact / effort / confidence:** 5 / L / medium-high.
- **Verification:** first read once/concurrently, current horizon and explicit future week, never-captured past warning, meal add/delete/swap, serving and fresh/freezer change, ingredient add/delete/rename, recurring edit/remove, manual delete, orphan retirement, invalid substitute clearing, export/import/reset round-trip.
- **Rollback:** disable materialization/reconciliation and serve the read-only legacy projection under Release A; imported/new tables remain intact.

## Gate B preparation result (2026-07-22)

The Release B candidate implements SRD-1A through SRD-4B behind the old shopping screen. Once the source-data initializer completes, the old screen stays readable while all old shopping mutations and AH review remain disabled. The new tables and mutation services are present, but the new three-tab UI starts only after Gate C.

### Live-copy migration evidence

- 🔍 verified: Railway CLI status and volume listing showed the production service online with `/data` on its persistent volume. An online SQLite rehearsal snapshot was saved at `/data/snapshots/gate-b-rehearsal-20260722T1625.db` and copied to `output/live-gate-b-rehearsal-20260722T1625.db`. No live schema or row changed.
- The live copy contained 8 recipes and 115 ingredients. Migration assigned 115 deterministic IDs. Recipe count, ingredient order, and every old ingredient field stayed unchanged.
- The copy contained 75 legacy overrides: 5 manual, 56 exact, 12 unmatched, and 2 ambiguous. Import committed the same 75 rows without fan-out or loss. The 14 unmatched/ambiguous rows remain read-only, show `Needs review`, and cannot reach AH.
- The bounded bootstrap materialized 106 week entries. A second import reported all 75 rows as already imported, and a second initializer call made no changes.
- Migration rejects an empty, non-text, or duplicate pre-existing ingredient ID before changing data.

### Rollback evidence

- Code rollback: the shipped Release A image at `74b7f13` booted against the migrated live copy, logged in, saved `adam-ragusea-bolognese`, moved its revision from 2 to 3, and preserved all 20 ingredient IDs and the note edit.
- Full rollback: the pre-Release A image at `907ba22` booted and returned a healthy response against the restored pre-`0020` live copy.
- The final rehearsal outputs are `output/gate-b-2026-07-22T14-46-27-857Z/gate-b-evidence.json` and `output/gate-b-2026-07-22T14-46-27-857Z/rollback-image-evidence.json`.

### Reconciliation callers

| Source-changing write | Release B caller |
|---|---|
| Add, change, or remove a planned meal | Meal-plan routes and the AI meal-plan executor reconcile the affected week. |
| Change linked meal freshness or portions | Meal routes reconcile the affected week. |
| Change a recipe's ingredients or servings | Manual recipe edit, AI recipe edit, and accepted recipe normalization reconcile existing nonpast snapshots. |
| Add, edit, skip, disable, or remove a recurring item | Shopping mutations reconcile the effective week and bounded horizon. |
| Add or remove a manual source; resolve a legacy row | Shopping mutations update source-owned entries in one transaction. |

### Gate B checks and release boundary

- 44 unit-test files / 320 tests, Svelte check, and the production build pass.
- The old read-only screen passes at 375, 768, and 1280 px with no horizontal overflow, browser error, or console error. The pause notice renders, every old checkbox is disabled, and AH review is disabled.
- Independent re-review returned GO for Gate B preparation after finding and fixing three further P1 gaps: two old writer routes, invalid non-string JSON ID types, and direct edits to unresolved legacy rows. The same pass confirmed that shopping-data reset and old-backup import clear the derived completion marker. No P0/P1 remains.
- Gate B approval authorizes only SRD-1A through SRD-4B. The live sequence is: take the service offline to block household writes; take a fresh `/data` SQLite snapshot; deploy and run `0020` once; record live recipe, ingredient, override, week-entry, and unresolved counts; run Release A code rollback and pre-`0020` restore checks; bring the service back only after those checks pass. A failure keeps Release A live or restores the fresh snapshot.
- Gate B does not authorize the Gate C shopping UI, recipe mutations, AH push changes, cooking work, or cleanup. The 14 unresolved rehearsal rows stay blocked for later review.
- Gate B was approved by Freek on 2026-07-22. The live write freeze, fresh snapshot, and Release B migration may proceed for this ticket range only.

### SRD-5 - Rebuild the shopping screen around three tabs

- **Observable behavior:** `To buy`, `N meals`, and `Every week` fit at 375 px; optional and stocked decisions live with their recipe source; the final list stays compact.
- **Scope in:** tab state, weekly editor, source ingredient sheet, legacy-review sheet with atomic attach/convert/dismiss, quiet row overflow, empty/loading/error/success states, focus return.
- **Scope out:** AH sheet redesign.
- **Targets:** `ShoppingLists.svelte`, shopping page, new focused shopping components, shared bottom-sheet primitive, message catalogs.
- **Risk:** R2. **Impact / effort / confidence:** 5 / L / medium-high.
- **Verification:** 0/1/20 weekly items, 1/3/8 meals, unresolved legacy 0/1/many candidates, attach/convert/dismiss and double-submit, long Dutch labels, 320/375/768/1280 px, keyboard tabs, Escape/backdrop, optimistic failure rollback.
- **Rollback:** keep page state derived from server payload so old `ShoppingLists` can be restored without data reversal.

### SRD-6 - Let shopping choices safely update the recipe

- **Observable behavior:** changing `Nice to have` to `Every time`, setting `Usually stocked`, or choosing `Use in recipe` survives recipe and shopping reloads.
- **Scope in:** exact leaf-source lookup, `contentRevision` conditional update, optionality update, canonical/substitute swap, old-name preservation, translation/cook invalidation, current/future week-entry reconciliation, household-global staple confirmation, save-before-search rule for any new Dutch AH term.
- **Scope out:** substitute quantity conversion.
- **Targets:** new recipe-choice service and route, recipe edit helpers/tests, inventory staple boundary, shopping components.
- **Risk:** R3 because recipe JSON and downstream AH keys change. **Impact / effort / confidence:** 5 / L / medium.
- **Verification:** stale ingredient ID/revision, two edits within one second, duplicate names, composite parent versus leaf owner, source removed mid-request, Dutch base/substitute round-trip, translation invalidation, cook cache invalidation, undo-by-reselecting old alternative, staple effect across matching source kinds, AH only sees the re-derived current Dutch term.
- **Rollback:** mutation is one transaction; previous canonical term remains a saved substitute so the user can reverse it without reconstructing data.

### SRD-7 - Bind AH push choices to a server preview

- **Observable behavior:** AH push accepts only the current week's server-derived Dutch terms and product options shown in the latest review; a stale, invented, or cross-user choice returns to review without changing the basket.
- **Scope in:** bounded single-use preview token store, user/week/entry-revision/term binding, offered product-ID allowlist, atomic token consumption plus write-ahead push-attempt row, `pending/succeeded/failed/uncertain` finalization, no-auto-retry rule, product/free-text/exclude and pack-count client decisions, expiry/stale handling, removal of arbitrary typed-term re-search, save-approved-term path back to the source sheet.
- **Scope out:** AH authentication, ranking algorithm, favorite products, or automatic push.
- **Targets:** AH preview/push routes and server helpers, `AhSheet.svelte`, `AhPreviewItem.svelte`, shopping source-choice entry point, AH fixtures/tests.
- **Risk:** R2. **Impact / effort / confidence:** 5 / L / medium-high.
- **Verification:** expired/consumed token, concurrent duplicate push, other user/week, missing/extra/retired entry, changed recipe/servings/substitute, product ID not offered for that entry, product offered for another entry, pack count bounds, free-text/exclude, definite external failure, timeout after dispatch, process loss with pending attempt, external success plus local finalization failure, uncertain attempt never auto-retries, typed term rejected until saved as an approved Dutch source term, zero live AH calls in tests.
- **Rollback:** token path is server-owned and additive; restore preview-only choice handling while keeping the stricter Dutch-term derivation and blocking arbitrary typed re-search.

### SRD-8 - Record human acceptance without weakening import provenance

- **Observable behavior:** an accepted suggestion may be `Every time`, `Nice to have`, or `Usually stocked`; unreviewed AI output still cannot become a required ingredient.
- **Scope in:** server-issued `ai_accepted` origin, separate live-mutation and trusted-restore schemas, removal of ingredient/substitute fields from the AI-facing `edit_recipe` tool, import/enrichment compatibility, settings import/export.
- **Scope out:** provenance history UI.
- **Targets:** ingredient schema, AI tool schema/executor, recipe executors/ingest/import/export/tests.
- **Risk:** R2. **Impact / effort / confidence:** 4 / M / high.
- **Verification:** old `ai_suggested` required rejection remains; live client/model schemas reject supplied `ai_accepted`; only proposal apply can mint it in live mutation paths; trusted full-backup restore preserves it after archive validation; direct AI edits cannot add or replace ingredient/substitute arrays; export/import round-trip.
- **Rollback:** SRD-0 already preserves the enum value; disable proposal writes before reverting this enforcement.

### SRD-9 - Stage and apply recipe-enhancement proposals

- **Observable behavior:** `Enhance recipe` returns selectable additions and substitutes; no recipe write happens before Apply; chat shows the same review UI.
- **Scope in:** proposal schema/token/TTL, recipe `contentRevision` precondition, conditional apply, page generator using the existing background model/cap, chat staging tool, structured display, selected apply.
- **Scope out:** autonomous approval and a durable proposal history.
- **Targets:** new `recipe_enhancement.ts`, recipe API route/component, AI tools/executor/system prompt/tool display, pending-action store, ChatView, focused tests.
- **Risk:** R2. **Impact / effort / confidence:** 5 / L / medium.
- **Verification:** all accepted, some accepted, none accepted, expired token, other user, stale revision, two edits within one second, duplicate suggestion, invalid/unapproved Dutch term, cap exceeded, provider error, hydrated chat proposal, direct-edit bypass attempt, no paid calls in tests.
- **Rollback:** proposal path is additive; remove button/tool and keep existing manual recipe editor. SRD-8 blocks the old bypass either way.

### SRD-10 - Add whole-recipe portion shortcuts

- **Observable behavior:** a linked 16-portion meal changes to 32 with one `×2` action; `×1` restores 16, while `−` and `+` still set exact counts.
- **Scope in:** current recipe-yield lookup, `×1..×4` controls, fixed-batch/scalable labels, one optimistic absolute-serving update through the existing API, pending/error/focus states, bilingual copy.
- **Scope out:** storing a multiplier, fractional batches, changing recipe yield, or raising the 99-portion limit.
- **Targets:** `meal-plan/+page.server.ts`, `meal-plan/+page.svelte`, meal-plan API tests, message catalogs.
- **Risk:** R2 because the saved count changes cooking and shopping quantities. **Impact / effort / confidence:** 4 / S / high.
- **Verification:** 16→32→16; current count 20 then `×2` still becomes 32; baseline 1/null/33/50; result above 99 disabled; linked recipe deleted or yield changed; fixed-batch and scalable recipe; optimistic failure restores the prior count; 320/375 px touch and keyboard path; shopping and cook projections receive the saved absolute value once.
- **Rollback:** controls are additive and store only the existing absolute `servings`; removing them leaves all planned meals valid.

### SRD-11 - Fix prep and ingredient-level cooking progress

- **Observable behavior:** one checkbox per prep item; tapping `500 g carrots` in any step strikes that ingredient everywhere without completing the step.
- **Scope in:** prep cardinality validation, selective v4 staleness, display indexes, shared local progress, component/merge card semantics.
- **Scope out:** timer or stream redesign.
- **Targets:** cook prompt/schema/staleness/types/tests, `BenchSheet.svelte`, `ComponentCard.svelte`, `MergeCard.svelte`.
- **Risk:** R2. **Impact / effort / confidence:** 5 / M / high.
- **Verification:** multi-ref legacy cache regenerates; single-ref/zero-ref cache stays; repeated ingredient across steps shares state; click/Space/Enter; no nested buttons or hydration warnings; progress restore.
- **Rollback:** legacy read-only pills remain available for v2/v3 caches; ingredient-level controls activate only when indexes exist.

### SRD-12 - Blend cooking colors when streams merge

- **Observable behavior:** yellow plus blue becomes a green result branch, and yellow plus red becomes orange; source colors remain named on the merge card and the blended result color continues on later steps.
- **Scope in:** graph-order palette assignment, tested blend table/token helper, merge-card result band, subsequent output-stream color, repeated/two-way/three-way merges, non-color labels and contrast.
- **Scope out:** user-picked colors, animation redesign, or asking the model for color names.
- **Targets:** `cook-mode/palette.ts`, `BenchSheet.svelte`, `MergeCard.svelte`, focused palette/graph/component tests.
- **Risk:** R1. **Impact / effort / confidence:** 3 / M / medium-high.
- **Verification:** amber+sky→emerald, amber+rose→orange, reversed source order, three-way merge, output reusing an input stream ID, later step carries blend, earlier cards keep base colors, six-plus streams, dark/high-contrast/reduced-color cues, source names remain readable without color.
- **Rollback:** palette assignment is display-only; restore segmented source bars and order-based result colors without touching cached cook graphs.

### SRD-13 - Keep cook-mode AI limited to recipe interpretation

- **Observable behavior:** changing portions, language, ingredient grouping/checks, or stream colors never starts `Writing cooking view` or spends a model call; editing canonical directions or ingredients still regenerates one semantic cook graph.
- **Scope in:** name the code-owned/model-owned boundary, remove `totalTimeMin` from generation payload and fingerprint, content-revision/fingerprint tests, provider-call counter fixtures, keep deterministic projection outside the schema/prompt.
- **Scope out:** removing AI from step/stream/merge/timer interpretation, structured-direction storage, a new model, or a new cook-cache version when v4 remains sufficient.
- **Targets:** `src/lib/server/ai/cook_mode.ts`, cook prompt comments only where ownership needs clarity, staleness/fingerprint tests, `BenchSheet.svelte` load tests.
- **Risk:** R2 because stale detection guards cooking correctness and paid calls. **Impact / effort / confidence:** 4 / M / high.
- **Verification:** portions, EN/NL view, component heading, ingredient check, blend palette, recipe rating/image/total time do not call; ingredient/direction/sub-recipe content changes call once; concurrent same-key requests share one call; failed validation keeps bounded retries and raw fallback; no new provider dependency or paid automated test.
- **Rollback:** restore the prior fingerprint/payload; v4 cache JSON and the raw-directions fallback remain compatible.

### SRD-14 - Make ingredient translation complete and safe

- **Observable behavior:** English never shows Dutch amount, unit, preparation, component, or substitute note; Dutch recipe fields remain the only AH source.
- **Scope in:** translated display shape, prompt/schema, numeric-token preservation, all-or-nothing readiness, composite recipe projection, stale translation refresh.
- **Scope out:** translating canonical Dutch recipe storage.
- **Targets:** `recipe_ingredient.ts`, `translate_recipe.ts`, prompt, recipe page/server projection, cooking projection, tests.
- **Risk:** R2. **Impact / effort / confidence:** 5 / L / medium.
- **Verification:** `1 groot rode ui`, `1 blik kikkererwten`, `naar smaak`, fractions/ranges, component/preparation/substitute notes, composite recipes, failed/partial translation, numeric-token mismatch rejection, AH request fixture remains Dutch.
- **Rollback:** English display stays all-or-nothing and can fall back to intact Dutch while a forced refresh retries.

### SRD-15 - Compact recipe cards and remove false time signals

- **Observable behavior:** more recipes fit vertically; Plan and Make remain 44 px targets; title and status chips wrap in one flow; no total-time or quick filter remains.
- **Scope in:** recipe index card markup/classes, filter cleanup, dead copy/helper removal, responsive browser proof.
- **Scope out:** image storage and detail-page layout.
- **Targets:** recipes page/server, message catalogs, recipe page tests/screenshots.
- **Risk:** R1. **Impact / effort / confidence:** 4 / M / high.
- **Verification:** missing/long title, 0/1/5 status chips, image/no image, rating, 320/375/768/1280 px, no nested controls, Plan/Make keyboard and touch.
- **Rollback:** markup-only revert; stored time data remains compatible.

### SRD-16 - Prove the full household flow and both rollback paths

- **Observable behavior:** one bolognese fixture completes enhancement, recipe decisions, weekly buys, AH review, recipe reload, and cooking with no stale or mixed state; a second fixture proves whole-batch planning, component separation, summed butter, and blended merge colors.
- **Scope in:** unit/integration/browser matrix, migration rollback drill, live-shape compatibility proof, release-gate evidence pack.
- **Scope out:** live AH mutation in automated tests.
- **Targets:** focused test files, browser fixtures, migration/rollback evidence under `output/`.
- **Risk:** R3 release gate. **Impact / effort / confidence:** 5 / L / high.
- **Verification:** repo check, 287+ free unit tests, production build, 375/768/1280 browser matrix in EN/NL, zero console errors, 16→32 in one `×2`, two `250 g butter` component rows → one `500 g` Dutch AH term, source colors → blended result color, no provider call for deterministic state, mocked AH preview/push that tampers with every client item field, export/import/bootstrap/reset for both new tables, SRD-0 code rollback, pre-0020 snapshot restore with the pre-SRD-0 image.
- **Rollback:** code-only rollback targets the SRD-0 compatibility release. A rollback to any earlier image requires the pre-0020 snapshot and loses post-snapshot writes; execute and record both drills before asking for cleanup approval.

### SRD-17 - Remove compatibility code and close the plan

- **Observable behavior:** after parity and rollback proof, no legacy writable owner, old optional/staple list, obsolete time/filter copy, or duplicate projection remains; the shipped plan and artifact move to the archive lane.
- **Scope in:** delete old shopping override write/projection code, remove spent compatibility adapters and dead copy/helpers, final targeted tests/build/browser smoke, append work log, archive feature list and HTML artifact.
- **Scope out:** deleting the historical `shopping_list_overrides` table or read-only data it contains; append-only migrations remain untouched.
- **Targets:** superseded shopping/recipe UI and server files named by prior tickets, message catalogs, `docs/log.md`, `docs/archive/`, `docs/artifacts/archive/`.
- **Risk:** R2 cleanup after an R3 gate. **Impact / effort / confidence:** 4 / M / high after SRD-16.
- **Verification:** zero imports/routes/writes for removed owners, old/new golden fixtures still pass, check/tests/build/browser smoke, git diff contains deletion or consolidation rather than a second compatibility path.
- **Rollback:** perform only after Freek approves SRD-16 evidence; revert the cleanup commit to restore adapters without reversing migrated data.

## Risk tier and verification matrix

Overall risk: **R3**. The migration is additive, but it backfills IDs inside recipe JSON and changes the identity used by shopping and AH handoff. Execution requires a database snapshot, an independent diff review, and a rollback drill before push.

| Check | Scope | Plan |
|---|---|---|
| Focused unit tests | Ingredient IDs, leaf/component refs, choices, weekly rows, proposal apply, portion presets, translation, cook progress/colors, provider-call boundary, AH handoff | Add fixtures before each behavior change; no network calls. |
| Existing test suite | All current business rules | Baseline: 40 files / 287 tests pass. Re-run after every phase. |
| Svelte check | Types and templates | Baseline: 0 errors / 0 warnings. Run after each UI phase. |
| Production build | Svelte/Tailwind/adapter | Baseline passes. Run after Phases 2, 4, and final. |
| Migration proof | Pre-0020 DB copy plus current DB copy | Ship SRD-0/0019 compatibility first; snapshot, migrate, semantic JSON comparison, edit/save under SRD-0 rollback code, full snapshot restore drill. |
| Browser UI | Meal plan, recipes, shopping, recipe enhancement, cooking | 375 first, then 768 and 1280; EN/NL; exact and whole-batch portions; component headings; two/three-way merges; empty/single/long/error/loading/success; console clean. |
| AH invariant | Preview/push/history fixtures | Re-derive entry IDs server-side; ignore tampered client item facts; block sources without an approved Dutch term; mark exact contributing entries bought. |
| AI cost | Proposal, translation, and cook-mode call ownership | Mock provider; assert no call for servings/language/grouping/progress/colors/total-time; manual live call only during user acceptance testing and within current caps. |
| Harden audit | Targeted app/data/LLM boundary | Run. P0/P1 mitigations: source-owned bought state, compatibility release, re-derived AH rows, revision checks, blocked AI edit bypass, effective dates. New recording scope adds no P0/P1; component identity and provider-call ownership remain R2. |
| UI audit | Meal portion controls, recipe grid, shopping tabs, cooking controls/colors | Extended using current 375 px captures plus source review. Thirteen plan findings recorded; new controls require live 375/768/1280 proof during `/run`. |
| UX audit | Plan portions -> shopping decisions -> AH; recipe -> enhance -> review; component-aware cook progress | Extended. Whole-batch acceleration, source ownership, component recognition, and reversibility are plan gates. |
| Stack discipline | New dependency/service trigger | Skipped: no dependency, service, auth, queue, email, provider, or platform choice enters scope. |
| Design shotgun | Layout/state uncertainty | Skipped: the user named the three surfaces, desired tabs, retained buttons, removed time signal, and manual gate. The remaining choice is an implementation detail, not a taste fork. |
| External API research | Framework or AH behavior | Skipped: the plan changes repo-owned schemas and UI only; no external API behavior claim is needed. |
| Independent plan review | Failure modes, ticket shape, migration/LLM/AH/cook-graph seams | Final GO after three enriched critique passes. Integrated no-guess legacy resolution, bounded snapshot lifecycle, single-use AH attempts with uncertain state, split live/restore provenance schemas in SRD-0, four pre-release user gates, and single-behavior data tickets. |

## Rollout and rollback strategy

1. **Gate A — user go/no-go before Release A.** Freek's explicit `/run` after reviewing this plan authorizes only the SRD-0 compatibility release. No migration or later feature work is implied.
2. **Release A — compatibility only (SRD-0).** Deploy the split live/restore schemas, future-shaped reader/writer, and revision counter. Prove every recipe writer preserves IDs and `ai_accepted`, live inputs reject the trusted origin, and only canonical content writes increment `contentRevision`.
3. **Migration rehearsal.** Copy both a pre-0020 fixture and the current database. Run ingredient-ID semantic comparison, legacy dry-run bucket counts, week-snapshot bootstrap, and a second-run no-op check. Stop on any changed old field/order, row fan-out/drop, overlapping recurring range, or unmatched count.
4. **Rollback rehearsal.** Run Release A against the migrated copy and edit/save a recipe. Then restore the pre-0020 copy and run the pre-Release-A image. Record that full rollback loses post-snapshot writes.
5. **Gate B — user go/no-go before Release B.** Present Release A production proof, rehearsal counts, semantic diff, both rollback results, exact production snapshot path, and expected write freeze. Approval authorizes only the live additive migration/data-boundary release.
6. **Release B — migration and data boundaries (SRD-1A–SRD-4B).** Take the live SQLite snapshot immediately before `0020`; run the additive migration/import once; make `shopping_list_overrides` read-only; enable bounded materialization/reconciliation without exposing the new UI.
7. **Gate C — user go/no-go before Release C.** Present Release B production counts, reconciliation caller matrix, unresolved legacy report, source/AH invariants, and code-only/full rollback status. Approval authorizes SRD-5–SRD-16, including the R3 recipe mutation in SRD-6.
8. **Release C — feature enablement (SRD-5–SRD-16).** Enable source-aware shopping, legacy resolution UI, AH preview tokens, recipe proposals, portion shortcuts, cooking changes, translation, and recipe-card cleanup. Keep the compatibility projection read-only.
9. **Gate D — user go/no-go before Release D.** Present full browser/test/build proof, zero unresolved active legacy rows or a named exception list, AH tamper/uncertain-write fixtures, provider-call matrix, and both rollback drills. Approval authorizes only compatibility deletion and archival.
10. **Release D — cleanup (SRD-17).** Delete superseded writers/projections/UI/copy in one scoped commit, rerun final gates, append the log, and archive the plan and HTML artifact. Keep append-only migrations and historical tables intact.

## Execution decision gates

| Gate | Evidence required | Approve means | No approval |
|---|---|---|---|
| A — ship compatibility | Reviewed plan and explicit `/run` | Deploy SRD-0 only | Do not start implementation. |
| B — migrate live data | Release A smoke, semantic JSON diff, no-guess legacy bucket counts, no-op rerun, two rollback drills, live snapshot path | Run SRD-1A–SRD-4B and additive `0020` | Keep Release A live; do not touch the database. |
| C — enable features | Release B counts, reconciliation caller matrix, unresolved legacy report, source/AH invariant proof, rollback status | Run SRD-5–SRD-16, including R3 recipe mutation | Keep data boundaries live with old read-only UI. |
| D — remove compatibility | Full flow/browser/build/test proof, AH token tamper/uncertain-write matrix, provider-call matrix, zero unresolved active legacy rows or accepted exceptions, rollback evidence | Run SRD-17 and archive | Keep the read-only compatibility path; no cleanup push. |

## Failure-mode critique

| Failure mode | Trigger | Impact | Detectability | Mitigation | Residual risk |
|---|---|---|---|---|---|
| Ingredient-ID backfill changes JSON content or order | Incorrect SQLite JSON aggregation | Recipe or AH data corruption | High through semantic diff | Snapshot; fixture plus copied real DB comparison; additive field only; abort migration on count mismatch. | Low after drill. |
| Bought/manual state collides after one source splits into two terms | Name-key override remains writable | Wrong row becomes bought or receives an amount | High in split fixture | Source-owned `shopping_week_entries`; immutable manual IDs; merged-row toggle writes exact contributor IDs in one transaction. | Low. |
| A weekly choice attaches to the wrong recipe | Aggregated name used instead of source key | Wrong ingredient bought or recipe edited | Medium | Stable recipe ID + ingredient ID; membership re-read on every write. | Low. |
| Composite choice mutates the parent recipe | Flattened child ingredient loses its owner | Wrong JSON ingredient changes | Medium | Source key uses the leaf recipe owner; meal IDs record occurrences only; conditional membership test. | Low. |
| Arbitrary or English term reaches AH | Client tampers with names, term, ref, amount, or unit | Bad AH match or basket item | High in tampered request fixture | Preview/push re-derive current entries server-side and ignore client item facts; block sources without approved Dutch canonical/substitute data. | Low. |
| Same-name weekly and recipe rows double-count | Contributions aggregate before source inclusion | Overbuying | High in golden fixture | Apply source choices first, then aggregate compatible selected terms once. | Low. |
| Legacy override import guesses among sources or never resolves | One old name-keyed row matches zero or several live contributions | State fans out, disappears, attaches wrongly, or blocks AH forever | Low because migrated rows still look valid | Dry-run 0/1/many counts; map only one exact match; preserve zero/many once; atomically attach/convert/dismiss; Gate D requires zero active unresolved rows or approved exceptions. | Low. |
| Week snapshot survives after its source disappears or grows without bound | Meal/source changes or reconciliation materializes every future week | Ghost items remain buyable, past weeks mutate, or rows grow forever | Medium in later-week views | Materialize migration horizon, directly affected weeks, and first-read nonpast weeks only; one reconciliation service retires unmatched rows; freeze captured past snapshots; verify caller map. | Low. |
| AH push trusts or repeats a client choice outside preview | Stale/tampered product, duplicate click, timeout, or local finalization failure | Wrong/duplicate product enters basket and retry state is unclear | Low without tamper/partial-failure fixtures | Single-use token; write-ahead attempt; allowlisted choices; `failed/succeeded/uncertain`; never auto-retry uncertain writes; save new Dutch terms before preview. | Low. |
| Component grouping changes ingredient indexes | UI groups or sorts before cook refs resolve | A step checks the wrong ingredient | High in index fixture | Keep one stable leaf-expansion order; build headings as a view over indexes, never reorder the backing array. | Low. |
| Same ingredient in two components stays duplicated in AH | Shopping groups by component before final term | Household buys two packs instead of the summed need | High in two-butter fixture | Keep component on source refs, apply choices, then sum compatible selected Dutch terms once for final rows. | Low. |
| Incompatible component quantities are summed anyway | Same name but different unit or non-numeric amount | Wrong buy amount | High in quantity fixture | Reuse `sumCompatibleQuantities`; keep non-summable rows adjacent with their component/source labels. | Low. |
| Proposal applies after another recipe edit in the same second | Long review, second tab, or coarse timestamp | Accepted changes overwrite newer recipe state | High via revision mismatch | Token includes recipe/user/`contentRevision`; apply uses one conditional update and fails stale. | Low. |
| Agent still changes ingredients through `edit_recipe` | Prompt/tool ambiguity or crafted tool call | Manual gate bypassed | High in executor test | Remove ingredient/substitute fields from the AI-facing edit schema; only proposal apply can issue `ai_accepted`. | Low. |
| Human-accepted AI ingredient remains forced optional | Old `ai_suggested` invariant reused | Pasta/Parmesan cannot become required | High in schema test | New `ai_accepted` origin issued only by proposal apply; keep unreviewed rule intact. | Low. |
| Compatibility release accepts forged `ai_accepted` or backup restore loses it | Live input and trusted archive share a schema before proposal work lands | Invalid provenance enters early or valid restore fails | High in SRD-0 matrix | SRD-0 separates live mutation from trusted restore before Release A; later proposal apply is the only live minting path. | Low. |
| `Usually stocked` appears source-specific but changes all matches | Global inventory flag shown without consequence | Unexpected rows disappear | High in same-name fixture | Label the household-wide effect in the sheet; test recipe, recurring, and manual sources together. | Low. |
| A recurring edit rewrites past weeks | One active flag with no effective dates | Shopping history changes | High in historical-week fixture | Start/end weeks; close-and-successor edits; occurrence skip stays in the week entry; export/import/reset coverage. | Low. |
| English translation changes a number | Model translates quantity text incorrectly | Wrong cooking amount | Medium | Preserve and compare numeric/fraction tokens; reject the whole translation on mismatch. | Medium for non-numeric measures. |
| Multi-ref prep cache keeps grouped checkboxes | Existing v4 cache passes old validation | Bug persists for some recipes | High in cache fixture | Mark only v4 caches with prep ref count >1 stale; prompt/schema limit future tasks. | Low. |
| Ingredient buttons nest inside step button | Directly turning spans into buttons | Invalid DOM and broken hydration | High in browser/console | Split step completion and pill controls into siblings; keyboard/DOM test. | Low. |
| `×2` multiplies the current count instead of recipe yield | User previously set an exact count | Repeated taps grow portions unexpectedly | High in 20-on-16 fixture | Calculate every preset from current canonical recipe yield and persist one absolute result. | Low. |
| A batch shortcut silently clamps above 99 | Large-yield recipe | `×4` promises a count that is not saved | High in boundary test | Disable invalid presets and keep exact controls; never clamp a labeled multiplier. | Low. |
| Merge recoloring changes earlier branch cards | One mutable palette map is overwritten at convergence | Color identity shifts while cooking | High in graph snapshot | Assign palette per beat while walking graph order; carry only the output stream's future palette. | Low. |
| Color mixing becomes the only merge cue | Low contrast or color-vision difference | Merge meaning disappears | High in grayscale/accessibility pass | Keep source names, `From` text, borders, and result labels; treat color as supporting information. | Low. |
| AI work moves into client heuristics | Over-aggressive cost cutting tries to infer steps/timers from strings | Unsafe or confusing cooking order | Medium | Keep semantic graph interpretation in the model; move only data already known to code and lock the call boundary with tests. | Low. |
| One `/run` crosses R3 release boundaries | Execution treats initial approval as permission for later releases | Compatibility, live migration, recipe mutation, or cleanup happens without its review | High in workflow state | Gate A authorizes Release A only; Gates B/C/D sit before migration, R3 feature enablement, and cleanup and name the exact ticket range. | Low. |
| Rollback code strips new IDs or rejects `ai_accepted` on save | Pre-SRD-0 image opens migrated data | Source identity loss or recipe save failure | High in edit/save rollback drill | Ship SRD-0/0019 as the prior release; code-only rollback targets it. Earlier rollback requires the pre-0020 snapshot and explicit loss of post-snapshot writes. | Low after both drills. |

### Steelman

The strongest objection is that stable IDs, source-rich expansion, two tables, and a proposal type are too much structure for a household app, especially after adding portion and cooking polish. A smaller UI patch would ship faster. It would keep the bugs that make the screen hard to trust: a name-keyed choice cannot say which recipe it changes, flat ingredients cannot stay separate while cooking and sum once for buying, and a plain confirmation cannot review additions with different need states. The new cooking work does not add another persistent model: portion presets store the existing absolute count, component groups project existing fields, blended colors stay display-only, and v4 AI output remains unchanged. The chosen plan adds identity only where durable shopping choices need it and keeps the new recording scope in code-owned projections.

## Decisions

> **Recurring tab:** `Every week` (`Elke week`). It says when the item appears and avoids confusing it with pantry stock.

> **Weekly alternatives:** keep `This week` as the first action and offer a separate `Use in recipe` action. A weekly stock or price choice must not silently rewrite future cooks.

> **AI additions:** start as `Nice to have`, with `Every time` and `Usually stocked` available before Apply. AI output stays non-required until a human names the stronger need.

## Resume pack

Goal: add source-aware shopping decisions, weekly buys, manual recipe enhancement, whole-batch planning, component-aware ingredients, deterministic cook colors/call ownership, complete ingredient translation, and denser recipe cards.

Current state: Gate B is approved. The Release B candidate for SRD-1A through SRD-4B passes live-copy migration, no-op import, code rollback, full restore, tests, build, and the read-only browser matrix; the live migration is in progress.

First command: complete the live write freeze, fresh snapshot, additive `0020` migration, recorded live counts, and rollback checks for SRD-1A through SRD-4B only.

First files: `src/lib/recipe_ingredient.ts`, `src/lib/server/db/schema.ts`, next append-only Drizzle migration, `src/lib/server/meal_recipes.ts`, `src/lib/server/shopping_needs.ts`.

Pending verification: take a fresh snapshot during the write freeze, compare live counts with the rehearsal, repeat both rollback checks on the fresh copies, and reopen the service only after they pass.

Decisions fixed: `Every week`; weekly alternatives do not rewrite recipes unless `Use in recipe` is chosen; AI additions start as `Nice to have`.
