# Feature List: Shopping Interaction Stability

_Status: Shipped - 2026-07-29 (stable Shopping identity, local focus/motion, and compact AH support)_

## Problem framing

The recent Shopping Source Ledger is a strong base, but its repeated-use interaction is not
spatially stable yet.

On a 375 × 812 synthetic authenticated fixture, checking a visible row while
`main.app-main.scrollTop` was 624 moved focus to the next clipped checkbox. The browser then
scrolled the outer window to 569 while leaving the app scroll container at 624. Primary navigation
landed at viewport y=186 and the active list left the usable viewport. The same path reproduces
with pointer and keyboard input.

Two other causes make the page feel as if it rearranges itself:

- recipe filters are derived from `pending` followed by `done`, so completing the Primary recipe
  changed the filter order from Primary → Secondary to Secondary → Primary;
- completing the only row in a recipe section removes 106 CSS pixels at once on desktop, with no
  motion to explain where the row went.

The page also repeats support context at the expense of the list. On the mobile All view, an empty
Weekly section and a fully expanded unresolved AH result put the first active row at y=747–794,
under the fixed dock at y=688–748 and bottom navigation at y=755–812. Desktop repeats the
disconnected AH state in the header, context card, notes, and dock. Recipe rows repeat the selected
ingredient term in both the item label and the trailing rule summary.

### Intended outcome

Keep the shipped Source Ledger, source filters, active/basket split, and explicit undo. Make them
feel fixed in place:

1. checking and undo never scroll the outer page or reorder source controls;
2. focus remains visible and predictable after pointer and keyboard actions;
3. local row and section reflow uses short, purposeful motion and becomes instant under reduced
   motion;
4. empty or repeated support UI no longer pushes the first useful list action behind fixed bars;
5. AH safety state remains explicit while connection and history details appear only once at the
   right level.

## Scope

### In

- Stable recipe/source ordering for filters and Source Ledger groups.
- Viewport-safe focus handling for check, undo, restore, and failed mutations.
- Local keyed-list reflow/exit motion using the repository's existing 150/240 ms motion tokens.
- Removal of the empty Weekly section from All while preserving the Weekly filter and its one-tap
  Manage state.
- Shorter per-row shopping-rule summaries.
- One passive AH connection status plus one contextual AH action.
- Outcome-first AH history that keeps safety-critical unresolved information visible and moves
  resolved product detail behind disclosure.
- EN/NL copy and synthetic unit/browser coverage for the changed behavior.

### Out

- Shopping schema, migrations, server commands, week selection, or reconciliation rules.
- Recipe-rule persistence, recurring-item behavior, or shopping mutation semantics.
- AH matching, preview fingerprints, push requests, result classification, or Dutch-source
  lineage.
- A new sort mode, a flat-list redesign, inline-completed rows, or changes to other primary pages.
- Real household data, a real AH account, or a real AH send during verification.

## UI and UX audit findings

| Priority | Lens | Finding and impact | Evidence | Durable direction |
| --- | --- | --- | --- | --- |
| P1 | Interaction / focus | A successful check can scroll the outer document while the app's own scroll container stays put, moving navigation into the middle of the viewport and making the list unusable. | `/shopping`, long active list, 375 × 812, pointer and Space; `ShoppingLists.svelte:107-117`, `list-controller.svelte.ts:223-233` | Separate focus from scrolling: prevent browser auto-scroll on the next active row and explicitly reveal restore/failure targets only inside `main.app-main`. |
| P2 | State agreement / orientation | Completing one recipe changes the order of recipe filter pills, so a control moves after it is used and invites mis-taps. | Primary → Secondary became Secondary → Primary after checking the Primary row; `list-controller.svelte.ts:104-108`, `shopping_list_view.ts:19-39` | Derive one stable source order from the canonical source registry and reuse it for filters and groups. |
| P2 | Motion / continuity | Removing a singleton recipe section shifts the next section upward 106 px instantly. The success toast explains state, but not spatial movement. | `/shopping`, 1280 × 800, active list; `ShoppingLists.svelte:253-345` | Animate only the keyed local reflow/exit, keep feedback immediate, and disable the exiting row against repeat activation. |
| P2 | Responsive hierarchy | At initial mobile load, no active row is fully usable because empty Weekly and expanded AH details occupy the space above fixed controls. | `/shopping`, All + unknown AH result, 375 × 812: first row y=747–794, dock y=688–748, nav y=755–812 | Omit empty groups from All and collapse resolved/history detail without hiding the unresolved outcome or recovery action. |
| P3 | Reuse / content | A recipe row repeats the visible selected term inside `Every time · <same term>`, using up to 34vw and truncating the actual item sooner. | `/shopping`, recipe row, 375 and 1280; `ShoppingLists.svelte:101-105,286-324,888-900` | Show the need label alone when the term matches; show a term only for a real substitute or multi-rule case. |
| P3 | Cognitive load | Disconnected AH state appears as header status, desktop card, Shopping note, and a dock action that still says Review. | `/shopping`, disconnected state, 1280 × 800; `WeekNav.svelte:60-65`, `+page.svelte:203-245,248-267` | Keep the header status passive and make the dock the sole contextual action: Connect when disconnected, Review when connected. |

