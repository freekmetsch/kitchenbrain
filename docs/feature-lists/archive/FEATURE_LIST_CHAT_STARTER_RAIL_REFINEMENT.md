# Chat Starter Rail Refinement

_Status: Shipped - 2026-07-25 (removed root shortcuts and shipped the Reading list)_

## Implementation result

- Removed the Assistant tab's `Open`, `Shopping list`, and `Meal plan` shortcut path, including
  its dead helper, types, imports, and five obsolete English/Dutch message keys.
- Replaced the horizontal primary-outline rail with three full-width neutral rows, a visible
  `Try starting with` / `Begin met` header, and explicit quiet `Hide` / `Show starters` actions.
- Kept the existing controller, prompt policy, per-user storage key, cap/stream/input authority,
  context fallback, dirty-recipe guidance, and fill/focus/caret behavior unchanged.
- Verified both mounts and locales at 375, 768, and 1280 px, the exact 480 px desktop panel,
  returning history, an effective 200% layout, text-spacing wraps, keyboard focus, persistence,
  context toggling, dirty edit, cap, streaming, and zero requests on starter selection.
- Repository gate: zero Svelte diagnostics, 73 test files / 460 tests passed, and production build
  succeeded.

Artifacts:

- [Approved design comparison](../../artifacts/archive/2026-07-25-design-shotgun-chat-starter-rail.html)
- [Execution plan workspace](../../artifacts/archive/2026-07-25-plan-chat-starter-rail-refinement.html)

## Problem framing

The shipped contextual prompt feature solved the assistant's recognition problem, but its current
presentation is uncomfortable in the two places where it matters most:

- the empty Assistant tab stacks `Open`, `Shopping list`, and `Meal plan` navigation shortcuts
  above a second row of orange prompt buttons;
- the prompt rail has 299 px for 576 px of content at 375 px, and 402 px for 672 px in the
  480 px contextual panel;
- the detached chevron does not explain whether it hides, scrolls, or moves the rail;
- the collapsed state remains a raised 44 px grey button, so hiding the prompts does not fully
  quiet the composer area.

The approved product decision is **Direction B — Reading list**. Remove the root-only navigation
shortcut row. Present all three sentence starters as full-width, borderless writing cues with no
horizontal scrolling. Keep explicit `Hide` and `Show starters` controls, the existing shared
preference, and every safe prompt-selection invariant.

The strongest cost is vertical space in returning conversations. That trade-off is accepted:
all three starters remain immediately readable, and users who value conversation height can use
the explicit persistent collapse control.

## Success criteria

- The Assistant tab never renders the `Open`, `Shopping list`, or `Meal plan` shortcut row.
- The Assistant tab still offers the general starter set; the contextual panel still uses the
  active page or sub-page set.
- Expanded starters render as one full-width native button per row, with no clipped meaning and
  no horizontal scrolling.
- A quiet section header reads `Try starting with` / `Begin met` and includes an explicit
  borderless `Hide` / `Verbergen` action.
- The collapsed state renders a compact borderless `Show starters` / `Zinsopeners tonen` action,
  not a raised grey control.
- Selecting any starter fills the composer, places the caret at the end, and focuses it without a
  request, model spend, message, or household-data write.
- The same collapsed preference continues to apply to both `ChatView` mounts and survives reload.
- Existing state authority remains unchanged: a non-empty draft or stream hides the list; the
  daily cap disables it; disabling context or using an unknown route falls back to general
  starters; dirty recipe edits use draft-safe guidance.
- English and Dutch pass at 375, 768, and 1280 px, in the 480 px contextual panel, and at an
  effective 200% layout without page-level overflow.

## Existing-system inventory

- `src/lib/components/ChatView.svelte`
  - derives localized starters from `promptStarterIds` and `promptStarterText`;
  - owns the root-only `NAVIGATION_CHIPS`, `openScreen`, and quick-action markup;
  - owns expanded/collapsed starter markup and the composer focus handoff;
  - is mounted by both the full Assistant tab and `src/lib/components/chat/ChatAgent.svelte`.
- `src/lib/stores/chat-agent.svelte.ts`
  - owns the per-user local-storage preference;
  - owns `applyPromptStarter`, cap state, streaming state, input, screen context, and context enablement.
- `src/lib/chat/prompt_starters.ts`
  - owns the pure route/state selection policy and localized starter text lookup;
  - already returns exactly three starters for every supported context.
