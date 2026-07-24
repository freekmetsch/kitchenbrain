# Chat Assistant and Cooking Timer — UX Workup

_Status: In flight - 2026-07-24 (safe implementation verified; persisted tag deletion and authenticated visual pass remain pending)_

> The assistant-only post-ship findings shipped and are archived in `archive/FEATURE_LIST_UX_ASSISTANT_CHAT.md`. This document remains active only for assistant/timer coexistence and the physical locked-screen timer gate.

## Goal and boundary

The assistant should feel available without competing with cooking. The timer must remain glanceable, dismissible, and capable of reaching an audible alarm while the screen is locked. This workup covers the experience around chat, not the content of assistant replies.

## Journey audit

| Journey | Current result |
|---|---|
| Open/close from any app screen | Works; Escape now closes the desktop non-modal dialog and returns focus to the launcher. |
| Open while a timer is active | Fixed: desktop timer moves beside the panel; tablet uses full-screen chat; launcher avoids the timer stack. |
| Start timer, background the page | Fixed in-browser: the timer tap starts a real media timeline whose alarm is embedded at the deadline, so the alarm does not depend on a throttled JavaScript callback. |
| Cancel/reset timer | Works; the associated media element stops and releases its source. |
| Reload an already-running timer | Remaining platform constraint: playback cannot be restarted automatically after reload because browsers require a user gesture. |
| Force-close the browser/app | Not guaranteed by the web platform; notifications remain a best-effort backup. |

## Findings

| Priority | Status | Finding and impact | Evidence | Effort | Principles |
|---|---|---|---|---|---|
| P1 | Resolved in browser; device check pending | The alarm previously depended on foreground JavaScript/Web Audio. A pre-started media timeline now carries the alarm through normal browser backgrounding; physical locked-screen behavior remains unverified. Foreground Web Audio, vibration, Wake Lock, and notifications remain fallbacks. | `background_audio.ts`, `cook-timer-alarm.m4a`, `BenchSheet.svelte`; background-tab playback verified | M | [H5] [Doherty] [Peak-end] |
| P1 | Resolved | Opening chat could make an active timer unobservable and hard to dismiss. Timer and panel now negotiate separate desktop lanes and a full-screen tablet boundary. | before/after screenshots at 1280 and 768 px | M | [H1] [H3] [RUI] |
| P2 | Resolved | Desktop Escape did not close the non-modal dialog. It now closes and returns focus to the launcher. | keyboard browser pass; `ChatAgent.svelte` | XS | [KNav] [H3] |
| P2 | Resolved | The destination now uses the canonical name “Assistant” in English and “Assistent” in Dutch across navigation, title, launcher, panel, and composer. | English and Dutch phone browser passes; `messages/en.json`, `messages/nl.json` | XS | [H4] [Krug] |
| P2 | Resolved | “Open” navigation and “Ask” AI quick actions are labelled, grouped, and styled separately, so their consequence is apparent before activation. | `ChatView.svelte`; `20260723-chat-polish-home-final-375.png` | S | [H2] [H4] [Norman] |
| P2 | Resolved | Primary phone interactions now meet the 44 px kitchen-use target, reducing slips with wet or occupied hands. | browser measurements at 375 px; wider responsive passes at 768, 1280, and 1536 px | S | [Fitts] [WCAG 2.5.8] |
| P3 | Resolved | Loading, cap, and attachment failure changes now expose status or alert semantics without moving focus. | invalid-upload and loading browser passes; `ChatView.svelte`, `ChatAgent.svelte` | XS | [WCAG 4.1.3] [H1] |

## Background-sound design

Starting a timer is the required user gesture. That gesture starts one ordinary audio element near the end of a long silent lead-in; the alarm tone is encoded into the same file at the target offset. The browser therefore advances media playback rather than waiting for a background `setTimeout` to start sound. One audio element is used per concurrent timer.

Guardrails:

- the cooking view must remain open;
- timers longer than 12 hours fall back to the foreground alarm path;
- reload, media pause, browser force-close, OS process eviction, and device-specific power rules can still interrupt sound;
- notifications are described as backup, not a promise;
- physical iOS and Android locked-screen verification remains an explicit release check.

## Remaining UX gate

- Run and record the physical iPhone and Android locked-screen timer matrix. Normal browser backgrounding is verified; locked-screen behavior is not.

## Recommended sequence

