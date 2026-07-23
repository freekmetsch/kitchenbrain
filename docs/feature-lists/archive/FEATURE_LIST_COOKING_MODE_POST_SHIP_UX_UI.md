# Cooking Mode Post-Ship UX/UI

_Status: Shipped - 2026-07-23 (legacy-session safety, truthful recovery, measured sticky layout, accessible swaps, and concise cooking controls)_

## Shipped implementation

- Split structural cache validity from new-session eligibility: v4/v5 may seed a Kitchen Timeline session, while v2/v3 remain readable for compatibility and fall back safely for new cooks.
- Versioned persisted cooking sessions with a frozen display language. Ambiguous pre-change or corrupt payloads now clear once, including stale timers, and show a localized recovery notice.
- Replaced raw provider errors with bounded reason codes and localized EN/NL fallback copy; saved/source steps remain usable and retry explicitly requests the enhanced view.
- Published the measured recipe-header height to the cooking surface so sticky progress, counter, and scroll offsets remain correct when status copy wraps or changes.
- Replaced the clipped counter disclosure with the shared `BottomSheet`, including Escape/backdrop/selection dismissal, exact trigger focus return, explicit live/default actions, and 44 px cooking controls.
- Deduplicated identical timer context, normalized safe quantity-led preparation fragments, and renamed the rating/log disclosure to “After cooking” / “Na het koken.”

Verification completed without provider spend or writes to the primary database: 398 unit tests, zero Svelte diagnostics, and a production build from the isolated staged tree, plus mocked browser stories at 320, 375, 768, 1280, and 1536 px across EN/NL, legacy/current/corrupt session states, provider success/failure, swap success/conflict, 200% zoom, reduced motion, and keyboard focus return.

## Problem framing

The new Kitchen Timeline is strong on its normal phone, tablet, and desktop path, but the post-ship audit found three P1 defects at state and layout boundaries:

1. valid v2/v3 caches can still enter the v5-oriented surface and produce incomplete or language-inconsistent active sessions;
2. the mobile ingredient-swap disclosure renders outside the viewport and lacks dialog dismissal behavior;
3. the cooking toolbar's fixed sticky offset overlaps the recipe header's optional status row.

Five smaller accessibility, recovery, and content defects remain. These are concentrated in shared seams, so this should be a focused hardening pass rather than another cooking-mode redesign.

Audit evidence:

- real browser at 375 × 812, 768 × 1024, 1280 × 900, and 1536 × 960;
- an isolated copy of `dev.db` and a disposable local session;
- English/Dutch switching, step progression, ingredient checks/swaps, timer start, keyboard tabs, and provider-failure fallback;
- 18 existing targeted tests passing, which confirms the legacy-cache regression is encoded in current expectations;
- screenshots under `output/playwright/20260723-*cooking*`;
- diagnosis log: [`ISSUE_COOKING_MODE_POST_SHIP_UX_UI_20260723-1653.md`](../../known_issues/solved/ISSUE_COOKING_MODE_POST_SHIP_UX_UI_20260723-1653.md).

## Goal

Make every new cooking session complete, stable, and operable on a phone, including legacy-cache, translation-status, provider-failure, ingredient-swap, and timer states, without changing the shipped Kitchen Timeline direction or recipe/AH data contracts.

## Scope

### In scope

- cache eligibility and compatibility behavior for v2/v3/v4/v5 cooking data;
- frozen active-session behavior during language, serving, and provider-state changes;
- recipe-header/cooking-toolbar sticky layout contract;
- ingredient-swap presentation and keyboard/focus behavior;
- cooking-specific 44 px touch targets;
- localized generation/fallback recovery copy;
- duplicated timer context, preparation wording, and the mislabeled after-cooking disclosure;
- focused unit and real-browser regression coverage.

### Out of scope

- another visual redesign of the Kitchen Timeline;
- schema or migration changes;
- recipe editing, meal planning, shopping-list generation, or Albert Heijn integration;
- automatic rewriting of stored v2/v3 JSON;
- fabricating v5 ingredient or direction references from legacy data;
- global resizing of every compact control outside the cooking journey;
- live provider calls during verification.