- `src/lib/chat/prompt_starters.test.ts`
  - covers every registered route, disabled/unknown fallback, clean/dirty recipe edit, and
    incomplete sentence-starter copy.
- `src/lib/stores/chat-agent.test.ts`
  - proves preference persistence and that applying a starter creates an editable draft without
    calling `fetch`.
- `src/lib/components/chat/ChatAgent.svelte`
  - fixes the desktop panel at `min(30rem, calc(100vw - 2rem))`, giving the relevant 480 px
    contextual width;
  - becomes a full-screen panel below 52 rem.
- `messages/en.json` and `messages/nl.json`
  - contain the obsolete quick-action labels and current starter disclosure labels;
  - compile into `src/lib/paraglide/` through the existing `i18n:compile` step.
- `src/app.css`
  - already provides the required base surfaces, separators, content colors, primary focus color,
    and dark-theme equivalents; no new design token is needed.

## Scope

### In

- Remove the root empty-state shortcut markup, dead navigation helper/type/derived state, and
  obsolete localized copy.
- Replace the horizontal outline rail with the approved full-width Reading list in the shared
  `ChatView`.
- Add localized visible section/disclosure copy while keeping descriptive accessible names.
- Preserve native button semantics, 44 px minimum row height, wrapping long copy, visible focus,
  cap disabled state, and current focus/caret behavior.
- Re-run existing selector/controller tests and add only focused coverage needed for newly
  extracted or changed pure behavior.
- Capture authenticated browser evidence for both mounts, both locales, priority viewports, and
  the risky state transitions.

### Out

- Prompt wording, prompt count, prompt ordering, route mapping, or screen-context schema changes.
- Chat API, LLM system prompt, model, provider, history, server, database, or auth changes.
- Automatic collapse based on history, height, viewport, or first-use state.
- A new component library, test framework, runtime dependency, analytics event, or server-saved
  preference.
- Replacing the chosen Reading list with the prior Quiet shelf recommendation.
- Changing attachment, composer, send, stop, retry, context-toggle, or assistant-launcher behavior.
- Production deployment in the planning workflow. Execution and delivery belong to `$run`.

## Option comparison

| Direction | Strength | Trade-off | Plan decision |
| --- | --- | --- | --- |
| Quiet shelf | Two starters are immediately comparable in about one compact row. | Retains horizontal scrolling and partially hidden content. | Rejected after user review. |
| Reading list | All three starters stay fully readable with no horizontal scrolling. | Uses about twice the conversation height. | **Selected.** |
| Starter deck | Shows one complete prompt in the smallest footprint. | Hides two alternatives behind `Next`. | Rejected because recognition and comparison weaken. |

## Chosen approach

### Information hierarchy

The root empty state becomes:

1. greeting and assistant hint;
2. Reading list;
3. composer;
4. primary app navigation.

The contextual panel remains:

1. Assistant panel header;
2. page-context status and toggle;
3. greeting or conversation;
4. Reading list;
5. composer.

There is no peer navigation-action group between the greeting and examples.

### Expanded Reading list

- Keep the existing group name (`Sentence starters` / `Zinsopeners`).
- Add a quiet header row:
  - visible section label: `Try starting with` / `Begin met`;
  - visible action: `Hide` / `Verbergen`;
  - descriptive accessible action name remains `Hide sentence starters` /
    `Zinsopeners verbergen`.
- Render the three starters in one `divide-y` list.
- Each row is a native `button` with:
  - full available width;
  - at least 44 px height;
  - left-aligned, normal-wrapping text;
  - neutral base-content and surface treatment;
  - no primary outline, filled primary hover, card chrome, trailing plus, or navigation icon;
  - the existing visual ellipsis after the incomplete text, excluded from the accessible name.
- Allow rows to grow for long Dutch copy and text-spacing overrides. Do not truncate or cap the
  list height.
- Keep the list above the composer in the normal flex layout so the message viewport, not the page,
  owns vertical scrolling.

### Collapsed treatment

- Reuse `controller.promptStartersCollapsed` and its existing local-storage key unchanged.
- Render one compact, right-aligned, borderless `Show starters` / `Zinsopeners tonen` control.
- Keep a usable pointer target and visible keyboard focus while removing the raised grey surface.
- Do not auto-collapse for history, viewport height, or locale. Automatic behavior would conflict
  with the approved persistent user choice and create a second hidden state model.

### Safe behavior seam

- Keep `usePromptStarter` and `controller.applyPromptStarter` unchanged unless a test exposes a
  genuine defect.
