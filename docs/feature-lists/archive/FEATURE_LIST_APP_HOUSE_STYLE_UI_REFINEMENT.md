# App House Style — UI Refinement

_Status: Shipped - 2026-07-31 (compact object cards, centered Shopping, semantic sliding choices, and state-integrity repairs)_

Risk: R2 — wide shared-UI and responsive-layout sweep; no schema, auth-boundary, provider,
Albert Heijn request, or persistent-data behavior change
`wide_sweep: true`
Stage gate: not required — beta staging applies to R3 work; every ticket in this plan is code-only R1/R2
Owner: current `$run`

## Problem Framing

The shipped Deep Grove chassis is coherent at a glance but its latest connected-ledger pass left
four deterministic regressions and several high-frequency hierarchy problems:

- narrow Stock rows can grow beyond their track and clip the always-needed quantity controls;
- route-owned bottom spacing and Recipe-detail clipping break the documented six-pixel Grove
  reveal;
- a freshly opened Recipe editor can appear dirty and persist a draft without a user edit;
- Stock warnings, connected Recipe/Stock rows, Meal controls, and Shopping's permanent history
  rail make routine household work denser or less centered than the content warrants.

Freek and Ylfa use these surfaces repeatedly on phone and desktop. The desired outcome is a
compact object-card grammar with one-tap quantities, quiet default states, clear exceptional
recovery, and one shared motion/semantics recipe for exclusive choices.

The browser reproduction and source diagnosis live in
`docs/known_issues/solved/ISSUE_GROVE_CHASSIS_UI_REGRESSIONS_20260731-1010.md`.

## Resolved Product Decisions

| Surface | Decision |
|---|---|
| Stock cards | Separate neutral cards, normally two lines, with quantity steppers always visible |
| Recipe relationships | One section-level count opens a focused review mode; item-level recipe actions appear only there |
| Stock warning color | Reserve warning color for genuine expiry/review risk, not every low-stock row |
| Shopping alignment | One centered focused column; remove the permanent right history rail |
| AH history | Successful and previous attempts open on demand; unresolved latest outcomes remain inline with recovery |
| Meal Plan | One separate card per meal; portions remain the primary repeated control |
| Batch size | Small anchored popover containing a shared `1×/2×/3×/4×` exclusive choice |
| Recipes | Separate cards with modest grid gaps while retaining one/two/three responsive columns |
| Exclusive controls | Shared sliding indicator and keyboard model; combinable/optional filters remain chips |
| Motion | Short CSS transitions with no layout jump; the existing global reduced-motion guard remains authoritative |

## Scope

### In

- Shared Grove work-surface ownership and geometry.
- A semantic segmented-choice contract, sliding indicator, disabled/no-selection behavior, and
  current exclusive-choice callers.
- Stock responsive containment, compact cards, neutral priority treatment, quantity reachability,
  and recipe-decision review mode.
- Meal card composition and native top-layer batch popover.
- Shopping centering and AH history/recovery separation.
- Recipe index card separation and Recipe-detail clipping.
- Recipe Edit fresh/recovered draft integrity.
- Localized invalid-login feedback and password-manager username metadata.
- House-style documentation, English/Dutch messages, source contracts, unit tests, and Playwright
  coverage.

### Out

- Database schema, migrations, authentication/session boundaries, account creation, or household
  data changes.
- Provider, Assistant, AH search/push request behavior, Shopping derivation, or Dutch ingredient
  field changes.
- New packages, design libraries, feature flags, or persisted UI preferences.
- Redesigning Cook Mode, generic bottom sheets, Shopping completion, swipe-to-delete, or
  combinable filter behavior.
- Hiding unresolved/failed AH outcomes inside an on-demand surface.

## Existing-System Inventory and Invariants

- `src/app.css` owns Grove, paper, focus-width, motion, reduced-motion, and shared card recipes.
- The former `SegmentedTabs.svelte` owned arrow-key/roving-focus behavior but used tab semantics
  for value choices. The implementation replaces it with `SegmentedControl.svelte`.
- `BottomSheet.svelte` owns native-dialog focus trapping and focus return. Closed sheet content is
  not an announcement surface.
