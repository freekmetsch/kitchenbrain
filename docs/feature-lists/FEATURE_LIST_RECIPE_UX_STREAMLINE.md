# Feature List: Recipe UX Streamline
_Status: Plan ready - 2026-07-20 (awaiting /run)_

## Problem framing

The home assistant is the only main screen that expands to the full desktop viewport; the established page width is `max-w-2xl` (672 px). The bottom navigation also uses placeholder-like short labels (`Home`, `List`, `More`) instead of the destinations Freek expects.

The recipe detail overflow currently mixes ordinary editing, duplicate entry points, display preferences, AI maintenance, media actions, a conditional external link, and destructive actions in one flat list. The result is seven visible items in the common translated-recipe state and as many as ten when photo, source, and cooking progress are present. Several items have a better owner elsewhere:

- `Ingredient roles` opens the exact same editor at the exact same position as `Edit recipe`.
- `Add photo` duplicates the full-width photo affordance.
- `Ask AI` duplicates the global assistant, which already opens with the current recipe context.
- `Rebuild cooking view` immediately starts a metered AI request; a healthy recipe should not expose maintenance as an everyday command.
- `Re-translate to EN` duplicates the translation retry/status path.
- `Open source` is provenance, not an action on the recipe.
- `View in Dutch` uses a globe even though it changes this recipe's content language, not the app locale or a website.

The recipe editor then compresses each ingredient into an unlabeled three-column row on mobile, renders an alternatives disclosure for every ingredient, uses a vertical stack of 32 px direction controls, and keeps a disabled `Saved` bar above the bottom navigation. The freezer target card exposes a permanent toggle and network-backed stepper in the cooking surface even though the target is rarely changed. On desktop, both cards stretch controls to opposite ends of the viewport.

The desired outcome is one obvious path per task, a recipe editor that remains a single page but is readable at 375 px, and compact recipe-detail controls that reveal maintenance only when it is relevant.

## Intent brief

- Center the home assistant at the same 672 px desktop width as the app's other standard screens while keeping it full-width on mobile.
- Rename the bottom destinations to `Assistance`, `Groceries`, and `Settings`, with natural Dutch equivalents.
- Reduce the recipe overflow to genuinely secondary, conditional actions.
- Restore a direct recipe-edit action and keep ingredient-role editing inside that editor.
- Replace the ambiguous globe action with an explicit recipe-language control.
- Move recipe provenance to the recipe content instead of the action menu.
- Redesign the editor for mobile readability without adding a wizard or changing the save/data model.
- Turn freezer target configuration into progressive disclosure with one deliberate save.

## Docs-aware grill outcome

The repository history answers the apparent product ambiguity:

- The shipped full-app UI plan required direct editing, persistent field labels, role controls, draft recovery, and a clear distinction between manual and AI editing (`docs/archive/2026-07/FEATURE_LIST_UI_FULL_APP.md`, UI-7).
- The 2026-07-19 recipe overhaul then moved Edit, photo, and completed roles into the overflow menu and replaced visible ingredient labels with placeholders (`9b490f7`). That compression reintroduced the exact discoverability and form-density problem the earlier plan intended to remove.
- The contextual-agent plan established the global assistant as the one recipe-aware AI surface. The current recipe page publishes recipe identity and facts to that controller, so the recipe-specific `Ask AI` item is not a required capability.

The earlier UX intent remains the better authority; the recent compression is the regression to correct. No glossary or ADR is warranted because this work does not introduce a new domain term or a hard-to-reverse architecture decision.

## Existing-system inventory

### Width and navigation

- `src/app.css:138-140` defines the standard centered `ui-page-shell` at `max-w-2xl`.
- `src/routes/+page.svelte:57,77` mounts the home chat in a full-width flex column with no width constraint.
- Browser evidence at 1280 and 1536 px shows `#home-chat` matching the entire viewport width; the Recipes list is 672 px at 1280 px.
- `src/lib/components/NavBar.svelte:22-27` owns all six bottom destinations.
- `messages/en.json:3,777-778` and `messages/nl.json:3,777-778` own the labels.

### Recipe action ownership