## Existing-system inventory

| Seam | Current behavior | Reuse or change |
|---|---|---|
| `staleness.ts` | Validates and localizes v2/v3/v4/v5 through one broad “not stale” concept. | Keep legacy readers, add an explicit eligibility distinction for new Kitchen Timeline sessions. |
| `cook_session.ts` and persisted session state | Freezes the active cooking payload and progress. | Reuse as the safety boundary for already-started legacy sessions; do not silently replace their step graph. |
| Deterministic source fallback | Produces complete source-owned steps without provider spend. | Reuse immediately when a new session encounters v2/v3 or generation fails. |
| `BottomSheet.svelte` | Native-dialog primitive with focus trapping, Escape/backdrop dismissal, and motion handling. | Reuse for ingredient swaps instead of maintaining another overlay primitive. |
| `RecipeHeader.svelte` | Sticky header whose height changes when a translation status row appears. | Publish its actual sticky extent to the cooking surface. |
| `BenchSheet.svelte` | Uses a fixed `top-[3.25rem]`, raw API messages, and several compact controls. | Consume the header contract, map errors locally, and resize cooking controls selectively. |

## Findings

| Priority | Dimension | Finding and impact | Evidence | Effort | Principles |
|---|---|---|---|---|---|
| P1 | State / correctness | A valid v2/v3 cache can override the v5 surface. The audited v2 cache omitted ingredients from its timeline; switching language changed a running 3-step session into a 2-step fallback and reset its meaning. | `+page.svelte:376-380`, `staleness.ts:218-253`, `cook_mode.ts:413-423`, `staleness.test.ts:111-134`; `20260723-ui-cooking-audit-375.png` | M | [H1] [H4] [H6] |
| P1 | Responsive interaction | The first 256 px swap menu begins at x=-65 on a 375 px viewport. Part of the option list is unreachable or invisible. | `CounterBoard.svelte:70-99`; `20260723-ui-cooking-swap-clipped-375.png` | S | [WCAG 2.5.8] [Fitts] [RUI] |
| P1 | Sticky layout | The 64 px cooking toolbar remains at y=52 while the translation-status row occupies y=52-96, placing progress and serving controls underneath the recipe header. | `BenchSheet.svelte:991`, `RecipeHeader.svelte:162-181`; `20260723-ux-cooking-current-step-2-375.png` | M | [WCAG 2.4.11] [H1] [Norman] |
| P2 | Keyboard / focus | The swap disclosure stays open after Escape and has no explicit focus-return or backdrop behavior. | `CounterBoard.svelte:70-99`, keyboard browser pass | S | [KNav] [H3] [Jakob] |
| P2 | Touch accessibility | Counter actions, serving presets, timer actions, and after-cooking controls use 36-40 px boxes despite the shipped cooking plan's 44 px phone target. | `CounterBoard.svelte:51-72`, `BenchSheet.svelte:997-1011`, `Timer.svelte:170-189` | S | [WCAG 2.5.8] [Fitts] |
| P2 | Error recovery | A raw English server message (“Cook mode generation failed”) appears in Dutch while usable fallback steps are already present, and the retry label does not explain what enhancement it retries. | `BenchSheet.svelte:523-550`, cook-mode API `+server.ts:41-42` | S | [H9] [H1] [H2] |
| P2 | Content hierarchy | A fallback timer can repeat the same long instruction as both purpose and step title, creating two truncated lines in the floating timer. Preparation projection can also expose quantity-led legacy/v4 task fragments. | `TimerStack.svelte:72-80`, `Timer.svelte:161-166`, `cooking_steps.ts:75+`; `20260723-ui-cooking-timer-375.png` | S | [H8] [Gestalt] [Type] |
| P3 | Information scent | “Cooking history” contains the current rating and “Log this cook,” not cooking history. | `messages/en.json:186`, `BenchSheet.svelte:1061-1075` | XS | [H2] [Krug] |

