# Feature List: Recipe, Cooking, and Shopping Continuity
_Status: Shipped - 2026-07-22 (occasion portions now stay consistent from recipe through planning, shopping, AH review, and cooking)_

## Problem framing

The app has good individual recipe, planning, cooking, and Albert Heijn surfaces, but they do not yet share one cooking intent. A recipe has a baseline serving count; cooking mode has a temporary serving draft; a planned meal stores no serving count; and shopping always derives the recipe's unscaled amounts. Changing one therefore cannot reliably update the others.

The same split appears in ingredient meaning. Recipe ingredient names currently carry preparation and packaging words, `cook_in` / `serve_fresh` roles are often missing after import, optional sides are not a first-class concept, substitutes live in a separate disclosure, and cooking mode receives AI-written quantity strings instead of references to the recipe's canonical ingredients. That is why changing servings still asks for a full AI regeneration, why cooking mode can omit rice or lime that the recipe expects at serving time, and why AH has to clean up recipe-flavoured search text after the fact.

The user-facing result is visible in the current app:

- Recipe cards only open the detail page; they have no direct Plan or Make action.
- Add to plan chooses a week but not how much will be cooked.
- Cooking mode spans 1,222 px of a 1,280 px viewport while normal pages use the 672 px `ui-page-shell`.
- The `Get ready` checklist contains preparation tasks, not the requested full, scaled ingredient checklist.
- Serving changes in cooking mode require an AI refresh before step quantities change.
- Pantry staples are hidden from generated shopping lists rather than offered at the bottom for a deliberate include/exclude choice.
- AH pack quantity is calculated but not editable, substitutes are not selectable in the shopping journey, and ranking does not express the household's fresh-first preference.
- Uploaded recipe images are stored at their original dimensions and bytes; the hero is full viewport width on desktop and paste-from-clipboard is unsupported.

The desired outcome is a continuous phone-first flow:

`Recipe -> choose week and portions -> scaled grocery choices -> AH packs -> cook with the same portions -> log/freeze the result`.

## Scope

### In scope

- Base-ingredient recipe data: preparation separated from the Dutch AH lookup name, order of first use, optionality, component, fresh/preserved purchase form, freezer-serving role, substitutes, and explicit scaling behavior.
- One shared portion-scaling service used by recipe display, plan instances, cooking mode, shopping derivation, AI tools, and tests.
- Meal-specific planned portions and recipe-level `scalable` versus `fixed_batch` behavior.
- Direct Plan and Make actions on recipe cards without invalid nested interactive markup.
- A Make flow that can start cooking now or log a meal already made, with portions carried into the cooking session.
- A visible, checkable, scaled ingredient list in cooking mode; preparation tasks remain distinct.
- Cook-mode cache v4 with structured ingredient references so serving changes are instant and cost-free.
- More deliberate component/stream splitting and visibly distinct component colors.
- A 672 px recipe-detail/cooking shell matching the rest of the app.
- Paste, choose, or camera-upload recipe photos through one server-side normalization pipeline; bounded display and storage dimensions.
- Import enrichment for base ingredients, preparation, order, roles, optional sides, components, substitutes, purchase form, and scaling rules, with source versus AI suggestion provenance.
- A resumable one-action path for enriching legacy recipes without silently accepting low-confidence changes.
- Shopping-list optional and staple groups, mark/unmark staple from the grocery row, per-week substitute choice, scaled quantities, and persistent include/exclude state.
- AH fresh-first ranking with recipe-declared exceptions, editable pack quantity, and egg price per egg when the pack count is known.
- English and Dutch public copy for every changed surface.

### Out of scope

- Multi-household, tenancy, accounts, permissions, or a SaaS layer.
- A relational ingredient catalogue, nutrition engine, barcode scanning, price history, or cross-supermarket comparison.
- Automatic ordering or any AH mutation before the existing explicit review-and-send step.
- Guessing pantry stock quantities from a staple flag.
- Replacing Drizzle, SQLite, daisyUI, Svelte runes, or the LLM seam.
- A background-job service. Legacy enrichment is resumable through ordinary request boundaries and the existing AI spend cap.
- Changing the invariant that AH and shopping derivation use Dutch recipe ingredient fields only.

## Existing-system inventory

| Surface | Current authority | Gap that matters here |
|---|---|---|
| Recipe ingredient | `recipes.ingredients` JSON, `Ingredient` in `src/lib/server/db/schema.ts` | Only name, amount, unit, role, substitutes; prep words remain in name and there is no optional/component/form/scaling provenance. |
| Translation | Parallel `ingredients_en` array | Index alignment means any normalization/reorder must happen before translation and invalidate stale translations atomically. |
| Recipe servings | `recipes.servings` | Baseline only; no recipe scaling mode and no planned-meal servings. |
| Planning | `meal_plan_meals` | Stores week/source/day/status but no portions. Week-boundary settings already exist. |
| Cooking | `BenchSheet.svelte`, cook-mode v2/v3 JSON | Serving draft exists, but generated text embeds quantities and requires regeneration. Progress is keyed by recipe/cache signature. |
| Shopping | `deriveWeekNeeds`, `shopping_list_overrides` | Uses unscaled recipe amounts. Overrides persist bought/manual state but not inclusion or substitute selection. |
| Staples | `inventory_items.is_staple` | Current grocery load suppresses staples unless a manual override says the household is out. |
| AH | `matching.ts`, AH preview/push routes | Pack quantity is derived and server-pushed but cannot be changed in preview; price basis is generic; ranking has no purchase-form preference. |
| Images | recipe image POST route + `RECIPE_IMAGES_DIR` | MIME and 5 MB limit only; original bytes/dimensions are stored and hero width follows the full recipe page. |
| Import | JSON-LD first, AI fallback | JSON-LD imports skip AI enrichment; both paths flatten ingredient wording and do not classify the requested semantics. |