- Stock writes stay in `InventoryController`; item components emit intent only. The row's
  `overflow-hidden` clips the swipe-delete backdrop and must not be removed as a shortcut.
- `PushHistory.svelte` combines history with live pending/failed/partial recovery. Those roles must
  be separated before history becomes on-demand.
- Recipe Edit already supports session recovery. A clean-baseline repair must never make a
  recovered draft clean or delete it.
- Existing motion tokens and the global reduced-motion clamp remain the only duration system.
- Every AH/shopping caller continues to source from Dutch recipe ingredient names.

## Diagnosis

The regressions are deterministic. The fast feedback loop is the seeded Playwright fixture at
375/1280 px plus focused source/unit assertions; no provider or external AH call is needed.

| Rank | Hypothesis | Evidence | Prediction | Confidence |
|---|---|---|---|---|
| 1 | Stock retains min-content width inside a shrinking grid track | A 571 px row is clipped inside a 331 px column; quantity buttons start beyond the viewport | `minmax(0, 1fr)` ownership plus a name/quantity grid keeps every stepper within the 375 px viewport | High |
| 2 | Grove spacing and clipping have multiple owners | Route bottom padding sits outside the pseudo paper; Recipe detail clips the surface owner | Moving clearance inside the surface and clipping to an inner wrapper restores the six-pixel reveal | High |
| 3 | Recipe Edit's fresh client snapshot differs from its normalized server baseline | Fresh fixture load enables Save and writes session state; the exact differing field is not yet identified | A first failing browser/unit seam will name the mismatch; a server-derived normalized baseline will stay clean while recovered drafts remain dirty | Medium |
| 4 | Connected boards and permanent context rails cause the observed hierarchy drift | Runtime geometry shows orange repeated rows, three-line Stock cards, equal-weight Meal controls, and Shopping's main column 158 px left of viewport center | Separate object cards and on-demand secondary context restore compact scanning and centered work | High |

### Options

1. **Chosen — shared primitive repair plus route-specific composition.** Fix shared geometry,
   choice semantics, and motion once; keep Stock, Meal, Shopping, and Recipe information
   architecture local. This removes drift without creating a universal card component.
2. **Rejected — local CSS patches per route.** Smaller initial diff, but it preserves duplicate
   ownership, semantic inconsistencies, and the same regression pressure at every caller.
3. **Rejected — full page redesign or data-model rewrite.** Could reshape every workflow, but adds
   data and behavior risk unrelated to the observed UI problems.

## Phase Plan

### Phase 1 — Correct shared seams

Repair Grove surface ownership, establish semantic choice modes and measured motion, and add a
native top-layer compact popover. Each shared behavior receives its own test before route
migrations.

### Phase 2 — Recompose repeated household work

Apply compact separate cards and focused secondary states to Stock, Meal Plan, Shopping, and
Recipes one journey at a time, running the closest Playwright slice after each.

### Phase 3 — State integrity, small leftovers, and delivery

Lock Recipe Edit clean/recovered behavior, localize Login, add account metadata, update the house
style, run the complete gate and final UI/UX browser sweep, simplify, archive, commit, and push.

## Execution Tickets

### UIR-01 — Restore one Grove surface owner

- **Observable behavior:** Short and long stable routes retain exactly the documented six-pixel
  Grove reveal to the fixed navigation; Recipe detail uses the same side reveal at 1280 px.
- **Scope in:** Move fixed-bar clearance inside the shared paper owner; remove route-owned outer
  padding; move Recipe-detail horizontal clipping to an inner wrapper; avoid `100vw` scrollbar
  assumptions.
- **Scope out:** Header/nav geometry and route content widths.
- **Targets:** `src/app.css`, `src/routes/inventory/+page.svelte`,
  `src/routes/meal-plan/+page.svelte`, `src/routes/recipes/+page.svelte`,
  `src/routes/recipes/[slug]/+page.svelte`, `src/lib/ui_house_style_source.test.ts`,
  `tests/e2e/house-style.e2e.ts`.