| Current option | Actual behavior | Decision and new owner |
|---|---|---|
| Edit recipe | Navigates to `/recipes/[slug]/edit`, with an active-timer guard. | Promote to a direct header action. Preserve the timer guard. |
| Ingredient roles · n/n | Calls the same `onEditRaw` callback as Edit and does not focus or anchor the role fields. | Delete. Incomplete coverage keeps its visible nudge; complete roles need no detail-page action. The editor owns role changes. |
| Add/Replace photo | Opens the same file input as the full-width photo affordance. | Delete from overflow. The hero remains the add/replace affordance. |
| Start cooking over | Appears only when cooking progress exists and clears the local cooking session after confirmation. | Keep as a conditional secondary action. |
| View in Dutch/English | Changes the displayed recipe language and may trigger translation when English is missing or stale. | For Dutch-source recipes, move to a visible `NL / EN` segmented control labelled `Recipe language`; use text badges instead of the globe emoji. Native-English recipes show their source language without offering a Dutch state the data model cannot produce. |
| Rebuild cooking view | Calls `BenchSheet.regenerate()` immediately; the browser observed a direct `POST .../cook-mode?force=true`. | Remove from the healthy-state menu. Existing stale/error UI owns `Retry cooking view`. |
| Re-translate to EN | Immediately forces the translation endpoint when a ready English translation is shown. | Remove from the healthy-state menu. Language switching remains automatic; the translation status/error row owns Retry. |
| Ask AI | Opens the global assistant and preloads `Help me edit ...`. | Delete. The global assistant button already opens with `Using context: Recipe: ...`; the user supplies the actual request. |
| Remove photo | Confirms, then deletes the stored photo. | Keep as a conditional destructive action, separated visually from session actions. |
| Open source | Opens `recipe.sourceUrl` in a new tab. | Move to a `Source: <hostname>` link in the Original recipe/provenance area with standard external-link semantics. |

When neither cooking progress nor a photo exists, there is no overflow button. The header then contains Back, title, Plan, and direct Edit only.

### Editor and freezer state

- The editor is a single 476-line route component (`src/routes/recipes/[slug]/edit/+page.svelte`). Its draft recovery, dirty check, navigation confirmation, Zod-backed server action, and role/substitute preservation are valuable and remain.
- Ingredient data is shown with placeholders instead of persistent labels at `+page.svelte:299-339`; the mobile role select is squeezed into the third column.
- Add Ingredient appends an off-screen row but leaves focus on the Add button; the current browser audit measured six rows while focus remained on `+ Add`.
- Direction controls are 32 px square at `+page.svelte:429-445`, above WCAG's 24 px floor but below the app's mobile comfort target.
- `FixedBottomBar` is always rendered at `+page.svelte:467-474`, including the disabled `Saved` state.
- `FreezerStockPanel.svelte:39-88` persists each toggle/step immediately. The target count is changed optimistically but is not restored after a failed request.
- The freezer API already accepts `is_freezer_staple` and `target_portions` together, and disabling the staple clears its target through `setFreezerStaple`; no schema change is needed.

## Evidence-backed findings

| # | Priority | Area | Finding and user impact | Evidence | Cite |
|---|---|---|---|---|---|
| 1 | P1 | Recipe maintenance | `Rebuild cooking view` looks like an ordinary menu item but immediately starts a forced AI request and can replace a healthy generated view. | Browser request to `/api/recipes/ui-substitute-curry/cook-mode?force=true`; `RecipeHeader.svelte:210-217`. | `[H5] [H8] [Norman]` |
| 2 | P2 | Action ownership | Edit and completed Ingredient roles are separate choices with the same callback and destination. | `RecipeHeader.svelte:158-174`; browser URLs and scroll position were identical. | `[H4] [Hick] [Krug]` |
| 3 | P2 | Action ownership | Add photo and Ask AI duplicate persistent page-level affordances. | `RecipeHeader.svelte:177-186,230-238`; direct assistant test showed recipe context without the menu item. | `[H8] [Cooper]` |
| 4 | P2 | Provenance | Open source is hidden among mutations even though it explains where the recipe came from. | `RecipeHeader.svelte:251-258`; conditional on `sourceUrl`. | `[H2] [Gestalt]` |
| 5 | P2 | Language | The globe implies app locale or web access; the action actually switches this recipe between Dutch and English. | `RecipeHeader.svelte:201-208`; paired Dutch/English browser states. | `[H2] [Norman]` |
| 6 | P2 | Mobile menu | A common translated recipe shows six to seven equal-weight rows with raw glyph/emoji icons and roughly 38 px row height. | `20260720-ui-recipe-menu-375.png`; `RecipeHeader.svelte:153-258`. | `[Hick] [H8] [WCAG 2.5.8]` |
| 7 | P2 | Editor fields | Filled ingredient rows lose visible field meaning, and the role value is cramped/truncated at 375 px. | `20260720-ui-recipe-edit-375.png`; `+page.svelte:299-339`. | `[H6] [Wro] [Type]` |
| 8 | P2 | Editor flow | Adding an ingredient creates it below the viewport but does not move focus or scroll to it. | Browser active-element check after Add; `+page.svelte:54-56`. | `[H1] [KNav] [Doherty]` |
| 9 | P2 | Editor chrome | The permanent disabled Saved bar consumes scarce mobile height and separates the form's completion action from its title. | `20260720-ui-recipe-edit-375.png`; `+page.svelte:467-474`. | `[Cooper] [VH]` |
| 10 | P2 | Method editing | Three 32 px controls form a visually noisy vertical strip beside each textarea. | `20260720-ui-recipe-edit-lower-375.png`; `+page.svelte:426-446`. | `[Fitts] [WCAG 2.5.8] [H8]` |
| 11 | P2 | Freezer target | Status, toggle, and stepper compete in the cooking surface; at desktop width the related controls sit more than 1,000 px apart. | `20260720-ui-target-portions-375.png`, `20260720-ui-target-portions-1280.png`. | `[Gestalt] [H8] [RUI]` |
| 12 | P1 | Freezer failure recovery | The target number changes before PATCH succeeds and is not restored on error, so visible state can disagree with SQLite. | `FreezerStockPanel.svelte:83-88`; source review. | `[H1] [H9] [Norman]` |