Principle tokens use the audit skills' compact rubric: Nielsen heuristics (`H1`–`H10`), WCAG success criteria, keyboard navigation (`KNav`), responsive UI (`RUI`), Fitts, Norman, Jakob, Krug, Gestalt, and typography hierarchy (`Type`).

## What already works

- The numbered timeline, current-step emphasis, exact quantities, counter state, and timer placement are coherent on the normal path.
- The layout becomes a useful two-column timeline at tablet/desktop widths and does not horizontally scroll at 1536 px.
- Tablist arrow-key behavior, step-card focus rings, counter `aria-pressed`, and reduced-motion CSS are present.
- The deterministic source fallback keeps cooking possible without a provider response.
- The Dutch-canonical recipe and AH boundaries are outside this repair and remain untouched.

## Options considered

### A. Patch only the visible CSS defects

Constrain the current dropdown and adjust the fixed sticky number. This is small, but it leaves the incomplete legacy-session path, disclosure focus behavior, and future variable-height header states unresolved.

### B. Contract-first compatibility and interaction hardening — selected

Separate new-session eligibility from legacy active-session compatibility, reuse the existing dialog primitive for swaps, and make the sticky relationship explicit. Then perform a narrow cooking-control and copy pass. This removes the root causes without redesigning the shipped happy path.

### C. Rebuild cooking mode around a new route or full-screen shell

This would avoid some stacking constraints, but the responsive surface already works and the defects do not justify another architecture or navigation change.

## Chosen approach

Use four phases:

1. restore the cache/session contract and recovery semantics;
2. repair sticky and swap interaction contracts;
3. close targeted touch/content defects;
4. run focused and full release verification.

New Kitchen Timeline sessions accept v4/v5 structured caches only. When stored data is v2/v3, the page immediately renders complete deterministic source steps and lazily requests v5 through the existing bounded generation path.

The current persisted session does not store its frozen display language, so a pre-fix legacy session cannot honestly be preserved across reactive language changes. Introduce a versioned session payload that freezes the display language (or the complete localized display projection). A compatibility session created with that complete payload can finish unchanged until Reset. An older or incomplete persisted legacy session must be cleared once, remove its stale timers, and fall back to complete source steps with a localized notice. It must not be partially remapped. This is a compatibility reader, not an old-format endorsement.

The old JSON remains stored and readable for rollback. No data migration is required.

## Execution tickets

### CUX-1 — Separate new-session eligibility from legacy validity

**Outcome:** A recipe with stored v2/v3 data starts the Kitchen Timeline from complete source fallback and requests v5 lazily; valid v4/v5 remains reusable.

**Scope in:** explicit helper/API for “eligible for a new Kitchen Timeline session”; recipe-route initial selection; server cache-return gate; tests for each schema version and language/serving combination.

**Scope out:** deleting legacy validators/types, mutating stored JSON, synthesizing v5 references, or changing the v4/v5 semantic validators.

**Target paths:**

- `src/lib/components/cook-mode/staleness.ts`
- `src/lib/components/cook-mode/staleness.test.ts`
- `src/lib/server/ai/cook_mode.ts`
- `src/routes/recipes/[slug]/+page.svelte`
- focused server cook-mode tests

**Requirements:**

- [x] Add a named eligibility concept distinct from structural validity/staleness.
- [x] New sessions accept v4/v5 only, including serving and requested-language checks already required by those formats.
- [x] v2/v3 returns complete deterministic fallback immediately and schedules only the existing bounded v5 request.
- [x] A failed or budget-blocked request never removes fallback steps.
- [x] v4 dual-read compatibility and v5 preference remain intact.

**Verification:**

- Red tests first for v2/v3 rejection from new-session reuse and v4/v5 acceptance.
- Server test proves a valid v2/v3 cache does not short-circuit generation.
- Unit test proves no writes occur merely by classifying a cache.

**Risk:** R2 — changes the state-selection seam for existing data.

**Rollback:** Revert the eligibility callers while retaining legacy JSON and readers; no database rollback.