1. **CHAT-UX-1 (XS, completed):** choose one assistant name and update navigation/title/launcher together.
2. **CHAT-UX-2 (S, completed):** separate “Go to…” actions from “Ask…” actions with verbs and grouping.
3. **CHAT-UX-3 (S, completed):** apply 44 px touch targets and semantic live feedback.
4. **TIMER-UX-1 (device gate):** test a 2-minute timer with screen locked on the household's actual iPhone and Android device; record lock, notification, silent-mode, media-volume, and force-close outcomes.

## Phase: Recipe cooking page streamlining

### Problem framing

The recipe page currently makes the cook carry too much persistent chrome: a sticky recipe header, a sticky step-progress/servings bar, a floating timer stack, a post-cook feedback prompt, and a collapsed maintenance section. Enhancement also blocks the page behind an AI loading sheet, while the cooking cards reserve horizontal space for a timer even when the instruction text does not need it.

The target is a calm, scrollable cooking surface for one household cook on a phone or kitchen tablet: recipe context is visible once, controls stay beside the content they affect, background work can be dismissed without losing its result, and each instruction uses the available width.

### Scope

In: non-sticky recipe header and cooking layout; removal of step progress chrome; inline serving controls; freezer/enhancement action pairing; background enhancement status and later review; top-level recipe notes/tags and reduced metadata; original-recipe toggle; inline instruction timers; component color continuity; removal of cooking-view feedback and floating timer UI; concise cook-log action.

Out: database schema changes; AI enhancement API changes; multi-user behavior; timer persistence contract; locked-screen device verification; redesign of the raw recipe editor.

### Chosen approach

Use existing Svelte components and primitives. Keep the server enhancement proposal contract, but make the first click start generation and return immediately to the page; retain the in-memory proposal for review once ready. Render the existing timer state inside the instruction line that owns it and remove only the floating presentation layer. Replace hand-rolled cooking/original view buttons with the existing `SegmentedTabs` primitive.

Rejected alternatives: a new job table or notification system would exceed the requested UI change and create schema/deployment work; keeping the modal open while generating preserves the current ambiguity; a new timer data model is unnecessary for the existing one-timer-per-step payload and would expand the cache contract.

### Execution tickets

1. **Flow chrome and metadata (R1, S)** — remove sticky classes and step-progress bar, remove sticky counter rail, keep servings adjustment in the cooking flow, convert original/cooking control to `SegmentedTabs`, move notes/tags to the top metadata strip, and remove the bottom maintenance section. Verify `npm run check` plus 375/1280 viewport smoke checks. Rollback: restore the affected component markup/classes.
2. **Background enhancement and action pairing (R2, M)** — place freezer and enhancement actions side by side, start enhancement without opening the sheet, expose busy/ready/error status, and allow review/apply once the proposal is ready. Verify dismissing the review surface does not cancel generation and that failure is announced. Rollback: revert component-only interaction changes; API remains unchanged.
3. **Inline timer and component density (R2, M)** — remove `TimerStack` rendering, attach the timer chip/label to its instruction line, remove timer-driven padding from the whole card, and preserve start/cancel/done behavior. Restore stream palette cues in the counter and improve swap affordance. Verify timer start/cancel/done and long instruction wrapping at 375/1280. Rollback: restore the existing stack renderer.
4. **Cook completion simplification (R1, XS)** — remove cooking-view rating feedback and make the sole bottom action the cook log button. Verify direct recipe and planned-meal logging still submit and show success. Rollback: restore the feedback block only if product needs it again.

### Risk and verification matrix

Risk: R2 (client interaction/state changes; no schema or auth boundary).

| Area | Verification |
|---|---|
| Responsive layout | Browser smoke at 375 px and 1280 px; no sticky header/progress, no horizontal clipping, instructions use full width. |
| Enhancement states | Source review plus browser pass for idle, busy, ready-review, apply, and failure; status uses `role=status`/toast. |
| Timer behavior | Unit tests remain green; browser pass for inline start, countdown, cancel, done/reset, and page background behavior where available. |
| Data/API invariants | Existing `npm run check`, `npm run test:unit`, and `npm run build`; no API/schema files changed. |

### Failure-mode critique