## Scope

### In scope

- Home assistant desktop width and centered alignment, including the expiry strip and composer.
- English and Dutch bottom-navigation labels.
- Recipe-detail header actions, overflow menu, language control, source attribution, and ownership of retry/AI/photo/role paths.
- Recipe editor chrome, ingredient rows, alternatives disclosure, direction controls, focus behavior, and responsive layout.
- Freezer stock summary and a focused target editor with reliable save/error behavior.
- Removal of messages, callbacks, props, and unreachable markup made obsolete by the new ownership model.
- Cost-free browser fixtures at 320/375/768/1280/1536 px and English/Dutch states.

### Out of scope

- Settings menu or any Settings information architecture.
- Recipe-list filters, cards, import flow, meal composition, cooking-view step design, timers, or Add to plan.
- Recipe schema, migrations, translation model/provider, OpenRouter configuration, or AH integration.
- A new icon package, form library, component library, or route.
- Changing the global assistant's behavior beyond removing the redundant recipe draft shortcut.

## Option comparison

| Option | Upside | Cost/risk | Decision |
|---|---|---|---|
| A. Prune three menu rows and restyle the current cards | Small diff and quick visual improvement. | Leaves ambiguous language/source ownership, cramped editor fields, permanent Saved bar, and per-tap freezer writes. The same clutter will return. | Rejected: treats symptoms. |
| B. Assign one owner per action, keep a single-page editor, and progressively disclose freezer configuration | Removes duplicate paths, preserves the existing data model and draft behavior, and improves both mobile and desktop without a new dependency. | Requires coordinated edits across recipe-detail and editor components plus focused regression coverage. | Chosen. |
| C. Convert recipe editing to tabs/wizard steps and move freezer settings to a separate route | Each surface is visually sparse. | Adds navigation state, cross-section recall, save coordination, and more taps for a household task. | Rejected: new interaction debt. |

## Chosen approach

### 1. Shared width and literal destination names

Wrap the entire home page column in `mx-auto h-full w-full max-w-2xl` rather than applying `ui-page-shell`; the latter adds page-bottom padding that a full-height chat should not inherit. The message list, expiry strip, empty state, quick chips, and composer remain one flex column. At widths below 672 px, behavior stays unchanged.

Use the requested destination names as the actual route/page terminology, not tooltip aliases:

| Route | English | Dutch |
|---|---|---|
| `/` | Assistance | Assistent |
| `/shopping` | Groceries | Boodschappen |
| `/settings` | Settings | Instellingen |

Reuse the full route labels in `NavBar` and remove obsolete short-only keys where that reduces duplication. Verify the six-tab bar at 320 and 375 px, 200% text, and both locales before accepting the exact implementation.

### 2. One owner per recipe action

