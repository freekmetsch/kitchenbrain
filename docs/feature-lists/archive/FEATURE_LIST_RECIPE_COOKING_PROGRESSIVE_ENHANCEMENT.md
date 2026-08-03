# Feature List: Cooking-First Recipe Page and Optional Cooking Details

_Status: Shipped - 2026-08-03 (implemented, verified, and pushed on `codex/recipe-cooking-first`)_

## Outcome

The recipe page now opens directly on one cooking desk. Phone order is setup, counter, then steps;
wide/tall screens keep setup and counter in a sticky left rail beside the timeline. Import-review
warnings remain before cooking, while photo, metadata, composition, and maintenance content follow
the cooking desk.

Cooking details are wholly opt-in. Page load, import, edit, chat recipe writes, and meal-composition
changes do not request them. `Add cooking details`, Refresh, and Retry are the only request paths,
and successful generation writes only the validated cache without changing canonical recipe text.
Edit and Archive are adjacent, Routine & freezer and AI suggestions occupy the green utility row,
and Cooking / Original plus language sit directly under portions.

Merge cards retain the result stream color on the left and render equal ordered incoming-stream
segments across the top. Unit, source-contract, primary/secondary browser, responsive visual, and
production-build verification passed with isolated synthetic data and no provider call.

## Problem Framing

The recipe page currently asks Freek or Ylfa to pass the photo, metadata, planned-meal context, Archive panel, Cooking rhythm/freezer card, and AI-suggestions card before cooking begins. The Cooking view / Original recipe choice sits in the Green Ribbon, separated from the portions it changes. Archive is a full body panel rather than an action beside Edit.

The page also starts the metered cooking-plan generator automatically when its cache is missing. That generator is started from page load, import, edit, composed-meal changes, and chat recipe writes. Its new-import path may promote rewritten directions into the canonical recipe. This contradicts the revised product decision: enhanced cooking details must be optional and user-triggered, while recipe text changes remain manual or explicitly reviewed through AI suggestions.

The desired result is a cooking-first page:

1. The Green Ribbon identifies the recipe and contains deliberate recipe commands.
2. Portions, planned-meal context, Cooking / Original, language, and optional cooking details form one paper control area immediately before the cooking content.
3. Cooking steps and counter ingredients arrive before photo, metadata, and maintenance panels.
4. Edit and Archive remain adjacent; Archive keeps confirmation and Undo.
5. The setting currently called Cooking rhythm returns to the green header area with a clearer name.
6. AI suggestions remains in that green area as a visibly secondary, reviewed recipe-improvement action.
7. A merge step keeps its result color on the left and shows the colors of every incoming lane as ordered segments across the top edge.

## Evidence and Existing-System Inventory

- The current source order is `RecipeHeader` → `RecipeHero` → metadata → `RecipePlanContext` → `RecipeArchiveControl` → import review → Cooking rhythm/freezer + AI suggestions → `BenchSheet`.
- `RecipeHeader.svelte` owns Edit, Plan, Cooking / Original, and language inside the Green Ribbon.
- `BenchSheet.svelte` owns portions, source/cooking content, optional structured guidance, counter ingredients, steps, and cook logging.
- `FreezerStockPanel.svelte` combines repeat cadence, seasons, keep-stocked state, freezer count, and target portions. “Cooking rhythm” names only part of that job.
- `RecipeEnhancementSheet.svelte` proposes reviewed edits to the recipe. It is distinct from cooking-plan generation and must remain visibly distinct if retained.
- `cookPaletteGraph()` already returns the source palettes for merge steps, but `BenchSheet` passes only the result palette to `CookStepCard`.
- `CookStepCard` renders the result color as a left bar and names incoming streams in text; no incoming color reaches the card.
- The isolated responsive browser story passed at phone and desktop on 2026-08-03. The user’s reported ordering problem and the source hierarchy are the load-bearing evidence; the test confirms the present controls and Green Ribbon behavior are reachable without household data.
- The UI/UX audit is source-based for the selected layout because it is not implemented yet. It found two design constraints now encoded below: one semantic phone/desktop document order, and conditional stickiness that cannot trap controls on short or zoomed viewports. Runtime proof remains a `$run` responsibility.

