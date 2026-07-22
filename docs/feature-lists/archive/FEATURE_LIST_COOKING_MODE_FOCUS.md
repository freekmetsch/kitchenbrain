# Feature List: Cooking Mode Focus
_Status: Shipped - 2026-07-22 (all four phases complete)_

## Problem framing

The cooking view works, but it asks the cook to read small text and find their place in one long list. On a phone or a laptop placed on the counter, the 12–15 px instruction and ingredient text is hard to scan. Completed rows use strikethrough and reduced opacity as the main orientation cue; the screen has no explicit current step or always-visible progress. Step ingredients sit below the instruction even though they are needed before the action is read.

Freek's 22 July recording asks for larger type, shorter action lines, bold verbs, underlined ingredient mentions, step ingredients above the instruction, live serving changes, a top progress bar, and a centered, highlighted current step. Release C already made serving changes a code-owned projection and limited each preparation checkbox to at most one ingredient. This plan preserves those shipped paths and adds the missing reading and focus layer without forcing a new cooking-view generation.

## Scope

### In scope

- Make cooking instructions and ingredient controls readable at 375 px and from counter distance.
- Lay out stored cooking text at sentence boundaries without changing its words or the stored v4 cache contract. A single long cached sentence stays intact.
- Bold the validated goal cue and underline exact localized ingredient mentions when the cache contains safe index evidence, through Svelte nodes and never raw HTML.
- Place the step ingredient controls above the instruction lines.
- Add an explicit current cooking step. Keep `Get ready` as its own checklist and count.
- Advance, select, restore, center, and highlight the current action without coupling selection to completion.
- Add an always-visible cooking progress bar and keep serving controls reachable during cooking.
- Preserve timers, stream and merge colors, ingredient checks, bilingual output, local progress restore, raw-direction fallback, and cook completion.
- Verify and close or update `docs/known_issues/current/ISSUE_COOKING_CHECKLIST_AND_TRANSLATION_20260722-1252.md` against the shipped and new behavior.

### Out of scope

- A new recipe route, full-screen shell, database table, or migration.
- A new model, provider, library, or service.
- Regenerating every stored cooking view or changing the v4 cache solely for presentation.
- Rewriting recipe directions, timer rules, stream order, merge colors, or AH-coupled Dutch ingredient storage.
- Changing the ordinary recipe page outside the cooking-view area.

## Existing-system inventory

- `src/lib/components/BenchSheet.svelte` owns generation, bilingual projection, serving changes, preparation and step completion, timers, local persistence, and the flat action list.
- `src/lib/components/cook-mode/ComponentCard.svelte` and `MergeCard.svelte` render goals at 14–15 px, bodies at 12–13 px, and ingredient controls at 11 px below the body.
- `src/lib/components/cook-mode/staleness.ts` keeps valid v4 caches renderable and projects quantities from ingredient indexes. The serving target changes in code; the model is not called.
- `src/lib/server/ai/cook_mode.ts` validates a short action-led goal and exact ingredient indexes. The body remains one unstructured string with no display-length rule.
- `src/lib/server/ai/prompts/cook_mode.md` already asks for direct bodies and one ingredient per preparation task. Future prompt output can improve without invalidating existing v4 caches.
- Cook progress is stored under a generation-specific local-storage key. Completion, preparation checks, ingredient checks, and timer end times persist; current selection does not.
- The Release C browser proof at `output/gate-c-cook-375-en.png` shows that the expanded ingredient list fills the mobile viewport before the first cooking step. The 768 px proof shows only the start of the first step below the fixed recipe controls.
- The new recording is transcribed at `docs/recordings/2026-07-22-cooking-mode-readability-focus-transcript.md`.

## Audit findings

