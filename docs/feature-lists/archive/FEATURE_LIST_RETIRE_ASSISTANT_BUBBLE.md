# Retire the Assistant Bubble

_Status: Shipped - 2026-07-25 (main Assistant retained; floating/contextual Assistant retired)_

## Problem Framing

Keukenbrein currently exposes one conversation through two competing journeys: the main Assistant screen at `/` and a draggable launcher that opens a second dialog/panel on every other app screen. The bubble adds persistent visual clutter and forces the app to maintain drag persistence, collision avoidance, responsive dialog behavior, focus restoration, unread state, per-screen context publishing, and a special bound recipe action.

The prior UI and UX audits already identified the duplicate entry points as confusing (`UI-07` and `UX-06` in the archived assistant audits). The user confirmed the retirement boundary during `$grill`: `/` becomes the only chat entry point, and contextual assistant actions outside that screen are removed rather than redirected or retained invisibly.

### Desired outcome

- The main Assistant at `/` remains fully usable with its conversation history, composer, attachments, tool results, confirmation/undo flows, retry behavior, spend cap, and general sentence starters.
- No floating assistant launcher, assistant dialog/panel, contextual chat action, or screen-context publisher remains elsewhere in the app.
- Bubble-only dependencies, state, server request branches, tests, styles, and translations are deleted so the retired path cannot drift or return accidentally.
- The root-owned controller remains because it preserves an in-flight turn or draft across route navigation; only its bubble/context/action responsibilities are removed.

### Grill intake brief

- **Problem and outcome:** the duplicate bubble journey is messy and annoying; one stable main Assistant should remain.
- **Target user and current workaround:** the single household user currently ignores or works around a launcher that competes with the main Assistant navigation destination.
- **Chosen direction:** one Assistant surface at `/`; remove the contextual overlay and its external entry points end to end.
- **Evidence:** current source mounts `ChatAgent.svelte` globally and re-renders `ChatView`; archived runtime audits recorded entry-point competition and bubble collision/motion complexity.
- **Rejected direction:** preserving or redirecting contextual actions would retain a second assistant concept and contradict the selected “main Assistant only” boundary.
- **Blocking decisions:** none.

## Scope

### In

- Remove the global floating launcher and dialog/panel renderer.
- Remove per-route screen-context publishers and all screen-context client/server validation and request injection.
- Remove the recipe ingredient-role “Ask AI” action and its bound chat-action protocol; retain manual role editing.
- Reduce sentence starters to the three general main-Assistant starters.
- Remove bubble/action-only controller state and lifecycle code while preserving main-chat state and behavior.
- Remove bubble-only styling, translations, tests, and the `@neodrag/svelte` dependency.
- Verify representative authenticated routes at phone and desktop widths, with `/` as the sole Assistant entry.

### Out

- Changing the main Assistant’s visual design, model/provider seam, prompts, tools, persistence schema, spend limits, or chat history.
- Adding redirects, replacement contextual buttons, or a new assistant entry point.
- Changing recipe role semantics or the manual recipe editor.
- Database migrations, auth changes, deployment configuration, or destructive household-data operations.

## Existing-System Inventory

| Area | Current responsibility | Retirement treatment |
|---|---|---|
| `src/lib/components/chat/ChatAgent.svelte` | Bubble drag/collision/persistence, dialog rendering, context switch, focus and motion | Delete |
| Root layout and `agent_context.ts` | Own one controller across navigation | Keep controller/provider; stop mounting overlay and publishing route fallbacks |
| Feature routes | Publish inventory, meal-plan, shopping, recipe, and recipe-edit snapshots | Remove publishers/imports |
| Recipe role coverage | Offers manual edit plus a bound contextual AI action | Keep manual edit; remove AI action |
| `chat-agent.svelte.ts` | Core chat plus overlay, lazy hydration, unread, context, and bound-action payloads | Keep core chat; delete overlay/context/action state and branches |
| Chat API | Core model/tool loop plus screen-context and bound-action request variants | Keep core loop; delete retired request variants |
| Prompt starters | General and route-specific starter catalog | Keep only the three general starters |
| `@neodrag/svelte` | Bubble dragging | Remove dependency and lock entry |

## Option Comparison

### Chosen: end-to-end retirement