- Keep the existing `!input.trim() && !isStreaming` visibility condition.
- Keep `disabled={capExceeded}` on every starter row.
- Keep prompt derivation from reactive `screenContext` and `contextEnabled`.
- Keep dirty recipe-edit prompts within the existing pure selection policy.

### Dead-path deletion

Remove in the same implementation:

- the root-only quick-action markup;
- `isAssistantTab`;
- `NavigationChip`, `NAVIGATION_CHIPS`, and `openScreen`;
- the now-unused `$app/navigation` and `IconName` imports;
- obsolete English/Dutch keys:
  - `chat_quick_actions_label`;
  - `chat_quick_open_group`;
  - `chat_quick_open_label`;
  - `chat_chip_shopping_list`;
  - `chat_chip_meal_plan`.

Retain `$app/paths` `base`; `ChatView` still needs it for tool-entity destination links.

## Phase plan

### Phase 1 — Remove the obsolete root shortcut path

Delete the Assistant-tab-only shortcut UI, navigation helper, dead types/state, and localized copy.
Compile localization and prove no sibling caller remains before moving on.

### Phase 2 — Apply the shared Reading list

Replace both expanded and collapsed rail presentations inside `ChatView` while preserving the
existing controller, prompt policy, and input-state conditions.

### Phase 3 — Run the state and responsive gate

Exercise both mounts in English and Dutch, including returning history and effective 200% layout,
then run the repository's complete secret-free verification commands.

## Execution tickets

### CSR-1 — Remove root empty-state navigation shortcuts

- **Observable behavior:** the empty Assistant tab moves directly from its greeting to sentence
  starters; `Open`, `Shopping list`, and `Meal plan` no longer appear there. Other app navigation
  and tool-result destination links continue to work.
- **Scope in:** delete the quick-action markup, helper, type, derived state, obsolete imports, and
  five unused English/Dutch message keys; recompile Paraglide output.
- **Scope out:** starter rendering, bottom navigation, tool-result links, route context, and
  composer behavior.
- **Target files:** `src/lib/components/ChatView.svelte`, `messages/en.json`, `messages/nl.json`,
  and mechanically generated `src/lib/paraglide/` output.
- **Risk tier:** R1 — localized UI deletion in one component.
- **Dependencies:** none.
- **Verification:**
  - repository search finds no obsolete key, `NAVIGATION_CHIPS`, `NavigationChip`, or `openScreen`;
  - `base` remains imported and tool-result destination links still resolve;
  - English and Dutch empty Assistant tab show no shortcut row at 375 and 1280 px;
  - `npm run check`.
- **Rollback:** restore the deleted block, helper, imports, and message keys together. No persisted
  data changes.
- **Effort / confidence:** S / high.

### CSR-2 — Render the approved Reading list and quiet disclosure

- **Observable behavior:** three full-width starter rows are readable without horizontal
  scrolling; the expanded header shows `Try starting with` plus `Hide`; the collapsed state shows
  a quiet `Show starters` action.
- **Scope in:** replace expanded/collapsed markup and classes; add visible localized header and
  short disclosure copy; retain descriptive accessible names; preserve cap/input/stream/context
  conditions and fill/focus behavior.
- **Scope out:** starter selection policy, prompt wording/order/count, local-storage key, API,
  server, and composer implementation.
- **Target files:** `src/lib/components/ChatView.svelte`, `messages/en.json`, `messages/nl.json`,
  generated Paraglide output, and existing focused chat tests only if a pure behavior assertion
  must change.
- **Risk tier:** R2 — one high-frequency shared component serves every authenticated route.
- **Dependencies:** CSR-1.
- **Verification:**
  - `src/lib/chat/prompt_starters.test.ts` still covers all routes and dirty-edit safety;
  - `src/lib/stores/chat-agent.test.ts` still proves shared persistence and zero requests;
  - keyboard activation fills, focuses, and leaves the caret at the end;
  - intercepted browser requests remain zero after selecting a starter;
  - cap disables all rows; non-empty input and streaming suppress the list;
  - context disable/enable swaps between general and page-specific sets without stale copy;
  - rows wrap long English/Dutch content without clipping or horizontal overflow.
- **Rollback:** restore the current rail markup while retaining the unchanged controller,
  selection policy, and compatible local-storage value.
- **Effort / confidence:** M / high.

### CSR-3 — Run the authenticated responsive and regression gate

- **Observable behavior:** the selected Reading list remains usable in both chat mounts and all
  authoritative assistant states, with no shortcut regression and no model or household-data write.
