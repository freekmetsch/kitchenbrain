# Feature plan: Show, don't tell UI

_Status: Shipped - 2026-07-24 (all eight state-first UI tickets implemented and verified)_

## Outcome

Replace explanatory UI with visible state, explicit choices, direct destinations, and previews
where the app already has enough data to do so. Keep copy where it carries safety, system status,
irreducible constraints, or recovery information.

This is an R2, code-only, wide-sweep UI plan. It changes no schema, authentication rule, runtime
secret, provider contract, or Albert Heijn write path.

## Why this plan exists

The scan found one correctness bug and six repeated interaction failures behind the same pattern:
the app explains a consequence after hiding the state or action that would make the consequence
obvious.

The sharpest example is deterministic:

> The meal drawer says `6 portions ready`, but choosing that freezer row submits the recipe's
> 16-serving fresh-cook yield.

That defect is tracked in
[`ISSUE_FREEZER_MEAL_PORTIONS_20260724-1915.md`](../../known_issues/current/ISSUE_FREEZER_MEAL_PORTIONS_20260724-1915.md).

## Audit method and coverage

The audit combined authenticated runtime inspection of the deployed beta with a source trace of
the state and write paths. Runtime actions were read-only: no meal was added, no preference was
saved, no destructive reset was opened, and no provider or AH request was made.

| Surface | Evidence | State and viewport | Result |
|---|---|---|---|
| Assistant | Runtime + source | Existing history and needs-review tool cards; 375×800 and 1024×720 CSS px | Review is requested in prose but has no direct destination action. |
| Meal plan | Runtime + source | Populated week and Add meal sheet; 375×800 and 1024×720 | Freezer/fresh choice is duplicated and the visible freezer count contradicts the submitted default. |
| Recipe detail / Plan | Runtime + source | Bolognese, stock present, cooking view; 375×800 and 1024×720 | The sibling planning sheet reproduces the freezer serving mismatch. |
| Shopping | Runtime + source | Populated To buy / In basket / Sent to AH; 375×800 and 1024×720 | Incompatible quantities stay correctly separate, but the UI does not show why. |
| Inventory | Runtime + source | Populated stock, filters, review items; 375×800 and 1024×720 | Recipe relationship is a tiny prose chip with `✕` as its only management cue. |
| Recipes | Runtime + source | Library, detail, edit, Import, Make; 375×800 and 1024×720 | Import and Make are strong direct-manipulation patterns; the editor still explains a hidden post-save refresh. |
| Settings | Runtime + source | Display, AI, meal plan, recipes, connections, account, data, advanced; 375×800 and 1024×720 | Meal-plan consequences and import blockers are described instead of previewed or surfaced as actions. |
| Empty/error/loading/locales | Source + safe runtime states | English runtime; Dutch strings; existing empty/loading/error branches | Empty states generally lead to a next action. Dutch and destructive/provider states need fixture coverage during implementation. |

The deployed CSS viewport was 1024×720 for the wide pass and 375×800 for the phone pass. The
requested browser window sizes were larger because of display scaling.

## What already works and must remain

- Recipe Import shows a URL field and a single import action without a tutorial.
- Make recipe offers the two real outcomes: start cooking or record an already-cooked batch.
- Inventory Add exposes the required fields and disables the action until they are usable.
- Empty states usually name the next available action.
- AI usage is shown as a chart rather than restated as a paragraph.
- Assistant context disclosure makes consequential system state visible.
- Data resets use explicit, per-group confirmation. This safety copy and friction must remain.
- AH connection steps are inherently instructional and already pair each instruction with a
  concrete copy, paste, or submit control.

## Findings and dispositions