Delete the second rendered journey and every caller/protocol that exists only for it. This produces one comprehensible Assistant path and removes compounding dead-code and caller drift.

### Rejected: hide only the bubble

This leaves the overlay, state machine, context publishers, bound action, dependency, and server branches unreachable but maintained. It also risks invisible background actions.

### Rejected: redirect contextual actions to `/`

This reduces overlay clutter but preserves multiple Assistant entry concepts and prompt-transfer behavior the user explicitly rejected.

## Phase Plan

1. Remove the second UI journey and every route-level entry/caller.
2. Collapse the shared controller, prompt starters, and server request loop to main-Assistant behavior.
3. Prove the retained Assistant and representative non-Assistant routes, then archive this completed list.

## Execution Tickets

### RETIRE-01 — Make `/` the only Assistant entry point

- **Observable behavior:** authenticated non-home routes render no floating Assistant control or dialog, and recipe role coverage offers only manual editing.
- **Scope in:** root overlay mount, bubble component, app-wide context publishers, recipe bound-action CTA, bubble-only CSS.
- **Scope out:** main Assistant renderer and manual ingredient-role editing.
- **Target files/paths:** `src/routes/+layout.svelte`; `src/lib/components/chat/ChatAgent.svelte`; `src/app.css`; publisher routes under `src/routes/{inventory,meal-plan,shopping,recipes}/`; `src/lib/components/recipe-detail/RoleCoverage.svelte`.
- **Risk tier:** R2.
- **Verification:** repository search finds no rendered launcher/dialog or route-level `publishScreen`/`chatAgent.open` caller; browser checks on `/`, `/inventory`, and one recipe detail at 375 px and 1280 px.
- **Rollback:** revert the retirement commit; no persistent data changes.

### RETIRE-02 — Delete the retired context/action protocols

- **Observable behavior:** the main Assistant still sends ordinary text/photo turns, renders history/tools, and offers three general editable sentence starters; request bodies contain no screen-context or bound-action fields.
- **Scope in:** controller overlay/context/action state; contextual prompt catalog; chat API request and loop branches; screen-context and bound-action modules/tests; related translations; `@neodrag/svelte`.
- **Scope out:** model selection, provider client, core chat tools, history schema, confirmation/undo behavior, image handling, spend caps.
- **Target files/paths:** `src/lib/stores/chat-agent.svelte.ts`; `src/lib/components/ChatView.svelte`; `src/lib/chat/{actions,screen_context,prompt_starters}*`; `src/lib/server/ai/{chat_actions,screen_context}*`; `src/routes/api/chat/+server.ts`; `messages/{en,nl}.json`; `package*.json`.
- **Risk tier:** R2.
- **Verification:** focused controller/prompt-starter tests, full `npm run test:unit`, `npm run check`, and `npm run build`; exhaustive symbol/dependency search.
- **Rollback:** revert the retirement commit; removed protocols had no stored schema or migration.

### RETIRE-03 — Browser closure and lifecycle update

- **Observable behavior:** only `/` exposes chat; its existing transcript, starters, composer, and navigation remain visually usable without overlap at target viewports.
- **Scope in:** safe, read-only browser smoke with existing local fixtures; plan status and archive lifecycle.
- **Scope out:** paid provider calls, live household mutations, deployment.
- **Target files/paths:** rendered `/`, `/inventory`, and a recipe-detail route; this feature list.
- **Risk tier:** R2.
- **Verification:** 375 px and 1280 px browser coverage; no console errors or failed same-origin resources attributable to the change; all repository gates pass.
- **Rollback:** revert the retirement commit if the retained Assistant or navigation regresses.

## Plan Critique

### Failure-mode table