- **Scope in:** deterministic browser stories, targeted source checks, complete unit suite,
  Svelte diagnostics, and production build.
- **Scope out:** provider calls, AH actions, real household writes, physical-device testing, and
  deployment.
- **Target paths:** existing tests beside chat state/selection; ignored browser evidence under
  `output/` only if `$run` needs durable screenshots.
- **Risk tier:** R1 — verification and test-only evidence.
- **Dependencies:** CSR-1 and CSR-2.
- **Verification:**
  - widths: 375, 768, and 1280 px, plus the 480 px desktop panel and an effective 200% layout;
  - locales: English and Dutch, including the longest available strings;
  - surfaces: Assistant tab and contextual panel;
  - states: empty, returning history, expanded, collapsed, reload persistence, context disabled,
    dirty recipe edit, cap reached, non-empty draft, and streaming;
  - input: pointer, keyboard, visible focus, caret position, and no request on starter selection;
  - geometry: no page-level horizontal overflow, composer remains reachable, message list retains
    its own vertical scroll, and the latest message remains recoverable;
  - commands: `npm run check`, `npm run test:unit`, and `npm run build`.
- **Rollback:** remove test-only fixtures/evidence; production rollback remains the CSR-2 code revert.
- **Effort / confidence:** S / high.

## Risk tier and delivery

Overall risk is **R2**. The shared composer presentation changes on every authenticated route, but
there is no schema, auth, secret, provider, API, data migration, or destructive operation.

The repository is in beta. The app-stage delivery reference requires no staging gate for this
code-only R2 change. `$run` may ship it through the ordinary route after all verification passes.

## UI and UX audit findings

| Audit | Priority | Finding | Plan response |
| --- | --- | --- | --- |
| UI | P2 | At 375 px, 299 px of visible rail contains 576 px of prompt content; the second action is cut off and primary orange makes the rail visually dominant. | Direction B removes horizontal scrolling, primary outlines, and fixed-width cards. |
| UI | P2 | In the 480 px contextual panel, 402 px contains 672 px; detached collapse chrome visually merges with clipped actions. | Full-width rows and an explicit header action separate content from disclosure. |
| UI | P2 watch | Three rows may squeeze returning history or low-height/200% layouts. | Keep the message list as the flex scroller, preserve manual collapse, and make low-height returning history part of CSR-3. |
| UX | P2 | Root-only navigation shortcuts and prompt actions compete as equal-weight next steps. | Remove the shortcut group so the empty journey becomes greeting → starters → composer. |
| UX | P2 watch | Automatic compaction would make the rail's state unpredictable between empty and returning conversations. | Reuse one explicit shared preference; do not auto-collapse. |
| UX | Pass | Starter selection already fills, focuses, preserves user control, and produces zero requests. | Preserve the existing controller seam and regression-test it. |

## Verification matrix

| Boundary | Required proof |
| --- | --- |
| Dead-path deletion | No quick-action markup, helper, type, imports, or EN/NL message keys remain; `base` tool links still work. |
| Selection policy | Every registered route remains deterministic; disabled/unknown context is general; dirty edit remains draft-safe. |
| No side effect | Selection changes only the editable draft, focus, caret, and textarea height; request count and message count remain zero. |
| Disclosure persistence | Expanded/collapsed preference is shared across full tab and panel, survives reload, and uses the existing per-user key. |
| State authority | Cap disables rows; input/stream hide them; context toggling updates the set immediately. |
| Accessibility | Native buttons, descriptive group/action names, logical tab order, visible unobscured focus, usable pointer targets, and no icon-only ambiguity. |
| Responsive UI | 375/768/1280 px, 480 px panel, effective 200%, long EN/NL text, no page overflow, composer reachable. |
| Returning history | Three-row list does not cover content; message list scroll and jump-to-latest behavior still recover the newest turn. |
| Localization | New visible labels are natural English/Dutch; removed keys have no remaining callers or raw IDs. |
| Repository | `npm run check`, `npm run test:unit`, `npm run build`. |

## Failure-mode critique