| Priority | Finding | UI should do the work | Disposition |
|---|---|---|---|
| P2 | Freezer row says 6 portions but both planning callers default to the recipe yield of 16. | Present one source-aware choice and submit the number shown. | Fix first; correctness blocker. |
| P2 | Assistant says a recipe needs review but offers only diff text and Undo. | Put a safe, entity-aware Review/View action on the tool card. | Fix. |
| P2 | The Add meal sheet repeats recipes under freezer and library; meal cards describe source in a mutable prose chip. | Show one recipe with explicit `Serve 6 from freezer` and `Cook 16 fresh` choices; use the same two-state source control after creation. | Fix with the correctness ticket. |
| P2 | Shopping shows rows such as `200g + 200g` and sibling rows for the same item without their meal/component source. | Reveal the contributions only when quantities cannot be combined; preserve the exact rows and IDs. | Fix presentation only. |
| P2 | Meal-plan settings explain week range, delivery effect, planning mode, and suggestion count below controls. | Render one compact live preview from the unsaved values. | Fix. |
| P2 | Data import is disabled with a paragraph telling the user to reset data groups farther down the page. | Show an import-readiness checklist with blocker counts and links to the exact reset group. | Fix without adding bulk reset. |
| P2 | Inventory shows `recipe planned ✕` / `no recipe ✕`. | Expose recipe relationship as a named state with separate Manage and Clear actions. | Fix. |
| P3 | Recipe editor says ingredient and method changes will refresh cooking view. | Let save redirect into the existing Preparing/Refreshing state and maintain continuity. | Remove the hint only after proving the state. |
| P3 | Recipe cards use textual on-hand/below-target/freezer pills. | No task is currently blocked; the compact card work is recent and coherent. | Defer; inert. |
| P3 | Cooking counter repeats component and ingredient labels. | Existing color and structure already carry the main grouping. | Defer; avoid reopening shipped work without a failure. |
| P3 | Advanced settings explain environment-only configuration. | The audience is a self-host administrator and the constraint is irreducible. | Keep. |

There is no P1 finding: all core routes are usable. The freezer mismatch is P2 because it can
create a materially wrong meal intent and downstream grocery quantity, but the user can still
inspect and correct the plan.

## Options considered

### A. Trim helper copy and rename controls

Fast, but rejected. Removing prose would make hidden state harder to understand and would not fix
the freezer quantity bug, missing review destination, or import recovery path.

### B. State-first vertical slices using existing data and components — chosen

Give each consequential state one visible representation, put its action beside it, and preview
locally derivable consequences before save. This fixes the bug and the repeated interaction
pattern without a new design system or data model.

### C. Redesign the full visual system

Rejected. It would reopen recently shipped recipe, cooking, shopping, and assistant work while
adding no leverage over the specific failures found here.

## Phase 1 — Close broken handoffs and the correctness gap

### SDT-1 — Make fresh/freezer choice source-aware everywhere

- **Intent:** The label, selected source, serving count, optimistic meal, and persisted meal all
  describe the same intent.
- **Targets:** `src/lib/meal_source_choice.ts` (new pure seam),
  `src/lib/meal_source_choice.test.ts`, `src/routes/meal-plan/+page.svelte`,
  `src/lib/components/recipe-detail/AddToPlanSheet.svelte`, an optional shared
  `MealSourceChoice.svelte`, `messages/en.json`, and `messages/nl.json`.
- **Change:**
  - Start with a failing pure-helper test: baseline 16/on-hand 6 yields fresh 16 and freezer 6.
  - Replace the duplicate freezer/library rows with one recipe row and explicit source actions.
  - Reuse the same helper and source control in recipe-detail Plan.
  - Preserve fixed-batch semantics: fresh batches remain whole multiples of recipe yield.
  - If the user asks for more freezer servings than are in stock, show the shortfall in the
    control; never silently relabel the source.
- **Acceptance:** Both callers show and submit 6 for the observed freezer fixture and 16 for
  fresh; zero-stock recipes cannot select freezer; optimistic and reloaded meals agree.
- **Verification:** Focused helper/component tests, copied-database POST integration, and 375/1280
  browser stories through both callers.
- **Risk:** R2, impact 5/5, effort M, confidence high.
- **Rollback:** Revert the helper, shared control, and both callers together. No stored data or
  migration needs rollback.
- **Dependency:** None. Keep the known issue `INVESTIGATING` until the implementation has user
  verification; then move it through `AWAITING VERIFICATION` before resolution.

### SDT-2 — Put Review/View on assistant result cards

- **Intent:** A user asked to review a changed recipe should be able to go there from the card that
  requests the review.
- **Targets:** `src/lib/tool_display.ts`, `src/lib/server/ai/tool_display.ts`,
  `src/lib/components/ChatView.svelte`, `src/lib/chat/tool_copy.ts`, and focused display tests.