- **Risk:** R2. **Effort:** M. **Confidence:** High.
- **Verification:** Focused source test; paper-frame geometry at 320, 393, and 1280 px; short and
  scrollable content; no document overflow.
- **Rollback:** Revert shared/route spacing classes together; no persisted state is involved.

### UIR-02 — Separate tab semantics from exclusive-choice semantics

- **Observable behavior:** Every shared segmented control is keyboard reachable and announces its
  real role, including no-selection and partially disabled states.
- **Scope in:** Add explicit `tabs` versus `choice` semantics (or a sibling
  `SegmentedChoice.svelte` sharing the visual track); use `radiogroup`/`radio` and `aria-checked`
  for choices; support per-option disabled state; skip disabled choices with arrow keys; give the
  first enabled option the roving tab stop when no value matches; remove dangling
  `aria-controls` unless a real panel exists.
- **Scope out:** Multi-select and optional `FilterChip` behavior.
- **Targets:** `src/lib/components/ui/SegmentedControl.svelte`, shared component tests/source
  contract, current settings/inventory/Recipe toolbar callers.
- **Risk:** R2. **Effort:** M. **Confidence:** High.
- **Verification:** Unit/component assertions for arrow wrap, disabled skip, no selection,
  one-option fallback, role/state, and real panel IDs.
- **Rollback:** Restore the former component contract and callers in one commit.

### UIR-03 — Add the shared sliding indicator and migrate exclusive filters

- **Observable behavior:** Selection moves as one quiet shared indicator without content jumps;
  keyboard and pointer produce the same selected state.
- **Scope in:** Measure live button rectangles for inline/grid and long-label callers; remeasure
  after hidden sheets open and on resize; use CSS transitions only; define a no-selection hidden
  indicator; migrate Stock scope, Shopping All/Weekly/Meal, Meal source, Settings choices, and
  Recipe view/language.
- **Scope out:** Recipe availability toggles, optional food/dish filters, Stock advanced filters,
  and Meal drawer category chips.
- **Targets:** shared segmented component(s), `src/routes/inventory/+page.svelte`,
  `src/lib/components/shopping/ShoppingLists.svelte`,
  `src/lib/components/meal-plan/MealSourceChoice.svelte`,
  `src/lib/components/inventory/FiltersSheet.svelte`,
  `src/lib/components/recipe-detail/RecipeViewToolbar.svelte`, Settings callers,
  `tests/e2e/house-style.e2e.ts`.
- **Risk:** R2. **Effort:** M. **Confidence:** Medium-high.
- **Dependencies:** UIR-02.
- **Verification:** Pointer/ArrowLeft/ArrowRight, closed-then-open Filters sheet, 320 px Dutch
  labels, grid/inline modes, dark theme, and `prefers-reduced-motion: reduce`.
- **Rollback:** Remove the indicator layer while retaining corrected semantics.

### UIR-04 — Make Stock cards compact and quantity-safe

- **Observable behavior:** Every quantity control remains fully within a 320/375 px viewport;
  normal rows use at most two information lines and independent card boundaries.
- **Scope in:** Shrink grid tracks/groups; use a name/quantity grid with truncation/disclosure;
  keep the compact stepper always visible; replace connected rows with an 8 px card gap; remove
  group-wide honey wash; keep exceptional expiry/review signals specific and textual.
- **Scope out:** Quantity write behavior, measured-unit editing, swipe deletion, group ranking,
  and keep-stocked calculations.
- **Targets:** `src/routes/inventory/+page.svelte`,
  `src/lib/components/inventory/ItemRow.svelte`,
  `src/lib/components/inventory/FacetChips.svelte`,
  `src/lib/components/inventory/QtyControl.svelte`,
  `tests/e2e/responsive-parity.e2e.ts`, `tests/e2e/house-style.e2e.ts`.
- **Risk:** R2. **Effort:** M. **Confidence:** High.
- **Verification:** Long fixture names at 320/375/1280; assert each stepper rect is inside its card
  and viewport; row height/density bound; quantity rollback/focus; swipe delete remains clipped
  to its card.
- **Rollback:** Restore Stock ledger classes without changing controller/write code.

### UIR-05 — Add focused Stock recipe-decision review