Runtime coverage included the long active list, successful pointer and keyboard check, meal-filter
switch, disconnected AH with an uncertain previous result, and settled desktop/mobile geometry at
375 and 1280 px. Empty, connected-AH, dark, NL, reduced-motion, and server-failure states were
source-traced but not manually walked in this audit; they are required verification below. All
runtime data was synthetic. No authenticated household screenshot or response was retained.

## Existing-system inventory

| Concern | Current owner | Plan consequence |
| --- | --- | --- |
| Filter and group projection | `src/lib/shopping_list_view.ts` | Keep this pure seam; add stable source-order inputs rather than a component-local sort. |
| Transient list state and focus target selection | `src/lib/components/shopping/list-controller.svelte.ts` | Preserve next-visible-key and undo semantics; add action/focus intent explicitly. |
| List DOM, keyed rows, rule summaries | `src/lib/components/shopping/ShoppingLists.svelte` | Own scroll-safe focus, transition placement, pending-row inertness, and compact display copy. |
| Canonical source registry | `ShoppingListSource[]` supplied by `/shopping` | Use this mutation-independent registry for recipe order; bought state must not define navigation identity. |
| Fixed app scroll container | `src/routes/+layout.svelte` (`main.app-main`) | Treat it as the only scrolling viewport. `window.scrollY` must remain zero in the authenticated shell. |
| Motion convention | `src/lib/motion.ts`, reduced-motion guard in `src/app.css`, `ChatView.svelte` pattern | Reuse 150/240 ms constants and resolve duration to zero for reduced-motion users. |
| AH connection/action composition | `WeekNav.svelte`, `/shopping/+page.svelte`, `ShoppingNotices.svelte` | Preserve one passive status and one action; remove repeated connection-only surfaces. |
| AH outcome detail | `PushHistory.svelte`, `shopping_push_history.ts` | Change disclosure only; do not alter outcome resolution, ordering, or retry safety. |
| Synthetic browser fixtures | `tests/e2e/fixtures.ts`, `responsive-parity.e2e.ts`, `kitchen-flows.e2e.ts` | Extend the existing isolated account flow; never call AH. |

## Option comparison

| Option | Strengths | Costs / risks | Decision |
| --- | --- | --- | --- |
| Stabilize the existing Source Ledger | Fixes the root ordering and scroll defects, preserves the shipped mental model, and removes local redundancy without touching domain data. | Requires careful focus intent and transition locking. | **Chosen.** |
| Add CSS motion only | Small visual change. | Leaves filter identity and outer-window scrolling broken; animation would disguise rather than repair the cause. | Rejected. |
| Replace groups/basket with a flat list of inline completed rows | Removes almost all reflow and makes undo direct. | Reverses the just-shipped Source Ledger and keeps completed items competing during the repeated in-store task. | Rejected for this pass. |