- **Change:**
  - Extend the persisted, client-safe display contract with optional typed entity metadata.
  - Derive an app-local route from a validated tool result and known entity kind; do not accept a
    raw LLM-supplied URL.
  - Render Review for `needs_review` and View for ordinary entity results beside Undo.
  - Keep old persisted cards valid when the optional metadata is absent.
- **Acceptance:** The observed needs-review recipe card has one direct Review action; keyboard and
  pointer activation land on the intended app view; legacy cards still render.
- **Verification:** Serialization/backward-compatibility tests, unsafe/raw URL rejection, and
  authenticated 375/1280 browser checks.
- **Risk:** R2, impact 4/5, effort M, confidence high.
- **Rollback:** Remove optional metadata and action rendering; old stored messages remain valid.
- **Dependency:** None.

### SDT-3 — Explain incompatible shopping quantities through structure

- **Intent:** Make distinct rows understandable without falsely merging units or changing what AH
  receives.
- **Targets:** `src/lib/components/shopping/ShoppingLists.svelte`, shopping presentation types and
  format helpers, `messages/en.json`, `messages/nl.json`, and existing shopping-view tests.
- **Change:**
  - Leave `aggregateRows` as the source of truth.
  - When `incompatibleQuantities` is true, visually group adjacent same-term rows and reveal the
    meal/component contributions that require separation.
  - Preserve each row, its exact `entryIds`, its bought state, and AH eligibility. Do not
    unit-convert or aggregate in the component.
- **Acceptance:** Compatible `250g + 250g` still becomes one 500g row; `g` and `stuk` remain
  separate but explain their sources; checkbox, count, AH preview, and push inputs are unchanged.
- **Verification:** Existing aggregation tests plus presentation tests for all/some bought rows and
  a Dutch-field/entry-ID AH fixture; browser proof at 375 and 1280.
- **Risk:** R2, impact 4/5, effort M, confidence medium.
- **Rollback:** Revert the presentation grouping only; the canonical shopping rows remain intact.
- **Dependency:** None.

## Phase 2 — Show consequences before commitment

### SDT-4 — Preview meal-planning settings

- **Intent:** Make week boundaries, delivery position, planning mode, visible horizon, and
  suggestion count apparent before save.
- **Targets:** `src/routes/settings/meal-plan/+page.svelte`, an optional local
  `MealPlanSettingsPreview.svelte`, existing `$lib/week` and `$lib/weekday` helpers, messages, and
  focused date tests.
- **Change:** Replace consequence-explaining paragraphs with one compact preview derived from the
  current local values: a dated week strip with delivery marker, pool/day layout, visible week
  count, and suggestion-card count. Retain concise field labels and irreducible caveats.
- **Acceptance:** Each control changes the preview immediately; the preview and saved meal-plan
  route agree across a week boundary; no preference is written until the existing save path runs.
- **Verification:** Deterministic date-helper tests and unsaved/saved 375/1280 browser stories in
  English and Dutch.
- **Risk:** R1, impact 4/5, effort M, confidence high.
- **Rollback:** Remove the local preview and restore the concise hints; preference storage is
  untouched.
- **Dependency:** SDT-1 establishes the source-control vocabulary used in the preview.

### SDT-5 — Turn import blockers into an actionable readiness state

- **Intent:** A disabled import should expose exactly what blocks it and how to reach the safe
  recovery control.
- **Targets:** `src/routes/settings/data/+page.svelte`, its page data only if the existing
  `resetGroups` shape is insufficient, messages, and focused tests.
- **Change:** Render an Import readiness checklist from nonzero reset-group counts. Each blocker
  moves focus to its matching reset group. Keep individual type-to-confirm reset sheets and all
  destructive safety copy; do not add a bulk reset or automatic deletion.
- **Acceptance:** Zero blockers visibly enables import; each nonzero blocker names its count and
  reaches the correct reset group; import remains impossible while a blocker exists.
- **Verification:** Zero/nonzero fixture tests, focus/anchor browser checks, and confirmation that
  no destructive request occurs during navigation.
- **Risk:** R1, impact 3/5, effort S, confidence high.
- **Rollback:** Revert the checklist and anchors; import eligibility and reset APIs are unchanged.
- **Dependency:** None.

### SDT-6 — Make inventory recipe relationship a real control