## Evidence-backed findings

| # | Priority | Audit | Finding and user impact | Evidence | Cite |
|---|---|---|---|---|---|
| 1 | P1 | UX / correctness | A serving change has no authoritative journey-wide owner. Cooking may show one amount while planning and shopping retain another. | `recipes.servings`; no servings column in `meal_plan_meals`; `BenchSheet.svelte` regenerates for `servingDraft`; `deriveWeekNeeds` uses raw amounts. | `[H1] [H4] [Norman]` |
| 2 | P1 | UI | Recipe/cooking content is 1,222 px wide at a 1,280 px viewport, versus the app's 672 px standard. Lines and ingredient-to-action distances become difficult to scan. | `output/plan-audit/recipe-cook-1280.png`; browser geometry; `src/app.css:138-140`. | `[Type] [Gestalt] [RUI]` |
| 3 | P1 | UX | Cooking mode's `Get ready` list is generated preparation work, not the full ingredient list. In the audited curry, rice and lime exist in the recipe but not in prep or step ingredient chips. | `output/plan-audit/recipe-mise-open-375.png`; audited recipe/cook-mode JSON. | `[H2] [H6] [Norman]` |
| 4 | P1 | Hardening | Image upload trusts the client MIME, stores original bytes, and performs no decode/pixel/dimension bound. Large or malformed images can waste storage or fail later. | image route and `src/lib/server/recipe_images.ts`; source review. | `[H5]` |
| 5 | P1 | Data integrity | Import parsing can store `gehakte prei` or `gebakken ei` as the AH lookup name, while JSON-LD recipes never receive the requested semantic enrichment. | `parseRawIngredient` and JSON-LD-first branch in `recipe_ingest.ts`; `recipe_scrape.md` flattening rule. | `[H2] [H5]` |
| 6 | P2 | UX | Recipe cards lack direct Plan and Make actions, forcing an avoidable detail-page round trip for the two main intents. | `output/plan-audit/recipes-375.png`; recipe grid is one anchor per card. | `[H7] [Cooper] [Fitts]` |
| 7 | P2 | UX | Add to plan asks only for a week and describes weeks by week number, not the cooking amount or the full household planning range. | `output/plan-audit/recipe-plan-375.png`; `AddToPlanSheet.svelte`. | `[H2] [H6] [Wro]` |
| 8 | P2 | UX | Staples are absent instead of available as low-priority choices, and the grocery row has no staple action. | `shopping/+page.server.ts:60-65,113-118`; `ShoppingLists.svelte`. | `[H3] [H7] [Norman]` |
| 9 | P2 | UX | Substitutes are detached from both the ingredient row and shopping decision, so the user has to remember them across screens. | `SubstituteSuggestions.svelte`; shopping item shape has no alternatives. | `[H6] [Miller] [Gestalt]` |
| 10 | P2 | AH | AH quantity is a calculated candidate property but has no preview control; manual duplicate adds replace the same-name weekly row. | `AhPreviewItem.svelte`; `AhSheet.svelte`; unique weekly override and `addItem` replacement. | `[H3] [H7]` |
| 11 | P2 | AH | Ranking prefers cheap matching products but has no fresh-first signal or preserved-form exception. Search-term cleanup treats the symptom after recipe meaning was already flattened. | `rankProducts` sort key and `toSearchTerm` in `matching.ts`. | `[H2] [H5]` |
| 12 | P2 | UI | Component colors already exist, but one broad AI stream makes all related work look the same. | audited curry has one `curry` stream; `streamPalette` colors by stream. | `[Color] [Gestalt] [H4]` |

### Audit summary

- Harden: targeted application audit run. No P0 found. Highest-risk areas are additive migration/backfill, untrusted AI enrichment before DB writes, image decoding, and external AH quantity validation.
- UI: browser audit run at 375 px and 1,280 px. The recipe width mismatch is screenshot-backed; card and cooking controls were interacted with.
- UX: Recipe -> Plan, Recipe -> Cook, and Plan -> Shopping journeys walked against a temporary database copy. No real household data or AH order was mutated.
- Stack Discipline: no listed trigger category applies. `sharp` is an in-process image codec, not a new storage/hosting service. Its use was still verified against official documentation.
- External AH live preview: skipped; no external account state was needed for planning. `❓ unverified: current live AH response variations were not probed; implementation must use captured fixtures plus one read-only connected preview before ship.`

## Option comparison