| Priority | Audit | Finding | Evidence | Plan response |
|---|---|---|---|---|
| P1 | UI | Goal, body, and step ingredient text is too small for the phone and counter use named in the recording. | `ComponentCard.svelte`, `MergeCard.svelte`, 375/768 px Release C screenshots. `[Type] [WCAG 2.5.8]` | CMF-2 raises the type and touch floor, then checks every content-height variant. |
| P2 | UX | Completion and current location are conflated. Checking a row crosses it out; no separate selected action exists and nothing advances or centers the next action. | `BenchSheet.svelte` completion maps and `toggleStep`. `[H1] [H6] [Norman]` | CMF-3 adds a persisted current-action key, explicit selection, auto-advance, and center-on-change. |
| P2 | UI/UX | Full ingredients and preparation controls precede the action list, so the active instruction can start below the mobile fold. | `BenchSheet.svelte`; `gate-c-cook-375-en.png`. `[VH] [Gestalt] [Krug]` | CMF-3 adds a sticky focus rail and scrolls only explicit selection/advance into the center. Reference lists remain available. |
| P2 | UI | Step ingredients appear after the body in 11 px pills, contrary to the order needed while cooking. | `ComponentCard.svelte`, `MergeCard.svelte`. `[Gestalt] [Type]` | CMF-2 moves readable ingredient controls above the instruction. |
| P2 | Harden | Adding a v5 cache for display markup would make valid recipes stale, trigger model calls, and raise cost without adding recipe meaning. | v4 staleness and generation paths in `staleness.ts` and `cook_mode.ts`. | CMF-1 builds a pure display projection and keeps v4 valid. Future prompt changes do not force regeneration. |
| P2 | Harden | Highlighting model text with `{@html}` or loose substring matching risks unsafe markup and wrong matches such as `ui` inside a longer word. | Current plain-string body plus indexed ingredient data. | CMF-1 emits typed text/action/ingredient segments, uses Unicode letter/number boundaries, and renders Svelte nodes only. Old caches without a valid ingredient index stay plain. |
| P3 | UX | Serving changes work in code but the control scrolls away once the cook reaches later steps. | Top control row in `BenchSheet.svelte`; v4 projection in `staleness.ts`. `[H7] [Fitts]` | CMF-3 keeps the same `servingDraft` path reachable from the sticky focus rail, with no network request. |

Audit record: Harden ran in targeted app mode; no P0 security or data-loss finding. UI and UX ran against the live app, the 375/768 px Release C proof, and the current Svelte source. Stack Discipline skipped because the plan adds no dependency or service.

## Option comparison

| Option | Benefits | Costs and risks | Decision |
|---|---|---|---|
| Add a v5 model schema with rich inline markup | Exact authored verb and ingredient spans. | Invalidates caches, spends model calls, adds parsing and bilingual validation for presentation. | Rejected. Presentation does not justify a new stored contract. |
| Split and style the current v4 projection in code | Keeps caches, costs no model call, uses ingredient indexes and translated recipe data already present. | Needs careful sentence and exact-name segmentation with tests. | Chosen. |
| Apply CSS only | Fast type increase and row highlighting. | Cannot create a durable current-step state, safe inline emphasis, progress, restore, or centering. | Rejected. It leaves the main orientation problem intact. |
| Add a separate full-screen cooking route | Maximum visual isolation. | Duplicates route and shell state, complicates timers and return flow, and exceeds the recorded need. | Rejected for the first release; the sticky in-page focus rail keeps one owner. |

## Chosen approach

Keep stored cooking meaning in v4. Add a pure display projection that turns the goal and body into typed segments without rewriting them. For existing caches, it bolds only the already validated goal cue and lays out body sentences on separate lines; one long sentence remains one long sentence. A valid v4 `ingredient_index` maps to the selected-language `fallback.ingredients[index].name`. V2/v3 rows without a valid index get no ingredient emphasis. Matching escapes punctuation, uses Unicode letter/number boundaries, resolves longest names first without overlap, and rejoins to the exact source string. Model output never becomes HTML.

Add a current-step state above the existing cooking-step completion map. `Get ready` keeps its own existing count; neither it nor the ingredient checklist changes cooking progress or the completion gate. Selecting a step changes focus only. Completing the current step advances to the next incomplete step and centers it. Completed steps stay available as compact history without strikethrough as the main cue. A sticky focus rail shows completed cooking steps, total cooking steps, current position, and the existing code-owned serving controls.

Future cooking-view generations get tighter prompt wording for short, one-action body sentences. Existing valid caches stay valid and receive the same display projection, so deployment does not cause a generation burst.

## Phase plan

### Phase 1 - Lock the no-regeneration display contract

Map every v2/v3/v4 rendering and fallback path, add display-projection fixtures, and prove serving, selection, and completion make no cook-mode request. A language switch may use the existing recipe-translation endpoint. Keep valid v4 caches valid.

### Phase 2 - Make each action readable

Create typed instruction segments, increase text and touch sizes, put step ingredient controls first, and render action verbs and exact ingredient mentions with semantic elements.

### Phase 3 - Add current action and progress

Add a pure current-step reducer, then wire selection and completion, centering, and the sticky progress and serving rail. Keep `Get ready` separate.

### Phase 4 - Prove the kitchen flow

