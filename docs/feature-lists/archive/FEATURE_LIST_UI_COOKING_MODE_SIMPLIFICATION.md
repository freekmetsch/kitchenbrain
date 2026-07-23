# Feature List: Cooking Mode Simplification

_Status: Shipped 2026-07-23_

## Outcome

Make cooking mode an immediate app-owned view of the saved recipe. A normal recipe with directions should never need a cooking-mode model call.

The app should render one ordered list of large instruction cards. If preparation guidance exists, it becomes the first normal card rather than a separate `Get ready` checklist. Each card starts with its instructions, bolds the leading action verb in every sentence, and uses the whole card as the control for making that step current. Completion checkmarks and ingredient underlines disappear.

Keep AI only for the two cases where it adds recipe meaning rather than presentation:

1. repairing genuinely incomplete or vague recipe directions through the existing recipe ingest/enhancement flow;
2. interleaving a composed meal's main recipe and sub-recipes when simple stored order is insufficient.

## Ship result

- Ordinary recipes now render 100% app-owned cooking steps from the selected-language saved directions. Opening, importing, or editing one does not generate a cooking sheet.
- Composed meals retain the existing AI coordination seam; their preparation tasks are flattened into the first normal instruction card.
- One full-card current-step control replaces stream headers, goal headings, preparation/ingredient/step checklists, and completion checkmarks.
- Every sentence preserves its source text while rendering its leading action in bold. Ingredient mentions are no longer underlined.
- Progress is current-position only. Selecting the final card reveals `Finish cooking`; cook logging remains an explicit action.
- Explicit Dutch and English durations use the existing local timer extraction. Running timers move above the finish bar instead of overlapping it.
- The pre-generation setting and ordinary-recipe generation callers were removed. Existing cache columns remain untouched for compatibility.

## Scope

This audit covers the cooking view on the recipe detail page and its shared cooking components at 375 and 768 px. It includes the preparation section, instruction cards, current-step state, progress rail, ingredient references, timers, completion/logging handoff, raw fallback, and the automatic `/cook-mode` generation boundary.

It does not change Dutch ingredient storage, Albert Heijn lookup fields, recipe translation, serving projection, timer alarms, or the recipe editing model.

## UI gap

The current surface is readable, but it still exposes the structure of the generated bench sheet instead of the cook's task. A two-step recipe becomes a preparation checklist, a section heading, two completion controls, separate ingredient controls, goal headlines, body sentences, and a progress bar that can say `0/2` while step 2 is current.

The static layout has no horizontal overflow at 375 or 768 px. The gap is interaction and information architecture: too many independent states compete with the single state the cook asked for—what am I doing now?

## Browser evidence

- [Cooking mode at 375 px](../../../output/screenshots/20260723-ui-cooking-mode-375.png)
- [Expanded Get ready checklist at 375 px](../../../output/screenshots/20260723-ui-cooking-get-ready-open-375.png)
- [Step 2 selected while completion remains 0/2](../../../output/screenshots/20260723-ui-cooking-current-step-2-375.png)
- [Cooking mode at 768 px](../../../output/screenshots/20260723-ui-cooking-mode-768.png)

The browser pass used a disposable copy of the local database. It did not change household data or call an external model.

Post-ship evidence:

- [App-owned cooking mode at 390 px](../../../output/screenshots/20260723-cooking-mode-simplified-mobile.png)
- [App-owned cooking mode with active timer at 768 px](../../../output/screenshots/20260723-cooking-mode-simplified-768.png)

The shipped browser pass used an ordinary recipe with a null `cook_mode_json`. It made no `/api/recipes/.../cook-mode` request, produced no console errors, exposed no cooking-step checkboxes, and had no horizontal overflow at 768 px.

## Findings