- Restore Edit as a direct text action in the sticky recipe header; keep its active-timer guard.
- Render the overflow only when at least one conditional secondary action exists.
- Keep `Start cooking over` and `Remove photo` in separated sections; both retain confirmations.
- Remove completed Ingredient roles, Add/Replace photo, Rebuild cooking view, Re-translate, and Ask AI from the menu.
- Delete `openRecipeAiEdit`, its prefill message, and corresponding props once the global assistant context regression is covered.
- Keep the incomplete role-coverage panel. Its manual edit link goes to the editor; its AI classification action remains because it is a specific bound operation, not a generic chat draft.
- Remove the unreachable complete branch from `RoleCoverage.svelte` after the parent render contract is simplified.

### 3. Visible language and provenance

For Dutch-source recipes, add a compact, labelled `NL / EN` segmented control in a recipe utility row before the Cooking view / Original recipe tabs. The active language is visible without interpreting an icon; the control's accessible name is `Recipe language`. It retains the current all-or-nothing English display rule and translation request logic. A native-English recipe instead shows static `Recipe language: English` text: the current model has no Dutch translation cache, so it must not render an active-looking `NL` choice that cannot change the content.

Show `Source: <hostname>` inside the Original recipe/provenance area when `sourceUrl` exists. `BenchSheet.svelte` owns the Original recipe view, so RX-4 must pass `sourceUrl` or a parsed `sourceHost` through that component boundary and into `RawDirectionsFallback.svelte`, or render a small provenance row beside that view. Use a semantic anchor with `target="_blank"` and `rel="noopener noreferrer"`; show the hostname rather than the generic `Open source`. No source row renders when the URL is absent.

Healthy-state AI maintenance disappears. A stale/failed cooking view exposes `Retry cooking view` in the existing status surface, and a failed translation exposes `Retry translation` in the translation status row. Those labels describe the state and consequence at the point of failure.

### 4. Single-page editor with lighter rows

Keep one route and one HTML form. Preserve session draft recovery, dirty-state navigation confirmation, server Zod validation, role/substitute serialization, and cook-mode/translation invalidation after save.

- Replace the fixed bottom Saved bar with a sticky editor header containing Back, `Edit recipe`, and `Save changes`. The button is disabled while clean/submitting, but it stays in the same task header and no longer covers form content.
- Keep Basics, Ingredients, Method, and Notes visible in natural order; do not introduce tabs or a wizard.
- Extract ingredient and direction list editors from the route so the page owns form state while row components own responsive markup/focus.
- Render ingredients as one grouped list instead of nested card-on-card surfaces.
- Give Ingredient, Amount, Unit, and Freezer handling persistent visible labels. At 375 px, Amount and Unit share one row and Freezer handling uses the full next row; at wider breakpoints all three may share a row.
- Rename role copy around the consequence (`Cook with recipe` / `Add fresh when serving`) while keeping stored values `cook_in` and `serve_fresh` unchanged.
- Hide the full Alternatives disclosure when the count is zero; show a quiet `Add alternative` action. Existing alternatives remain collapsed with their count.
- Give dynamic rows stable client IDs, focus the newly added row/step, and scroll it into view. IDs are UI-only: exclude them from the hidden ingredient/direction JSON and dirty snapshots, and hydrate missing IDs when recovering existing v1 session drafts. Extracted Svelte 5 rows use explicit `$bindable` field props or parent-owned patch callbacks rather than copied local form state.
- Put direction actions in a horizontal secondary row with comfortable touch targets and clear accessible names; retain Up/Down as the non-drag alternative and do not add drag-only behavior.
- On successful save, preserve the existing redirect. On failure, retain the draft and put focus on the error summary or first invalid field.

### 5. Freezer status plus focused configuration

The recipe page renders a compact, clickable summary:

- Off: `0 portions in freezer` plus `Set stock target`.
- On: `0 of 4 portions` plus `4 short` or `Target met`.

Opening the summary launches one responsive native-dialog surface: bottom sheet on mobile, centered compact dialog on desktop. It contains the current freezer count, `Keep stocked`, and the target stepper. Controls edit a local draft. `Save target` sends one PATCH containing the final boolean/target state, consumes the API's canonical `{ isFreezerStaple, targetPortions }` response, updates the parent from that response only after success, and closes. This matters when switching off, because the server clears `targetPortions`. A failed request leaves the authoritative page summary untouched, keeps the unsaved dialog draft for Retry, marks it unsaved, and shows an inline error.

Extend the existing `BottomSheet` primitive with an opt-in desktop-centered presentation rather than creating a second focus-trap implementation. Existing sheets retain their current presentation.

## Phase plan and context-window strategy

Overall size is L. Execute in four phases. Each ticket is a vertical behavior slice and a safe checkpoint; switch context only at ticket or phase boundaries. The editor phase may require two windows, but do not split a half-converted form across them.

