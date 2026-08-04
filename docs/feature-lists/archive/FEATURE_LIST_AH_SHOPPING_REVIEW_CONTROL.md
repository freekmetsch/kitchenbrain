# Feature List: AH Shopping Review Control
_Status: Shipped - 2026-08-04 (secure manual search, stable review confirmation, centered dialog, and alternative-aware AH matching)_

## Problem Framing

The AH review currently makes correction harder than accepting its first guess. A household user
cannot search AH manually, an alternative pick immediately relocates the row and loses keyboard
focus, the desktop review is a right-side drawer, saving a favorite invalidates the active review,
and a complete either/or ingredient searches only its first alternative. The deterministic example
`munt of peterselie` becomes `munt` and ranks `AH Pepermunt` first.

The journey begins on `/shopping`, opens **Review AH order**, resolves uncertain items, sends the
chosen products once, and returns to the shopping list with pushed rows marked **In basket**. This
plan keeps the household in control without weakening the preview token (the short-lived server
record that authorizes products offered during this review).

### UX audit evidence

| Priority | Finding | Evidence and impact | Durable direction |
|---|---|---|---|
| P1 | No manual AH search | At 375 px, expanding `Other options` exposes only the original candidates; the existing search messages are unused and `AhPreviewItem.svelte` has no search props or form. The right product can be unreachable. | Restore row-scoped search through the secured preview token. |
| P1 | A favorite invalidates its own review | `toggleFavorite` writes the favorite while `assertCurrentPreview` compares a signature that includes the favorite. The browser's 409 recovery state replaces the review with **Match again**. | Validate recipe preferences, not a default favorite, after explicit review decisions exist. |
| P2 | Alternative selection moves the row and loses focus | At 375 px, choosing `AH Platte peterselie` moved the row from **Needs a look** to **Confirmed**, moved `ui` into its place, and left `document.activeElement` on `BODY`. | Keep candidate selection in place; require an explicit confirmation before advancing and focus the next review item. |
| P2 | Desktop review is peripheral | At 1280×800, the dialog occupied the rightmost 512×800 px (`AhSheet.svelte` passes `desktopSide`). | Use the shared centered-dialog mode on desktop while retaining the mobile bottom sheet. |
| P2 | Complete alternatives collapse to the first term | A 1.6-second probe returned `{query:"munt", order:["AH Pepermunt","AH Platte peterselie"]}`. | Search complete alternatives separately, merge results, and prefer exact tokens over compound-only matches. |
| P2 | No-match rows look confirmed | A non-product decision makes `itemNeedsAttention` return false, so a failed/empty AH search can be compacted under **Confirmed** even though correction is possible. | Put failed/empty matches in the initial review queue and preserve their recovery controls. |

Runtime coverage used the isolated E2E database and intercepted AH responses at 375×812 and
1280×800. No household or AH data was written. Authenticated screenshots were deliberately not
retained. A real AH search/push remains production-canary-only because the repository forbids using
household data as test evidence.

## Scope

### In

- Secure row-scoped manual AH search that keeps the active preview and prior decisions.
- Explicit, stable attention-item confirmation with predictable focus.
- Centered desktop review and mobile bottom-sheet parity.
- Complete either/or query handling, candidate de-duplication, and exact-over-compound ranking.
- Favorite changes that affect future defaults without invalidating the current explicit review.
- Focused unit, route, workflow, component/browser, full-gate, deployment, and canary evidence.

### Out

- AH authentication, token-file handling, basket API behavior, or a new provider/library.
- Database/schema changes or recipe ingredient rewrites.
- Translating AH queries or deriving them from English display fields.
- Real AH mutations during local verification.
- A redesign of the shopping list outside the AH review.

## Existing-System Inventory

- `AhSheet.svelte` owns preview state, decisions, favorites, ordering, and final push.
- `AhPreviewItem.svelte` renders one correction card; stale message keys still cover manual search.
- `preview_tokens.ts` binds user, week, entry revisions, and offered products for ten minutes and
  consumes the token exactly once at push.