Run bilingual mobile/tablet/desktop browser checks, local restore and timer tests, provider-call checks, reduced-motion and keyboard checks, then resolve the known-issue record and ship.

## Execution tickets

### CMF-0 - Freeze the compatibility and call boundary

- **Scope in:** golden v4 fixtures, v2/v3 compatibility reads, endpoint-specific call spies for serving/language/select/complete, current local-storage signature behavior.
- **Scope out:** a cache migration, forced regeneration, or deletion of older read adapters.
- **Targets:** `src/lib/components/cook-mode/staleness.test.ts`, `src/lib/server/ai/cook_mode_fingerprint.test.ts`, focused BenchSheet tests or extracted state-helper tests.
- **Risk:** R2. **Impact / effort / confidence:** 5 / M / high.
- **Verification:** valid v4 remains non-stale; old fixtures still render; serving changes alter projected quantities instantly; serving, selection, and completion make no `/cook-mode` request; language switching may call the existing `/translate` path; missing or stale cook-mode data and explicit Regenerate retain their current `/cook-mode` behavior.
- **Rollback:** tests and helpers can revert without touching stored recipe rows.

### CMF-1 - Build a safe instruction display projection

- **Scope in:** lay out goal/body at exact sentence boundaries without rewriting words; bold only the validated goal cue in old caches; for v4, map each valid `ingredient_index` to the selected-language fallback ingredient name; match escaped names longest-first with non-overlapping Unicode letter/number boundaries; emit typed `text`, `action`, and `ingredient` segments; keep unmatched text unchanged. V2/v3 rows without a valid index stay plain.
- **Scope out:** raw HTML, markdown parsing, fuzzy matching, translation writes, or changing stored cook-mode JSON.
- **Targets:** new `src/lib/components/cook-mode/instruction_projection.ts` and test; `src/lib/types.ts` only if a display-only type belongs there.
- **Risk:** R1. **Impact / effort / confidence:** 4 / M / medium-high.
- **Verification:** punctuation, accents, repeated mentions, `ui` versus longer words, overlapping names, invalid or absent indexes, v2/v3 plain fallback, EN/NL, empty body, one long sentence, multiple sentences, and exact source recovery when segments rejoin.
- **Rollback:** render the original goal/body strings; stored caches remain unchanged.

### CMF-2 - Raise the reading and touch floor

- **Scope in:** goal at least 18 px, body and ingredient text at least 16 px, relaxed line height, ingredient controls above instructions, semantic `<strong>` and `<u>`, at least 44 px for selection/completion/timer/serving controls, and the WCAG 24 px floor only for compact secondary controls; current/complete/upcoming styles do not rely on color.
- **Scope out:** restyling the recipe header, timers, bottom navigation, or global type scale.
- **Targets:** `ComponentCard.svelte`, `MergeCard.svelte`, shared cooking CSS or a small shared `InstructionLines.svelte` when it removes duplicate markup.
- **Risk:** R1. **Impact / effort / confidence:** 5 / M / high.
- **Verification:** short/long goals, no/one/many ingredients, timer/no timer, merge/non-merge, done/current/upcoming, 200% zoom, 375 and 768 px with no overflow, visible focus rings.
- **Rollback:** revert the shared renderer and component class changes.

### CMF-3A - Define current-step state and persistence

- **Scope in:** a pure reducer for cooking-step keys, completion transitions, current selection, generation signature, and persisted restore. First load selects the first incomplete step, or the last step when all are complete. A valid restored completed key selects the next incomplete step after it, wraps to the earliest incomplete, then falls back to the last step. A stale signature resets to the first incomplete step.
- **Scope out:** preparation and ingredient checks, DOM scrolling, timer semantics, or cross-device sync.
- **Targets:** new `src/lib/components/cook-mode/cook_progress.ts` and tests; shared display-only types if needed.
- **Risk:** R2. **Impact / effort / confidence:** 5 / L / medium-high.
- **Verification:** complete current selects the next incomplete after it, then wraps to the earliest incomplete; complete non-current keeps selection; reopening a step reduces the completed count and selects that step; manual select never changes completion; completing the last step with earlier gaps wraps to the earliest gap; language and serving changes preserve the key; parallel streams follow current linear display order; all cooking steps complete retains the existing `allDone` gate.
- **Rollback:** remove the optional selection key; existing completion, timer, and stored progress fields remain readable. Unknown extra local-storage fields are ignored.

### CMF-3B - Wire selection and completion rows

