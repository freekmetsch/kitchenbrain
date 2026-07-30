# Green Ribbon Contextual Coherence

_Status: Shipped - 2026-07-30 (64/72 Green Ribbon family restored with contextual Recipe actions)_

## Problem framing

Commit `8f4b1a5` reduced the shared Green Ribbon contract from 64/72 px to 56/64 px and narrowed
the copy flex basis for every caller. That made Recipe Edit fit Back, contextual identity, and
Save on one 320 px row, but solved an editor-specific composition problem by changing the visual
rhythm of the whole app. Recipe Edit now reads as a compressed utility bar rather than the same
green page identity used by Stock, Meal plan, Shopping, Recipes, Settings, and Login.

The expected result is one coherent Green Ribbon family with a stable material, type hierarchy,
content measure, 64/72 px normal geometry, and 44 px controls. The family may have an explicit
contextual composition for pages that combine Back navigation, identity, and a primary action.
That composition is stylistically bespoke through layout intent, not through a second color,
component, or route-local visual dialect.

Diagnosis: `docs/known_issues/current/ISSUE_GREEN_RIBBON_RECIPE_EDIT_COHERENCE_20260730-0846.md`.

## Scope

### In

- Restore the pre-`8f4b1a5` 64 px phone / 72 px desktop Green Ribbon geometry before designing
  the replacement.
- Add one explicit contextual layout to `KitchenPageHeader` for Back + identity + primary-action
  pages.
- Apply the contextual layout to Recipe detail and Recipe Edit, the two existing callers with
  both leading navigation and a ribbon action.
- Keep standard action-only and Back-only callers on the standard layout.
- Lock normal geometry, narrow-screen fit, Dutch/English copy, 200%-equivalent text growth,
  keyboard focus, action semantics, and overflow in the browser contract.
- Update the durable house-style contract, issue log, and repository log.

### Out

- Green color, typography family, primary-action color, page utilities, route composition below
  the ribbon, or information architecture changes.
- Save, Plan, Back, dirty-state, form, menu, focus-return, or navigation behavior changes.
- Assistant, Cook Mode, timers, bottom navigation, data, schema, auth, provider, Albert Heijn,
  secrets, runtime configuration, and dependencies.

## Existing-system inventory

| Seam | Current state | Planning consequence |
|---|---|---|
| `KitchenPageHeader` | One owner for green material, identity, optional leading navigation, and one action | Keep one owner; add layout intent here rather than a route-local header. |
| Standard callers | Login/Settings identity-only, Settings panels Back-only, Stock/Meal plan/Shopping/Recipes action-only | Restore their shared 64/72 px contract without changing caller markup. |
| Contextual callers | Recipe detail and Recipe Edit provide both `leading` and `action` snippets | Mark both explicitly so the special composition is coherent across the Recipe family. |
| Browser contract | Currently asserts the compact 56/64 geometry and one 320 px Recipe Edit row | Revert the global assertion, then lock the contextual exception at the real rendered seam. |
| Durable style guide | Currently documents 56/64 as the family rule | Restore 64/72 and document contextual layout as a composition, not a second style. |

## Diagnosis and hypotheses

The repro is deterministic at `/recipes/e2e-primary-stew/edit`, 320 × 844: the current ribbon is
56 px, with Back, a 121 px copy column, and Save forced into a dense single row.

| Rank | Hypothesis | Evidence | Prediction | Confidence |
|---|---|---|---|---|
| 1 | A global geometry change was used for an editor-specific layout problem. | `8f4b1a5` changes the shared min-height/padding and copy basis; every caller inherits it. | Restoring the original family geometry and narrowing only an explicit contextual composition preserves both coherence and 320 px fit. | High |
| 2 | Recipe Edit needs its own header component. | The route has transactional controls, but all visual ingredients already exist in the shared primitive. | A second component would duplicate material/type/focus rules without improving fit. | Low |
| 3 | Save should move below the green surface. | It would free horizontal space, but would separate the editor's highest-value action from its page identity and diverge from Recipe detail. | The route would fit but lose the approved one-primary-action ribbon hierarchy. | Medium-low |

## Option comparison

### Chosen — explicit contextual layout in the shared primitive

Restore standard 64/72 geometry. Add a typed `layout="contextual"` intent that keeps a 44 px
icon treatment for the primary action only at the narrow breakpoint, preserves its accessible
label, and permits growth when content no longer fits. Use it for Recipe detail and Recipe Edit.

- One visual owner and one normal space contract.
- The layout difference is deliberate and testable instead of inferred from slot count.
- Future Back + action pages must opt in consciously.

### Rejected — keep the global compact contract

This is the proven regression: it makes every route absorb Recipe Edit's constraint and changes
the whole app's page-identity rhythm.