| ID | Priority | Category | Finding | Evidence | File(s) | Effort | Cite |
|---|---|---|---|---|---|---|---|
| CM-1 | P1 | Interaction model | A step has separate controls for completion, ingredients, selection, and timer. Only the inner instruction button makes it current, so most of the visually unified row is not the selection target. | Both. The accessibility snapshot exposes `Mark step complete`, ingredient buttons, `Read step`, and timer as separate peers. | `src/lib/components/cook-mode/ComponentCard.svelte:30-60`; `MergeCard.svelte:33-58` | M | `[Cooper] [Norman] [Fitts]` |
| CM-2 | P1 | Hierarchy / typography | Generated stream headings, goal headlines, body text, ingredient pills, and underlined ingredient mentions repeat the same action. The cook must reconstruct one instruction from several visual layers. | Both. The curry row renders `Curry`, `Brown chicken — deep gold`, a chicken pill, and `Sear the chicken...`. | `BenchSheet.svelte:750-815,1109-1167`; `InstructionLines.svelte:10-24` | M | `[H8] [VH] [Krug]` |
| CM-3 | P1 | Workflow | `Get ready` is a separate collapsible checklist with its own count and completion state, even though its actions happen in the same sequence as the cooking instructions. It pushes the first real instruction down and creates a second progress system. | Both. The expanded phone view shows three checkbox rows before the recipe steps. | `BenchSheet.svelte:141-145,737-748,1065-1107` | M | `[Cooper] [Gestalt] [H2]` |
| CM-4 | P2 | System status / architecture | Current position and completion disagree by design: selecting step 2 changes `Step 2 of 2` but leaves `0/2` and the progress bar empty. The completion map also gates the final cooked/rating action. | Both. Step-2 screenshot plus reducer and `allDone` source. | `BenchSheet.svelte:541-586,733-748,1023-1035,1177+`; `cook_progress.ts:1-54` | L | `[H1] [Saffer] [Cooper]` |

## Summary

- P1: 3
- P2: 1
- Categories: interaction model 1, hierarchy 1, workflow 1, system status/architecture 1

The visual language already matches the rest of Keukenbrein. The cooking view feels more complex than the recipe because generated structure and completion bookkeeping remain visible.

## How much can be app-owned?

### Already app-owned

| Capability | Existing source |
|---|---|
| Canonical instruction text | `recipes.directions` and `directionsEn` |
| Serving changes and ingredient quantities | `servingDraft`, `projectIngredient`, recipe scaling helpers |
| EN/NL display choice | recipe translation projection |
| Explicit-duration timers | `timer_extract.ts` already handles English and Dutch direction text |
| Timer runtime, alarm, persistence, and restore | `BenchSheet.svelte`, timer worker, `TimerStack` |
| Current-step selection, scrolling, reduced motion, and restore | `cook_progress.ts`, `BenchSheet.svelte` |
| Sentence splitting and safe Svelte-node rendering | `instruction_projection.ts`, `InstructionLines.svelte` |
| Responsive shell, ingredient reference drawer, and serving rail | `BenchSheet.svelte` |

### Currently model-owned

- extracting a separate preparation checklist;
- inventing stream names and merge relationships;
- rewriting each source direction into title, goal, and body;
- assigning ingredient indexes to steps;
- producing timer purpose/action/location labels;
- interleaving main and sub-recipe work.

The requested UI removes the visible need for the first five outputs. The saved directions can be the cards, the app can split their sentences and bold their leading verbs, and the existing timer parser can attach timer buttons for explicit durations.

### Recommended boundary

- **Ordinary single recipes:** 100% app-owned cooking view. Render saved directions immediately; do not POST to `/cook-mode`.
- **Composed meals with sub-recipes:** keep a planning seam only when directions need interleaving. Its output should be a flat ordered instruction list, not presentation fields.
- **Poor source recipes:** repair the recipe itself during import/edit/enhancement. Do not create a second, better recipe that exists only inside `cook_mode_json`.

This makes cooking mode available for every recipe with directions, removes background cost and waiting from the normal path, and leaves AI focused on missing recipe meaning.

## Chosen interaction

Each saved direction is one selectable instruction card. A direction may contain multiple sentences; every sentence renders on its own line and bolds its first action verb. Do not underline ingredient mentions.

If preparation instructions exist in the selected plan, combine them into the first normal card:

> **Cube** the chicken breast.
> **Drain** the chickpeas.
> **Measure** the garam masala.

Do not render `Get ready`, a preparation count, a stream name, a goal headline, or a completion checkbox around that card.

The card itself is the current-step button. Timer controls remain sibling buttons so the markup has no nested interactive elements. Ingredient quantities may remain non-interactive reference chips above the instruction when reliable indexes exist; otherwise omit them rather than guess.

Remove step, preparation, and ingredient completion state. The ingredient drawer becomes reference-only. The sticky rail shows `Step N of M` with position-based progress, not a completed count. Selecting the final step reveals an explicit `Finish cooking` action that owns cook logging, rating, and the freezer prompt; merely selecting a step never records completion.

## UI plan

### P1 — One app-owned instruction model

