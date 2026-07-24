# Contextual Chat Prompt Suggestions

_Status: Shipped (2026-07-24)_

_Archived after implementation and verification._

## Problem framing

The chat composer currently repeats the static visual label `Ask the assistant`, while the only
example actions are a fixed freezer pair shown when the conversation is empty. Those examples do
not react to the active page and disappear as soon as chat history exists. The result asks the
user to remember what the assistant can do precisely when page context could make that choice
easier.

The target behavior is:

- the Assistant tab offers general household examples;
- the contextual panel offers examples for the active page or sub-page;
- disabling page context immediately falls back to general examples;
- selecting a short sentence starter fills and focuses the composer so the user can finish it,
  but never sends, spends, or writes by itself;
- the rail can be collapsed and its per-user browser preference is remembered;
- the visible `Ask the assistant` composer label and the old generic `Ask` quick-action group are
  removed without losing the textarea's accessible name.

## Existing-system inventory

- `src/lib/components/ChatView.svelte` owns the static quick chips, the empty-state groups, the
  visual composer label, cap/stream state, and send behavior.
- `ChatAgentController` already exposes reactive `screenContext`, `contextEnabled`, `input`,
  `isStreaming`, and `capExceeded` state. No new store or server contract is needed.
- `src/routes/+layout.svelte` publishes a fallback for every authenticated route. Inventory,
  meal-plan, shopping, recipes, recipe detail, and recipe edit publish richer context.
- `ScreenContextV1.routeId` already distinguishes recipe view/edit and every Settings sub-route.
  The server validates that list and keeps context display-only.
- English and Dutch UI copy is owned by `messages/en.json` and `messages/nl.json`, then compiled by
  Paraglide.
- The current quick-action buttons send immediately. That behavior is deliberately not reused for
  examples because a suggested prompt can lead to a metered model call or a household-data write.

## Scope

### In

- Both `ChatView` mounts: the full Assistant tab and the contextual assistant panel.
- A client-only suggestion policy keyed by `ScreenContextV1.routeId`, `contextEnabled`, and dirty
  recipe-edit state.
- General, inventory, meal-plan, shopping, recipe-list, recipe-detail, recipe-edit, Settings, and
  Settings-subpage prompt sets in English and Dutch.
- An adaptive prompt rail of short sentence starters immediately above the composer whenever the
  composer is empty and the assistant is not streaming.
- Click-to-fill, composer focus, keyboard operation, cap-disabled treatment, long-copy wrapping,
  narrow-screen horizontal containment, and 200% zoom.
- Removal of the visible composer label and old `Ask` quick-action group. Keep the textarea's
  accessible name and keep the root Assistant tab's existing `Open` navigation shortcuts when the
  conversation is empty.
- Pure selection tests plus browser verification at the repository's required viewports.

### Out

- Changes to the LLM system prompt, tools, chat API, chat history, database, or screen-context
  schema.
- Personalized, rotating, ranked, remotely configured, or AI-generated suggestions.
- Automatic memory, telemetry, prompt-click analytics, server-saved prompt preferences, or a new
  dependency. The explicit collapsed/expanded browser preference is in scope.
- Sending a prompt from the suggestion control.
- Changing the recipe page's bound ingredient-classification action.
- Adding live Settings values or secrets to screen context.

## Design shotgun

All three directions remove the visible composer label and use native buttons. They differ in
where examples live and how strongly they compete with conversation history.

| Direction | Visual thesis | Main strength | Main trade-off | Optimizes for |
| --- | --- | --- | --- | --- |
| **A. Adaptive prompt rail — chosen** | A compact, horizontally contained row sits directly above the composer and changes with page context. | Useful in an empty or returning conversation; page changes are reflected where the next message begins. | Permanently uses about one touch-target row above the composer. | Repeated phone use and recognition without losing history. |
| **B. Context starter cards** | Two larger prompt cards occupy the empty conversation state as onboarding content. | Best first-use explanation and easiest long-copy scanning. | Disappears once history exists, which defeats contextual help for a returning user. | First-run discovery. |
| **C. Examples drawer** | A quiet `Examples` control beside the composer opens a popover or phone sheet. | Keeps the chat viewport clean and can hold more examples. | Adds a tap, hides recognition, and creates another overlay/focus path in an already modal mobile panel. | Maximum conversation density. |