### Rejected — create `RecipeEditorHeader`

This would add a parallel owner for green material, typography, focus, and responsive behavior,
making future drift more likely.

### Rejected — infer layout with `:has()` or slot count

Automatic inference is concise but hides intent: adding or removing an action would silently
change layout behavior. A typed prop makes the composition reviewable at each caller.

## Chosen implementation contract

- Standard Green Ribbons are 64 CSS px below 768 px and 72 CSS px from 768 px upward at normal
  text size.
- `layout="standard"` remains the default and keeps the original 10 rem copy basis.
- `layout="contextual"` uses the same green material, content measure, eyebrow/title type, action
  treatment, and normal 64/72 geometry.
- Only below 23 rem, the contextual primary action uses its 44 px icon treatment while its full
  label remains accessible; the text label returns above that breakpoint.
- When Dutch/English copy, 200%-equivalent text, or a wider action no longer fits, the ribbon may
  wrap and grow. Nothing clips or causes document overflow.
- Recipe detail and Recipe Edit use the contextual layout. Standard callers remain unchanged.
- Back and action remain native links/buttons with 44 px targets and visible focus.

## Phase plan

### Phase 1 — restore and prove the baseline

1. Revert only the production/test/style-guide effects of `8f4b1a5`; keep its append-only history.
2. Run the focused browser repro to prove the standard family is back at 64/72 and Recipe Edit
   again exposes the original narrow-screen composition failure.

### Phase 2 — contextual composition

3. Add the typed contextual layout to `KitchenPageHeader`.
4. Opt Recipe detail and Recipe Edit into it.
5. Replace the compact regression assertion with standard-family and contextual-family browser
   contracts.

### Phase 3 — UI closure and delivery

6. Audit standard, Back-only, action-only, and contextual headers at 320/393/768/1280 px, light
   and dark, English and Dutch, keyboard focus, and 200%-equivalent text.
7. Update the durable contract and issue/artifact logs.
8. Run the complete repository gate, commit, and push the existing feature branch.

## Execution tickets

### GRC-1 — restore the shared family baseline

- **Observable behavior:** standard ribbons return to 64 px on phone and 72 px on desktop; the
  320 px Recipe Edit repro again demonstrates why a contextual composition is needed.
- **Scope in:** revert shared geometry, compact browser assertion, and 56/64 style-guide text.
- **Scope out:** delete historical log evidence or change callers.
- **Target files:** `src/lib/components/ui/KitchenPageHeader.svelte`,
  `tests/e2e/house-style.e2e.ts`, `docs/ui-house-style.md`.
- **Risk tier:** R1. `wide_sweep: false`. `requires_stage_gate: false`.
- **Verification:** focused house-style Playwright repro; exact 64/72 standard geometry; 320 px
  Recipe Edit baseline evidence.
- **Rollback:** reapply `8f4b1a5`; no data/configuration recovery.

### GRC-2 — shared contextual Recipe composition

- **Observable behavior:** Recipe detail/edit retain the same 64/72 Green Ribbon family while
  fitting Back + short identity + primary action on one row at 320 px; long/enlarged content grows.
- **Scope in:** typed layout prop, contextual narrow breakpoint, Recipe detail/edit opt-in, source
  and browser contracts.
- **Scope out:** action behavior, copy, forms, menus, or route utilities.
- **Target files:** `src/lib/components/ui/KitchenPageHeader.svelte`,
  `src/lib/components/recipe-detail/RecipeHeader.svelte`,
  `src/routes/recipes/[slug]/edit/+page.svelte`,
  `src/lib/ui_house_style_source.test.ts`,
  `tests/e2e/house-style.e2e.ts`.
- **Risk tier:** R1. `wide_sweep: false`. `requires_stage_gate: false`.
- **Dependencies:** GRC-1.
- **Verification:** Recipe detail/edit at 320 px in English/Dutch; normal 64 px height; Back and
  action aligned; 44 px controls; 200% text growth; no clipping/overflow; standard callers remain
  64/72.
- **Rollback:** revert the contextual prop and two caller opt-ins together.

### GRC-3 — durable contract and complete gate

- **Observable behavior:** documentation describes one coherent family and the issue is awaiting
  user verification with complete test evidence.
- **Scope in:** style guide, feature list, issue log, append-only repository log, full gate, push.
- **Scope out:** merge or production deployment.
- **Target files:** `docs/ui-house-style.md`, this feature list,
  `docs/known_issues/current/ISSUE_GREEN_RIBBON_RECIPE_EDIT_COHERENCE_20260730-0846.md`,
  `docs/log.md`.