- **Intent:** Show whether stock is linked to a planned recipe without making a raw `✕` the only
  management affordance.
- **Targets:** `src/lib/components/inventory/FacetChips.svelte`, the existing recipe link picker or
  a small shared relationship control, messages, and inventory interaction tests.
- **Change:** Render a visible relationship state with separately named Manage and Clear actions.
  Reuse the current picker and mutation seams; fit the control at 375 px and provide explicit
  accessible names.
- **Acceptance:** Linked, unlinked, loading, failed, and cleared states remain understandable
  without hover; keyboard users can manage or clear independently.
- **Verification:** Component tests and populated inventory browser stories at 375/1280 in both
  locales.
- **Risk:** R1, impact 3/5, effort M, confidence high.
- **Rollback:** Restore the current chip renderer; link data and endpoints are unchanged.
- **Dependency:** None.

## Phase 3 — Remove residual explanatory scaffolding and prove the story

### SDT-7 — Let recipe-save state explain cooking-view regeneration

- **Intent:** Remove the editor hint only when the actual save-to-cooking transition makes the
  refresh visible.
- **Targets:** `src/lib/components/recipe-edit/DirectionListEditor.svelte`, the recipe edit action
  and redirect, existing `BenchSheet` preparing/refreshing states, messages, and focused tests.
- **Change:** Verify that a semantic edit redirects to the recipe and visibly enters the existing
  Preparing/Refreshing state while preserving sensible focus. Then remove
  `recipes_edit_directions_hint`. Do not fake a synchronous preview of AI-derived structure.
- **Acceptance:** A semantic save never leaves the user wondering whether the cooking view is
  stale; a nonsemantic save does not show a false regeneration state.
- **Verification:** Cost-free stubbed generation tests and a disposable-data browser story; no
  provider request.
- **Risk:** R1, impact 2/5, effort S, confidence medium.
- **Rollback:** Restore the hint if the real state cannot be made reliable without expanding
  architecture.
- **Dependency:** None.

### SDT-8 — Run the complete story and remove only redundant copy

- **Intent:** Prove that the new controls carry the meaning at phone and wide widths, in both
  locales, without eroding safety or status communication.
- **Targets:** Browser fixtures/specs, `messages/en.json`, `messages/nl.json`, and only the surfaces
  changed by SDT-1 through SDT-7.
- **Change:** Delete helper sentences only after the paired state/control/preview passes its
  interaction story. Preserve safety, destructive confirmation, loading, error, recovery, system
  context, and external-connection instructions.
- **Acceptance:** A first-time user can identify source, consequence, blocker, and next action on
  every changed surface without the removed sentences; no overflow, clipped action, inaccessible
  name, or locale regression at 375 and 1280.
- **Verification:** Full matrix below plus repository gates.
- **Risk:** R1, impact 3/5, effort M, confidence high.
- **Rollback:** Restore individual strings per surface; do not roll back the correctness fix.
- **Dependencies:** SDT-1 through SDT-7.

## Verification matrix

Run all repository gates:

```text
npm run test:unit
npm run check
npm run build
```

Use a copied/disposable database for every browser path that writes. Use fixtures for generation
and AH review; do not spend provider credits or push a real basket.

| Story | 375 px | 1280 px | EN | NL | Keyboard | Pointer |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| Add meal: freezer 6 vs fresh 16, one recipe row | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Recipe Plan uses identical source semantics | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Needs-review assistant card reaches recipe | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Incompatible shopping rows disclose sources without changing IDs/AH input | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Meal settings preview responds before save | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Import blockers reach exact reset group without deleting | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Inventory relationship Manage/Clear states | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Semantic recipe save shows real preparing/refreshing state | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

Also exercise zero stock, stock shorter than requested servings, fixed-batch recipes, legacy
persisted tool displays, all/some bought shopping groups, week boundaries, zero/nonzero import
blockers, loading failures, and reduced motion.

## Invariants and failure-mode review