| Failure mode | Trigger | Impact | Detectability | Mitigation | Residual risk |
|---|---|---|---|---|---|
| Enhancement result is lost after navigation | User leaves before review | Generated proposal cannot be reviewed later | Visible only after leaving the route | Keep busy/ready/error status explicit; leave durable proposal persistence out of scope | Medium; requires a later API/schema decision if cross-route resume is needed |
| Timer affordance is not discoverable | Timer label is attached to a long/multiline instruction | Cook misses or cannot reach the timer | Browser pass with long instruction text | Render chip inline beside the matched sentence with a clear action/location label and 44 px target | Low |
| Step selection regresses during card refactor | Click target/focus semantics change | Current-step highlighting or resume behavior breaks | Unit/build plus keyboard smoke | Preserve `selectStep` and card-level labelled selection control | Low |
| Removing feedback changes direct-cook request shape | Rating is removed from the client body | Server may reject or mis-handle logging | Unit/build and direct-cook smoke | Send an empty JSON object for the existing endpoint; keep planned-meal status payload unchanged | Low |
| Palette cues disappear on narrow screens | Counter remains neutral or hides component labels | Multi-component recipes become harder to scan | 375 px visual smoke | Apply the stream palette to each ingredient row and retain a compact component label | Low |

Steelman: Keeping a modal open during enhancement would be simpler mechanically, but it directly preserves the user’s reported ambiguity and blocks the cooking page during metered AI work. Starting the same existing request from the button, exposing a status, and reusing the current review/apply sheet gives the user control without inventing a second server contract; the remaining cross-route persistence risk is explicit and isolated rather than silently implied.

### Previous phase open question

> **Q: Should a completed enhancement survive leaving the recipe page?** — Default: keep the current in-memory proposal for this task and make the status explicit; persisting staged proposals is an API/schema decision outside this UI pass. Reason: it delivers dismissible background work without introducing a new durable job contract.

### Resume pack

Goal: streamline the recipe cooking page around vertical flow, local controls, and resumable enhancement.

Current state: active implementation task; existing page has sticky header/progress, floating timer stack, modal-blocking enhancement, bottom maintenance, and feedback controls.

First command: `/run`.

First files: `src/routes/recipes/[slug]/+page.svelte`, `src/lib/components/BenchSheet.svelte`, `src/lib/components/cook-mode/CookStepCard.svelte`, `src/lib/components/cook-mode/InstructionLines.svelte`, `src/lib/components/recipe-detail/RecipeEnhancementSheet.svelte`.

Pending verification: standard check, unit, build, then responsive browser smoke if a seeded local session is available.

## Acceptance checks

- The timer stays visible and operable before, during, and after opening chat.
- Opening or closing chat never changes the timer deadline or stops its media.
- A backgrounded browser tab reaches the encoded alarm without a JavaScript wake-up.
- Cancel/reset stops media immediately.
- Escape, close button, and launcher all return users to a predictable focus location.
- Every quick action states or visually signals whether it navigates or contacts the AI.

## Phase: Cooking instruction and ingestion polish

### Problem framing

The first cooking-view pass moved the timer into the instruction, but the screenshots expose three remaining density problems: the timer still carries redundant `COOKING · STOVE` copy, the instruction renderer uses a flex row that makes the bold action and sentence behave like separate wrapping items, and the freezer/AI cards still stack on narrow screens. The recipe context also still exposes stored tags and labels the source prose as notes, while preparation can appear as an unlabeled first block with no ingredient ownership.

The deeper correctness issue is semantic: imported ingredient lines such as “400 g finely chopped leek” are currently normalized into `name: prei` plus `preparation: fijngehakt`, but the system does not guarantee that the cook is shown the required chopping action before using the ingredient. The cook should always start from the purchased/raw ingredient state unless the recipe explicitly names a preserved or already-processed product.

### Scope

In: inline timer copy and wrapping; always-horizontal freezer/AI suggestion actions; renaming the action to “AI suggestions” / “AI-suggesties”; removing tag rendering from recipe detail; rendering notes as an unlabeled recipe summary; making preparation a regular numbered cooking step with a component label and ingredient chips; strengthening ingestion and cook-mode contracts around raw ingredients and preparation coverage; focused tests and browser verification.

Out: deleting the stored `tags` column or migrating historical recipe rows; changing Albert Heijn lookup fields; replacing the AI provider; introducing a queue or durable enhancement-job table; redesigning the raw recipe editor; changing recipe source snapshots; automatic background enhancement persistence across route changes.