- **Observable behavior:** Normal Stock shows one neutral “N recipe decisions” action; activating
  it shows only unresolved meals with compact item-level recipe actions, and Close restores the
  prior normal view.
- **Scope in:** Add a controller-owned relationship-review filter/state; keep recipe management
  in the existing link sheet; hide unresolved row text outside review mode; announce entry/exit
  and retain search/scope clarity.
- **Scope out:** Changing recipe relationship values, auto-linking, or conflating recipe
  decisions with existing data-quality `needsReview`.
- **Targets:** `src/lib/components/inventory/controller.svelte.ts`,
  `src/routes/inventory/+page.svelte`,
  `src/lib/components/inventory/ItemRow.svelte`,
  `src/lib/components/inventory/FacetChips.svelte`, `messages/en.json`,
  `messages/nl.json`, controller tests and responsive Playwright coverage.
- **Risk:** R2. **Effort:** M. **Confidence:** High.
- **Dependencies:** UIR-04.
- **Verification:** Normal/review/zero/unresolved-resolved states, focus on entry and return,
  recipe link sheet, 320 px English/Dutch, and no warning wash.
- **Rollback:** Remove the review filter and restore the existing coverage status; relationship
  data remains untouched.

### UIR-06 — Create a compact native top-layer popover

- **Observable behavior:** A small anchored auxiliary panel escapes clipped cards, light-dismisses,
  closes on Escape, keeps within the visual viewport/fixed navigation, and returns focus.
- **Scope in:** Reusable UI primitive based on the native `popover` top layer; content-sized
  positioning with flip/clamp; trigger `aria-expanded`/target ownership; focus-in and focus-return;
  CSS entrance/exit compatible with the reduced-motion guard.
- **Scope out:** Replacing BottomSheet/dialog workflows or adding a positioning dependency.
- **Targets:** new `src/lib/components/ui/CompactPopover.svelte`, `src/app.css`, focused component
  or Playwright coverage.
- **Risk:** R2. **Effort:** M. **Confidence:** Medium-high.
- **Verification:** Open/dismiss/Escape/return-focus, near right/bottom edges at 320/375/1280,
  clipped ancestor fixture, keyboard-only, and reduced motion.
- **Rollback:** Remove the primitive; no caller migration occurs until UIR-07.

### UIR-07 — Compose Meal cards and Batch size popover

- **Observable behavior:** Each meal is a separate card; portions are immediately legible; Batch
  size opens a sleek popover with `1×/2×/3×/4×` choices and closes after a valid selection.
- **Scope in:** Separate Meal cards; quiet secondary/remove action; labelled portions row; shared
  segmented choice inside `CompactPopover`; disabled multipliers above 99; no-selection state for
  manually stepped values; update obsolete toggle/reset copy.
- **Scope out:** Meal/source write APIs, cooked/freezer modals, suggestion behavior, or day
  planning.
- **Targets:** `src/routes/meal-plan/+page.svelte`, shared segmented/popover components,
  `src/lib/meal_batch.ts`, `src/lib/meal_batch.test.ts`, `messages/en.json`, `messages/nl.json`,
  meal-plan Playwright coverage.
- **Risk:** R2. **Effort:** L. **Confidence:** Medium-high.
- **Dependencies:** UIR-02, UIR-06.
- **Verification:** One/four/invalid batch multipliers, free-stepped servings, pending state,
  long Dutch title, 320/393/1280, Escape/outside click/focus return, and live servings
  announcement.
- **Rollback:** Restore ledger rows and direct multiplier buttons; server behavior is unchanged.

### UIR-08 — Center Shopping and remove rail compensation

- **Observable behavior:** Shopping's primary list and fixed desktop shelf share the centered
  focused measure whether history exists or not.
- **Scope in:** One 52 rem column; delete `single-column`, right-rail grids, and the
  `translateX(-9.875rem)` dock compensation; preserve mobile shelf attachment and final-row
  clearance.
- **Scope out:** Shopping list grouping, source controls, mutation behavior, or AH actions.
- **Targets:** `src/routes/shopping/+page.svelte`,
  `tests/e2e/responsive-parity.e2e.ts`, `tests/e2e/house-style.e2e.ts`.