1. Introduce one display-only `CookStep` projection used by saved directions and any composed-meal plan.
2. For an ordinary recipe, build steps directly from the selected-language directions and attach timers with `extractTimers`.
3. Stop automatic cook-mode generation for ordinary recipes. Remove `Regenerate` from the cooking surface.
4. Keep recipe translation separate; changing language may use the existing translation path but must not generate cooking mode.
5. Do not migrate or overwrite canonical directions from cached generated prose.

### P1 — One instruction card

1. Replace `ComponentCard` and `MergeCard` with one shared card component.
2. Remove stream dividers, merge decoration, goal headings, completion controls, interactive ingredient checks, and ingredient underlines.
3. Render sentence lines first. Bold the leading imperative token in each sentence through typed Svelte segments, never raw HTML.
4. Make the card body one 44 px minimum button with `aria-current="step"` and a visible current outline/badge.
5. Keep timer buttons as accessible siblings within the card container.

### P1 — Preparation in sequence

1. Flatten available preparation instructions into the first normal step.
2. Remove the collapsible `Get ready` section, preparation count, `mep` state, persistence, and messages.
3. Never invent preparation at render time. If a recipe omits a necessary action, improve the saved recipe through ingest/edit/enhancement.

### P2 — Current position without done bookkeeping

1. Reduce `cook_progress.ts` to current-key normalization and selection; delete completed-set and toggle transitions.
2. Persist only current step and timers. Remove `checked`, `ingredientChecks`, `mep`, `totalDone`, and `allDone`.
3. Change the sticky progress bar to position (`current index + 1` of total).
4. Replace the `allDone` completion gate with an explicit `Finish cooking` button available from the final current step.
5. Preserve reset, edit-with-active-timer guard, cook logging, rating, and freezer follow-up through the explicit finish action.

### P2 — Retire the duplicate runtime

1. Make the deterministic direction renderer the only ordinary cooking view; remove `RawDirectionsFallback` as a separate UI once parity is proven.
2. Remove unused ordinary-recipe generation callers, retry banners, loading/pending swap state, prompt/schema fields, and cache-staleness adapters.
3. Leave existing SQLite cache columns in place but unused; dropping them would add a destructive migration with no user benefit.
4. Keep the composed-meal planning seam behind one narrow server function if browser fixtures prove that deterministic sub-recipe order is insufficient.

## Shared pieces

- Reuse the current sticky serving rail, timer worker, timer stack, recipe scaling, sentence splitter, reduced-motion scroll behavior, and Svelte-node projection.
- Promote `timer_extract.ts` from fallback-only use to the canonical instruction projection.
- Seed no new dependency and no new design token.
- Prefer one `CookStepCard.svelte` over two stream-specific components.

## Verification

### Unit

- source directions become stable step keys in EN and NL;
- multi-sentence directions preserve every character and punctuation mark;
- leading verbs are bolded without `{@html}`;
- prefixed sentences such as `Then add...`, `Meanwhile, heat...`, and Dutch equivalents have explicit fixtures;
- explicit English and Dutch durations attach correct timers;
- selecting a card changes only current state;
- restore survives language, serving, and route changes without a generated ID;
- final-step selection does not log a cook; `Finish cooking` does;
- composed meals preserve every main and sub-recipe direction exactly once.

### Browser

- 375 and 768 px first; representative 1280 px afterward;
- short and long instructions, one and multiple sentences, timer/no timer, ingredients/no reliable ingredients;
- full-card pointer target, Tab/Enter/Space behavior, visible focus and current state;
- current position and progress bar always agree;
- timer persists across selection, original-view toggle, reload, and background/foreground;
- final cook logging, rating, and freezer prompt;
- no horizontal overflow, clipped focus ring, external API call, or automatic `/cook-mode` request.

### Repository

- `npm run test:unit`
- `npm run check`
- `npm run build`

## Architecture call

Do not replace the v4 generator with a smaller v5 presentation generator. The stable recipe directions are already the right source for a cooking UI. Keep model work upstream where it improves recipe meaning, and keep runtime cooking deterministic.

## Verification result

- `npm run check` — passed with 0 errors and 0 warnings.
- `npm run test:unit` — 58 files and 377 tests passed.
- `npm run build` — production build passed.
- Browser — passed full-card pointer selection, action-word projection, position progress, timer/current-state independence, final-step finish action, 390/768 px rendering, and the no-generation boundary on a disposable database.