### Existing-system inventory and invariants

- `src/lib/components/cook-mode/InstructionLines.svelte` renders projected sentence segments in a flex paragraph and currently places timer action/location text beside `TimerChip`.
- `src/lib/components/recipe-detail/RecipeEnhancementSheet.svelte` owns the visible enhancement label and review flow; the API contract remains unchanged.
- `src/routes/recipes/[slug]/+page.svelte` owns the freezer/AI grid and passes notes into `RecipeMetaChips.svelte`.
- `src/lib/components/cook-mode/cooking_steps.ts` turns deterministic directions into steps and currently joins legacy `mise_en_place` into one unlabelled, ingredient-free step.
- `src/lib/components/cook-mode/staleness.ts` localizes v4/v5 cook-mode caches. V5 already has `prep_tasks`, but its display projection drops the full ingredient index list.
- `src/lib/server/ai/recipe_ingest.ts` separates canonical Dutch base names from preparation wording and validates source-line coverage before writing. `recipe_enrich.md` is the prompt contract for that boundary; `cook_mode.md` is the later semantic cooking contract.
- Dutch ingredient names remain authoritative for Albert Heijn search and shopping derivation. Preparation changes must never replace or translate the canonical Dutch `name`.
- No schema/auth change is required. Existing AI output must continue through Zod validation before recipe or cook-mode cache writes.

### Option comparison and chosen approach

| Area | Options | Chosen |
|---|---|---|
| Timer/wrapping | Keep a reserved timer column; render timer inline in normal text flow; split instructions into new block records | Inline timer with ordinary inline text flow. It fixes the screenshot without changing the cache contract. |
| Narrow action cards | Stack on phones; always use two equal columns with compact controls; use a horizontal scroll rail | Always two equal columns. The user explicitly wants freezer and AI suggestions to share one horizontal row; short labels and `min-w-0` handle narrow widths. |
| Preparation semantics | Prompt-only instruction; mutate imported directions; preserve preparation metadata and synthesize/dedupe a normal prep step in cook mode | Preserve source data, strengthen ingestion validation, and project a normal prep step from validated preparation metadata. This keeps snapshots faithful while making the cooking experience honest. |
| Summary/tags | Delete tags; keep rendering tags; hide tags but retain stored values and show notes as plain prose | Remove tag UI now; persisted tag deletion remains a separate beta R3 action requiring an explicit migration/data-clear decision. Render notes as unlabeled prose. |

Rejected alternatives: a new instruction schema is unnecessary for the wrapping fix; rewriting source directions during ingestion would make the canonical recipe diverge from its immutable source snapshot; prompt-only raw-ingredient handling has no deterministic coverage check and can silently omit chopping/draining actions.

### Phase plan

1. **Presentation pass:** remove timer label copy, change instruction paragraphs back to inline text flow, rename the action, and make the freezer/AI action row two columns at all supported widths. Verify static UI states and long wrapping first.
2. **Recipe context pass:** remove tag rendering without deleting stored tags and render notes as unlabeled summary prose. Verify empty, short, and multiline summaries.
3. **Preparation projection pass:** carry all V5 prep-task ingredient indexes through localization, map preparation tasks into a normal labelled step with ingredient chips, and dedupe against directions that already perform the same preparation. Preserve legacy fallback behavior with deterministic matching.
4. **Ingestion correctness pass:** update `recipe_enrich.md` and its writer validation so raw/base ingredient semantics and preparation coverage are explicit; make cook-mode generation use the preparation signal when a required prep action is absent. Add unit tests for chopped, drained, preserved, and already-prepared ingredients.
5. **Full verification:** run `npm run check`, `npm run test:unit`, `npm run build`, then Playwright smoke at 375 px and 1280 px for long instructions, action-card layout, preparation chips, timer start/done, and empty/summary states.

### Execution tickets

1. **Inline timer and text wrapping (R1, S)** — scope: `InstructionLines.svelte`, `TimerChip.svelte`, related tests. Remove timer action/location rendering; keep only the timer control with its accessible duration/action label. Replace the flex paragraph with inline-flow markup so the bold action verb and following text wrap as one sentence. Verification: unit projection tests, check/build, browser long-sentence and timer states. Rollback: restore the prior timer label and paragraph classes.