**Effort / confidence / dependencies:** M / high / none.

### CUX-2 — Version the frozen-session boundary and handle ambiguous legacy sessions safely

**Outcome:** A session persisted with a complete frozen-language/projection payload keeps its original steps, language, progress, checks, swaps, and timers until Reset. A pre-fix legacy payload that cannot prove that invariant is cleared once and replaced by complete source fallback with a localized notice.

**Scope in:** session hydration/identity, language and serving changes while active, reset behavior, provider success arriving during an active legacy session.

**Scope out:** upgrading a legacy session in place or trying to map its indices to stable v5 references.

**Target paths:**

- `src/lib/components/BenchSheet.svelte`
- `src/lib/components/cook-mode/cook_session.ts`
- `src/lib/components/cook-mode/cook_session.test.ts`
- `src/lib/types.ts`

**Requirements:**

- [x] Introduce the smallest new session payload version that freezes `viewLang` or the complete localized display projection.
- [x] Distinguish a complete versioned active session from a stored recipe cache and from ambiguous pre-change session data.
- [x] Keep a complete session's frozen display language and step graph until explicit Reset.
- [x] Do not apply a late v5 response to the active frozen session.
- [x] Reset clears progress and starts from current fallback/v5 eligibility rules.
- [x] If a pre-change, corrupt, or incomplete session cannot be hydrated safely, clear it and its stale timers, show a clear one-time notice, and use complete source fallback instead of partially mapping state.
- [x] The notice cannot repeat on reload once the invalid payload has been cleared.

**Verification:**

- Rehydrate fixtures from the actual pre-change local-storage payload plus the new complete session version; do not test only newly constructed fixtures.
- Change NL/EN, servings, provider response, reload, and a second tab generating v5 while on step 2; assert a complete session's step count, current identity, checks, swaps, and timers do not change.
- For old/corrupt/incomplete payloads, assert one-time fallback, stale-timer removal, and no repeated remap/notice on reload.
- Reset and assert the old active-session payload is no longer selected.
- Reset while generation is in flight and assert the late response cannot resurrect the legacy plan or progress.

**Risk:** R2 — cooking progress is user state.

**Rollback:** Revert session selection logic; stored recipe/session payloads remain untouched.

**Effort / confidence / dependencies:** M / medium-high / CUX-1.

### CUX-3 — Make fallback recovery localized and truthful

**Outcome:** Provider failure in either language leaves usable steps visible and explains, in that language, that retrying only adds an enhanced cooking view.

**Scope in:** cook-mode API error reason codes, client mapping, retry copy, budget/no-directions/network variants.

**Scope out:** changing provider budgets, model routing, retry policy, or exposing raw provider details.

**Target paths:**

- `src/routes/api/recipes/[slug]/cook-mode/+server.ts`
- `src/lib/components/BenchSheet.svelte`
- `messages/en.json`
- `messages/nl.json`
- API and component/state tests

**Requirements:**

- [x] API responses expose a bounded machine reason, never display copy as the client contract.
- [x] EN/NL messages state that saved/source steps remain usable.
- [x] Retry text names the benefit without AI/provider jargon.
- [x] Unknown reasons map to a localized safe default.

**Verification:**

- Mock each reason in EN and NL and assert no raw server message reaches the DOM.
- Browser story proves fallback remains interactive while the notice is visible.

**Risk:** R1 — localized presentation/API response shape only.

**Rollback:** Restore the prior generic message mapping; no persistent state involved.

**Effort / confidence / dependencies:** S / high / CUX-1.

### CUX-4 — Establish a measured sticky-header contract

**Outcome:** The cooking toolbar always starts below the complete recipe header, including normal, loading, success, and error status variants.

**Scope in:** measuring the sticky header block, publishing a CSS custom property or equivalent scoped layout value, consuming it in `BenchSheet`, and initial/resize/language-change behavior.

**Scope out:** moving cooking mode to a separate route or redesigning the recipe header.

**Target paths:**