### Phase 1 - Shell and destination language (R1, one window)

Execute RX-1 and RX-2 together, then capture both locales before moving into recipe code.

### Phase 2 - Recipe action ownership (R1/R2, one to two windows)

Execute RX-3 and RX-4. Remove obsolete callbacks/messages in the same phase so old and new entry points do not coexist.

### Phase 3 - Recipe editor (R2, two windows at ticket boundaries)

Execute RX-5, RX-6, and RX-7. Keep data serialization unchanged until the new row components pass a save/reload preservation test.

### Phase 4 - Freezer target and integrated regression (R2, one to two windows)

Execute RX-8, then RX-9. Finish with the full repository gates and browser matrix.

## Execution tickets

### RX-1 - Center the home assistant

- **Observable behavior:** at 1280 and 1536 px, the assistant column is centered and no wider than 672 px; at 320-768 px it uses the available width without horizontal scrolling.
- **Scope in:** home page outer flex column, expiry strip, ChatView mount.
- **Scope out:** ChatView message rendering and floating agent dimensions.
- **Targets:** `src/routes/+page.svelte`; browser evidence under `output/playwright/`.
- **Risk:** R1. **Impact:** 3/5. **Effort:** S. **Confidence:** high.
- **Verification:** bounds at 320/375/768/1280/1536; long-message overflow fixture; composer and date dividers align with Recipes/Settings columns.
- **Rollback:** restore the full-width wrapper; no state/data impact.

### RX-2 - Rename bottom destinations

- **Observable behavior:** the bottom bar reads Assistance, Stock, Plan, Groceries, Recipes, Settings in English and uses Assistent, Voorraad, Planning, Boodschappen, Recepten, Instellingen in Dutch.
- **Scope in:** navigation and route/page title messages affected by the canonical labels.
- **Scope out:** route paths, icons, order, and Settings contents.
- **Targets:** `src/lib/components/NavBar.svelte`, `messages/en.json`, `messages/nl.json`, generated Paraglide output via the normal compile step.
- **Risk:** R1. **Impact:** 2/5. **Effort:** S. **Confidence:** high.
- **Verification:** both locales at 320/375 px and 200% text; active state and accessible names on all six routes; no text overlap.
- **Rollback:** restore message values/short keys together.

### RX-3 - Reduce the recipe overflow to conditional actions

- **Observable behavior:** Edit is directly visible; a default recipe has no overflow; only Start cooking over and/or Remove photo appear when their state makes them relevant.
- **Scope in:** menu rendering, callback props, timer confirmation, photo deletion confirmation, menu focus/keyboard behavior.
- **Scope out:** Plan and add-to-plan sheet.
- **Targets:** `src/lib/components/recipe-detail/RecipeHeader.svelte`, `src/routes/recipes/[slug]/+page.svelte`, `src/lib/components/recipe-detail/RoleCoverage.svelte`, message catalogs.
- **Risk:** R2 because active timer and photo deletion actions must remain guarded. **Impact:** 5/5. **Effort:** M. **Confidence:** high.
- **Verification:** matrix for no optional state, cook progress only, photo only, both; Enter/Arrow/Escape/focus return; timer and photo confirmations; no duplicate Edit/roles/photo/AI items.
- **Rollback:** restore the old header/menu and callback surface as one unit; no schema impact.

### RX-4 - Make recipe language and source contextual

- **Observable behavior:** Dutch-source recipes use `NL / EN` to switch all translated fields as one unit; native-English recipes do not offer a fake Dutch state; source provenance appears as a hostname link in Original recipe; retries appear only in failure/status surfaces.
- **Scope in:** language control, source URL display, translation/cook-mode retry placement.
- **Scope out:** provider/model logic and source import.
- **Targets:** `src/routes/recipes/[slug]/+page.svelte`, `RecipeHeader.svelte`, `BenchSheet.svelte`, `RawDirectionsFallback.svelte` or a small provenance component, message catalogs.
- **Risk:** R2 because incomplete translations must never mix English and Dutch fields. **Impact:** 4/5. **Effort:** M. **Confidence:** high.
- **Verification:** ready/pending/error/incomplete translation fixtures; native Dutch recipe switches both ways; native English recipe has no enabled Dutch choice; source remains reachable from Original recipe after its menu item is removed; no-source state; external anchor attributes; assert zero paid requests in healthy-state navigation.
- **Rollback:** restore menu language/source actions together; translation data is unchanged.

### RX-5 - Replace the editor's fixed footer with a sticky task header