| Failure mode | Trigger | Impact | Detectability | Mitigation | Residual risk |
|---|---|---|---|---|---|
| Main Assistant loses draft, stream, or history state | Controller ownership is moved into the home page while deleting the global bubble | Navigation interrupts the retained experience | Browser navigation smoke and controller tests | Keep the root-owned controller/provider; delete only overlay-specific state | Low |
| A contextual caller survives without a visible renderer | Bubble component is deleted but `open()`, bound sends, or publishers remain | Invisible background spend or confusing dead controls | Exhaustive symbol search, typecheck, browser route walk | Remove callers and protocols in the same change | Low |
| Recipe role completion loses all recovery | Both AI and manual actions are removed | Shopping-list role warnings become a dead end | Recipe-detail browser/source check | Preserve the manual edit link and role editor | Low |
| Partial API cleanup breaks ordinary text/photo chat | Context/action branches are interleaved with the core tool loop | Main Assistant requests fail or tool streaming regresses | Unit suite, typecheck, build; ordinary request-path source review | Restore the loop to unconditional core tools/text handling while leaving image, cap, retry, and tool code intact | Low |
| Contextual starter copy remains as dead localization surface | Only selection logic is simplified | Translation drift and misleading maintenance surface | Key/reference search and i18n compilation | Delete non-general starter keys from both locales and tests | Low |
| Bubble package/style residue remains | Component removal does not include lockfile/tokens | Ongoing dependency and styling debt | Dependency and symbol search | Remove `@neodrag/svelte`, its lock entry, agent z-token, and dialog/timer coordination CSS | Low |

### Steelman

The strongest objection is that a UI-only removal would be safer because it touches fewer shared files. End-to-end retirement is still the correct approach: the hidden context/action branches have no remaining caller under the chosen product boundary, and retaining them would create unreachable server behavior, dependency cost, and an invisible-action risk. Keeping the root-owned core controller sharply limits the blast radius while the full unit/type/build/browser matrix directly covers the shared-code deletion.

### Readiness

- [x] Scope and boundaries are explicit.
- [x] Failure modes and mitigations are documented.
- [x] Verification strategy is defined.
- [x] Rollback is a commit revert with no data migration.
- [x] The only product gate was resolved through `$grill`.

**Recommendation: GO.** No P0/P1 failure mode or high residual risk remains after the mitigations above.

## Risk and Verification Matrix

| Area | Risk | Verification |
|---|---|---|
| Main Assistant state/rendering | R2 shared client state | Controller/prompt tests; `/` browser smoke at 375/1280 |
| Chat request/tool loop | R2 shared server logic | Full unit suite, `svelte-check`, production build, source closure review |
| Non-home UI | R1 rendered-surface deletion within R2 change | `/inventory` and recipe detail at 375/1280; no launcher/dialog |
| Recipe roles | R1 localized journey | Manual edit remains visible and linked correctly |
| Dependency/localization cleanup | R1 build surface | clean install graph/lock reference search; i18n compile through test/check/build |
| UI audit | Applicable | Prior runtime audits confirm duplicate-entry friction; post-change browser verification checks removal and retained layout |
| UX audit | Applicable | Grill selected one entry journey; browser verifies main entry and manual recipe recovery |
| Harden | Not triggered | No security, auth, data integrity, deployment, or legal behavior added; retired privileged branches are deleted |
| Stack discipline | Not triggered | The change removes a dependency and introduces none |
| Context7 | Exception | Internal-only deletion; no external API or version-specific behavior change |
| Stage gate | Not required | R2 only; no schema/auth/destructive R3 work and no wide-sweep migration |

## Rollout and Rollback

This is a code-only beta change with no feature flag or data migration. Ship as one conservative commit after all gates pass. Rollback is a normal revert of that commit; chat history and household data are untouched.

## Open Questions

None. The user selected full retirement: `/` is the only Assistant entry point, including removal of contextual actions elsewhere.

## Completion Evidence

- Removed the floating launcher, overlay, route context publishers, recipe “Ask AI” action, retired client/server protocols, contextual starters, translations, styling, tests, and `@neodrag/svelte` dependency.
- Preserved the root-owned controller and main Assistant behavior at `/`, including history, attachments, tool flows, draft continuity, and three general editable sentence starters.
- Passed `npm run check` with zero diagnostics, all 429 unit tests, and the production build.
- Exhaustive residue searches found no references to the deleted bubble, context, action, or drag paths.
- Authenticated browser checks at 375 px and 1280 px confirmed no overlay or contextual Assistant action, no horizontal overflow, no console errors, a retained manual “Edit roles” path, and a working main Assistant composer with three starters.

## Resume Pack

- **Goal:** make `/` the only Assistant surface and remove the bubble/context/action implementation end to end.
- **Current state:** shipped and verified; `/` is the only Assistant surface.
- **First command:** none; start a new `$plan` for subsequent work.
- **First files:** none.
- **Pending verification:** none.
- **Open questions:** none.