```powershell
$env:PLAYWRIGHT_HTML_OPEN='never'; npm run test:e2e -- --grep "Joined Stock and Recipe headers stay compact and complete"
```

## Fixed Product Decisions

- Cooking-plan generation is opt-in. Opening, importing, editing, composing, or changing a recipe does not call the provider.
- The explicit cooking-details action writes only the validated `cook_mode_json` cache. It never rewrites canonical directions, Dutch ingredients, translations, shopping fields, or Albert Heijn lookup terms.
- An eligible existing cooking plan may still render; stale or missing details expose the explicit action instead of regenerating.
- Freek selected **D. Split Prep Desk**: one phone-first document order that becomes a left prep rail and right cooking timeline on sufficiently wide screens.
- `Routine & freezer` / `Routine & vriezer` is the selected replacement for Cooking rhythm, and `AI suggestions` remains a separate reviewed recipe-edit workflow in the green utility row.
- `Cooking / Original` and language sit directly under portions. The opt-in action is `Add cooking details` / `Kookdetails toevoegen` with `Uses AI once; your recipe text stays unchanged.`
- Edit and Archive stay adjacent in every variant. Archive retains literal confirmation, redirect, Undo, restore, disabled state, and focus behavior.
- The incoming-color band supplements, never replaces, stream names and merge text.

## Scope

### In

- Remove every automatic cooking-plan trigger and expose one explicit, busy-safe cooking-details action.
- Prevent cooking-plan generation from promoting canonical directions.
- Recompose the recipe page as Split Prep Desk at 320, 393, 768, and 1280 px, using one document order rather than separate phone/desktop controls.
- Move Cooking / Original and language directly beneath portions.
- Integrate selected planned-meal context with the cooking controls instead of a full panel above cooking.
- Move `Routine & freezer` into a visually continuous green utility band.
- Move AI suggestions into that green utility band while preserving loading, review-ready, retry, and dialog states.
- Move Archive beside Edit and remove the duplicate body panel for active recipes; preserve an archived-state Restore treatment.
- Move photo, metadata, meal composition, role coverage, and other reference/maintenance content after the cooking surface, except import-review warnings that can make the recipe unsafe or incomplete.
- Render ordered incoming lane colors across the top of merge steps while retaining the result lane on the left.
- Update English/Dutch copy, accessibility names, focused unit tests, and isolated Playwright stories.

### Out

- Changing the recipe, cook-mode, meal-plan, or freezer database schema.
- Changing model selection, OpenRouter configuration, daily spend caps, or the validated generated-plan schema.
- Redesigning the AI-suggestions review dialog, recipe editor, original recipe body, counter checks, serving calculations, or cook logging.
- Automatically accepting AI suggestions or generated cooking details.
- Moving Dutch canonical ingredient data into display-only English fields.
- Creating another persistent user preference, feature flag, or alternate recipe route.

## Design Shotgun

Five complete directions were compared using the same recipe content, phone/desktop requirements, controls, cooking lanes, and merge behavior.

| Variant | Visual thesis | Main strength | Main trade-off | Optimizes for |
| --- | --- | --- | --- | --- |
| **A. Counter First** | Two-tier green header, then a calm paper cooking control block and the counter/timeline immediately. Reference material moves below cooking. | Shortest, clearest route from recipe title to cooking while preserving all requested commands. | The green header still carries two secondary utilities. | Repeated phone cooking. |
| **B. Kitchen Console** | A denser command ribbon and one sticky horizontal control deck combine portions, mode, language, and cooking details. | Everything operational stays visible during scrolling. | More compact controls and a busier first screen. | Fast switching during an active cook. |
| **C. Quiet Cook** | Minimal identity header; cooking controls and steps dominate. Edit/Archive and recipe-improvement tools sit in one compact green drawer. | Lowest cognitive load and earliest first step. | Secondary commands require opening one drawer. | Hands-busy cooking. |
| **D. Split Prep Desk** | Desktop uses a sticky left control/counter rail and right timeline; phone collapses to the same ordered stack. | Strong wide-screen use without changing phone task order. | Largest responsive-layout change. | Laptop or tablet on the counter. |
| **E. Recipe Dock** | A prominent Cooking / Original dock sits beneath portions; optional details appear as a contained upgrade card before the timeline. | Makes the two recipe representations and optional enhancement unmistakable. | Adds more vertical chrome before step one than A or C. | Occasional source comparison. |