| Option | Upside | Cost / risk | Decision |
|---|---|---|---|
| A. Add the requested buttons and lists on top of current data | Smaller first diff. | Leaves four serving values, AI regeneration, prep-flavoured AH terms, and optional/staple drift. Each later feature would add another exception. | Rejected: compounds the current split. |
| B. Extend the existing JSON ingredient contract and make planned portions the shared occasion value | Fits SQLite/Drizzle and the Dutch-name seam, preserves existing recipes/caches, and fixes the whole Recipe -> Shop -> Cook chain without a new service. | Requires one additive migration, cook-cache v4, and coordinated tests across several existing seams. | Chosen. |
| C. Introduce relational ingredient/product/component tables | Strongest normalization and future analytics. | Disproportionate migration/backfill burden for a single-household app; turns flexible recipe content into a catalogue project and duplicates AH's product model. | Rejected: architecture exceeds the problem. |

## Chosen approach

### 1. One baseline recipe, one occasion quantity

- Keep `recipes.servings` as the source recipe's baseline yield.
- Add recipe scaling mode: `scalable` by default; `fixed_batch` for recipes normally made as one batch.
- Add `meal_plan_meals.servings` as the amount made on that occasion. Existing linked plans backfill from the recipe baseline; unlinked meals remain nullable.
- The Plan and Make sheets default to the recipe baseline. A fixed batch presents that yield as the normal amount, with a secondary `Change this batch` escape rather than an irreversible lock.
- Opening a planned meal carries its stored servings into cooking. Opening a recipe directly uses the baseline until the Make sheet supplies a different value.
- One pure scaling module owns number parsing, fraction/range formatting, and ingredient rules. Default is linear. Whole-item and fixed/to-taste behavior are explicit ingredient metadata, not keyword guesses scattered across screens.
- Shopping derives each planned meal at `planned servings / baseline servings` before deduplication. Shared ingredients sum after scaling; optional/staple inclusion happens after the required total is known.

### 2. Rich ingredient meaning without a catalogue rewrite

Extend the backward-compatible ingredient JSON shape. Missing new fields keep legacy behavior.

```ts
type Ingredient = {
  name: string;                 // canonical Dutch base ingredient; the only AH term source
  amount: string;
  unit?: string;
  preparation?: string;        // chopped, drained, fried; never part of the AH key
  role?: 'cook_in' | 'serve_fresh';
  optional?: boolean;
  component?: string;          // canonical Dutch grouping hint, e.g. saus / rijst / topping
  purchaseForm?: 'fresh' | 'preserved' | 'frozen' | 'dried' | 'any';
  scale?: 'linear' | 'whole' | 'fixed';
  origin?: 'source' | 'ai_suggested';
  substitutes?: IngredientSubstitute[];
};
```

- Array order is order of first use. Items that never enter a cooking step follow in serving order; optional sides come last. The editor retains explicit up/down controls.
- `preparation` appears beside the base ingredient in the recipe/cooking UI and is carried into the relevant simple direction, but shopping/AH only sees `name`.
- Optional AI additions use `origin: ai_suggested`, are visibly marked, and default off in shopping. Enforce the writer invariant `origin === 'ai_suggested'` implies `optional === true` across import, normalization, editor, and AI-tool writes. Core source ingredients are never silently replaced or deleted.
- `purchaseForm` defaults to `fresh` for produce and `any` otherwise; a source requirement such as canned chickpeas can explicitly preserve the exception.
- Translation adds preparation and any visible component label while retaining index equality with the Dutch array. Purchase form, optionality, role, scale, and origin remain language-neutral.

### 3. Import once, process fully, preserve provenance

- Preserve raw source ingredient lines first, whether the page exposes JSON-LD or needs HTML extraction.
- Run one bounded enrichment pass after extraction for both paths. Its schema returns base name, amount/unit, preparation, first-use order, component, `cook_in` / `serve_fresh`, optionality, purchase form, scaling behavior, and substitutes.
- Enrichment receives the source ingredients and directions and must distinguish source facts from suggestions. Optional sides and substitutes may be suggested; required source content may not be invented or dropped.
- Validate AI output with Zod and deterministic invariants before writing: non-empty unique-ish Dutch names, source coverage, valid roles/enums, sensible counts, `origin === 'ai_suggested'` implies `optional === true`, and every ingredient assigned to an existing position.
- On ambiguity, store the safely preserved source parse, set `needsReview`, and show the proposed improvement in the existing review surface rather than accepting a guess.
- Add `structureVersion` to recipes. New enriched imports land at v2. A Settings -> Recipes action processes legacy v1 recipes in small resumable batches under the existing background spend cap; low-confidence results remain review items.
- Update the recipe create/edit AI tools and manual editor so every write follows the same schema and invalidation rules.

### 4. Recipe cards own Plan and Make

- Refactor each card from one enclosing anchor to an `<article>`: image/title/body link plus a separate 40-44 px action strip. This prevents nested buttons inside links and preserves the two-column phone grid.
- `Plan` opens the shared plan sheet with week range, source choice when freezer portions exist, and occasion servings.
- `Make` opens a compact sheet with the same servings control and two clear outcomes:
  - `Start cooking` opens cooking view with that occasion's servings.
  - `Already cooked` records a manual cook for today, then reuses the existing freeze-portions prompt.
- A planned meal's recipe link opens with its plan id and servings; completing cooking marks that plan row cooked through the existing idempotent cook-log seam rather than creating a second manual log.
- Plan weeks display the actual date range. The default planning boundary becomes Wednesday-Tuesday only when the household has no explicit week-start preference; existing explicit preferences are never overwritten.

### 5. Cooking mode becomes a deterministic projection