- `src/lib/components/recipe-detail/RecipeHeader.svelte`
- `src/lib/components/BenchSheet.svelte`
- `src/routes/recipes/[slug]/+page.svelte`

**Requirements:**

- [x] One owner reports the actual sticky extent through a value on the common route ancestor so both sibling surfaces can consume it; no duplicated magic pixel values.
- [x] Initial render has a safe fallback and does not flash controls under the header.
- [x] Status-row appearance/disappearance, wrapping, zoom, font load, and resize update the value without a render loop.
- [x] Current-step centering and keyboard focus account for the combined sticky extent.

**Verification:**

- Browser assertions compare header bottom with toolbar top for all status variants at 375 and 768 px.
- Repeat at 200% zoom and after EN/NL copy changes.
- Verify no layout oscillation, console error, or obscured focused element.

**Risk:** R2 — shared sticky layout and scroll positioning.

**Rollback:** Return to the fixed fallback offset; no data impact.

**Effort / confidence / dependencies:** M / high / none.

### CUX-5 — Replace counter swap disclosure with the existing BottomSheet

**Outcome:** Every ingredient swap opens fully within the viewport, traps focus while open, closes on option/Escape/backdrop, and returns focus to the originating ingredient.

**Scope in:** one selected-ingredient state, dialog title/options, option selection, dismiss/focus restoration, 44 px trigger/options, and desktop behavior.

**Scope out:** changing substitute generation, saved defaults, or adding a new overlay primitive.

**Target paths:**

- `src/lib/components/cook-mode/CounterBoard.svelte`
- `src/lib/components/BenchSheet.svelte`
- `src/lib/components/ui/BottomSheet.svelte` only if a cooking-neutral accessibility defect is proven
- counter interaction tests

**Requirements:**

- [x] Reuse `BottomSheet`; do not keep a second disclosure implementation.
- [x] Preserve the stable ingredient reference from trigger through selection.
- [x] “Use for this cook” applies exactly one live substitute and closes.
- [x] “Use as recipe default” remains a separate explicit action; success revises the frozen source/default as designed, while request failure or revision conflict preserves the active session, progress, checks, and timers and shows localized recovery.
- [x] Escape/backdrop closes without mutation and restores focus to the trigger.
- [x] First, middle, and last counters work at 320/375 px without clipping.
- [x] Desktop remains compact and intentional, even though the interaction uses the same dialog contract.

**Verification:**

- Keyboard-only and touch browser stories for select/cancel/reopen.
- Assert focus trap, focus return, viewport bounds, scroll lock, and reduced-motion behavior.
- Select rapidly on two different counters and prove the second cannot inherit the first counter's identity.
- Exercise saved-default success, request failure, and revision conflict while progress and a timer are active.

**Risk:** R2 — changes a live cooking mutation control.

**Rollback:** Revert `CounterBoard` presentation; substitute data APIs remain unchanged.

**Effort / confidence / dependencies:** S-M / high / none.

### CUX-6 — Enforce the cooking-specific 44 px target contract

**Outcome:** Frequently used phone controls in cooking mode provide at least a 44 × 44 px interactive box without breaking tablet/desktop density.

**Scope in:** counter check/swap, serving presets, timer minimize/cancel, rating/log controls, and any new swap-sheet actions.

**Scope out:** global header, recipe-maintenance controls, and unrelated shared components.

**Target paths:**

- `src/lib/components/BenchSheet.svelte`
- `src/lib/components/cook-mode/CounterBoard.svelte`
- `src/lib/components/cook-mode/Timer.svelte`
- `src/lib/components/ui/BottomSheet.svelte` only if its close target is in the cooking interaction

**Requirements:**

- [x] Interactive bounding boxes are at least 44 × 44 px at phone breakpoints.
- [x] Visual density may remain compact through padding/transparent hit area.
- [x] Adjacent targets remain separated and do not overlap.
- [x] Tablet/desktop layout remains within existing shells.

**Verification:**

- Browser-side bounding-box audit at 375 px and 200% zoom.
- Pointer/touch activation at target edges.
- No horizontal overflow at 320, 375, 768, 1280, or 1536 px.

