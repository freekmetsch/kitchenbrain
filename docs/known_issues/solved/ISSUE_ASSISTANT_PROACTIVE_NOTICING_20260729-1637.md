# Issue: Assistant proactively notices household work before being asked
Created: 2026-07-29 16:37
Status: RESOLVED

## Symptom

Opening `/` renders a deterministic Butler Brief above chat with household cues such as open
Shopping work, plan gaps, or stock pressure. This makes the Assistant initiate attention and work
before a person has asked for anything.

## Expected Behavior

The Assistant should be assertive only inside the current request. After a person asks for an
outcome, it should perform the safe implied reads, comparisons, lookups, and preparation without
asking permission at every intermediate step, then present one adjustable review. A clean visit
to `/` should not notice, suggest, prepare, dismiss, snooze, or prioritize household work.

## Investigation Log

| Date | Action | Result | Next Step |
|------|--------|--------|-----------|
| 2026-07-29 16:37 | Ran the isolated existing Butler browser story on current `main`. | The test passed in 23.8 seconds because `/` rendered the unwanted `Butler brief` region above chat. The mismatch is deterministic and already protected by the current test contract. | Trace the rendered Brief, deterministic candidate derivation, durable state branches, and request-triggered proposal path before selecting the rollback design. |
| 2026-07-29 17:04 | Traced the shipped `/` loader and Brief component, the Assistant system prompt, contextual proposal tools, and draft PR bases 35, 36, 39, and 40. | The shipped loader derives candidates on every authenticated home load. The system prompt and reviewed proposal tools already encode request-triggered preparation. Draft PR 35 adds initiative/dismiss/snooze/last-seen state, and the later useful drafts are based on that branch even though their product behavior does not require it. | Remove the shipped Brief, retire its model-visible planning narration, and recut the useful draft stack from corrected `main` without PR 35 or its migration. |
| 2026-07-29 18:02 | Removed the home Brief and deterministic candidate path, retired `present_plan`, made the working/process treatment client-owned, and made Docket recommendation fields optional and grounded. | Focused red/green tests pass. The exposed catalog shrank from 27 tools / 23,125 bytes to 26 / 22,407. The complete primary gate passes: clean diagnostics, 684 unit tests, 25 authenticated browser stories with one expected AH-connected skip, and production build. | Verify the second household account, publish the R2 correction, run the exact-revision canary, then recut the R3 draft chain without Butler service state. |
| 2026-07-29 18:04 | Ran the complete authenticated browser suite with the second isolated household account. | 25 stories passed with the same one expected fake-connected AH skip; the request-driven empty home, Plan → Shop, sparse/active review, process disclosure, responsive, and recovery journeys all passed. | Publish the verified R2 correction and run the exact-revision production canary before recutting the draft chain. |
| 2026-07-29 18:10 | Merged PR #41 and supervised Railway deployment `3825498d-7aac-4a1e-889b-e961e6bec35d` to `SUCCESS` for exact remote `main` `8b4ded624be2d570916e4dc9c7f742fde7d5a7a5`. | Both household auth guards passed. `/api/healthz` reported healthy; the phone and desktop logged-out boundary had no overflow or console errors; bounded Railway checks found zero application errors and zero HTTP 5xx. No provider turn, household mutation, AH lookup, or AH push occurred. | Resolve this issue. Continue the separately gated R3 replacement draft recut from corrected `main`. |

## Hypotheses

- [x] **High — “assertive” was implemented as standing Notice UI.** If this is the root cause,
  removing the home-load Brief and keeping preparation behind a user message will make `/`
  request-driven without weakening contextual follow-through.
- [x] **Medium — durable initiative, dismissal, snooze, and last-seen state have created callers
  that must be removed from the unmerged stack.** If true, the rollback needs a branch-stack
  reconciliation in addition to removing the shipped Brief component.
- [x] **Low — refuted: the current tool loop cannot prepare a complete outcome without a standing Brief.**
  If false, existing reviewed proposal tools and forced capability packs can support contextual
  assertiveness without any home-load candidate service.

## Approaches Tried

- Ran the existing isolated authenticated Butler Brief browser test on current `main`.
- Located the home Brief component, deterministic candidate service, server load path, and
  roadmap trigger/initiative model.
- Compared the Assistant prompt and typed proposal path with the standing Brief path.
- Inspected the draft PR base chain and confirmed the useful later domains can be recut without
  the Butler service-state feature or its migration.

No household mutation, provider call, Albert Heijn lookup, external push, or production data read
was performed.

## Recommended Fix

1. Invert the current browser regression first: opening `/` must render chat and no Butler region,
   perform no Butler candidate derivation, and make no provider call.
2. Delete the shipped Brief component, home-loader snapshot/derivation, Brief-only server modules,
   messages, and tests. Keep `/` as the only Assistant surface.
3. Replace model-narrated `present_plan` progress with one generic client-owned working state.
4. After a request, render the prepared answer or reviewed write proposal as an in-conversation
   Outcome Docket: recommended result first, evidence and uncertainty visible, alternatives
   adjustable, and any write or external effect still explicitly approved.
5. Do not merge draft PR 35. Recut the useful inventory, meal-decision, and cooking branches from
   corrected `main`, regenerate the append-only inventory migration without Butler state, and
   close the old drafts only after the replacements pass their gates.

## Repro Pack

- **Environment:** current repository `main`; isolated Playwright primary account.
- **Data:** seeded household facts that deterministically produce at least one Butler candidate.
- **Command:** `$env:E2E_PORT='4195'; npx playwright test tests/e2e/assistant-safety.e2e.ts
  --project=chromium-primary --grep "Butler brief stays"`.
- **Interaction:** authenticate and open `/`.
- **Expected:** chat is the only Assistant service surface until a person submits a request.
- **Actual:** a `Butler brief` region appears above chat and presents household work without a
  request.
- **Classification:** deterministic product-behavior regression.

## Related Files

- `src/routes/+page.server.ts`
- `src/routes/+page.svelte`
- `src/lib/components/butler/ButlerBrief.svelte`
- `src/lib/server/butler/brief.ts`
- `tests/e2e/assistant-safety.e2e.ts`
- `docs/feature-lists/FEATURE_LIST_ASSISTANT_HOUSEHOLD_BUTLER_ROADMAP.md`