### Selected combination: D. Split Prep Desk

Freek selected **D. Split Prep Desk**, overriding the initial A recommendation. It keeps A’s cooking-first phone order while preserving portions, ingredients, and view controls beside a long timeline on a sufficiently wide counter screen. The exact arrangement is:

1. Green identity row: Back, recipe title, quiet adjacent Edit + Archive, and clay Plan.
2. Continuous green utility row: current `Routine & freezer` summary and secondary `AI suggestions` action.
3. Import-review warning when present, before any cooking instructions it can invalidate.
4. Split Prep Desk: the left rail contains selected planned occasion, portions and batch size, Cooking / Original and language directly beneath portions, explicit cooking-details state/action, and counter ingredients. The right column contains the step timeline and Log cooked action.
5. At 320/393 px and any constrained or zoomed viewport, that same document order stacks as controls → counter → timeline. From 768 px it may split when both columns keep their minimum readable width. Stickiness begins only at 1024 px with sufficient viewport height; otherwise the rail stays in normal document flow and never becomes an independently scrolling panel.
6. Original view keeps the same left control rail, omits cooking-only counter content, and renders the original recipe as one readable right column. Missing counter ingredients let the timeline use the available column without an empty rail section.
7. Recipe details below the complete cooking desk: photo, metadata, source/maintenance information, meal composition, and role coverage.

This treats the Green Ribbon as identity plus commands while placing route context in a contiguous green utility row. It reuses `BenchSheet`’s existing counter/timeline grid and adds progressive stickiness without duplicating controls or introducing a second recipe route.

Rejected alternatives:

- **A. Counter First:** strongest fallback and simpler on wide screens, but its prep context scrolls away during a long timeline; D retains the same phone order while improving counter-screen continuity.
- **B. Kitchen Console:** keeps controls visible but creates an overly dense command ribbon and weakens the one-primary-action hierarchy.
- **C. Quiet Cook:** reaches steps fastest but hides Edit, Archive, Routine & freezer, and AI suggestions behind another disclosure.
- **E. Recipe Dock:** clarifies representation changes but adds persistent chrome before step one without D’s wide-screen prep benefit.

## Terminology and Copy

### Routine and freezer

Selected visible label: `Routine & freezer` / `Routine & vriezer`.

The button should prefer the current summary over the category name, for example `Monthly · keep 4 frozen` / `Maandelijks · houd 4 in de vriezer`. Its accessible name remains explicit: `Edit routine and freezer target` / `Routine en vriezervoorraad bewerken`.

Rejected labels:

- `Cooking rhythm`: friendly but does not name the freezer target and is difficult to predict before opening.
- `Rotation`: concise but sounds like an internal scheduling mechanism.
- `Meal schedule`: overstates precision; the setting stores cadence and seasons, not dates.

### Two different AI actions

- `Add cooking details` / `Kookdetails toevoegen`: generates ingredient links, preparation, streams, and merge order for the cooking view. Supporting text must say `Uses AI once; your recipe text stays unchanged.`
- `AI suggestions` / `AI-suggesties`: proposes optional changes to the recipe and opens the existing review before any write.

The two actions must never share the same loading label, success state, or accessible name.

## Interaction Contracts

### Optional cooking details

- Missing or stale cache: source steps render immediately and `Add cooking details` is available.
- Click: start exactly one request, disable the action, show elapsed/busy status, and leave every cooking control usable.
- Success before cooking interaction: adopt the validated plan without changing canonical recipe content.
- Success after cooking interaction: preserve the frozen session and make the cached plan eligible next time.
- Failure or daily cap: preserve source steps, name the failure, and expose a deliberate retry.
- Existing eligible cache: render enhanced details with a quiet `Enhanced details` status and an explicit `Refresh details` command in secondary controls; never refresh automatically.
- Recipe semantic edit or composition change: invalidate the cache and restore the explicit add action without starting a provider request.

### Header and cooking order