- Introduce cook-mode cache v4. AI decides clear steps, localized wording, component streams, timers, preparation tasks, and ingredient-index references. It does not bake quantities into prose.
- The UI renders every quantity from the canonical recipe ingredient plus the occasion multiplier. Serving +/- therefore updates ingredients, preparation, and step chips immediately without an AI call or progress reset.
- Legacy v2/v3 caches remain readable. A recipe receives one v4 refresh in the background when needed; the original directions and ingredient list remain usable while it runs.
- Replace the collapsed prep-only strip with two distinct sections:
  - `Ingredients`: full scaled list in first-use order, open by default, checkable, optional sides marked, substitutes available inline.
  - `Get ready`: preparation tasks, separately checkable and collapsible.
- Persist ingredient and prep checks with the existing cook progress, keyed by recipe plus plan/occasion identity and cache signature. Changing servings does not discard step/timer/check state.
- Component generation should split independently handled work (for example curry, rice, fried egg, garnish) into distinct streams. Reuse the existing palette, show a colored component label and edge on each relevant card, and cap/reuse colors deterministically when components exceed the palette.
- Put the complete recipe route inside the standard `max-w-2xl` shell. Header, hero, utility rows, cooking steps, notes, and fixed-bar contents align to the same column at every viewport.

### 6. Images are normalized once