The chosen motion seam follows Svelte's documented keyed-list FLIP/transition pattern while using
the repository's own tokens and reduced-motion convention:
[Svelte keyed-list animation reference](https://svelte.dev/playground/animate).

## Phase plan

### Phase 1 — Stable identity and viewport

- Establish one source registry order that survives pending/done movement.
- Make focus intent explicit for success, failure, undo, and restore.
- Prove pointer and keyboard checks cannot scroll the outer document.

### Phase 2 — Local continuity

- Animate row/section exit and reflow without delaying state feedback.
- Make an exiting or in-flight row inert so rapid taps cannot duplicate a mutation.
- Keep reduced-motion behavior instant and focus-stable.

### Phase 3 — Remove repeated support UI

- Drop zero-row Weekly from All while preserving its management route.
- Compact recipe-rule summaries.
- Unify AH status/action and compress resolved history detail.

### Phase 4 — Full verification and delivery

- Exercise all affected states in both locales and priority viewports.
- Run the complete provider-free repository gate and the secondary-account browser suite.
- Deliver through GitHub `main`, supervise Railway exact-revision success, and run a privacy-safe
  structural canary with no AH push.

## Execution tickets

### SIS-01 — Keep source controls and groups in canonical order

- **Observable behavior:** checking, undoing, or restoring any row does not reorder recipe filter
  pills or surviving Source Ledger groups; a selected filter stays selected while its source still
  exists.
- **Scope in:** derive unique meal order from the canonical `ShoppingListSource[]`; feed that order
  to filter options and grouping; reconcile only genuinely removed sources.
- **Scope out:** alphabetical/store sorting, database order changes, or server reconciliation.
- **Targets:** `src/lib/shopping_list_view.ts`,
  `src/lib/components/shopping/list-controller.svelte.ts`,
  `src/lib/shopping_list_view.test.ts`,
  `src/lib/components/shopping/list-controller.svelte.test.ts`.
- **Risk:** R1. Impact 5/5. Effort S. Confidence high.
- **Verification:** exact order before/after check, undo, all-done, source add/remove, and filter
  reconciliation; browser assertion that Primary/Secondary pill bounding boxes never swap.
- **Rollback:** revert the source-order input and its tests; no persisted state changes.

### SIS-02 — Preserve the app viewport while moving focus

- **Observable behavior:** from 600+ px down the mobile list, pointer click and Space both complete
  a row while `window.scrollY` remains zero, `main.app-main` stays at the same logical position, and
  the next focused control is visible above the dock/navigation. Undo and failure reveal the
  original row inside the app scroll container.
- **Scope in:** explicit focus modes; `focus({ preventScroll: true })` for next-active focus; a
  row-level reveal target for restore/failure; app-main-only nearest scrolling; unobscured focus
  assertions.
- **Scope out:** removal of keyboard focus movement or changes to global scroll restoration.
- **Targets:** `src/lib/components/shopping/ShoppingLists.svelte`,
  `src/lib/components/shopping/list-controller.svelte.ts`,
  controller tests, `tests/e2e/responsive-parity.e2e.ts`,
  `tests/e2e/kitchen-flows.e2e.ts`.
- **Risk:** R1. Impact 5/5. Effort M. Confidence high.
- **Dependencies:** SIS-01.
- **Verification:** pointer and keyboard success/failure/undo at 375 and 1280; assert outer scroll,
  app-main scroll, focused key, focus visibility, dock clearance, and no page overflow.
- **Rollback:** revert the focus-intent contract; existing mutation and undo APIs remain intact.

### SIS-03 — Add bounded, non-repeatable list reflow

- **Observable behavior:** a successful check gives immediate checked feedback, then one short local
  exit/reflow; remaining rows settle without a hard jump, rapid repeat activation cannot send a
  second mutation, and reduced-motion users get the settled state immediately.
- **Scope in:** keyed row/group FLIP or local exit transitions using `MOTION_MICRO_MS` /
  `MOTION_CONTENT_MS`; per-key in-flight/exiting guard; zero-duration reduced-motion path.
- **Scope out:** decorative page motion, delayed server writes, or global motion changes.
- **Targets:** `src/lib/components/shopping/ShoppingLists.svelte`,
  `src/lib/components/shopping/list-controller.svelte.ts`, focused unit/browser tests.
- **Risk:** R1. Impact 4/5. Effort M. Confidence medium-high.
- **Dependencies:** SIS-02.
- **Verification:** settled geometry after singleton and middle-row checks, rapid double pointer/
  keyboard activation yields one POST, failure reverses without a ghost row, reduced-motion has no
  delayed removal, production build catches invalid Svelte animation placement.
- **Rollback:** remove directives and the transition-only guard while retaining SIS-01/02.

### SIS-04 — Remove zero-row sections from All

- **Observable behavior:** All never renders an empty Weekly card; Weekly remains a visible filter
  and its empty state still offers Manage in one tap.
- **Scope in:** omit empty All groups at the pure projection seam; retain explicit filtered empty
  states.
- **Scope out:** recurring-item CRUD or hiding Weekly management.
- **Targets:** `src/lib/shopping_list_view.ts`,
  `src/lib/components/shopping/ShoppingLists.svelte`,
  `src/lib/shopping_list_view.test.ts`, responsive browser coverage.
- **Risk:** R1. Impact 3/5. Effort S. Confidence high.
- **Verification:** All/Weekly with zero and nonzero recurring entries; 320/375 geometry; one-tap
  Manage and focus return.
- **Rollback:** restore the empty All group; no state change.

### SIS-05 — Stop repeating unchanged rule terms

- **Observable behavior:** a single-source row displays only `Every time`, `Nice to have`, or
  `Usually stocked` when its effective term matches the visible item; a real substitute and
  multi-rule row remain explicit.
- **Scope in:** pure summary formatting and accessible full edit label/title.
- **Scope out:** rule meanings, save behavior, or source selection.
- **Targets:** `src/lib/components/shopping/format.ts`,
  `src/lib/components/shopping/format.test.ts`,
  `src/lib/components/shopping/ShoppingLists.svelte`, EN/NL messages only if needed.
- **Risk:** R0. Impact 2/5. Effort S. Confidence high.
- **Verification:** same-term, substitute, multi-source, long EN/NL labels at 320/375/1280.
- **Rollback:** restore the current summary formatter.

### SIS-06 — Make the dock the single AH action

- **Observable behavior:** the header provides one passive `AH connected/offline` state; the fixed
  dock says Review when connected and Connect when disconnected; no duplicate desktop connection
  card or AH-only Shopping note remains.
- **Scope in:** responsive dock action/link, removal of the desktop connection card and connection
  notice, consistent empty/active/complete rendering.
- **Scope out:** AH preview, matching, push, tokens, or settings behavior.
- **Targets:** `src/routes/shopping/+page.svelte`,
  `src/lib/components/shopping/ShoppingNotices.svelte`,
  `src/lib/components/shopping/WeekNav.svelte`, `messages/en.json`, `messages/nl.json`,
  responsive browser tests.
- **Risk:** R1. Impact 3/5. Effort M. Confidence high.
- **Verification:** connected/disconnected × empty/active/complete at 320/375/1280; Connect routes
  to Settings; Review opens the existing preview; zero push requests.
- **Rollback:** restore the card/notice and prior dock branch; no AH state changes.

### SIS-07 — Keep AH outcome safety visible and collapse resolved detail

- **Observable behavior:** pending/uncertain/failed/partial outcomes always show their title, help,
  and safe action; up to two action-relevant unresolved lines remain visible; resolved lines and
  overflow move behind one 44 px disclosure; success stays compact.
- **Scope in:** `PushHistory` disclosure composition and copy; previous attempts remain collapsed.
- **Scope out:** outcome classification, item status ordering, retry behavior, or stored history.
- **Targets:** `src/lib/components/shopping/PushHistory.svelte`,
  `src/lib/shopping_push_history.test.ts`, EN/NL messages, responsive browser fixtures.
- **Risk:** R2. Impact 4/5. Effort M. Confidence medium-high.
- **Verification:** empty, pending, uncertain, failed, partial, success, long labels, one/many
  unresolved items, keyboard disclosure, 320/375/1280, and explicit assertion that uncertain never
  exposes Retry.
- **Rollback:** restore the always-expanded latest attempt; stored history is untouched.

## Risk tier, rollout, and rollback

Overall risk is **R2**. Most changes are localized UI/controller work, but AH result presentation
is an external-handoff safety surface: hiding the wrong fact could invite a duplicate send. There
is no schema, auth, destructive action, provider call, or new dependency, so no beta R3 stage gate
applies.

Land the tickets in phase order with their focused tests. Before delivery, run the full provider-
free gate. Rollback is a normal revert of the Shopping refinement commits; no database, environment,
AH token, or household-data rollback exists. Production verification must use names/counts and
structural state only, retain no household screenshot/response, and perform no AH send.

## Failure-mode critique

| Priority | Failure mode | Trigger | Impact | Detectability | Mitigation | Residual risk |
| --- | --- | --- | --- | --- | --- | --- |
| P1 | Outer window still scrolls | Focus or reveal targets the 1 px checkbox or document instead of the row/app-main | List/navigation leave the usable viewport | High in scrolled browser assertion | Focus with `preventScroll`, reveal the row wrapper within app-main only, assert `window.scrollY === 0` | Low |
| P1 | Motion enables double mutation | Outro keeps a checked row interactive during a rapid second tap/Space | Bought state can toggle twice or conflict | High with counted POSTs | Per-key in-flight/exiting guard and inert/pointer-disabled row until settled | Low |
| P1 | AH compression hides duplicate-send warning | Uncertain/pending details are generalized into a closed summary | Household may retry an external send | High in outcome fixtures | Keep outcome, help, Open AH, and unresolved lines visible; never add Retry | Low |
| P2 | Filter order drifts after refresh | Stable order is cached from pending rows rather than canonical sources | Controls still move after undo/source save | High in unit + browser order assertions | Recompute from mutation-independent source registry; reconcile only removed sources | Low |
| P2 | Focus is stable but offscreen | `preventScroll` is applied equally to undo/failure targets | Keyboard user loses focus location | High via bounding-box/focus test | Separate next-active focus from restore/failure reveal intent | Low |
| P2 | Reduced motion still waits for an outro | CSS neutralizes animation but Svelte retains a nonzero lifecycle duration | Delayed feedback with no visible explanation | Medium | Resolve directive duration to zero using the existing `ChatView` reduced-motion pattern | Low |
| P2 | Weekly management becomes hidden | Empty Weekly card is removed without preserving entry | Recurring basics become hard to edit | High in one-tap journey test | Keep Weekly filter visible and its focused empty Manage state | None expected |
| P2 | Connect action disappears in a shape state | Dock branch keys only on pending count | Disconnected empty/complete list has no setup path | High in state matrix | Key action first on connection, then list state; test every shape | Low |
| P2 | Long unresolved AH result still buries the list | Every unresolved product stays expanded | Mobile repeated task remains support-first | High at 320/375 | Show at most two unresolved lines; disclose overflow and all resolved lines | Low |
| P2 | EN/NL copy or target sizes drift | New Connect/disclosure labels are updated in one locale or cramped at 320 | Broken parity or hard-to-tap action | High in compile/browser checks | Same-change messages, 44 px targets, long-label viewport matrix | Low |
| P3 | Transition structure is invalid in Svelte | `animate:` is not the sole element in a keyed each block | Production build fails | Immediate in build | Place directives on the keyed row/group element and run build in the ticket | None |
| P1 | Public evidence retains household content | Production canary saves screenshots, bodies, or list text | Privacy breach | High in artifact review | Synthetic screenshots only; production structural assertions and counts | Low |

**Steelman:** A flat inline-completed list is the strongest alternative because it eliminates
reparenting altogether. It is still the weaker next step: it reverses the accepted active/basket
contract and makes every completed item compete with the remaining in-store task. The chosen
approach repairs the actual identity and scroll bugs, explains unavoidable local reflow with
bounded motion, and trims the support blocks that currently make the list feel heavier—without
inventing a second shopping model.

Plan-readiness recommendation: **GO**. No P0/P1 blocker remains after the focus-intent,
per-key-action-lock, and AH-safety mitigations above. The required independent `opus` verification
was unavailable because the Claude session limit resets at 12:50 Europe/Amsterdam; no outside
findings were accepted.

## Verification matrix

| Layer | Required proof |
| --- | --- |
| Pure projection | Stable meal order across pending/done/check/undo; source add/remove; zero-row All groups omitted; no duplicate item ownership |
| Controller | Next-active vs restore/failure focus intent; invalid filter reconciliation; one mutation per key; undo status/count parity |
| Component | Same/substitute/multi-rule summaries; connected/disconnected dock; AH outcome disclosure for all statuses |
| Browser journey | 375 pointer and keyboard check at `app-main.scrollTop >= 600`; `window.scrollY === 0`; focus visible; pill order stable; singleton group reflow; rapid double action; failure; undo |
| Responsive UI | 320, 375, 768, 1280 px; EN/NL; light/dark; long recipe/product labels; 200% effective layout; no row behind dock/nav; 44 px targets |
| Motion | Default and `prefers-reduced-motion: reduce`; immediate state, bounded local animation, no delayed invisible outro |
| AH safety | Connected/disconnected; empty/active/complete; pending/uncertain/failed/partial/success; no real preview lookup or push; uncertain has no Retry |
| Repository gate | Focused Vitest/e2e while iterating; `npm test`; `npm run test:e2e:secondary`; `git diff --check`; privacy-safe secret scan |
| Production | Railway `SUCCESS`, source `main`, exact remote-main commit, authenticated structural canary at phone/desktop, zero app-origin console/HTTP errors, no retained household content |

## Open Questions

> **Q: Should checked rows continue moving into the basket?** — Default: keep the active/basket
> split and add stable focus plus short local reflow. Reason: completed rows stop competing with
> the remaining shop while the defects—not the underlying model—are repaired. Alternative: keep
> checked rows inline for absolute positional stability, but that is a larger interaction change.

> **Q: How much of an unresolved AH result should remain expanded?** — Default: keep the outcome,
> safety help, Open AH, and at most two unresolved item lines visible; collapse resolved lines and
> overflow. Reason: the facts needed to avoid a duplicate send stay visible while the list begins
> materially higher. Alternative: leave every line expanded for maximum detail at the cost of the
> repeated-shopping task.

## Resume pack

- **Goal:** make `/shopping` spatially stable and less repetitive without replacing the shipped
  Source Ledger or changing Shopping/AH data behavior.
- **Current state:** synthetic UI/UX audit complete at 375 and 1280; seven execution tickets ready;
  overall R2; no application code or household data changed.
- **First command:** `$run`
- **Load first:** `docs/feature-lists/FEATURE_LIST_SHOPPING_INTERACTION_STABILITY.md`
- **First files:** `src/lib/shopping_list_view.ts`,
  `src/lib/components/shopping/list-controller.svelte.ts`,
  `src/lib/components/shopping/ShoppingLists.svelte`.
- **First proof:** reproduce the scrolled 375 px check, filter-pill reorder, and singleton-section
  shift in the isolated fixture before changing code.
- **Pending verification:** every row in the matrix; no real AH push.
- **Defaults if unanswered:** preserve active/basket, use stable local motion, and keep only
  action-relevant unresolved AH lines expanded.

## Execution update — 2026-07-29

The two recommended decisions were accepted: checked rows continue moving into the basket with
local motion, and the latest AH result keeps at most two unresolved product lines expanded.

SIS-01 through SIS-07 are implemented in code. The Shopping projection now derives filter and
group identity from the canonical source registry; focus uses `preventScroll` and reveals only
inside `main.app-main`; in-flight and exiting row keys are locked; row/group directives resolve
to zero duration for reduced motion; empty Weekly is omitted from All while its filter keeps the
one-tap Manage path; repeated source-rule copy is suppressed; the dock owns the contextual AH
action; and unresolved AH detail is capped without adding Retry or changing outcome
classification, fingerprinting, Dutch lookup lineage, or push behavior.

Synthetic reproduction confirmed the original failure class before implementation:

- a checked row could move the outer document by 569 px at 375 px;
- source pills reordered after checking a source’s last active row;
- the current singleton fixture collapsed the following section by about 127 px immediately
  (the audit fixture recorded 106 px).

Passing evidence:

- Shopping projection/controller/push-history focused Vitest: 30 tests;
- `svelte-check`: zero errors and zero warnings;
- primary Shopping pointer/keyboard, reduced-motion, 320/375/768/1280, EN/NL, light/dark,
  double-mutation, undo/failure, and frame-sampled singleton-motion coverage;
- secondary-account Shopping coverage;
- opt-in fake-connected AH fixture, with explicit zero preview/push requests;
- production build against an isolated migrated database.

No real AH request was made and no household content was used or retained. The ignored local
`dev.db` was not migrated or modified.

The Cook Mode gate blocker was a browser-test synchronization defect: two journeys waited for
global `networkidle`, and a trace showed that background traffic could consume 169 seconds before
the first visible assertion. The tests now wait on the rendered Cook interface with bounded
readiness tolerances; no Cook application behavior changed.

Final verification passed:

- `npm test`: 125 unit files / 683 tests, 25 primary browser tests plus one expected opt-in skip,
  Svelte diagnostics, and the production build;
- `npm run test:e2e:secondary`: 25 secondary browser tests plus the same expected opt-in skip;
- opt-in fake-connected AH fixture: two tests, with zero AH preview or push requests;
- `git diff --check` and a privacy-safe secret scan.