- **Risk:** R2. **Effort:** S. **Confidence:** High.
- **Verification:** No-history and seeded-history states at 320/393/768/1280; list/dock centers
  align; final row remains above the shelf.
- **Rollback:** Restore the two-column grid and dock compensation as one layout unit.

### UIR-09 — Put successful AH history on demand without hiding recovery

- **Observable behavior:** A small “Sent to AH” action opens success/previous history in a sheet;
  pending, uncertain, failed, or partial latest attempts remain inline with their alert and
  Open-AH recovery action.
- **Scope in:** Split live outcome from historical detail; keep live `aria-busy`/`aria-live` and
  alert semantics mounted; add an accessible history trigger/count; use existing BottomSheet
  focus behavior for on-demand history.
- **Scope out:** AH preview/push requests, retry logic, account linking, or persistence.
- **Targets:** `src/routes/shopping/+page.svelte`,
  `src/lib/components/shopping/PushHistory.svelte`, optional focused presentation component,
  `messages/en.json`, `messages/nl.json`, Shopping Playwright tests.
- **Risk:** R2. **Effort:** M. **Confidence:** High.
- **Dependencies:** UIR-08.
- **Verification:** Success, previous, pending, uncertain, partial, and failed fixtures; inline
  alert and Open-AH visibility; history sheet open/close/focus return; mobile first-item remains
  in the first useful viewport.
- **Rollback:** Recombine the presentation and restore always-visible history without touching
  stored push records.

### UIR-10 — Restore separate Recipe cards

- **Observable behavior:** Recipe results render as independent cards with modest gaps while
  preserving one/two/three columns and current image/action behavior.
- **Scope in:** Remove connected-grid surface and internal-border overrides; restore the existing
  `ui-recipe-card` border/radius/shadow; use 12 px gaps.
- **Scope out:** Recipe query, sorting, filters, actions, images, or data.
- **Targets:** `src/routes/recipes/+page.svelte`, `src/app.css`,
  `tests/e2e/house-style.e2e.ts`.
- **Risk:** R1. **Effort:** S. **Confidence:** High.
- **Verification:** 320/393/768/1280, missing/image cards, long titles, 1/2/3 column count, dark
  theme, and no horizontal overflow.
- **Rollback:** Restore wrapper ledger styling.

### UIR-11 — Prove and repair Recipe Edit clean/recovered state

- **Observable behavior:** A fresh ordinary edit load has disabled Save, no session draft, and no
  leave prompt; a valid recovered draft remains dirty, persisted, saveable, and protected.
- **Scope in:** First add the correct-seam failing browser/unit assertion and identify the
  differing field; derive a normalized clean baseline from server recipe data through the same
  hydrate/serialize pipeline; keep recovered drafts explicitly dirty; never delete recovered
  storage from a clean comparison.
- **Scope out:** Recipe save schema, structure-draft acceptance, image upload, or server mutation
  behavior.
- **Targets:** `src/routes/recipes/[slug]/edit/+page.svelte`, `src/lib/recipe_edit.ts`,
  `src/lib/recipe_edit.test.ts`, Recipe Edit Playwright coverage.
- **Risk:** R2 because draft loss is data-loss-adjacent. **Effort:** M. **Confidence:** Medium.
- **Verification:** Fresh load, valid recovered draft, stale stored draft, malformed stored draft,
  explicit structure-review draft, discard, save success/failure, navigation prompt.
- **Rollback:** Restore the former comparison only if recovered session data is preserved; no
  server data rollback.

### UIR-12 — Localize invalid-login feedback

- **Observable behavior:** Invalid credentials render in the currently selected English or Dutch
  locale, including a locale switch after failure.
- **Scope in:** Return a stable error code from the action and render `m.*()` copy client-side;
  localize the language group's accessible label.
- **Scope out:** Credential validation and session cookies.
- **Targets:** `src/routes/login/+page.server.ts`, `src/routes/login/+page.svelte`,
  `messages/en.json`, `messages/nl.json`, `tests/e2e/auth.e2e.ts`.