**Risk:** R1 — contained presentation change.

**Rollback:** Revert cooking-specific sizing classes.

**Effort / confidence / dependencies:** S / high / CUX-5.

### CUX-7 — Remove duplicate and misleading cooking copy

**Outcome:** Timer context is not repeated, supported v4 preparation remains action-led, and the current rating/log area is called “After cooking” in EN/NL.

**Scope in:** equality-based timer label deduplication, safe display normalization for v4 preparation tasks, disclosure label, and translations.

**Scope out:** inventing missing recipe actions, rewriting stored content, or changing v5 generation prompts unless a fixture proves the structured output violates its existing contract.

**Target paths:**

- `src/lib/components/cook-mode/TimerStack.svelte`
- `src/lib/components/cook-mode/Timer.svelte`
- `src/lib/components/cook-mode/cooking_steps.ts`
- `src/lib/components/cook-mode/cooking_steps.test.ts`
- `messages/en.json`
- `messages/nl.json`

**Requirements:**

- [x] Hide the secondary timer line only when normalized title and purpose are identical.
- [x] Distinct timer context remains visible.
- [x] Preparation normalization uses only supplied action/content; quantity-led fragments that cannot be repaired safely remain unchanged rather than guessed.
- [x] Rename the disclosure to “After cooking” and a natural Dutch equivalent.

**Verification:**

- Unit fixtures for identical/distinct timer strings and action-led/unsafe preparation fragments in EN/NL.
- Phone screenshot proves one concise timer label without covering the active step heading.

**Risk:** R1 — derived display copy only.

**Rollback:** Revert projection/display changes; stored recipe data is unchanged.

**Effort / confidence / dependencies:** S / medium-high / CUX-1.

### CUX-8 — Close the regression with a release matrix

**Outcome:** Focused tests, the repository's full checks, and a real-browser matrix pass without provider spend or new console errors.

**Scope in:** obsolete test replacement, coverage of the repaired seams, responsive/accessibility stories, and issue-log closure.

**Scope out:** unrelated flaky-test cleanup.

**Target paths:**

- focused tests beside the touched modules;
- `docs/known_issues/solved/ISSUE_COOKING_MODE_POST_SHIP_UX_UI_20260723-1653.md`;
- this feature list's status/archive path during `/done`.

**Requirements:**

- [x] Replace, rather than layer around, tests that define v2 as eligible for a new session.
- [x] Keep explicit tests proving v2/v3 remain structurally readable for rollback compatibility while pre-change sessions without a frozen language are discarded.
- [x] Verify both provider-success and provider-failure responses with mocks.
- [x] Preserve AH's Dutch-source invariant by not changing or importing shopping/AH code.

**Verification commands:**

```powershell
npm run check
npm run test:unit
npm run build
```

**Browser matrix:**

- widths: 320, 375, 768, 1280, 1536 px;
- languages: EN and NL;
- data: no cache, v2, v3, v4, v5, malformed cache;
- session: not started, active on step 2, reset;
- header: normal, loading, translation success, translation failure;
- interaction: first/middle/last swap, Escape/backdrop/selection, servings, checks, timer, rating/log;
- accessibility: keyboard order/focus return, 200% zoom, reduced motion, 44 px bounds, no obscured focused content;
- operations: no real OpenRouter call and no writes to the developer's primary database.

**Risk:** R1 — verification and documentation.

**Rollback:** Not applicable; failing evidence blocks ship.

**Effort / confidence / dependencies:** M / high / CUX-1 through CUX-7.

## Failure modes and mitigations