### Chosen direction

Use **A. Adaptive prompt rail**.

- Render concise sentence starters in native outline buttons. The button shows an ellipsis, while
  the draft receives the starter plus a trailing space so typing can continue naturally.
- On narrow screens use one contained horizontal row with touch-sized, two-line buttons and a
  partially visible next item; the page itself must never gain horizontal overflow.
- At wider widths allow the same buttons to wrap within the 672 px Assistant column or contextual
  panel.
- Show the rail when `controller.input.trim()` is empty and the assistant is not streaming,
  regardless of whether chat history exists.
- A click copies the full prompt into `controller.input`, scrolls/focuses the textarea, and leaves
  Send as the only action that starts a request.
- An adjacent 44 px control collapses the rail. The collapsed state shows one quiet restore
  control, is shared by both ChatView mounts, and persists per user in local browser storage.
- When `capExceeded` is true, keep the examples visible but disabled in agreement with the
  composer. During streaming, hide the rail so Stop remains the only foreground action.
- When `contextEnabled` is false, use the general set even though a screen snapshot still exists.
- Keep motion optional. If a context change animates, reuse the existing micro duration and honor
  reduced motion.

The strongest objection is the lost vertical space in long conversations. The rail is still the
right choice because a single contained row is materially smaller than the current two-group
empty-state area, remains useful after history exists, and removes a separate label. The drawer
recovers a little space but makes examples harder to discover and adds an overlay/focus lifecycle
that the current assistant does not need.

## Prompt policy

Copy should be short enough for a two-line chip, describe a capability the current assistant or
visible Settings page actually supports, and never imply that unsaved recipe edits are visible to
the model. Dutch copy should be natural Dutch, not a word-for-word translation.

| Context | English examples |
| --- | --- |
| Assistant tab, disabled context, or unknown route | `Help me cook with` · `Plan three dinners using` · `Add these to my shopping list:` |
| Stock | `Help me use up` · `Suggest a meal using` · `Restock this freezer staple:` |
| Meal plan | `Fill the open days with` · `Use more of my stock by planning` · `Swap a planned meal for` |
| Shopping | `Check whether I still need` · `Regenerate this list for the week of` · `Remove items already covered by` |
| Recipes list | `Find a saved recipe with` · `Show recipes that use` · `Find a freezer-friendly recipe for` |
| Recipe detail | `Scale this recipe for` · `Suggest an alternative for` · `Set this ingredient to serve fresh:` |
| Recipe edit, saved state | `Check this saved recipe for` · `Rewrite this cooking step:` · `Improve this recipe by` |
| Recipe edit, dirty state | `Before I save, explain` · `Help me decide whether this ingredient is` · `Show me how to write` |
| Settings overview | `Show me where to change` · `Help me connect` · `Before I export my data, explain` |
| Account / Display | Account: password, household users, sign-out. Display: language and theme. |
| AI / Advanced | Chat/background/vision model roles, daily limits, reply routing, reasoning, and temperature. |
| Connections / Data | AH connection and reconnection; export, import, and reset consequences. Suggestions remain explanatory and never perform a destructive action. |
| Meal-plan / Recipe settings | Week start, planning window, suggestion count, delivery day; recipe language, auto-translation, default sort, and normalization. |

The implementation may shorten individual strings after phone rendering, but it must preserve each
row's intent and must not replace page-specific sets with one generic section-level set.

## Phase plan

### Phase 1 — Define the client-only prompt contract — complete

Create one pure selection seam that returns stable prompt IDs for the current route and safe state.
Keep localization and rendering outside the server screen-context contract.

### Phase 2 — Replace the static Ask chrome — complete

Render the selected direction in `ChatView`, remove the old Ask group and visible composer label,
preserve the accessible textarea name, and wire click-to-fill without invoking `send`.