- `push-shopping-to-ah.ts` is the workflow seam for preview/push and preserves Dutch AH terms.
- `matching.ts` cleans one term and re-ranks AH results without filtering them.
- The pre-token implementation had manual search but returned unbound products; restoring that
  endpoint shape would bypass current offered-product validation.

## Option Comparison

1. **Restore the old free-form preview request — rejected.** It is small but lets the client submit
   arbitrary item shapes and cannot authorize newly returned products against the active review.
2. **Rematch the entire basket after every search/favorite — rejected.** It is secure but discards
   accepted decisions, repeats AH calls, and recreates the reported loss of control.
3. **Extend one token binding for one row — chosen.** The server verifies user, expiry, token, and
   row before searching, adds only returned product IDs to that row's authorization set, and leaves
   every sibling row and decision unchanged.

**Steelman:** A full refresh is easier to reason about because it creates one immutable snapshot.
The chosen row extension is still the stronger design: offered-product membership remains
server-authored and bounded, list/revision checks remain immutable, concurrent claim/expiry races
fail closed, and the interaction no longer destroys unrelated reviewed work.

Context7 exception: this is an internal-only change using existing Svelte, SvelteKit, Zod, and test
patterns; no external framework or AH API behavior assumption changes.

## Phase Plan

### Phase 1 — Matching and authorization seams

1. Parse complete Dutch alternatives and rank merged AH candidates against their best alternative.
2. Add bounded, fail-closed preview-token inspection/extension and the authenticated row-search
   workflow/route.
3. Make staleness validation recipe-preference-specific so current-review favorites remain valid.

### Phase 2 — Stable review interaction

4. Restore discoverable per-row search, merge/dedupe results, preserve drafts/errors, and ignore
   out-of-order responses.
5. Separate candidate selection from confirmation; transfer focus only after the explicit advance.
6. Center the desktop dialog and keep empty/error matches in the review queue.

### Phase 3 — Closure and delivery

7. Run focused tests after each behavior, the full `npm test` gate, mobile/desktop browser coverage,
   simplify the diff, merge only task commits to `main`, supervise Railway, and run the authenticated
   production canary without retaining household contents.

## Execution Tickets

### AH-1 — Alternative-aware matching

- **Observable behavior:** `munt of peterselie` searches both complete alternatives; an exact
  `peterselie` candidate outranks compound-only `pepermunt`, while valid compounds such as
  `tafelzout` still outrank unrelated products.
- **In:** `toSearchTerms`, merged/deduped result pools, best-alternative scoring, max three explicit
  alternatives, preserved dangling-hyphen behavior and fallback.
- **Out:** synonym dictionaries or AI calls.
- **Targets:** `src/lib/server/ah/matching.ts`, `matching.test.ts`,
  `src/lib/server/workflows/push-shopping-to-ah.ts` and focused workflow tests.
- **Risk:** R3; impact 5; effort M; confidence high.
- **Verification:** failing regression first; exact/compound/dangling/duplicate/empty/failure cases;
  focused Vitest.
- **Rollback:** revert matching/workflow commit; no persisted data changes.

### AH-2 — Token-bound row search

- **Observable behavior:** a search adds products only to its row and every returned selectable
  product is accepted by the existing push validator.
- **In:** authenticated route; peek without consume; re-check before extension; user/ref/expiry
  validation; 100-product per-row cap; offered-product de-duplication; 409 on claim/expiry/replaced
  preview; 400 bounds; explicit search-failure response.
- **Out:** client UI.
- **Targets:** `preview_tokens.ts` and tests, `push-shopping-to-ah.ts` and tests, new
  `src/routes/api/shopping/ah-search/+server.ts` and route tests.
- **Risk:** R2; impact 5; effort M; confidence high.
- **Verification:** wrong-user/ref, expiry, token replacement, cap, concurrent claim, search failure,
  no results, successful extension, and final decision binding.
- **Rollback:** revert route/workflow/token commit; original immutable preview remains.

### AH-3 — Favorite-safe staleness validation

- **Observable behavior:** starring or unstarring a candidate changes future defaults but the current
  reviewed basket still sends without **Match again**.
- **In:** recipe-only preference signature; retain entry identity, amount/unit, source revision,
  recipe preference, expiry, and offered-product checks.
