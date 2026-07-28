# Issue: Assistant recipe options are not selectable and make chat excessively long
Created: 2026-07-28 14:59
Status: AWAITING PRODUCTION VERIFICATION

## Symptom

The latest production recipe-refinement exchange promised multiple adjustable Albert Heijn
options per ingredient, but the review card showed one fixed change and one checkbox per row. The
conversation also exposed failed tool attempts, repeated successful reads, duplicate explanation,
and two active-looking proposal cards for the same recipe. Narrow chat and bubble caps left much of
the available horizontal space unused while the cards became several screens tall.

## Expected Behavior

For an ingredient such as Parmezaanse kaas, the assistant offers three meaningfully different live
AH product forms when it does not know the user's preference, for example a whole block, fresh
pre-grated cheese, and shelf-stable grated powder. The user chooses one option for this recipe, can
request another bounded batch when none fit, and the accepted recipe-scoped preference informs
future AH shopping for that recipe without changing the canonical Dutch ingredient into display
text or a retailer SKU.

The chat should make the proposal the decision surface: routine reads and recoverable validation
details stay compact, superseded proposals are visibly inactive, final prose does not repeat every
row, and assistant bubbles and cards use the available width responsively.

## Investigation Log

| Date | Action | Result | Next Step |
|------|--------|--------|-----------|
| 2026-07-28 14:30 | Inspected the latest authenticated production assistant messages and their stored tool trace. | The latest turn made 13 tool calls: one rejected 8-query AH search, three recipe reads, seven successful AH search batches, and two proposal attempts. The first proposal used an invalid evidence key; the successful retry still stored only one product per ingredient. Internal retry narration and raw validation errors were rendered in chat. | Trace the typed proposal, renderer, and proposal lifetime to find the first incapable boundary. |
| 2026-07-28 14:38 | Measured the live chat and review cards in authenticated Chrome at wide and narrow viewports. | At the measured desktop viewport the page column was 672 px, the assistant bubble 530 px, and cards about 482 px. In the measured narrow viewport the assistant bubble was 214 px and cards about 166 px. The two latest assistant bubbles were approximately 1,870/2,998 px and 2,764/4,650 px tall at wide/narrow sizes. | Replace stacked width caps with one responsive content-width policy and test realistic seven-row proposals. |
| 2026-07-28 14:45 | Traced `RecipePatchOperationInputSchema`, `RecipePatchDisplay`, `RecipeEnhancementReview`, and proposal storage. | One operation can carry only one `after` value and one evidence object; the UI can only include/exclude that fixed operation. Proposals coexist in an in-memory token map for ten minutes and do not supersede earlier proposals for the same user and recipe. Persisted proposal cards do not receive an inactive/hydrated state. | Design mutually exclusive candidate groups, recipe-scoped preference persistence, and explicit supersession. |
| 2026-07-28 14:50 | Traced AH search limits, system prompt guidance, and tool rendering. | The 1-5 query bound exists in schema and prose, but model misuse becomes a raw visible error. Every successful read/search renders as its own card. The final assistant response can narrate recovery and duplicate the structured proposal. | Plan deterministic candidate generation, friendly/aggregated progress rendering, and response-shape tests. |
| 2026-07-28 14:59 | Completed `/grill` with the user. | The required product behavior is three distinct product-form options, selected and remembered only for this recipe, with an explicit way to fetch more options when the first three do not fit. | Produce the implementation-ready feature list, risk critique, responsive UI/UX specification, and rollback plan. |
| 2026-07-28 15:04 | Ran the existing focused authenticated browser loop. | `assistant-safety.e2e.ts` passed in 24.8 seconds, but its two fixed rows and overflow-only assertion do not represent multiple candidates, proposal replacement, chat width, or production-height density. | Make seeded realistic chat/proposal JSON the first failing `$run` seam. |
| 2026-07-28 15:14 | Completed targeted hardening and independent Opus plan critique. | The first draft had eight P1 specification gaps: mixed-source preference leakage, an unresolved push outcome, token replay, transaction timing, destructive replacement failure, FK/writer coverage, reset/export semantics, and an underspecified test seed seam. | Integrate all eight mitigations and re-run plan-readiness review. |
| 2026-07-28 | Finalized the five-phase R3 feature list after critique. | The revised design uses an additive recipe/ingredient preference table, server-bound opaque candidate IDs, transaction-internal validation, single-use proposals, strict mixed-source conflict handling, scoped replacement that preserves the old proposal on failure, and responsive/aggregated chat UI. The plan is GO for `$run`; no application code or production data changed. | Execute `docs/feature-lists/FEATURE_LIST_ASSISTANT_RECIPE_OPTIONS_AND_CHAT_DENSITY.md` through `$run`, stage the R3 migration, and keep this issue open until production verification. |
| 2026-07-28 16:46 | Implemented and verified the accepted plan on `wide-sweep/schema-assistant-recipe-options`. | Added opaque three-to-nine-candidate recipe product groups, atomic recipe-scoped preferences, strict AH source precedence, single-use proposal replacement, final-only assistant prose, compact activity, and responsive mobile/desktop review. `npm test` passed 577 unit tests, 20 primary browser tests, and the production build; the focused secondary-account flow also passed. Fresh and pre-feature database migration tests passed with an empty foreign-key check, and the client-bundle marker scan was clean. | Open the required R3 PR. Keep production promotion and any metered provider canary blocked until deployment-lineage recovery and the names-only exact-revision command are present and verified. |
| 2026-07-28 17:20 | Integrated draft PR #21 with current `main` and reran the complete gate. | Renumbered the additive preference migration to 0024 after main's timer-alert migration, composed reset/export behavior, and hardened Cook Mode recovery waits exposed by full-suite load. `npm test` passed 111 test files / 604 unit tests, all 20 primary browser stories, zero Svelte diagnostics, and the production build. The names-only Railway verifier reported `SUCCESS`, branch `main`, and exact deployed/remote-main equality for the current pre-feature revision. | Keep the PR draft pending R3 review. Ask for explicit authority before the optional one-turn metered provider canary; stop it before Apply/AH push. After merge, supervise Railway and repeat exact-revision plus authenticated canary proof. |