### Phase 3 — Prove route, locale, and responsive behavior — complete

Cover every registered route, context disable/enable, dirty edit state, history, cap, stream,
keyboard/focus, long Dutch copy, phone/wide layouts, and the repository's three standard commands.

## Execution tickets

### CCP-1 — Select prompt IDs from existing screen context

- **Observable behavior:** `/` and disabled/unknown context return the general set; every supported
  route returns the intended page/sub-page set; dirty recipe edit returns the draft-safe set.
- **Scope in:** a pure client helper and exhaustive route/state unit tests.
- **Scope out:** UI rendering, server schemas, prompt generation, persistence, and user profiling.
- **Target paths:** add `src/lib/chat/prompt_starters.ts` and
  `src/lib/chat/prompt_starters.test.ts`; consume existing
  `src/lib/chat/screen_context.ts`.
- **Risk:** R2 — one shared policy drives both chat surfaces.
- **Verification:** table-driven tests for every route in the server allow-list, no-context,
  disabled-context, clean edit, dirty edit, and an unexpected route cast used only as a defensive
  client fallback.
- **Rollback:** remove the helper; existing chat state and server contract are unchanged.
- **Effort / confidence:** S / high.

### CCP-2 — Localize and render the adaptive prompt rail

- **Observable behavior:** the visible `Ask the assistant` label and old Ask group are gone; general
  prompts appear on the Assistant tab; contextual prompts appear in the panel; tapping one fills
  and focuses the composer without a request.
- **Scope in:** prompt copy in both locales, the prompt-ID-to-copy map, responsive rail, accessible
  button names, disabled/stream/input state, root-only preservation of the existing Open shortcuts,
  and deletion of obsolete Ask-group code/copy.
- **Scope out:** changing navigation shortcuts, sending on selection, API/model work, or new motion
  primitives.
- **Target paths:** `src/lib/components/ChatView.svelte`, `messages/en.json`,
  `messages/nl.json`, and generated Paraglide output through the existing compile command.
- **Risk:** R2 — shared composer behavior and a high-frequency phone surface.
- **Verification:** component/source assertions that suggestion handlers never call
  `controller.send`; keyboard activation; focus lands in the filled textarea; no duplicate Ask
  group; accessible textarea name remains; cap disables examples; streaming/input states suppress
  the rail.
- **Rollback:** restore the current static quick-action block and visual label; no persisted data
  needs conversion.
- **Effort / confidence:** M / high.

### CCP-3 — Run the responsive and regression gate

- **Observable behavior:** prompts match the current route in English and Dutch without covering
  chat, composer, navigation, or panel controls.
- **Scope in:** deterministic browser stories with no chat sends, plus the repository's standard
  checks.
- **Scope out:** provider calls, AH actions, household-data writes, and physical-device testing.
- **Target paths:** focused tests beside the helper/component and evidence under ignored `output/`
  only when `/run` needs screenshots.
- **Risk:** R1 — verification and any test-only fixtures.
- **Verification:** 375, 768, and 1280 px for Assistant general, Stock, Shopping, recipe detail,
  dirty recipe edit, Settings/AI, context disabled, returning history, cap reached, and long Dutch
  copy; keyboard tab order and 200% zoom; then `npm run check`, `npm run test:unit`, and
  `npm run build`.
- **Rollback:** remove test-only fixtures/evidence; production behavior is owned by CCP-2.
- **Effort / confidence:** S / high.

## Risk tier and verification matrix

Overall risk is **R2**: there is no schema, auth, secret, or destructive-data change, but the shared
composer and route-context behavior affect every authenticated page. Beta staging is not required.