- **Observable behavior:** Back, page title, and Save changes remain visible while scrolling; no disabled bar occupies the area above bottom navigation.
- **Scope in:** form ID/action association, dirty/submitting state, error focus, draft banner.
- **Scope out:** field row layout.
- **Targets:** `src/routes/recipes/[slug]/edit/+page.svelte`; remove this page's `FixedBottomBar` use without changing the shared primitive.
- **Risk:** R2 because save submission and unsaved-navigation protection are stateful. **Impact:** 4/5. **Effort:** M. **Confidence:** high.
- **Verification:** clean/dirty/submitting/failure/success states; keyboard submit; back with unsaved changes; Notes and final controls unobscured at 375 px.
- **Rollback:** restore the fixed footer and its reserved spacing together.

### RX-6 - Rebuild ingredient editing as responsive labelled rows

- **Observable behavior:** every filled value retains a visible label; role choices are readable at 320/375 px; zero-alternative rows are quiet; Add focuses and reveals the new ingredient.
- **Scope in:** ingredient names, amount, unit, role, substitutes, add/remove, stable row identity, focus/scroll.
- **Scope out:** stored JSON shape and role enum values.
- **Targets:** `src/routes/recipes/[slug]/edit/+page.svelte`, new focused components under `src/lib/components/recipe-edit/`, message catalogs.
- **Risk:** R2 because recipe ingredients feed shopping/AH and manual saves must preserve roles/substitutes. **Impact:** 5/5. **Effort:** L. **Confidence:** medium-high.
- **Verification:** add/remove middle row, add/remove substitute, all role values, long names/units, 0/1/12 substitutes, recovery of an existing draft with no client IDs, no client IDs in hidden JSON or dirty snapshots, save/reload DB assertion that Dutch names, roles, and substitutes survive unchanged; AH Dutch-field invariant remains intact.
- **Rollback:** keep state types/serialization in the route so the row component extraction can be reverted without data migration.

### RX-7 - Streamline method and notes editing

- **Observable behavior:** steps read as a sequence, their actions do not form a cramped vertical rail, Add step focuses the new textarea, and keyboard users can reorder/delete without drag.
- **Scope in:** direction list presentation, action targets, focus, Notes grouping.
- **Scope out:** cooking-view generation logic.
- **Targets:** `src/routes/recipes/[slug]/edit/+page.svelte`, new direction editor component, message catalogs.
- **Risk:** R2 because direction order is persistent recipe data. **Impact:** 3/5. **Effort:** M. **Confidence:** high.
- **Verification:** add/remove/reorder first/middle/last, focus after each action, long multiline steps, save/reload order, 320/375/1280 screenshots.
- **Rollback:** preserve the route's direction array/functions until the component passes parity, then remove the old markup.

### RX-8 - Move freezer targets into a reliable focused editor

- **Observable behavior:** the recipe shows a compact freezer summary; one tap opens a mobile sheet/desktop dialog; Save target emits one request and visible state changes from the canonical response only after success.
- **Scope in:** keep-stocked boolean, target count, summary status, responsive dialog, loading/error/retry.
- **Scope out:** freezing portions after cooking, meal-plan freezer source, inventory linking, schema.
- **Targets:** `src/lib/components/recipe-detail/FreezerStockPanel.svelte`, optional `FreezerStockDialog.svelte`, opt-in desktop mode in `src/lib/components/ui/BottomSheet.svelte`, `src/routes/api/recipes/[slug]/+server.ts` only if response/error semantics need tightening, message catalogs.
- **Risk:** R2 persistent recipe metadata. **Impact:** 5/5. **Effort:** M. **Confidence:** high.
- **Verification:** off/on, targets 1/4/99, current 0/equal/above target, one PATCH per save, on-to-off response clears the local target, on-to-new-target adopts the returned value, cancel without write, 400/500/offline failure leaves the page summary authoritative and the dialog draft marked unsaved, focus trap/Escape/focus return, mobile/desktop bounds.
- **Rollback:** restore the inline panel; API/schema remain backward compatible.

### RX-9 - Remove obsolete paths and lock the regression