| Failure mode | Mitigation / proof |
|---|---|
| A pre-fix session lacks enough information to freeze its display language. | Version the session payload with frozen language/projection; clear ambiguous old payloads once, remove stale timers, and use source fallback with a notice. |
| A language or serving change silently replaces a complete running compatibility session. | Freeze the session payload/language until Reset; cover mid-step changes, reload, second-tab generation, and late provider responses. |
| A forgotten caller still uses broad `isStaleCookMode` as new-session eligibility. | Add a named eligibility helper and search all route/server callers; tests cover both caller classes. |
| Every legacy recipe triggers a provider burst. | Keep the existing bounded/lazy generation path, deduplicate in-flight work, and verify the immediate fallback independently. |
| Header measurement initializes to zero, loops, does not reach the sibling cooking surface, or jumps after copy/font changes. | Put the CSS variable on their common route ancestor, provide a safe initial value, observe one owning header element, write only on value change, and test zoom/wrapping/scroll centering. |
| The dialog applies a substitute to the wrong ingredient after rapid reopen. | Carry the stable ingredient reference in one selected state; test first→second trigger races. |
| Saved-default failure or revision conflict damages the active cook. | Keep live-session mutation and persistent-default mutation explicit; verify success/failure/conflict with progress and timers present. |
| Reusing `BottomSheet` causes desktop width, scroll-lock, or nested-dialog regressions. | Verify cooking-specific content at every breakpoint and avoid modifying the shared primitive unless a generic defect is proven. |
| Larger targets create overflow or overlapping hit areas. | Resize hit boxes selectively; inspect bounding boxes and horizontal overflow at 320 px and 200% zoom. |
| Recovery copy implies enhanced data loaded when only source fallback exists. | Bind copy to explicit state/reason codes and assert the displayed step source in tests. |
| Timer deduplication hides genuinely distinct purpose/context. | Compare normalized full strings; suppress only exact equivalents. |
| Preparation normalization invents cooking advice. | Transform only safely recognized display fragments; retain ambiguous supplied text unchanged. |

## Risk and rollout

**Overall risk: R2.** No schema, migration, AH, or irreversible data change is planned, but cache/session selection and live cooking controls affect user state.

Roll out as one small compatibility release after the full matrix passes. Keep stored v2/v3 JSON and compatibility readers for rollback. Do not bulk-regenerate recipes. Let v5 generation remain lazy and bounded. If a regression appears, revert the eligibility/session selection commits; the deterministic fallback and stored source recipe remain available.

## Plan critique

The approach was challenged specifically on:

- whether “valid legacy data” and “eligible for a new v5-oriented session” must be separate concepts;
- how an active legacy session avoids mid-cook mutation;
- whether shared `BottomSheet` reuse is safer than repairing a disclosure;
- whether a measured sticky contract introduces initialization or resize loops;
- provider-burst, wrong-ingredient, focus, zoom, and fallback-copy failure modes.

Independent review signal: **PASS WITH REFINEMENTS** (`gpt-5.6-terra`, read-only). The critique found that the existing persisted session lacks frozen display language, required an explicit old-payload discard path, separated live swap from saved-default failure behavior, and placed the sticky CSS variable on the common route ancestor. Those refinements are integrated above.

Model `gpt-5.5` verify: attempted twice through the read-only CLI route and timed out without a result; no conclusion from those calls was used.

## Open questions

No user decision is required. The safety defaults are:

- preserve only sessions whose versioned payload contains a frozen language/projection; clear ambiguous pre-fix sessions once to complete source fallback;
- use the existing `BottomSheet` for swaps at all widths;
- include the P3 “After cooking” rename only if it remains a one-line, translation-complete change during CUX-7.

## Acceptance criteria

- [x] New sessions never use v2/v3 as the Kitchen Timeline plan.
- [x] Complete versioned sessions do not silently change steps, language, progress, checks, swaps, or timers.
- [x] Ambiguous pre-fix/corrupt sessions clear once to complete fallback, remove stale timers, and cannot repeatedly remap or notify.
- [x] Every recipe retains complete usable fallback steps when generation is absent or fails.
- [x] Swap UI stays on-screen and meets keyboard, dismissal, focus-return, and 44 px target expectations.
- [x] Cooking toolbar never overlaps any recipe-header state.
- [x] Recovery copy is localized and accurately describes fallback/retry.
- [x] Timer/preparation presentation is concise without inventing content.
- [x] Targeted and full checks pass, plus the browser matrix, without provider spend.