- **Scope in:** connect the reducer to cooking-step rows; keep selection and completion as separate controls; style current, complete, and upcoming states; keep `Get ready` and ingredient checks independent.
- **Scope out:** sticky layout, scroll behavior, serving placement, or changes to the existing cook-completion rule.
- **Targets:** `BenchSheet.svelte`, `ComponentCard.svelte`, `MergeCard.svelte`, and one shared row component when it removes duplicate state wiring.
- **Risk:** R2. **Impact / effort / confidence:** 5 / M / high.
- **Verification:** keyboard and touch can select without completing; completion follows the reducer table; preparation completion never changes the current step, denominator, or `allDone`; restore performs CMF-3A's one-time normalization, but dispatches no completion event and causes no automatic scroll; timer ticks never advance.
- **Rollback:** disconnect the current-state props and retain the existing completion controls.

### CMF-3C - Add the sticky rail and centered focus

- **Scope in:** sticky cooking-step progress, current/total copy, existing `servingDraft` controls, center-on-explicit-selection/advance, `scroll-margin`, and reduced-motion behavior. Move the serving controls into this rail only while cook mode is active; raw/original/fallback views retain the current top controls.
- **Scope out:** a full-screen route, automatic scrolling from timer ticks or restore, and global header changes.
- **Targets:** `BenchSheet.svelte`, shared cooking CSS, message catalogs, and browser proof.
- **Risk:** R2. **Impact / effort / confidence:** 5 / M / medium-high.
- **Verification:** exactly one serving-control set is visible in each view; explicit select/advance centers the row below the rail without moving keyboard focus; no scroll loop; 375/768/1280 px, 200% zoom, and reduced motion pass.
- **Rollback:** remove the sticky rail and center effect; reducer and completion stay usable in flow.

### CMF-4 - Tighten future generation without expiring v4

- **Scope in:** prompt asks for direct imperative bodies; new generation output accepts at most two sentences and 28 words in each EN and NL body string. Enforce that emit-time rule inside the existing retry loop only. Do not attempt language-specific verb detection. Existing read validation and `isStaleCookMode` stay unchanged.
- **Scope out:** cache-version bump, bulk regeneration, or a new provider call.
- **Targets:** `src/lib/server/ai/prompts/cook_mode.md`, `src/lib/server/ai/cook_mode.ts`, focused validation tests.
- **Risk:** R2 because model retries cost money. **Impact / effort / confidence:** 3 / S / medium.
- **Verification:** accepted EN/NL fixtures contain at most two sentences and 28 words per body; rejected new output retries within the existing three-attempt cap; existing v4 validity and stale checks are unchanged; no extra call occurs outside an existing generation request.
- **Rollback:** revert prompt/emit validation; code-owned display projection remains.

### CMF-5 - Run the kitchen proof and close the issue

- **Scope in:** 375/768/1280 px EN/NL browser matrix; current-step progress, serving, prep, ingredient, timer, restore, Regenerate, raw fallback, completion and back/edit guard; source-only accessibility checks plus real keyboard/touch interactions; update and archive the known issue when every recorded symptom passes.
- **Scope out:** live AH mutation or paid model calls beyond one existing cached/fixture generation when a browser state needs it.
- **Targets:** focused tests, `output/` screenshots/evidence, `docs/known_issues/`, this feature list, `docs/log.md`.
- **Risk:** R2 release proof. **Impact / effort / confidence:** 5 / M / high.
- **Verification:** full unit suite, Svelte check, production build, no horizontal overflow or console error, visible current action and progress, exact EN/NL quantities and units, provider-call capture, Railway smoke after push.
- **Rollback:** revert the release commit; no database restore is needed because the plan changes no schema or stored recipe contract.

## Risk tier and verification matrix

Overall risk: **R2**. The plan changes shared cooking progress and focus state, but keeps database and cached model data unchanged.

| Check | Scope | Required proof |
|---|---|---|
| Harden | Safe text segmentation, cache compatibility, local persistence, call/cost boundary | Run. No raw HTML, no fuzzy ingredient markup, no mass stale cache, no new secret or dependency. |
| Stack Discipline | New dependency/service | Skip: no trigger category in scope. |
| UI | Readability, hierarchy, touch, focus, responsive layout, reduced motion | Run at 375, 768, and 1280 px in EN/NL; inspect every row-height and timer variant. |
| UX | Select/complete distinction, advance, restore, center, servings, progress, fallback | Run the cooking-step journey and interruption restore; verify `Get ready` remains independent. |
| Unit | Projection, matching, progress reducer, persistence signature, provider-call matrix | Free deterministic fixtures; no network. |
| Svelte | Types, runes, semantics, templates | Zero errors and warnings. |
| Build | Tailwind classes, adapter-node bundle | Production build passes. |
| Live smoke | Authenticated Railway cooking page | Running commit, readable current step, no overflow, health endpoint OK. |