- **Observable behavior:** one entry point remains for each recipe task, both locales are complete, and the full flow passes without a real OpenRouter or AH call.
- **Scope in:** dead props/functions/messages/imports, unreachable completed-role markup, screenshot/bounds matrix, repository gates.
- **Scope out:** unrelated UI cleanup.
- **Targets:** all files changed by RX-1 through RX-8 plus focused tests/fixtures.
- **Risk:** R2 integration. **Impact:** 4/5. **Effort:** M. **Confidence:** high.
- **Verification:** menu inventory assertion, direct contextual assistant assertion, editor data-preservation assertion, freezer failure rollback, no x-scroll/overlap at all five widths, `npm run check`, `npm run test:unit`, `npm run build`.
- **Rollback:** revert the phase by ticket; no migration or irreversible data operation exists.

## Risk tier and verification matrix

Overall risk is **R2**. The visible changes are UI-focused, but the editor and freezer controls sit on persistent recipe data and generated cooking/translation seams. There is no schema migration, auth change, destructive real-data operation, or stage gate.

| Risk | Fast seam | Browser seam | Acceptance |
|---|---|---|---|
| Chat width regression | DOM bounds helper | 320/375/768/1280/1536 | Centered 672 px maximum; no nested x-scroll. |
| Navigation copy overflow | Message-key compile | EN/NL, every tab, 200% text | Exact requested English labels; natural Dutch labels; no overlap. |
| Action duplication | Pure action-state matrix if extracted | Recipe states with/without photo/progress/source/translation | One owner per action; default menu absent. |
| Accidental paid call | Route spy/mocked fetch | Healthy language/tab/menu walk | No OpenRouter request until a user explicitly retries a failed state or sends chat. |
| Mixed translation | Existing completeness helper tests | pending/ready/error/incomplete | The recipe is wholly Dutch or wholly English. |
| Editor data loss | Serializer/server-action test or DB before/after assertion | Edit one field, save, reload | Roles, substitutes, order, Dutch ingredient names, and untouched fields persist. |
| Dynamic-row focus | Row helper/component test where practical | Add ingredient/step and keyboard walk | New control is visible and focused; removal lands on a sensible neighbor. |
| Freezer stale UI | PATCH state helper test | delayed/failing/success response | One request; no visible divergence from server truth. |
| Overlay/accessibility | Native dialog contract | Escape, backdrop, close, focus return | No trap or nav/assistant collision. |

Baseline before implementation: 28 Vitest files / 213 tests pass, `svelte-check` reports zero errors/warnings, and the production build succeeds.

## Audit record

| Audit | Status | Result |
|---|---|---|
| Harden (scoped app audit) | Run | Two high-value integrity gaps entered the plan: forced AI rebuild as a casual menu item, and freezer target optimistic state without failure rollback. No secret/schema/auth/AH-boundary change is required. |
| UI | Run | Browser captures at 375/768/1280/1536 confirm width mismatch, menu density, editor compression, fixed Saved chrome, and target-control separation. Findings cite the shared principle library. |
| UX | Run | Every conditional menu path was traced in source; representative actions were walked in Chromium. Direct assistant context, duplicate edit/roles, language switch, rebuild failure, dynamic-row focus, and target enablement were reproduced. |
| Stack discipline | Skipped | No new tool, library, service, auth, payments, queue, email, AI provider, or platform boundary is introduced. |
| External framework/API research | Run | Official Svelte 5 docs confirmed extracted rows need explicit `$bindable` props or callback props; official SvelteKit docs confirmed the existing enhanced-form action remains the save seam. No new external API or dependency is introduced. |
| Independent plan review | Run | The gpt-5.5 review found four P1 specification gaps: source ownership, native-English language truthfulness, canonical freezer response handling, and client-ID isolation. All four are resolved in RX-4, RX-6, and RX-8 below. Its nested second-opinion call could not reach the network; the primary review still completed against the repository. |

## Failure-mode critique