## Hypotheses

- [x] **High:** the assistant cannot fulfil “multiple options” because the server/client proposal
  contract represents one fixed `after` state and one AH evidence item per operation.
- [x] **High:** tool progress is noisy because every read, search, and validation result is rendered
  independently and model retry narration is preserved in final assistant text.
- [x] **High:** older recipe proposals remain active-looking because staging does not supersede
  prior user/recipe proposals and the review component has no inactive state.
- [x] **High:** chat density is poor because the page is capped at `max-w-2xl`, assistant bubbles
  are capped at 85%, and each operation card stacks vertically with nested padding.
- [x] **High:** accepting only an AH evidence key cannot preserve the user's recipe-scoped product
  choice for later shopping or AH basket selection.
- [x] **Medium:** the existing AH product result contains enough stable form/category information
  to generate diverse choices without a small server-side classifier. The sanitized candidate
  contract and realistic provider-free selection path verify this boundary.

## Approaches Tried

- Read-only production SQLite inspection through the authenticated Railway service.
- Authenticated production browser inspection at wide and narrow viewports.
- Static trace through the proposal schemas, turn evidence ledger, tool-display contract, chat
  renderer, review component, and in-memory proposal store.
- `/grill` clarification of option diversity, preference scope, and “show more” behavior.
- Implemented and verified the typed proposal, additive recipe preference table, strict shopping
  precedence, replacement lifecycle, final-only prose, and responsive decision surface.
- Opened draft PR #21 and integrated current `main`; no production deployment, provider spend,
  Apply action, AH push, or production data mutation was performed.

## Related Files

- `src/lib/server/ai/recipe_patch.ts`
- `src/lib/server/ai/tools.ts`
- `src/lib/server/ai/turn_safety.ts`
- `src/lib/server/ai/executors/ah.ts`
- `src/lib/server/ai/executors/recipes.ts`
- `src/lib/server/ai/prompts/system.md`
- `src/lib/server/ai/tool_display.ts`
- `src/lib/tool_display.ts`
- `src/lib/components/ChatView.svelte`
- `src/lib/components/chat/RecipeEnhancementReview.svelte`
- `src/routes/+page.svelte`
- `tests/e2e/assistant-safety.e2e.ts`