## Rollout and rollback strategy

Ship one code release after the full matrix passes. Keep the v4 cache contract and existing local-storage key. New optional selection data must be backward-compatible so rollback ignores it. Do not bulk-regenerate recipes. Serving, selection, and completion make no cook-mode call. Missing or stale cook-mode data and explicit Regenerate retain the current cook-mode generation path; switching language may use the existing recipe-translation path.

If the selected-step UI causes a regression, revert the release commit. Completion maps, timers, recipe rows, and v4 caches remain intact; no snapshot restore or data conversion is required.

## Failure-mode critique

| Failure mode | Consequence | Prevention and proof |
|---|---|---|
| Ingredient marking matches a substring or wrong language | The wrong word is underlined and the step becomes harder to trust. | Step-owned indexes, localized projected names, longest exact boundary match, overlap tests, plain-text fallback. |
| Display segmentation drops punctuation or words | Cooking meaning changes. | Segment join must reproduce the source text exactly; golden EN/NL fixtures. |
| Auto-advance fires on restore or timer ticks | The screen jumps while the cook reads. | Advance only from an explicit completion event; center effect keyed to a user/state transition token, not reactive time. |
| Selection and completion share one click target | A cook marks a step done while trying to read it. | Separate named selection surface and completion checkbox; keyboard and touch proof. |
| Progress counts preparation or ingredient checks | Progress reaches the wrong value or completion disagrees with the rail. | Count cooking steps only. Keep `Get ready`'s own count and the existing all-cooking-steps completion gate. |
| Sticky rail hides focused content | Current step centers underneath the rail. | Account for rail height with `scroll-margin`; verify 375/768 px and zoom. |
| Prompt tightening marks old v4 stale | Deployment causes a model-call burst. | Keep read validation unchanged; generation-only checks and explicit call-count proof. |
| Larger type breaks timer or merge rows | Clipping or horizontal scroll appears on mobile. | Exercise timer/no-timer and 1/2/3-stream merge fixtures at 375 px before ship. |

## Open Questions

> **Q: Should the focused cooking surface stay in the recipe page or become full screen?** - Default: keep one recipe page and use a sticky in-page focus rail. Reason: it keeps timers, fallback, edit guards, and return behavior under one owner while meeting the top-of-screen progress need.

> **Q: How should completed actions remain visible?** - Default: collapse them to a quiet one-line checked history row, without strikethrough, and keep tap-to-review. Reason: the cook can recover context without letting finished work compete with the current action.

> **Q: What counts toward the progress bar?** - Default: cooking steps only. `Get ready` keeps its own count and the ingredient checklist stays reference. Reason: the rail then matches the existing cook-completion gate and never hides unfinished preparation inside cooking progress.

## Resume pack

Goal: make cooking mode readable at phone and counter distance, then keep one explicit current cooking step centered with progress, safe text emphasis, live servings, timers, and bilingual data intact.

Current state: Release D is live. The recording is transcribed, shipped overlap is removed from scope, and this four-phase R2 plan is ready.

First command: `/run`.

First files: this feature list, `docs/recordings/2026-07-22-cooking-mode-readability-focus-transcript.md`, `src/lib/components/BenchSheet.svelte`, `src/lib/components/cook-mode/ComponentCard.svelte`, `src/lib/components/cook-mode/MergeCard.svelte`, and `src/lib/components/cook-mode/staleness.ts`.

Pending verification: baseline provider-call capture; current v4 fixture coverage; 375/768/1280 px EN/NL browser matrix; independent implementation review before push.

Open questions: focused surface shape, completed-action display, and progress denominator. The defaults above let `/run` start without waiting.

## Shipped result

Cooking mode now has one explicit current step, cooking-only progress, quiet completed rows, readable instructions, exact safe ingredient emphasis, step ingredients above each action, and persistent focus state. Serving and checklist changes stay local. Missing or stale data and explicit Regenerate keep the existing generation path. The v4 cache, schema, provider seam, and read-validity rules did not change.

[Open the archived cooking plan](../../artifacts/archive/2026-07-22-plan-cooking-mode-focus.html)