| Failure mode | Guardrail and proof |
|---|---|
| Only one planning caller gets the source-aware default. | One pure helper, two caller tests, and two browser entry points. |
| Deduplicating meal rows loses source or fixed-batch meaning. | Keep two explicit actions and assert fixed-batch multiples and optimistic/server parity. |
| Shopping presentation accidentally changes AH aggregation. | Keep grouping in presentation; assert exact `entryIds`, Dutch terms, and AH input fixtures. |
| Grouped shopping checkboxes update the wrong rows. | Mutate the existing underlying row IDs and test all/some bought states. |
| An LLM injects an arbitrary action URL. | Persist typed entity metadata only; derive allowlisted base-local routes in app code. |
| Old assistant history stops rendering. | Optional metadata and fixtures for the old serialized display contract. |
| Settings preview drifts from server date math. | Reuse canonical week/weekday helpers and test real boundary dates. |
| Import recovery weakens destructive safeguards. | No bulk reset; anchors only; retain exact-name confirmation for each group. |
| Removing the editor hint hides asynchronous regeneration. | Remove it only after the real redirect and preparing/refreshing state pass. |
| The sweep turns into a new design system. | Reuse existing components; introduce a shared component only for repeated semantics. |

Residual risk is medium until the source-choice and shopping/AH invariants pass. It drops to low
after the full matrix and repository gates.

## Rollout and rollback

- Implement and verify one vertical ticket at a time, beginning with SDT-1.
- No feature flag or beta stage gate is needed: the changes are reversible code and UI contracts,
  not R3 schema/auth/destructive-data work.
- Deploy through the normal beta path only after all three repository gates and the cost-free
  browser matrix pass.
- Roll back by reverting each UI/helper contract as a unit. There is no migration or data
  rollback. If SDT-1 must be reverted, revert both planning callers together.
- Never use production household data for a write verification, a real provider call, or an AH
  basket push.

## Critique and decision

**Steelman:** The existing helper copy is cheap, and replacing it with previews and controls can
add clutter or subtly change semantics. A broad polish pass also risks reopening recently shipped
work.

**Response:** The chosen scope is not a general ban on help text. It fixes one observed
contradiction and six blocked handoffs using data and mutation seams the app already owns. It
explicitly preserves safety, status, recovery, Dutch-canonical shopping, fixed-batch, and AH
invariants, and defers decorative or recently shipped areas without a user-task failure.

**Recommendation:** GO. No steelman failure.

An external model critique was attempted with the routed model and fallbacks, but the configured
models were unavailable and the account fallback had reached its weekly limit. The failure-mode
review above is therefore local and records the resulting extra guardrails explicitly.

## Open questions and defaults

These are implementation defaults, not blockers:

- **Freezer servings above stock:** allow the user to adjust but show the shortage beside the
  source; do not silently switch to fresh.
- **Assistant action label:** use Review when `needs_review` is true and View otherwise.
- **Shopping disclosure:** expand only rows marked `incompatibleQuantities`; keep ordinary rows
  compact.
- **Import blockers:** link to existing per-group reset controls; never add “reset all.”
- **Recipe editor:** if the real preparing/refreshing transition cannot be made reliable within
  SDT-7, keep the hint and stop that ticket rather than inventing a fake preview.

## Resume pack

- **Next command:** `/plan` for the next item.
- **Tickets:** SDT-1 through SDT-8 complete.
- **Current blocker:** none. Household verification remains open for the linked known issue.
- **Risk:** R2 overall; `wide_sweep: true`; `requires_stage_gate: false`.
- **Authoritative artifacts:** this file, the linked known issue, and
  [`2026-07-24-plan-show-dont-tell-ui.html`](../../artifacts/archive/2026-07-24-plan-show-dont-tell-ui.html).

## Delivery record

- SDT-1 through SDT-8 shipped together with no schema, auth, provider-contract, or AH write-path
  change.
- Source-aware meal actions now show and submit the same freezer/fresh portion count in both
  planning callers; fresh batch controls stay hidden for freezer-served meals.
- Assistant recipe results have direct local Review/View actions; incompatible shopping rows
  expose exact meal and recipe contributions; inventory recipe relationships have named Manage
  and Clear actions.
- Meal settings preview unsaved consequences, and Data import shows localized blockers linked to
  the existing per-group destructive controls.
- Recipe edits regenerate cooking structure only when ingredient/direction identity or timer
  duration changes, so wording-only saves no longer show a false refresh.
- Verification passed with 426 unit tests, zero Svelte diagnostics, a production build, and
  disposable-data browser stories at 375 and 1280 CSS pixels in English and Dutch. No provider or
  Albert Heijn request was made.