- **Risk:** R1. **Effort:** S. **Confidence:** High.
- **Verification:** Invalid English/Dutch credentials, language switch after failure, no session
  cookie.
- **Rollback:** Restore the server string without changing auth.

### UIR-13 — Add password-manager username metadata

- **Observable behavior:** The account password-change form exposes the current username to
  password managers without adding a visible or keyboard-focusable field.
- **Scope in:** Add an offscreen/screen-reader-safe username field with the correct
  `autocomplete="username"` contract and current value; preserve password labels and submission.
- **Scope out:** Password API, policy, or auth.
- **Targets:** `src/routes/settings/account/+page.svelte`, account/auth Playwright coverage.
- **Risk:** R1. **Effort:** XS. **Confidence:** High.
- **Verification:** Browser console has no password-form username warning; field metadata and
  submitted password request remain unchanged.
- **Rollback:** Remove the metadata field.

### UIR-14 — Update the contract, simplify, verify, and deliver

- **Observable behavior:** The written house style matches the shipped separate-card and
  segmented-choice system; all provider-free gates pass.
- **Scope in:** Update `docs/ui-house-style.md`; update source contracts; run a changed-code
  simplification pass; run `npm run check`, `npm run test:unit`, `npm run build`, and `npm test`;
  final UI/UX browser sweep; append `docs/log.md`; mark this feature list Shipped and archive it.
- **Scope out:** New cleanup tracks unrelated to changed callers.
- **Targets:** docs, source tests, Playwright tests, active issue/feature-list lifecycle files.
- **Risk:** R2. **Effort:** M. **Confidence:** High.
- **Dependencies:** UIR-01 through UIR-13.
- **Verification:** 320/393/768/1280; light/dark; English/Dutch; pointer/keyboard;
  reduced-motion; empty/long/error/recovered states; no external provider/AH request.
- **Rollback:** Revert the delivery commit; no migration, secret, or data repair is required.

## Risk and Verification Matrix

| Area | Tier | Required evidence |
|---|---|---|
| Shared surface/segmented/popover primitives | R2 | Focused tests per primitive, source contract, browser geometry/keyboard/reduced-motion |
| Stock/Meal/Shopping responsive composition | R2 | Seeded Playwright at 320/375/393/768/1280 with long/error states |
| AH history presentation | R2 | All outcome states; unresolved recovery remains inline; no real AH call |
| Recipe card styling | R1 | Column/card geometry and dark/long-content smoke |
| Recipe Edit session integrity | R2 | Fresh/recovered/stale/malformed/structure-review draft matrix |
| Login/account metadata | R1 | Auth Playwright and browser-console check |
| Full repository | R2 | `npm test` plus final real-browser UI/UX sweep |

Audit records:

- UI audit: complete on `origin/main` `84093f0`, light/dark and 320-1280 px.
- UX audit: complete for repeated Stock quantity/review, Meal batch, Shopping history/recovery,
  Recipe edit/resume, and Login failure journeys.
- Independent plan critique: `opus` initially returned NO-GO; its recovered-draft, AH recovery,
  semantics, disabled/no-selection, measurement, and popover mitigations are integrated above.
  Plan readiness after integration: GO.
- Harden audit: not applicable; no security, schema, auth-boundary, secret, or provider change.
- Stack-discipline audit: not applicable; no new dependency or service.
- Context7 exception: internal-only change; no external API behavior change.

## Failure-Mode Critique