- Support an image clipboard item on recipe detail and edit surfaces. Only intercept a paste when the clipboard actually carries an image; ordinary text paste keeps normal input behavior.
- Keep camera/file picking as the mobile path. Both routes call the same upload endpoint and show the same busy/error state.
- Add `sharp` to the adapter-node runtime. Decode first, auto-orient from EXIF, enforce byte and pixel limits, resize inside 1,600 x 1,600 without enlargement, strip metadata, encode one bounded WebP, and atomically replace the prior file only after successful conversion.
- `🔍 verified: official Sharp documentation supports EXIF auto-orientation, inside-fit resize with withoutEnlargement, default metadata stripping, WebP encoding, and returned output dimensions.` Sources: [Sharp operation docs](https://sharp.pixelplumbing.com/api-operation/#autoorient), [Sharp resize docs](https://sharp.pixelplumbing.com/api-resize).
- Store only the normalized `.webp`; clean legacy extensions after the DB update succeeds. A failed conversion leaves the old image and URL untouched.
- Render the hero through the existing smart-image primitive at 16:9 inside 672 px, with `object-cover`; cards keep their bounded thumbnail height.

### 7. Shopping exposes choices instead of hiding them

- Extend weekly shopping overrides with `included` and `selectedName`. The override key remains the canonical Dutch base `name`; `selectedName` is only the chosen Dutch shopping/AH term.
- Present groups in this order:
  1. Required items, selected by default.
  2. Optional sides, unselected by default and labelled with their meal.
  3. Household staples, unselected by default at the bottom.
- A row action marks/unmarks the canonical ingredient as a household staple using the existing inventory staple authority. When no active pantry row matches, create/revive one through the inventory write/merge boundary; do not create duplicate name variants.
- Selecting a substitute changes only that week's `selectedName`; the recipe remains unchanged. Show the substitute note at the choice point and retain the base ingredient as the row identity for bought/undo/history.
- Manual re-add of an existing name merges or increments the week's amount instead of replacing the row silently. Required, optional, staple, and manual rows all use stable source refs so same-label UI choices do not cross-wire.
- AH preview receives only currently included, uncovered items. The push contract keeps `sourceRef` / canonical Dutch base `name` as row identity; `term` / `selectedName` is only the Dutch AH search-and-send value. A successful push marks the canonical source row bought, even when a substitute was sent.

### 8. AH chooses the right form, then the right count

- Carry `purchaseForm` into AH preview. Ranking keeps favorite and semantic relevance protections, but within relevant food results prioritizes form compatibility: fresh whole produce before pre-cut/bagged/canned variants unless the recipe explicitly requires another form.
- Do not rely on negative keyword lists alone. Add a small deterministic product-form classifier over product name/category/size, backed by fixtures for whole, cut/bagged, canned, frozen, and dried forms. AI archetype picking receives the form requirement and may not override a pinned favorite.
- Add a pack-quantity stepper to the selected AH product. Seed it from `deriveQuantity`; allow the user to raise or lower it within 1-99. Validate and clamp again in the push route.
- When changing product candidate, calculate that candidate's required pack count. Preserve an explicit user override only when still valid and make the override visible.
- For count packs such as eggs, parse the pack count and show both pack price and computed price per egg. If count is unknown, omit per-egg copy rather than guessing.
- Preserve the Dutch-field invariant through substitute search, re-search, favorites, preview refs, and push history.

## Phase plan and context-window strategy

Overall size is XL. Execute in six phases. Every phase ends with passing focused tests and a clean handoff; switch context only at phase boundaries or between tickets explicitly marked multi-window.

### Phase 1 - Contracts, migration, and shared scaling (multi-window)

Execute RCS-1 and RCS-2. Do not touch UI until the additive migration, compatibility parsers, and shared quantity tests pass.

### Phase 2 - Import and recipe normalization (multi-window)

Execute RCS-3 and RCS-4. Verify the Dutch base-name seam and provenance before allowing normalized data into cooking or shopping.

### Phase 3 - Planning and recipe-card entry points (multi-window)

Execute RCS-5 and RCS-6. The plan instance becomes the occasion authority before cooking and shopping consume it.

### Phase 4 - Cooking, layout, and images (multi-window)

Execute RCS-7, RCS-8, and RCS-9. Keep v2/v3 rendering available throughout; never land a half-converted cache reader.

### Phase 5 - Grocery choices and AH review (multi-window)

Execute RCS-10, RCS-11, and RCS-12. First make the local list correct, then let AH consume it.

### Phase 6 - Cross-flow hardening and rollout (one to two windows)

Execute RCS-13. Run the complete mobile/desktop and migration/rollback matrix before ship.

## Execution tickets

### RCS-1 - Additive recipe/plan/shopping contract

- Impact / effort / confidence: 5 / L / high.
- Scope in: append-only Drizzle migration for recipe `scalingMode`, `structureVersion`, planned `servings`, and weekly `included` / `selectedName`; backward-compatible ingredient types; import/export/reset coverage.
- Scope out: UI and AI enrichment.
- Target paths: `src/lib/server/db/schema.ts`, `drizzle/`, settings import/export/reset, shared recipe/detail types.
- Risk tier: R3.
- Dependencies: none.
- Verification: migrate a copy of the pre-change DB; assert legacy recipes, plans, overrides, imports, and resets; rerun migration idempotently through the journal path.
- Rollback: restore the pre-migration SQLite snapshot if data rollback is required. Code rollback may leave additive columns in place; old code must ignore them safely.

### RCS-2 - One quantity engine

- Impact / effort / confidence: 5 / M / high.
- Scope in: pure baseline-to-occasion projection for decimals, common fractions/ranges, whole items, fixed amounts, formatting, and compatible-unit sums; replace keyword-based independent calculations inside the quantity engine only.
- Scope out: consumer wiring such as `deriveWeekNeeds`, AI shopping execution, unit conversion across incompatible dimensions, and nutrition math. Until RCS-11, shopping callers retain compatibility multiplier `1` and may not add another scaling implementation.
- Target paths: `src/lib/recipe_scale.ts` and new focused quantity helpers/tests.
- Risk tier: R2.
- Dependencies: RCS-1.
- Verification: table tests for 1/2, 1.5, ranges, eggs, to-taste/fixed, shared-ingredient sums, fixed batches, null servings, and English/Dutch display.
- Rollback: keep legacy string amounts as the stored truth; revert consumers to multiplier 1 if parsing fails.

### RCS-3 - Enrich every imported recipe safely

- Impact / effort / confidence: 5 / L / medium.
- Scope in: raw extraction preservation, one enrichment schema/prompt for JSON-LD and fallback paths, provenance, review fallback, roles, optional sides, substitutes, component, order, purchase form, scaling metadata.
- Scope out: autonomous acceptance of low-confidence rewrites.
- Target paths: `src/lib/server/ai/recipe_ingest.ts`, recipe prompts, AI client seam consumers, translation path, recipe ingest/unit tests.
- Risk tier: R2.
- Dependencies: RCS-1, RCS-2.
- Verification: fixtures for chopped leek, fried egg, canned chickpeas, nasi with optional kroepoek, substitutes, missing steps, mixed language, model-invalid JSON, source ingredient omission, and the hard writer rule `origin === 'ai_suggested'` implies `optional === true`.
- Rollback: preserve the raw deterministic parse and mark review; no partial enriched write.

### RCS-4 - Normalize legacy recipes without silent rewrites

- Impact / effort / confidence: 4 / L / medium.
- Scope in: resumable Settings action, v1/v2 progress, spend-cap behavior, per-recipe transactional write, low-confidence review queue, editor parity.
- Scope out: startup-time automatic bulk mutation.
- Target paths: Settings recipes page/server, a bounded normalization endpoint/service, recipe editor/list review states, AI spend tests.
- Risk tier: R3.
- Dependencies: RCS-3.
- Verification: interrupt/resume, cap reached, one recipe failure, double-submit, concurrent edit staleness, already-v2 skip, and rejection of any normalized/editor/AI-tool write where `origin === 'ai_suggested'` but `optional !== true`.
- Rollback: each recipe transaction retains its prior JSON until enriched validation succeeds; DB snapshot before bulk apply.

### RCS-5 - Recipe-card Plan and Make actions

- Impact / effort / confidence: 4 / M / high.
- Scope in: semantic card refactor, action strip, shared Plan/Make sheet, start-cooking and already-cooked outcomes, touch/keyboard focus.
- Scope out: recipe-card filtering/sorting changes.
- Target paths: recipes list page/server, new/reused recipe action sheet components, cook/freeze endpoints, messages.
- Risk tier: R2.
- Dependencies: RCS-1.
- Verification: 320/375/768/1280 px; no nested interactive elements; keyboard order; busy/error/double-submit; already-cooked idempotency and freeze prompt.
- Rollback: retain the card's main recipe link; actions can be removed without affecting data.

### RCS-6 - Planned portions and Wednesday planning range

- Impact / effort / confidence: 5 / L / high.
- Scope in: create/update APIs and AI tool accept servings; plan sheet and meal-plan rows show/edit servings; actual date ranges; configured Wednesday default only when unset; plan-to-cook linking.
- Scope out: mandatory day-by-day meal planning.
- Target paths: meal-plan API routes/page, AddToPlan sheet, meal-plan prefs, AI tools/executors, cook-log bridge.
- Risk tier: R3.
- Dependencies: RCS-1, RCS-2, RCS-5.
- Verification: fixed/scalable plans, custom week preference preserved, legacy nearest-week bucketing, unlinked meal, freezer source, update after plan, duplicate cook logging.
- Rollback: nullable servings fall back to recipe baseline; existing week keys remain readable.

### RCS-7 - Cook-mode v4 and instant serving changes

- Impact / effort / confidence: 5 / XL / medium.
- Scope in: v4 schema/generator/validator/localizer, structured ingredient refs, ingredient and prep checklists, instant scaling, plan identity, component streams/colors, legacy v2/v3 path.
- Scope out: voice control or multi-device live sync.
- Target paths: `src/lib/types.ts`, cook-mode server/prompt/tests, `BenchSheet.svelte`, cook-mode components/palette, raw fallback, staleness/progress helpers.
- Risk tier: R2.
- Dependencies: RCS-2, RCS-3, RCS-6.
- Verification: v2/v3 fixtures, v4 generation, servings change with zero network calls, timer/check preservation, every required ingredient visible, optional side visibility, component color reuse, raw fallback during refresh.
- Rollback: keep v2/v3 normalizers and original directions; never delete a usable legacy cache before v4 validates.

### RCS-8 - One recipe width and bounded hero

- Impact / effort / confidence: 4 / S / high.
- Scope in: max-2xl route shell, sticky header alignment, hero/toolbars/notes/cook cards/fixed bar, SmartImage reuse.
- Scope out: global shell redesign.
- Target paths: recipe detail page and recipe-detail/cook components, `src/app.css` only if a shared recipe-shell utility is warranted.
- Risk tier: R1.
- Dependencies: RCS-7 boundary known.
- Verification: browser geometry and screenshots at 320/375/768/1280/1536; no horizontal overflow; timers and fixed actions align to the column.
- Rollback: remove the wrapper without touching data or cooking state.

### RCS-9 - Paste and normalized recipe photos

- Impact / effort / confidence: 4 / M / high.
- Scope in: `sharp`, clipboard image path, shared upload state, decode/pixel/byte bounds, EXIF orientation, WebP resize, atomic replace, legacy cleanup, image response/cache behavior.
- Scope out: gallery/multiple photos or cloud storage.
- Target paths: package manifests, image endpoint/helper/read route, recipe detail/edit photo affordances, Docker build verification, image tests.
- Risk tier: R2.
- Dependencies: RCS-8 for display constraint.
- Verification: JPEG/PNG/WebP, rotated EXIF, oversized dimensions, malformed bytes with image MIME, transparency, text-only paste, repeated replace, Docker Linux build/read.
- Rollback: preserve old file until new WebP and DB update succeed; old extensions remain readable during one release.

### RCS-10 - Optional, substitute, and staple grocery choices

- Impact / effort / confidence: 5 / L / medium.
- Scope in: ordered grocery groups, include toggles, weekly substitute selection, row-level staple action, stable source identity, manual same-name merge, undo/error handling, and canonical bought/history marking in the AH push route.
- Scope out: a permanent global shopping catalogue.
- Target paths: shopping page/load/API/types/components, weekly override merge, inventory write/merge helper, recipe substitute UI, AH push route/history boundary, messages.
- Risk tier: R2.
- Dependencies: RCS-1, RCS-3.
- Verification: optional/staple defaults, include persistence, substitute reload, duplicate ingredient across meals, case/diacritic match, staple create/revive/unmark, undo and network failure; push a selected substitute fixture and assert `sourceRef` / canonical base name marks the row while `term` / `selectedName` is only the sent value.
- Rollback: legacy rows default included; canonical recipe names remain untouched.

### RCS-11 - Scale and aggregate the actual shopping intent

- Impact / effort / confidence: 5 / L / high.
- Scope in: the only behavioral wiring from planned servings through `deriveWeekNeeds`, sub-recipe expansion, optional/staple filtering, selected substitute term, compatible amount sums, chat executor parity, and freezer serve-fresh behavior. All consumers call the RCS-2 projection exactly once; none calculate their own multiplier.
- Scope out: cross-unit estimation when conversion is unsafe.
- Target paths: `shopping_needs.ts`, shopping load, meal-recipes expansion, AI shopping executor and tests.
- Risk tier: R2.
- Dependencies: RCS-2, RCS-6, RCS-10.
- Verification: two meals at different servings, shared ingredients, fixed batch, Meal Recipe sub-parts, freezer meal fresh sides, optional choice, staple choice, unsafe unit combination surfaced rather than guessed, and a golden 4 -> 6 serving case proving `deriveWeekNeeds` applies exactly one multiplier.
- Rollback: fall back per item to uncombined display rows when units cannot be proven compatible.

### RCS-12 - Fresh-first AH preview, editable packs, per-egg price

- Impact / effort / confidence: 5 / L / medium.
- Scope in: purchase-form signal, deterministic form classification/ranking, AI archetype context, pack stepper, candidate-change behavior, server clamp, count-unit price display, source/substitute history.
- Scope out: price prediction or product availability guarantees.
- Target paths: AH matching/AI-pick/client-facing types/tests, preview/push routes, `AhSheet`, `AhPreviewItem`, push history.
- Risk tier: R2.
- Dependencies: RCS-10, RCS-11.
- Verification: fixtures for whole leek versus cut bag, fresh tomato versus canned, explicit preserved exception, eggs 6/10/12, bonus price, favorite override, qty 1/2/99/invalid, re-search and substitute source refs.
- Rollback: current relevance/price ranking remains the fallback when form classification is unknown; server defaults invalid qty to a rejected 400, never a silent large order.

### RCS-13 - Full-flow verification and rollout

- Impact / effort / confidence: 5 / L / high.
- Scope in: migration rehearsal, browser matrix, accessibility, connected read-only AH preview, Docker image, export/import/reset, rollback drill, docs.
- Scope out: unrelated app-wide redesign.
- Target paths: focused tests/evidence, README only where user operation changed, feature-list status in `/run` done stage.
- Risk tier: R3.
- Dependencies: RCS-1 through RCS-12.
- Verification: complete matrix below; all repository gates.
- Rollback: documented snapshot restore plus prior image; additive columns/caches remain harmless if old code is restored.

## Risk tier and verification matrix

Overall risk: R3 because the work adds persistent columns, backfills existing rows, and changes the quantity used for external AH pushes. No destructive schema operation is planned.

| Check | Plan | Current status |
|---|---|---|
| Repository typecheck | `npm run check` | Pass, 0 errors / 0 warnings on 2026-07-22. |
| Unit suite | `npm run test:unit` | Pass, 287 tests on 2026-07-22. |
| Production build | `npm run build` | Pass on 2026-07-22. |
| Migration rehearsal | Copy a pre-change DB; migrate; inspect counts/servings/overrides; run app; restore snapshot. | Pass: 0000-0016 database upgraded through 0018 with linked servings and override defaults intact; the untouched snapshot retained the legacy shape. |
| Scaling unit coverage | Fractions, whole/fixed, sums, fixed batch, sub-recipes, freezer roles. | Pass in the unit suite and browser flow; 4 -> 5 servings produced 250 -> 312½ g and 400 -> 500 g exactly once. |
| Import adversarial fixtures | Base/prep split, optional suggestion provenance, source omission, invalid model output, stale concurrent edit. | Pass, including source coverage, low-confidence staging, spend cap, and stale-edit protection. |
| Cook cache compatibility | Render v2/v3; generate v4; change servings without network/progress reset. | Pass: v2/v3 readers retained; v4 ingredient references rescale instantly and preserve progress. |
| UI browser matrix | 320, 375, 768, 1280, 1536; EN/NL; cards, sheets, recipe, cooking, shopping, AH preview. | Pass across all five widths. English full flow and Dutch normalization/shopping flow had no overflow or browser errors. |
| Accessibility | Tab/Shift+Tab, Enter/Space, Escape/focus restore, 44 px comfort targets, reduced motion, status announcements. | Pass: semantic card actions, labelled controls, focusable sheets, and grocery status announcements reviewed in browser. |
| Image safety | Decode/EXIF/pixel/byte/malformed/atomic replace/Docker. | Pass for JPEG/PNG/WebP, EXIF rotation, malformed input, transparency, bounded output, atomic replacement, and Linux container build. |
| AH correctness | Fixture ranking + quantity clamp + one connected read-only preview; no order push in verification. | Fixture, canonical source-name, fresh-first, generalized count-price, and 1-99 checks pass. Connected preview was unavailable in this checkout; the UI failed closed as not connected and sent nothing. |
| Export/import/reset | New columns/JSON fields round-trip and reset groups remain complete. | Pass, including legacy defaults and new structured fields. |
| Rollback drill | Restore DB snapshot and prior app image; verify legacy columns/caches/images remain readable. | Pass: the pre-migration snapshot stayed readable and compatibility readers accept legacy recipe/cook/image data. |
| Harden audit | Targeted app hardening. | Run; mitigations integrated. |
| Stack Discipline | Trigger-category check. | Skipped: no trigger category; Sharp verified independently. |
| UI audit | Recipe/list/cooking width and controls. | Run. |
| UX audit | Recipe -> Plan/Make -> Shopping/Cooking. | Run. |
| Plan critique | Failure modes, steelman, independent verification. | Pass after two P1 ticket-boundary fixes: RCS-11 solely owns shopping scaling; RCS-10 owns canonical substitute marking through AH push. Two P2 clarifications added for snapshot timing and AI-suggestion validation. |

## Rollback and rollout strategy

1. In each environment, take a SQLite snapshot immediately before applying the migration and record current recipe/plan/override counts.
2. Ship the additive migration and compatibility readers before enabling new writes. Existing JSON fields and cook caches remain valid.
3. Enable new import writes and plan servings. Do not run legacy normalization yet.
4. Verify one full local flow and one connected read-only AH preview. Take a second SQLite snapshot immediately before enabling the Settings legacy-normalization action.
5. Keep legacy cook-cache and image-extension readers for at least one release. New writes use v4/WebP only.
6. If application behavior regresses, roll back the app image; additive columns and richer JSON are ignored by old readers. If migrated data itself is wrong, stop writes and restore the SQLite snapshot.
7. Never squash the Drizzle journal. A corrective migration is append-only.

## Failure-mode critique

| Failure mode | Trigger | Impact | Detectability | Mitigation | Residual risk |
|---|---|---|---|---|---|
| Planned servings backfill assigns the wrong amount | Null/legacy recipe yield or unlinked dinner | Wrong grocery totals | Migration assertions and sampled rows | Nullable fallback, linked backfill only, pre-migration snapshot | Low |
| Quantity scales twice | v4 cache was generated for target servings and UI multiplies again | Overbuying and wrong cooking amounts | Golden fixture at 4 -> 6 servings | v4 stores baseline servings and refs; one shared projection owns scaling | Low |
| AI silently invents a required ingredient | Enrichment treats a suggestion as source fact | Recipe fidelity loss and unwanted shopping | Source-coverage invariant and provenance UI | Suggested additions must be optional + `ai_suggested`; low confidence needs review | Medium |
| English or substitute name reaches AH | Selected display field is used as shopping key | Bad AH matches; invariant regression | Dutch-seam unit tests and request fixtures | Base and substitute canonical names stored in Dutch; translations display-only | Low |
| Fresh-first picks the wrong form | Recipe genuinely requires canned/frozen/dried form | Wrong product | Explicit fixture and preview label | `purchaseForm` exception outranks fresh default; user can pick/re-search/favorite | Medium |
| Staple choice disappears or is pushed while off | Weekly include state keyed by selected display term | Missing/extra AH item | Reload and push-source-ref tests | Canonical base key owns override; selected term is a value only | Low |
| Legacy cook progress attaches to another quantity | Progress key lacks occasion identity | Incorrect completed steps/timers | Reload planned and direct sessions | Include plan/occasion identity plus cache signature; migrate/clear incompatible state | Low |
| v4 generation fails | Provider/cap/schema failure | No enhanced steps | Existing fallback is immediate | Keep original directions and structured ingredient checklist usable; retry later | Low |
| Image conversion consumes excessive memory | Crafted dimensions or decoder issue | Process instability | Pixel-limit fixture and server logs | Byte + input-pixel limits, decode before write, single bounded output | Low |
| Image replace loses the old photo | Conversion/write/DB update fails mid-operation | Missing recipe image | Failure injection | Temp output, atomic rename, DB update order, delete old only after success | Low |
| Card actions conflict with card navigation | Buttons remain inside anchor or event bubbling | Wrong navigation / inaccessible controls | Browser and DOM audit | Semantic article with separate link and buttons | Low |
| Week default moves existing plans | Wednesday preference overwrites an explicit setting | Meals appear in unexpected bucket | Existing pref fixture | Change fallback only when unset; reuse nearest-week bucketing | Low |
| AH sends an excessive quantity | Client state is tampered with | Large unwanted basket mutation | Push-route validation tests | Integer 1-99 schema and server clamp/reject; explicit review remains | Low |
| Too many colors reduce meaning | Every minor step becomes a new component | Noisy cooking view | Screenshot/greyscale review | Components represent independent work only; deterministic capped palette | Low |

Steelman: The strongest alternative is a smaller UI-only pass: it would visibly satisfy several bullets with much less code. It loses because servings, ingredient identity, optional sides, and AH quantity are already the same domain value expressed four different ways. Adding buttons before establishing that shared contract would make the card action write one value, cooking regenerate another, and shopping continue to use a third. The chosen additive JSON-and-plan extension is therefore the narrower sustainable change: it reuses the current SQLite, recipe JSON, shopping override, palette, and AI seams while removing the drift that caused the feedback.

## Resolved decisions

> **Fixed batch:** show its normal batch size and allow a secondary `Change this batch` override. The source recipe stays stable while half/double occasions carry into planning, shopping, and cooking.

> **AI-suggested sides:** keep them visibly optional and unchecked in shopping.

> **Wednesday-Tuesday default:** use it only when no preference is saved; explicit choices remain authoritative.

> **Legacy recipe structure:** one resumable Settings action; low-confidence proposals wait for review.

## Agent handoff checkpoints

- After Phase 1: migration copied/rehearsed, compatibility types and scaling tests green; no UI writes yet.
- After Phase 2: new imports and one legacy fixture carry rich Dutch ingredient semantics with provenance; translation/AH seams proven.
- After Phase 3: card Plan/Make and meal-plan servings persist end to end; shopping still allowed to render legacy totals until Phase 5.
- After Phase 4: v4 cooking is cost-free to rescale, ingredient-complete, bounded in width, and image-safe; v2/v3 fallback proven.
- After Phase 5: local grocery intent is authoritative and AH preview consumes only its included canonical Dutch choices.
- After Phase 6: migration/rollback drill, full browser matrix, Docker, and read-only connected AH preview complete.

## Resume pack

- Goal: deliver one continuous recipe-to-plan-to-shopping-to-cooking flow with occasion servings, base ingredients, optional/staple choices, instant cooking scale, safe images, and correct AH pack decisions.
- Current state: RCS-1 through RCS-13 shipped. The append-only migrations, compatibility readers, canonical Dutch AH identity, and single quantity projection are retained.
- Next command: `/plan` against the next active feature list.
- Verification: repository gates, migration/rollback, Linux container, full-width browser matrix, Dutch interaction flow, and AH fixtures pass. A connected AH preview remains unavailable in this checkout; fail-closed behavior sent nothing.
- Open questions: none for this feature.