| Boundary | Required proof |
| --- | --- |
| Selection | Every allowed route maps deterministically; disabled/unknown context is general; dirty edit is draft-safe. |
| No side effect | Prompt selection changes only `controller.input`; intercepted request count stays zero until Send. |
| Context lifecycle | Route changes and context enable/disable update suggestions without stale page copy. |
| Accessibility | Native buttons, visible focus, textarea accessible name, logical tab order, and no focus trap or forced send. |
| Responsive UI | 375/768/1280 px, 200% zoom, no page-level horizontal overflow, long EN/NL prompts remain readable. |
| Assistant states | Empty/returning history, non-empty draft, streaming, cap reached, panel and full-page mounts. |
| Localization | Matching English and natural Dutch intent; no raw message IDs or mixed-language prompt set. |
| Repository | `npm run check`, `npm run test:unit`, `npm run build`. |
| UI audit | Authenticated post-change evidence captured in English and Dutch at 375, 768, and 1280 px, plus returning history, cap, dirty edit, keyboard collapse, and an effective 200% layout. |
| UX audit | Adaptive rail selected because it supports recognition in returning conversations; click-to-fill preserves user control before metered or mutating work. |

## Implementation outcome

- `ChatView` now keeps only the empty Assistant tab's direct `Open` shortcuts; the old generic
  `Ask` group is gone.
- The visible composer label is removed while its localized screen-reader label remains.
- `prompt_starters.ts` selects stable localized starter IDs from route context, context-enabled
  state, and dirty recipe-edit state. Unknown or disabled context falls back to the general set.
- Selecting a starter writes the starter plus a trailing space, resizes and focuses the textarea,
  leaves the caret at the end, and does not call `fetch` or create a chat message.
- The rail remains above an empty composer with or without history, hides while typing or
  streaming, respects the daily cap, and can be collapsed with a keyboard-accessible 44 px
  control. The per-user collapse preference is shared across both chat mounts and stored locally.
- Verification passed: `npm run check`, all 449 unit tests, and `npm run build`. Authenticated
  English/Dutch browser stories passed at 375, 768, and 1280 px with no page-level overflow.

## Failure-mode critique

| Failure mode | Trigger | Impact | Detectability | Mitigation | Residual risk |
| --- | --- | --- | --- | --- | --- |
| A prompt click starts a turn | Reusing the current AI-chip `send` handler | Unexpected spend or household write | High with request interception | Dedicated fill handler; assert zero requests until Send | Low |
| Suggestions describe the previous page | Route publisher cleanup/effect ordering | User asks about the wrong object | Browser-visible and unit-testable | Derive from reactive controller context; test rapid route changes and fallback precedence | Low |
| Dirty recipe prompt implies draft visibility | Edit form has unsaved changes | Assistant reasons from the saved recipe and misleads the user | Moderate | Separate dirty-safe set that asks for guidance, not draft review | Low |
| Context is disabled but prompts remain specific | `contextEnabled` is ignored | UI promises context the request will not receive | High | Make enabled state the first selection gate | Low |
| Long Dutch prompts crowd the composer | Translation or zoom expands labels | Composer/Send becomes obscured | High at target viewports | Contained scroller/two-line chips, touch-size floor, no page overflow | Low |
| Prompt rail fights an active draft or reply | Suggestions remain while typing/streaming | Competing actions and reduced reading space | High | Suppress for non-empty input and streaming; disable at cap | Low |
| Removing the label removes the input name | Visual label deletion is literal | Screen-reader users lose orientation | Automated/source-visible | Keep a screen-reader label or `aria-label` with localized copy | Low |
| Settings suggestions overpromise live knowledge | Copy asks about secrets/current values not in context | Hallucinated support answer | Copy-review visible | Ask about visible feature meaning and navigation only; never imply secret/value access | Medium |

## Rollout and rollback

This is a code-only beta change. Ship the selector and UI together so no caller can observe an
unfinished prompt ID. The old Ask-group code and obsolete copy should be deleted in the same change
to avoid two competing sources of examples.

Rollback is a normal code revert: restore the static quick actions and composer label. There is no
data migration, persisted prompt state, server contract change, or deployment-order constraint.

## Resolved decisions

- Adaptive prompt rail selected and implemented.
- Suggestions are short sentence starters, not complete questions.
- Selecting a starter fills and focuses the composer but never sends.
- The rail has a persistent per-user collapse control.
- Dirty recipe-edit starters give general guidance and never imply access to unsaved fields.