- **Out:** favorite persistence semantics.
- **Targets:** `push-shopping-to-ah.ts`, workflow tests, push route tests if required.
- **Risk:** R2; impact 4; effort S; confidence high.
- **Verification:** favorite add/remove does not stale; recipe-preference/source/list change still
  returns 409.
- **Rollback:** revert signature change; no data migration.

### AH-4 — Manual search without lost work

- **Observable behavior:** each full review card exposes **Search AH**; results append without
  auto-selecting or moving the row; no-result/failure retains candidates, draft, decisions, and
  sibling rows.
- **In:** row draft/pending/error state; request generation per ref; disable Send while searches are
  pending; merge/dedupe/cap candidates; clear success feedback; stale-token recovery.
- **Out:** automatic semantic selection of typed results.
- **Targets:** `AhSheet.svelte`, `AhPreviewItem.svelte`, messages, focused component/source tests,
  browser test.
- **Risk:** R1; impact 5; effort M; confidence high; depends on AH-2.
- **Verification:** 375/1280 search success, empty, failure, double-submit, out-of-order response,
  existing selection preservation, keyboard submit, and final push body.
- **Rollback:** revert client commit; secured endpoint may remain inert or be reverted with AH-2.

### AH-5 — Explicit attention completion and focus

- **Observable behavior:** choosing or adding a candidate keeps the current row open. **Confirm
  choice** deliberately advances it, then focus lands on the next attention row or the Send action.
- **In:** initial attention for low-confidence, incompatible, unresolved, unknown, and empty results;
  explicit product confirmation; accurate unresolved count; stable selection.
- **Out:** forcing confirmation on initially reliable matches.
- **Targets:** `AhSheet.svelte`, `AhPreviewItem.svelte`, messages, browser regression.
- **Risk:** R1; impact 5; effort M; confidence high.
- **Verification:** selection retains row/scroll/focus; confirmation advances once; quantity, text,
  skip, undo, final-item, and rapid repeated-action cases.
- **Rollback:** revert attention-state commit; decisions remain client-only.

### AH-6 — Centered responsive review

- **Observable behavior:** the review stays a bottom sheet on phone and is centered on desktop,
  without clipped content, hidden footer controls, or horizontal overflow.
- **In:** use shared `desktopCentered`; verify long terms, 320/375/768/1280 widths and 200% text.
- **Out:** global BottomSheet redesign unless a verified defect requires it.
- **Targets:** `AhSheet.svelte`, existing shopping browser coverage.
- **Risk:** R1; impact 3; effort S; confidence high.
- **Verification:** box position/size, keyboard trap/close/restore, scroll and sticky footer.
- **Rollback:** one-prop revert.

## Failure-Mode Table

| Failure mode | Trigger | Impact | Detectability | Mitigation | Residual risk |
|---|---|---|---|---|---|
| Arbitrary product reaches push | Client invents an ID during search | Unauthorized basket item | Token/push unit test | Only server-returned IDs extend the named binding; push validator unchanged | Low |
| Search races token claim/expiry | Send/other tab consumes token while AH search runs | Stale candidates appear usable | 409 route/browser test | Disable local Send during search; re-check token after AH returns; fail closed | Low |
| Older search overwrites newer results | Two row searches return out of order | User sees the wrong result set | Deferred-response browser test | Per-ref generation; only latest response updates UI; server union remains safe | Low |
| Candidate authorization grows without bound | Repeated searches in ten minutes | Memory/payload growth | Cap test | Deduped 100-product cap per row; return only authorized candidates | Low |
| Favorite fix hides recipe drift | Favorite and recipe preference share one signature | Stale recipe intent is pushed | Workflow regression | Compute signature from recipe sources only; keep recipe preference 409 test | Low |
| Alternative parsing increases AH load | Multiple complete alternatives | Slower preview/API pressure | Search-call count tests | Max three alternatives, parallel calls, dedupe IDs, one fallback per empty term | Low |
| Compound downgrade rejects valid food | Exact-over-compound score is too strict | Worse matching for salt/oil compounds | Matching fixtures | Compound stays positive and above unrelated; only exact gets higher score | Low |
| Attention row still jumps or focus disappears | Reactive regroup after pick/search | Loss of place | 375 px focus/scroll assertion | Selection does not settle; explicit confirmation owns movement and focus | Low |
| Search failure destroys accepted work | Network/error response | Basket must be rebuilt | Mocked failure browser test | Row-local error; preserve decisions, candidates, draft, token, siblings | Low |
| Centered dialog clips a long basket | Desktop/modal max-height mismatch | Controls inaccessible | 320–1280 and 200% text smoke | Existing internal scroll + sticky footer; no shared primitive change by default | Low |