- At 320/393 px, the identity/actions and green utility row may wrap to two measured rows; labels cannot truncate into ambiguity.
- Edit and Archive are adjacent. Archive remains visually dangerous through label and confirmation, not color alone.
- Plan remains the only clay primary action in the header.
- Planned-meal selection stays visible near portions because it determines serving synchronization and removal behavior.
- Cooking / Original is one exclusive choice with appropriate pressed/radio semantics; language remains a separate exclusive choice.
- Switching view or language does not reset a cooking session, portions, or timers.

### Split Prep Desk

- Controls, counter, timeline, and Log cooked exist once in semantic document order; CSS grid changes placement without duplicating focus targets or state.
- The left rail uses normal page scrolling. It becomes sticky only on a wide and sufficiently tall viewport, never receives its own scrollbar, and reverts to normal flow when zoom or long copy makes the viewport constrained.
- The right timeline retains the current selected-step, progress, and Log cooked order. A short or absent ingredient list does not leave an empty rail placeholder.
- Original view retains portions, planned context, view, and language controls but omits cooking-only counter and enhancement status that cannot apply to the source body.
- Focus, live status, and the current scroll position remain stable when cooking details arrive, fail, or are deferred to the next session.

### Merge colors

- Keep the merged result stream’s color as the left vertical bar and step-number accent.
- Render one equal-width top segment per unique incoming stream in `merges_from` order.
- Two incoming lanes produce two segments; three produce three. Duplicate or unknown stream IDs do not create blank segments.
- Keep `← Lane A + Lane B` text and the result stream name so color is redundant information.
- The top band follows the card radius, does not cover the full-card button focus outline, and remains visible in dark mode and current-step state.

## Phase Plan

### Phase 1 — Lock paid-call and data boundaries

Write failing tests proving that page load, import, edit, chat recipe write, and meal-composition changes do not call cooking-plan generation. Add the explicit-action success, double-click, cap, network failure, stale cache, and active-session cases. Prove canonical directions and Dutch ingredients are byte-for-byte unchanged after generating cooking details.

### Phase 2 — Make cooking details explicitly user-triggered

Remove automatic `kickCookModeGeneration` callers and the `BenchSheet` load effect. Narrow generation to a cache-only write; retain validation, provider seam, daily cap, in-flight deduplication, revision/fingerprint checks, and frozen-session adoption. Add explicit Add, Refresh, busy, success, failure, and retry controls.

### Phase 3 — Ship Split Prep Desk page composition

Refactor `RecipeHeader` into identity/actions plus a contiguous green utility row. Move Cooking / Original and language into a new cooking-control composition with portions and planned-meal context. Build one controls/counter/timeline document order that becomes the selected left prep rail and right timeline only when space permits. Move active Archive beside Edit, relocate Routine & freezer and AI suggestions, and reorder reference material below `BenchSheet`. Preserve import-review priority, archived Restore behavior, and a readable single-column Original view.

### Phase 4 — Show incoming merge colors

Pass `CookPaletteAssignment.sources` through `BenchSheet` to `CookStepCard`. Render the top segmented band, preserve result accents and text labels, and cover two-, three-, duplicate-, missing-, dark-, and current-step cases.

### Phase 5 — Bilingual responsive and repository gate

Update English/Dutch product copy and obsolete selectors. Verify phone, tablet, and desktop layouts; keyboard/focus; long Dutch/English labels; loading/error/review states; original/cooking switches; planned-meal synchronization; Archive confirmation/Undo/Restore; and no horizontal overflow. Run the full secret-free repository gate.

## Execution Tickets

### RCP-1 — No automatic paid generation

- **Scope in:** Add negative-call tests for every current automatic caller and a positive test for the explicit action.
- **Scope out:** Production code changes.
- **Targets:** `tests/e2e/kitchen-flows.e2e.ts`; `src/lib/server/workflows/{import-recipe,meal-composition,recipe-edit}.test.ts`; `src/lib/server/ai/executors/recipes.test.ts`; `src/lib/components/cook-mode/network-controller.test.ts`.
- **Risk tier:** R2.
- **Impact / effort / confidence:** 5 / M / High.
- **Verification:** Old code fails because at least one automatic caller or page request fires; explicit action is the only accepted request source.
- **Rollback:** Revert test-only additions; no data or provider calls occur.