| Failure mode | Trigger | Impact | Detectability | Mitigation in plan | Residual risk |
|---|---|---|---|---|---|
| Longer nav labels collide in Dutch | Six equal tabs at 320/375 px or 200% text | Navigation becomes unreadable | High in bounds/screenshots | Verify both locales early in RX-2 and adjust responsive typography/spacing without abbreviating the requested English terms. | Low |
| Width constraint breaks chat height/scroll | `ui-page-shell` padding or wrong flex owner is reused | Composer moves or nested scrolling appears | High | Use only the width utilities on the existing full-height outer flex column; preserve ChatView's internal scroller. | Low |
| Removing Ask AI loses recipe context | Global button lacks current publisher | Generic replies | High via visible context chip | Keep the existing page publisher and add a direct-button regression before deleting the menu prefill. | Low |
| Removing rebuild/retranslate hides recovery | Healthy-state items deleted before failure CTAs are proven | User cannot recover from a failed generation | High with forced failure fixture | Land contextual Retry surfaces before deleting menu callbacks/messages. | Low |
| Editor refactor drops roles/substitutes | New row components change serialization or key identity | Shopping/freezer behavior becomes wrong | Medium; data can look fine until later | Freeze the JSON shape, add stable client-only IDs, and assert DB before/after on an unrelated edit. | Low |
| Client IDs leak into persistent form state | Extracted rows serialize UI identity or older drafts contain no IDs | False dirty state, rejected payload, or drift in saved JSON | High in hidden-field/snapshot assertions | Keep IDs outside hidden JSON and snapshots; hydrate missing IDs on draft recovery; use explicit bindable fields or parent patch callbacks. | Low |
| Sticky header Save submits the wrong form | Button moves outside `<form>` without a form association | Edits cannot be saved | High | Give the form a stable ID and test click + keyboard submission in all dirty states. | Low |
| Freezer dialog applies the request instead of canonical state | Switching off clears the target server-side but the page keeps the submitted/stale target | Page and SQLite disagree until reload | High in response-contract tests | Local draft plus one explicit Save request; disable during submit; update parent only from the API response. | Low |
| Source URL creates unsafe navigation | Raw DB URL rendered as external link | Opener or malformed-link risk | Medium | Parse/display hostname defensively; semantic anchor with `noopener noreferrer`; invalid URL omits link and remains editable as data. | Low |
| Language control promises a missing translation | Native-English recipe renders an active NL choice | Control changes state without changing content | High with a native-English fixture | Only render the switch when both language states are meaningful; otherwise show static source-language text. | Low |
| Conditional overflow disappears while focus is inside it | Progress/photo state changes after an action | Focus loss | High in keyboard test | Close menu first and return focus to the direct Edit/header fallback before state invalidation. | Low |
| Recent compression returns later | Implementation is reviewed by file count rather than observable ownership | Duplicate menu/form clutter regresses | Medium | Keep the action inventory and browser assertions as acceptance criteria; delete obsolete props/messages in the same tickets. | Low |

### Steelman

The strongest alternative is a narrow menu prune because it is safer and would address the most obvious complaint quickly. It is not sufficient here: the same 2026-07-19 compression also removed persistent labels and promoted permanent freezer controls, so deleting three rows would leave the underlying ownership errors intact. The chosen approach is still bounded: it keeps all existing routes, schema, provider seams, draft recovery, and server validation, while changing where controls live and how local UI state commits. That is the structural fix with the smaller long-term surface.

Plan critique result: **GO after revision**. The initial review's four P1 gaps are now explicit acceptance criteria: provenance crosses the `BenchSheet` boundary, native-English recipes do not offer a false Dutch state, freezer UI adopts the canonical response, and client IDs never enter persisted or dirty-state shapes. Every R2 path now has a data-preservation or failure-recovery seam, no mandatory decision is unresolved, and tickets are split by observable behavior.

## Rollout and rollback

- Ship in phase order so the global assistant and failure retry paths are proven before their duplicate menu entries are deleted.
- Use a disposable copied SQLite database and intercepted AI endpoints for browser work. Do not make real OpenRouter or AH calls.
- Keep the recipe schema and API payload shape stable. No migration or real-data rollback is required.
- Commit each ticket independently; rollback is a ticket-level revert. RX-3/RX-4 callback and message deletions move with their replacement UI, and RX-6/RX-7 preserve route-owned serialization until parity is proven.
- If the responsive freezer dialog has a platform-specific issue, restore only the inline `FreezerStockPanel`; stored values remain authoritative.

## Open Questions

None. Defaults are fixed: exact requested English navigation labels; natural Dutch equivalents; 672 px assistant maximum; direct Edit; explicit `NL / EN`; no healthy-state AI maintenance commands; single-page editor; freezer configuration in an opt-in responsive dialog; no new dependency.

## Baked-in resume pack

- **Goal:** implement the home width/navigation rename and the recipe action, editor, and freezer-target streamline defined here.
- **Current state:** plan is ready at R2 across four phases and nine vertical tickets; baseline check, unit tests, and production build pass.
- **First command:** `/run`.
- **First files:** `src/routes/+page.svelte`, `src/lib/components/NavBar.svelte`, `messages/en.json`, `messages/nl.json`.
- **Pending verification:** all RX-1 through RX-9 browser and data-preservation seams; no paid AI/AH calls.
- **Open questions:** none; the independent review's four P1 gaps are resolved in the plan.