- **Risk tier:** R1. `wide_sweep: false`. `requires_stage_gate: false`.
- **Dependencies:** GRC-1 and GRC-2.
- **Verification:** real-browser UI audit with no P1-P3 finding; `git diff --check`; `npm test`.
- **Rollback:** revert the final feature commit; no schema/data/auth/provider/AH rollback exists.

## Risk and verification matrix

Overall risk is **R1**: one shared presentation primitive and two explicit callers change, with
no route behavior, persistence, auth, provider, AH, schema, or runtime configuration impact.

| Failure mode | Trigger | Impact | Detectability | Mitigation | Residual risk |
|---|---|---|---|---|---|
| Standard headers remain globally compressed | Baseline revert is incomplete | Family coherence is not restored | Exact geometry across stable routes | GRC-1 restores and verifies 64/72 before contextual work | Low |
| Contextual layout becomes a second visual style | Route-local color/type/spacing is added | Recipe pages drift again | Source review and computed style checks | Contextual layout changes only narrow flex basis in the shared owner | Low |
| Dutch Save or Plan wraps unexpectedly | Contextual copy/action exceeds 320 px row | Header becomes taller at normal text | Dutch 320 px browser state | Allow intentional growth; assert single row only for content that fits | Low |
| Enlarged text clips | Normal geometry is implemented as fixed height | Identity/action becomes inaccessible | 200%-equivalent browser state | Keep min-height and wrapping, assert height growth and no overflow | Low |
| Detail and Edit diverge | Only one Back + action caller opts in | Recipe family feels inconsistent | Source guard and both route states | Migrate both contextual callers in one ticket | Low |
| Back/Save/Plan behavior changes | Markup or handlers move during visual work | Navigation or submission regresses | Existing kitchen-flow/browser tests | Change only the layout prop; preserve native controls and handlers | Low |
| Automatic layout surprises future callers | Layout is inferred from slots | Unreviewed visual change after a caller edit | Source review | Typed explicit layout with standard default | Low |

### Audit record

- **UI:** Applicable. Browser evidence at Recipe Edit 320 × 844 confirms a P2 family-coherence
  regression: the global compact patch changes the page-identity rhythm to solve one transactional
  layout. The planned fix preserves one visual owner and verifies all header shapes.
- **Harden/stack discipline:** Not triggered. No security, data, dependency, service, or runtime
  boundary changes.
- **Context7:** Not needed. This is internal CSS/Svelte composition with no new external API or
  version-dependent behavior.

### Steelman

The strongest alternative is to infer the contextual layout whenever both leading and action
slots exist. That removes one prop, but makes visual behavior depend on incidental slot count and
silently changes if a caller later adds or removes an action. The explicit typed layout is the
stronger long-term choice: it preserves one component, documents intent at the two Recipe callers,
and lets tests distinguish standard from contextual composition without creating a second style.

**Plan critique recommendation:** GO. All failure modes are low residual risk, each ticket maps
to one observable behavior, Playwright exercises the rendered seam, and rollback is code-only.
There is no P0/P1 finding, high-risk migration, or steelman failure requiring an independent
model cross-check.

## Decision resolved

The contextual composition covers both Recipe detail and Recipe Edit. They are the only existing
Back + primary-action ribbons, so one explicit Recipe-family composition prevents immediate drift.

## Resume pack

- **Goal:** restore the Green Ribbon's 64/72 family rhythm and solve Recipe Back + action fit with
  one explicit contextual composition.
- **Current state:** shipped and fully verified on the feature branch; issue awaits user visual
  confirmation.
- **First command:** none; implementation is complete.
- **First files:** `src/lib/components/ui/KitchenPageHeader.svelte`,
  `tests/e2e/house-style.e2e.ts`, `docs/ui-house-style.md`.
- **Verification complete:** baseline repro, contextual Recipe detail/edit matrix, and complete
  `npm test`.
- **Decision:** contextual composition applies to both Recipe detail and Recipe Edit.

## Shipped result

The global 56/64 compact patch was reversed before replacement work. Standard Green Ribbons now
again use the intended 64/72 px phone/desktop geometry. `KitchenPageHeader` owns an explicit
`contextual` layout used only by Recipe detail and Recipe Edit; it keeps the same green material,
type, content alignment, and height while rendering the primary action as a 44 px icon below
23 rem. The full accessible action label remains in the DOM and returns visually above that
breakpoint.

Real-browser verification covered standard, Back-only, action-only, and contextual ribbons at
320/393/768/1280 px; English and Dutch; light and dark; normal and 200%-equivalent text; and
disabled, active, and focused actions. No P1-P3 UI finding remains. The final clean repository
gate passed 125 unit-test files / 691 tests, 29 primary authenticated browser stories with one
deliberate connected-AH skip, clean Svelte diagnostics, and the production build.