### RCP-2 — Cache-only explicit cooking-details action

- **Scope in:** Remove all automatic generation calls; expose Add/Refresh/Retry; prevent canonical direction promotion; retain validation, cap, dedupe, fingerprint, and session-freeze behavior.
- **Scope out:** Prompt/schema/model changes and AI-suggestions behavior.
- **Targets:** `src/lib/server/ai/cook_mode.ts`; `src/lib/server/workflows/{import-recipe,meal-composition,recipe-background}.ts`; `src/lib/server/ai/executors/recipes.ts`; `src/routes/recipes/[slug]/edit/+page.server.ts`; `src/lib/components/BenchSheet.svelte`; `src/lib/components/cook-mode/network-controller.svelte.ts`; focused tests.
- **Risk tier:** R2.
- **Impact / effort / confidence:** 5 / L / High.
- **Dependencies:** RCP-1.
- **Verification:** No provider request on any read/write path; one request on click; double click remains one request; cache writes succeed; canonical recipe hash is unchanged; active session does not change.
- **Rollback:** Restore automatic callers and former client effect as one commit; cache/schema compatibility is unchanged.

### RCP-3 — Header commands and adjacent Edit/Archive

- **Scope in:** Implement the selected identity/action row and green utility row; place Routine & freezer and AI suggestions there; place Archive directly beside Edit while preserving confirmation/Undo/Restore.
- **Scope out:** Changing the editors or AI-suggestions review body.
- **Targets:** `src/lib/components/recipe-detail/{RecipeHeader,FreezerStockPanel,RecipeEnhancementSheet,RecipeArchiveControl}.svelte`; `src/routes/recipes/[slug]/+page.svelte`; `messages/{en,nl}.json`; header/browser tests.
- **Risk tier:** R2 because several command states and destructive recovery move together.
- **Impact / effort / confidence:** 5 / L / Medium-high.
- **Dependencies:** None; all product placement decisions are fixed.
- **Verification:** 320/393/768/1280 px; loading/review/error; active/archived; keyboard/focus return; confirm/Undo/Restore; one clay primary action; no duplicate controls.
- **Rollback:** Restore the current component placement without changing endpoint behavior or stored state.

### RCP-4 — Split Prep Desk and cooking-first order

- **Scope in:** Combine plan context, portions, batch size, mode, language, and optional cooking-details action; implement one controls/counter/timeline document order with a conditional sticky desktop rail; keep Original readable; move photo/metadata/maintenance after cooking; preserve import-review warning priority.
- **Scope out:** Serving calculations, recipe-body content, or planned-meal mutation semantics.
- **Targets:** `src/lib/components/BenchSheet.svelte`; a focused cooking-control component if extraction reduces prop churn; `src/lib/components/recipe-detail/RecipePlanContext.svelte`; `src/routes/recipes/[slug]/+page.svelte`; responsive tests.
- **Risk tier:** R2.
- **Impact / effort / confidence:** 5 / L / Medium-high.
- **Dependencies:** RCP-2 and RCP-3.
- **Verification:** First cooking step moves above non-critical reference material; plan selection still synchronizes portions; Cooking / Original and language preserve state; phone/zoom keep one column; desktop keeps prep beside steps; a short viewport disables harmful stickiness; Original has no empty cooking rail; no duplicate focus targets, focus/scroll jump, nested scrolling, or horizontal overflow.
- **Rollback:** Restore previous route order and pass-through props; no data migration exists.

### RCP-5 — Incoming merge-color band

- **Scope in:** Pass source palettes and render ordered top segments while retaining result color and text.
- **Scope out:** Palette replacement, generated stream semantics, or color-only meaning.
- **Targets:** `src/lib/components/cook-mode/{palette.ts,palette.test.ts,CookStepCard.svelte}`; `src/lib/components/BenchSheet.svelte`; focused render/browser coverage.
- **Risk tier:** R1.
- **Impact / effort / confidence:** 4 / S / High.
- **Dependencies:** None; may run after RCP-1.
- **Verification:** Pure graph tests plus rendered two-/three-lane merge, unknown/duplicate ID, dark mode, current state, keyboard outline, and merge text.
- **Rollback:** Remove the top band prop/markup; existing left result color remains unchanged.

