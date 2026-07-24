# Chat Assistant and Cooking Timer — UX Workup

_Status: In flight - Phase 2 of 2 (paused 2026-07-24)_

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

### Open Questions

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