2. **AI suggestions/freezer action row (R1, XS)** — scope: recipe route and enhancement copy. Rename visible action copy to “AI suggestions” / “AI-suggesties”; use a two-column grid at the phone breakpoint with compact equal-height cards and no horizontal overflow. Verification: 375 px and 1280 px default/loading/ready/error states. Rollback: restore the previous labels/grid classes.

3. **Summary and tag visibility (R1, XS)** — scope: `RecipeMetaChips.svelte`, recipe detail route, English/Dutch messages. Remove tag chips from the rendered page and render notes directly as summary prose without a “Notes” or “Summary” heading. Persisted tag deletion is paused at the beta R3 gate; do not clear rows or drop the column in this pass. Verification: empty, one-line, multiline, translated, and long-summary states. Rollback: restore the display-only tag/notes markup.

4. **Regular preparation step (R2, M)** — scope: `types.ts`, `staleness.ts`, `cooking_steps.ts`, `CookStepCard.svelte`, focused tests. Preserve all V5 `prep_tasks.ingredient_indexes`, create a normal first step with the “Preparation” component label and the referenced scaled ingredient chips, and dedupe tasks already represented by a direction. Keep legacy `mise_en_place` conversion working with best-effort ingredient matching and explicit empty-chip behavior when no match is safe. Verification: v4/v5 projection tests, ingredient scaling tests, check/build, browser preparation-step smoke. Rollback: revert projection changes; cached cook-mode records remain readable.

5. **Raw-ingredient ingestion contract (R2, M)** — scope: `recipe_enrich.md`, `recipe_ingest.ts`, `cook_mode.md`, ingestion/cook-mode tests. Treat “finely chopped leek” as a raw leek plus a required chopping preparation, not as a pre-chopped purchase. Preserve Dutch canonical names and preparation fields, validate that source preparation is either represented by directions/prep tasks or produces a review reason, and have cook-mode generation add the missing preparation action without duplicating an explicit source action. Re-validate all generated data before writes; no schema migration. Verification: mocked ingestion tests for chopped/drained/fried/preserved ingredients, review-reason tests, cook-mode prompt/validation tests, full checks. Rollback: revert prompt and deterministic coverage changes; existing recipe rows remain untouched.

6. **End-to-end verification and audit (R2, S)** — scope: no new product files beyond tests or verification fixtures. Run the UI/UX audit path with safe seeded data, exercise keyboard focus and mobile touch targets, and capture the changed states at 375 px and 1280 px. Browser findings must be labeled runtime-observed; source-only findings must name file/line evidence. Rollback: none; this ticket only records evidence.

### Rollback and rollout

Ship the UI tickets and semantic projection behind the existing recipe route in one ordinary beta deployment; no migration or feature flag is needed. If the preparation projection produces incorrect or duplicated actions, disable the new projection by reverting the cook-mode presentation change while retaining the validated `preparation` fields and source snapshots. If ingestion validation rejects valid source lines, revert only the new coverage check and leave existing normalized ingredients untouched. No existing recipe rows are rewritten by this phase.

### Risk tier, stage, and verification matrix

Risk: R2. This changes generated cooking semantics and the persisted cook-mode cache contract, but not the database schema, authentication boundary, or external purchase behavior. `requires_stage_gate: false`; beta stage is advisory only for this code/data-shape work.

| Area | Verification | Failure boundary |
|---|---|---|
| UI geometry | Playwright at 375 px and 1280 px; inspect no horizontal overflow, equal action-card row, inline timer, and natural sentence wrapping | Runtime visual regression |
| Accessibility/interaction | Keyboard focus on action cards/timer/review; 44 px controls; status and error states | Lost focus or false affordance |
| Preparation projection | Unit tests for v4/v5, ingredient indexes, scaling, dedupe, and legacy fallback | Wrong or missing ingredient chips |
| Ingestion integrity | Unit tests for source-line preservation, Dutch names, preparation coverage, review reasons, and AI-suggested optionality | Incorrect recipe data or silent missing prep |
| AI boundary | Zod validation remains before DB/cache writes; no new SDK/dependency; `Context7 exception: internal-only change; no external API behavior change.` | Untrusted model output |
| UI/UX audit | Run from the supplied screenshots and source mapping now; rerun with Playwright during `/run`, and label any unverified runtime state explicitly | Visual or journey regression |
| Repo checks | `npm run check`, `npm run test:unit`, `npm run build` | Compile, test, or bundle regression |