### RCP-6 — Bilingual responsive gate

- **Scope in:** Final copy, generated Paraglide output, source assertions, targeted browser stories, full gate.
- **Scope out:** Deployment or production mutation.
- **Targets:** `messages/en.json`; `messages/nl.json`; `src/lib/ui_house_style_source.test.ts`; `tests/e2e/{house-style,kitchen-flows,responsive-parity,assistant-safety}.e2e.ts`.
- **Risk tier:** R2.
- **Dependencies:** RCP-2 through RCP-5.
- **Verification:** `npm run i18n:compile`; focused unit/e2e commands; `npm test` for primary account; `npm run test:e2e:secondary` if shared fixture behavior changed.
- **Rollback:** Revert the composed feature diff; no schema, environment, or persistent-data rollback is needed.

## Failure-Mode Critique

| Failure mode | Trigger | Impact | Detectability | Mitigation | Residual risk |
| --- | --- | --- | --- | --- | --- |
| Hidden automatic callers remain | Page effect is removed but import/edit/chat/composition kicks survive | “Optional” still spends money without a click | High with call spies | Inventory and negative tests for every caller before deletion | Low |
| Cooking details still rewrite recipe text | Existing new-import promotion remains in `cook_mode.ts` | A display action silently edits canonical directions | High with canonical hash assertion | Make explicit cooking generation cache-only; recipe edits stay in reviewed workflows | Low |
| Double click starts duplicate spend | Busy state is set after request start | Two metered calls run | High in routed browser test | Synchronous busy guard plus existing server in-flight dedupe | Low |
| Header becomes a button wall | Edit, Archive, Plan, Routine, and AI all share one row | Title and action priority collapse on phone | High at 320/393 px | Two-tier identity/utility composition; one clay primary action; measured wrapping | Medium-low |
| Planned context becomes hidden | Full panel is moved without replacement | Wrong occasion or servings are edited | High in plan fixture | Integrate selected occasion and selector beside portions | Low |
| AI suggestions and cooking details look identical | Both actions say AI/enhance and share states | User cannot predict recipe write versus display cache | High in copy/role assertions | Distinct labels, descriptions, dialogs, and statuses | Low |
| Archive loses safety or focus | Control is moved into header | Accidental removal or lost keyboard position | High in existing archive story | Preserve literal confirm, disabled state, Undo, redirect, Restore, and focus tests | Low |
| Merge band becomes color-only meaning | Text is removed or visually demoted | Color-vision users cannot understand the merge | High in source/render review | Retain incoming names, arrow, and result stream text | Low |
| Merge segment order drifts | Source palettes are deduped/sorted independently from `merges_from` | Colors contradict text order | High in pure test | Derive unique segments in first-seen `merges_from` order | Low |
| Details below cooking hide an urgent review | All pre-cook panels are moved indiscriminately | Incomplete imported recipe is cooked without warning | High in needs-review fixture | Keep ImportReviewBanner before cooking content; move only non-critical reference material | Low |
| Dark/current styles obscure merge colors | Top band is under the full-card overlay or focus ring | Requested relationship disappears in common states | High in browser matrix | Place band inside radius but below focus outline; test dark/current states | Low |
| Sticky rail is taller than the viewport | Long Dutch copy, AI status, or 200% text expands the left column | Lower controls become difficult to reach | High at zoom/short-viewport checks | Enable stickiness only at wide plus sufficiently tall viewports; use normal page scrolling and no nested scrollbar | Low |
| Desktop and phone controls diverge | Separate markup is introduced for the split layout | Duplicate focus targets and state drift appear | High in source and keyboard tests | Keep one semantic document order and use CSS grid areas only for placement | Low |
| Original view inherits an empty cooking rail | Counter and enhancement-only content remain mounted | Source comparison wastes space and confuses the selected mode | High in Original-view browser story | Keep shared controls, omit cooking-only rail content, and render the source body as the readable right column | Low |

## Plan Critique Result