| Failure mode | Trigger | Impact | Detectability | Mitigation | Residual risk |
| --- | --- | --- | --- | --- | --- |
| Reading list leaves too little conversation height | Returning history, short viewport, or 200% effective layout | Recent messages feel crowded or difficult to recover | High in browser geometry and scroll checks | Preserve the message list as the only flex scroller; test returning history at 375 and 200%; keep explicit persistent collapse | Medium-low |
| Long Dutch text clips or silently truncates | Translation wraps beyond one line or text spacing increases | Starter meaning is hidden | High at Dutch/zoom browser gate | Use normal wrapping, growing rows, no line clamp, no fixed list height | Low |
| Quiet disclosure becomes too small to use | Styling removes button chrome and its hit area | Hide/show becomes frustrating on touch or keyboard | High with bounding-box and focus inspection | Retain a usable target, native button semantics, and visible focus while removing only the raised surface | Low |
| Row styling implies send or add | Trailing plus/arrow or primary fill resembles a direct action | User expects an immediate request or write | High in visual review | Use text-only neutral rows with the existing ellipsis; no plus, send arrow, or primary card treatment | Low |
| Prompt selection starts a request | New row handler bypasses the existing fill seam | Unexpected spend or household mutation | High with request interception and message count | Reuse `usePromptStarter`/`applyPromptStarter`; keep zero-request unit and browser checks | Low |
| Cap or stream authority regresses | Disabled/visibility conditions move during markup rewrite | Users can invoke unavailable work or see competing actions | High with state fixtures | Keep the existing outer condition and row `disabled`; verify cap, stream, and non-empty draft | Low |
| Context copy becomes stale | List markup captures rather than derives starter values | User composes against the previous screen | High during route/context-toggle story | Keep the existing reactive derived array and keyed starter loop | Low |
| Shared preference forks between mounts | A new component-local disclosure state is introduced | Assistant tab and panel disagree | High with cross-mount reload story | Reuse controller state and storage key; add no local duplicate | Low |
| Dead imports or copy remain | Shortcut markup is deleted without callers/catalog cleanup | Build warnings and future confusion compound | High with search and compile | Delete helper/type/imports/message keys in CSR-1 and run compile/check before CSR-2 | Low |
| `base` is removed with navigation cleanup | `$app/paths` import is mistaken for shortcut-only code | Tool-result destination links break | Medium in non-empty tool-result story | Retain `base`; explicitly smoke one tool entity link | Low |

## Plan critique

**Recommendation: GO.** No P0/P1 blocker remains. Ticket boundaries map to one observable
behavior each, rollback is a normal code revert, and all compounding dead-path cleanup is pulled
into CSR-1 rather than deferred.

**Steelman:** The strongest objection to Reading list is that three full-width rows permanently
consume more conversation height than the Quiet shelf, especially after history exists. It is
still the right approved direction because the user explicitly prioritized complete readability,
removing the shortcut row recovers part of the height, the list appears only for an empty draft
and never during streaming, and the explicit shared collapse preference gives repeated users a
stable way to reclaim space. The plan treats low-height returning history as a release gate rather
than assuming the mockup settles it.

## Rollout and rollback

### Rollout

1. Execute CSR-1 and prove the quick-action path is fully deleted.
2. Execute CSR-2 on the same shared `ChatView` seam without touching controller persistence or
   selection policy.
3. Run CSR-3 with no provider calls or household-data writes.
4. Ship through the ordinary beta code path only after all three repository commands and browser
   stories pass.

### Rollback

- Revert the `ChatView` and localized-copy change together.
- The existing local-storage boolean remains compatible with both presentations; no cleanup or
  migration is required.
- No database, server, API, prompt, or household data is changed.

## Resolved decisions

> **Decision: Do not automatically collapse when conversation history exists.** Reason:
> automatic collapse contradicts the approved recognition goal, forks the
> existing explicit preference model, and makes the same empty composer behave unpredictably.

> **Decision: Do not show a trailing plus or arrow.** Reason: either symbol
> can imply add, send, or navigation; the incomplete-text ellipsis already communicates that the
> user will finish the draft.

## Completion record

- **Goal:** remove the Assistant tab's root shortcut row and ship the approved full-width Reading
  list with quiet explicit disclosure.
- **Final state:** all three tickets shipped and verified.
- **Changed production files:** `src/lib/components/ChatView.svelte`, `messages/en.json`, and
  `messages/nl.json`.
- **Verification:** `npm run check`, `npm run test:unit`, `npm run build`, plus isolated
  authenticated browser stories with no provider or real household-data calls.
- **Rollback:** revert the component and localized-copy commit together; no storage migration,
  database rollback, or server cleanup is required.

## Decision record

- Selected direction: **Direction B — Reading list**.
- Prior recommendation: Direction A — Quiet shelf.
- User override accepted because complete readability and no horizontal scrolling are product
  preferences, not architecture risks.
- User-provided implementation notes: none.