### Failure-mode critique

| Failure mode | Trigger | Impact | Detectability | Mitigation | Residual risk |
|---|---|---|---|---|---|
| Timer control becomes ambiguous without the label | User sees only a duration chip | Timer is still discoverable from the sentence and duration, but action purpose could be unclear | Browser pass with timer-bearing instructions | Keep exact-duration accessible label and place the chip directly in the owning sentence | Low |
| Inline timer still breaks sentence flow | Flex/inline-block styling or long timer text | Action verb and body wrap awkwardly on phone | Screenshot/browser pass at 375 px | Use normal inline text flow and keep timer control compact; add a long multiline regression fixture | Low |
| Two-column action row clips on a narrow phone | Long localized labels or browser text zoom | Freezer or AI action becomes unreachable | 375 px + text-spacing/browser zoom pass | Use short localized labels, `min-w-0`, compact card copy, and no fixed widths | Medium |
| Preparation is duplicated | Source direction already says “chop leek” and metadata also requests chopping | Cook repeats an unnecessary prep action | Unit fixture with explicit and implicit prep | Match preparation to direction text and dedupe by ingredient ID/name before projecting | Low |
| Preparation is omitted | Model output has preparation metadata but no prep task/direction | Cook assumes chopped ingredient was purchased | Ingestion/cook-mode fixture and review state | Require preparation coverage or a review reason; cook-mode generation has a deterministic missing-prep fallback | Medium |
| Existing cached cook mode has incomplete prep indexes | Older v5 cache or legacy v4 payload | Chips are missing or the cache is rejected | Staleness and projection tests | Preserve backward-compatible nullable/empty handling and regenerate only when eligibility fails | Low |
| Tag removal breaks an unseen consumer | A future/search path relies on rendered tags | Filtering affordance disappears | Source audit and browser route checks | Hide only display; retain database values and explicitly keep tag deletion out of scope | Low |
| Ingestion changes canonical shopping names | Prompt misreads preparation as base product | Albert Heijn lookup fails or searches processed wording | Dutch ingredient assertions and AH invariant review | Keep `name` as Dutch base product and test it through the writer gate | Low |

Steelman: A prompt-only fix would be faster, but it leaves the most important failure—silently assuming a processed ingredient—dependent on model compliance. Combining a small deterministic projection with the existing validated ingestion fields gives the cook a reliable preparation step without rewriting source recipes or introducing a migration, while the UI changes remain narrowly local.

### Open Questions

> **Decision: remove tag UI now; persisted tag deletion is explicitly requested but blocked at the beta R3 gate.** Clearing recipe tag values or dropping the schema column is irreversible for real household data. The safe implementation must pause before that migration/data operation and ask for the exact approved target.

> **Q: Should freezer and AI suggestions remain side by side at 375 px?** — Default: yes, use two equal compact columns at every breakpoint. Reason: this is the explicit requested relationship; labels will be shortened and cards will avoid fixed-width content.

> **Q: When ingredient preparation is already explicit in a direction, should a separate preparation step still appear?** — Default: no, dedupe it. Reason: the cook needs the action exactly once, with the ingredient chip attached to the step where it happens.

### Resume pack

Goal: polish the cooking instruction surface and make raw-ingredient preparation explicit from ingestion through cooking mode.

Current state: the previous recipe-view phase is committed and pushed; this phase is in flight. Safe UI and cooking-semantics changes are being implemented; persisted tag deletion remains paused at the beta R3 gate.

First command: `/run`.

First files: `src/lib/components/cook-mode/InstructionLines.svelte`, `src/lib/components/recipe-detail/RecipeEnhancementSheet.svelte`, `src/routes/recipes/[slug]/+page.svelte`, `src/lib/components/cook-mode/staleness.ts`, `src/lib/components/cook-mode/cooking_steps.ts`, `src/lib/server/ai/recipe_ingest.ts`, `src/lib/server/ai/prompts/recipe_enrich.md`, `src/lib/server/ai/prompts/cook_mode.md`.

Verification recorded: `npm run check`, `npm run test:unit` (414 passing), `npm run build`, and `git diff --check` pass. Playwright reaches `/login`, but the recipe route requires an authenticated household session, so 375/1280 recipe screenshots remain runtime-unverified. Persisted tag deletion is paused at the beta R3 gate; the pre-existing physical locked-screen timer gate remains separate.