**GO.** Freek resolved every product decision, including the Split Prep Desk override. The plan resolves paid-call and canonical-write boundaries before moving UI, confines the responsive expansion to existing recipe components, and gives each observable behavior its own verification. No schema, new dependency, feature flag, parallel route, or stage gate is needed.

**Steelman:** Counter First is simpler and would be the conservative engineering choice because it changes less wide-screen behavior. Split Prep Desk is still the right selected approach: its phone order is identical to Counter First, the current `BenchSheet` already has a counter/timeline grid, and conditional stickiness gives a laptop or tablet persistent portions and ingredient context without creating another stateful component. One document order and automatic fallback to normal flow contain the added responsive risk.

## Rollout and Rollback

This is an R2 code-only beta delivery. Ship behind the existing recipe route after the full secret-free gate; no stage gate, migration, environment change, or live provider call is required. Runtime verification must use isolated fixtures and mocked provider responses. Production canary evidence may name controls and deployment revision but must not retain household recipe contents or authenticated screenshots.

Rollback is one code revert across the generation callers, cache-only write, recipe composition, messages, and tests. Existing `cook_mode_json`, recipe rows, planned meals, progress storage, and freezer settings remain compatible. Removing automatic generation creates no backfill obligation; source cooking steps remain the fallback.

## Risk and Verification Matrix

Overall risk is **R2**: shared AI-spend behavior, canonical-write ownership, recipe-page command placement, and planned-serving context change, with no schema/auth/destructive data work.

| Boundary | Required proof |
| --- | --- |
| UI/UX audit | Source hierarchy and current isolated browser evidence establish the baseline; selected Split Prep Desk remains explicitly unverified until `$run` covers phone, tablet, desktop, short viewport, zoom, Original, and async states. |
| Provider initiation | Zero cooking-plan requests from open/import/edit/chat/composition; exactly one from explicit Add/Refresh. |
| Canonical recipe integrity | Directions, Dutch ingredients, translations, content revision, shopping terms, and AH lookup fields do not change when cooking details are generated. |
| Cache behavior | Eligible cache renders; stale/missing cache exposes Add; semantic edit invalidates without generating; Refresh is explicit. |
| Active session | Delayed success never changes frozen directions, ingredients, servings, language, or current step. |
| Header hierarchy | One primary action, adjacent Edit/Archive, usable title, clear Routine/AI separation at 320/393/768/1280 px. |
| Cooking order | Plan/portions/mode/language/details precede counter and steps; non-critical photo/metadata/maintenance follow cooking. |
| Split Prep Desk | One semantic control/counter/timeline order; wide/tall conditional stickiness; no nested scroll; stacked phone/zoom fallback; readable Original view. |
| Planned meal | Context selection, synchronized portions, remove/Undo, cooked read-only state, and direct-recipe fallback remain intact. |
| AI suggestions | Idle/loading/ready/error/reopen/apply states remain reviewed and distinct from cooking-details generation. |
| Merge colors | Result left bar plus ordered incoming top segments; text redundancy; two/three/unknown/duplicate/dark/current coverage. |
| Accessibility | Native controls, names/roles/states, 44 px targets, visible focus, logical focus return, live status, 200% text, no color-only meaning. |
| Language | Complete English/Dutch labels and long-copy layout. |
| Provider/privacy safety | Tests mock paid calls; no household data, provider secret, authenticated artifact, or AH request is used. |
| Repository | Focused checks then `npm test`; secondary account e2e when shared fixtures changed. |

## Open Questions

None. Freek selected Split Prep Desk, `Routine & freezer`, AI suggestions in the green utility row, `Add cooking details`, and Cooking / Original directly under portions. `$run` may proceed without a product decision gate.

## Resume Pack

- **Goal:** Make the recipe page cooking-first, make structured cooking details wholly opt-in and cache-only, and show incoming lane colors across merge steps.
- **Current state:** Implemented and verified on `codex/recipe-cooking-first`; the feature branch still needs normal review/merge before it is live.
- **First command:** Review the branch diff or open its draft pull request after push.
- **First files:** `BenchSheet.svelte`, `RecipeHeader.svelte`, `cook_mode.ts`, `CookStepCard.svelte`, and the focused browser/unit tests.
- **Pending verification:** Normal pull-request review and production delivery after merge.
- **Open questions:** None.