| Failure mode | Trigger | Impact | Detectability | Mitigation | Residual risk |
|---|---|---|---|---|---|
| Recovered Recipe draft becomes the clean baseline | Baseline captured after applying session state | Save disables and draft may be deleted | Fresh/recovered browser matrix | Server-derived normalized baseline; recovered state forces dirty | Low |
| False-dirty fix targets the wrong field | Exact fresh mismatch is assumed instead of measured | Regression persists or is masked | First failing correct-seam test | Diagnose the differing field before implementation | Low |
| Failed AH recovery disappears in a closed sheet | Entire PushHistory moves on demand | Error is unannounced and Open AH is hidden | Outcome-state fixture | Keep unresolved latest outcome mounted inline | Low |
| Choices are announced as tabs or leave the tab order | Value controls reuse tab-only semantics; current value is null/unmatched | Keyboard/screen-reader interaction breaks | Role/tabindex assertions | Separate tab and radiogroup modes; enabled fallback | Low |
| Indicator measures zero or drifts | Control mounts hidden, resizes, or uses long Dutch labels | Selection highlight is missing/misaligned | Hidden-sheet and resize probes | Live rectangle measurement, resize/open remeasure, truncation/stack rule | Low |
| Disabled batch targets receive focus | Multiplier exceeds 99 | Dead action and confusing state | Unit/keyboard test | Per-option disabled contract and skip logic | Low |
| Popover is clipped or loses focus | Meal card/list ancestors clip overflow | Batch control becomes inaccessible | Edge/clipped-ancestor browser test | Native top-layer popover, clamp/flip, focus return | Low |
| Stock swipe affordance escapes its card | Overflow is removed to solve quantity clipping | Delete backdrop leaks between cards | Pointer/visual smoke | Keep row clipping; fix grid shrink/reflow instead | Low |
| Grove pseudo-surface causes scrollbar or bottom band | Viewport sizing includes scrollbar or route padding remains outside | Chassis continuity breaks | 320/1280 short/long geometry | Size from layout owner; clearance inside paper | Low |
| Shopping dock remains offset after rail removal | Legacy transform/single-column branches survive | List and actions center differently | Center-coordinate assertion | Delete rail compensation with layout change | Low |
| Separate cards create excessive vertical bulk | Existing three-line metadata is preserved | Phone scanning remains slow | Card-height/first-viewport check | Two-line Stock contract and modest 8/12 px gaps | Low |
| Shared card change leaks into Settings/Assistant | `ui-list-group` is globally redefined | Unrelated surfaces drift | Stable-route sweep/source diff | Route-specific object-card classes; do not redefine every ledger | Low |
| Motion remains active under reduced motion | JS/WAAPI animation bypasses CSS clamp | Vestibular/accessibility regression | Reduced-motion browser context | CSS transitions only | Low |

Steelman: Keeping the connected ledger and permanent Shopping rail would produce a smaller diff
and avoid retesting several shared primitives. It does not solve the repeated evidence: clipped
Stock actions, orange hierarchy wash, equal-weight Meal controls, or a primary Shopping column
visibly displaced by occasional history. The chosen shared-seam plus local-composition approach is
the narrower sustainable solution because it fixes semantics and geometry once while leaving all
data workflows and purpose-built interactions intact.

Plan critique: GO. There are no unresolved P0/P1 items after the outside-review mitigations above.
Every behavior has an observable ticket, rollback, and same-ticket verification.

## Rollout and Rollback

- Execute on `codex/ui-house-style-refinement`, based on the latest remote `main`, in its isolated
  worktree. The unrelated dirty worktree remains untouched.
- This is code-only R2 at beta: no stage-first data gate and no schema/auth split.
- Push the feature branch after the complete gate. A feature-branch push is not production.
- Production promotion remains the repository's normal GitHub-main merge path; after merge,
  Railway must report `SUCCESS`, source `main`, deployed commit equal to remote `main`, and the
  authenticated canary must pass.
- Rollback is a git revert of the delivery commit. No database, volume, credential, AH token, or
  household-data repair is required.

## Open Questions

None. The grill resolved every product choice, and the independent critique's technical gates are
integrated as mandatory ticket acceptance criteria.

## Resume Pack

- **Goal:** Deliver the whole-app house-style refinement: separate compact object cards, centered
  Shopping with on-demand history, smooth semantic exclusive controls, a sleek Meal batch
  popover, and the reproduced responsive/state fixes.
- **Current state:** All three phases are implemented and the complete repository gate passes on
  isolated branch `codex/ui-house-style-refinement`.
- **First command:** `git show --stat --oneline HEAD`
- **First files:** `src/app.css`, `src/lib/components/ui/SegmentedControl.svelte`,
  `src/lib/components/ui/CompactPopover.svelte`, and the four primary route compositions.
- **Pending verification:** None.
- **Open questions:** None.