Plan critique: **GO**. No P0 remains. The P1 authorization and stale-state risks are directly
mitigated; no compounding caller, rename, migration, or deferred follow-up remains.

## Risk and Verification Matrix

| Area | Risk | Required evidence |
|---|---|---|
| Matching | R2 | Focused Vitest for alternative parsing, scoring, dedupe, fallbacks, and call counts |
| Preview authorization | R3 | Token/workflow/route tests for identity, expiry, mutation race, cap, and push binding |
| Review interaction | R1 | Isolated Playwright at 375 and 1280; success/failure/no-result/stale/focus paths |
| Responsive/accessibility | R1 | 320/375/768/1280, 200% text, keyboard submit/confirm/close/focus restore |
| Repository closure | R3 | `npm test` passes: Svelte diagnostics, Vitest, authenticated Playwright, production build |
| Production | R3 | Task commits only on `main`; Railway `SUCCESS` at remote-main commit; authenticated canary with no retained household contents |

Audit records: UX audit run (six findings above); security/integrity critique run for token mutation;
stack audit skipped (no dependency/service); beta authentication gate completed for the new route:
existing session identity is reused, unauthenticated and wrong-user access fail closed, the change is
reversible, and the explicit `/run` authorized ordinary PR delivery without household-data mutation.

## Rollout and Rollback

Land reversible commits in ticket order on `codex/shopping-ah-ux-hardening`. After the complete gate,
push the feature branch, merge only these commits to `main`, supervise Railway to `SUCCESS` for the
exact remote tip, and run the authenticated production canary. Do not perform a real AH push during
canary. If deployment or canary fails, fix forward when clear; otherwise revert the task commits,
redeploy, and repeat the canary. No database backup is required because no persisted shape changes.

## Open Questions

> **Q: Should selecting a candidate immediately advance?** — Default: no; require **Confirm choice**.
> Reason: selection is exploration, while confirmation is the deliberate queue-advance action.
> **Q: Should favorite changes stale the current review?** — Default: no; explicit current-review
> decisions win, while recipe preference and shopping-row changes remain stale checks. Reason: a
> default for future reviews should not invalidate work in this review.

## Completion Evidence

- AH-1 through AH-6 are implemented without schema, dependency, or real AH data changes.
- Focused server/component set: 67 tests passed.
- AH browser scenario passed in the standard gate at 320, 375, 768, and 1280 px, including 200% text,
  successful/manual/empty/failed search, favorite persistence, stable selection, explicit focus
  advance, final push, and centered desktop geometry.
- Full `npm test`: Svelte diagnostics clean; 121 Vitest files and 738 tests passed; 49 Chromium
  tests passed with one opt-in connected-dock test intentionally skipped; production build passed.
- CodeRabbit review findings were applied for undo, stale search completion, authorization-cap
  feedback, alternative parsing, authentication coverage, preview concurrency, and E2E isolation.
  Plan status follows the `$run` archive lifecycle; a new per-user rate limiter was not introduced
  because search already requires an authenticated explicit submit, a row-bound ten-minute token,
  disabled duplicate submission, bounded preview concurrency, and a 100-product authorization cap.
- Context7 exception: repository-internal workflow and route; no third-party SDK contract changed.

## Resume Pack

- **Goal:** delivered — AH review is searchable, stable, centered, and alternative-aware without
  weakening push authorization.
- **Current state:** implementation and local verification complete; feature list archived by `$run`.
- **Pending verification:** Railway deployment truth and authenticated production canary.
- **Open-question decisions:** explicit confirmation and favorite-safe current review shipped.
