# Issue: Assistant saves internally inconsistent recipes as ready
Created: 2026-08-04 13:02 +02:00
Status: FIXED

## Symptom

The latest production Assistant turn saved a pasted recipe and reported that it was correctly
structured and ready to use. The saved recipe contains scaled ingredient quantities alongside
unscaled numeric directions, a duplicate utility ingredient, and impractical fractional produce
counts. The write result nevertheless returned `needs_review: false`.

## Expected Behavior

Before a direct recipe save, the server should detect contradictions between ingredient amounts
and numeric directions, duplicate utility ingredients, and suspicious whole-item fractions. The
Assistant should either stage a reviewed correction or save the recipe with a specific review
reason; it must not describe unverified structure as correct or ready.

## Investigation Log

| Date | Action | Result | Next Step |
|------|--------|--------|-----------|
| 2026-08-04 13:02 +02:00 | Read the latest authenticated production chat record and opened the saved recipe in original and cooking views without mutating household data. | The stored tool input preserves conflicting scale literals and a duplicate utility ingredient, while the tool result reports success with no review flag. The final answer overclaims correctness. | Trace `add_recipe` schema, executor, prompt, and tests; identify the correct server-owned validation seam. |
| 2026-08-04 13:21 +02:00 | Traced the URL importer against the current source page and the Assistant executor. | The page returns array-shaped Schema.org fields; `parseJsonLd` casts the category array to a string before `normalizeFoodCategory` calls `trim()`. The soft failure is not recorded in the turn failure map, so identical retries execute and render again. | Normalize every untrusted scalar shape, then add a bounded same-turn soft-failure policy. |
| 2026-08-04 13:26 +02:00 | Traced direct pasted-recipe creation and independently critiqued the proposed validation seam. | `add_recipe` trusts the model's optional review flag and bypasses the URL import enrichment checks. The existing recipe action already links to review when the result is flagged. Broad semantic inference would over-fire; narrow warn-only rules at the executor boundary are viable with negative fixtures. | Add the repair as BTL-13 in the active Assistant feature list. |
| 2026-08-04 13:30 +02:00 | Ran the three closest suites against an isolated test database. | 26 existing ingest, recipe-executor, and turn-safety tests pass; none covers the production scalar shape, repeated soft failure, or server-owned recipe warning. | Start `$run` with the missing red fixtures in BTL-13A–C. |
| 2026-08-04 13:34 +02:00 | Started `$run` for BTL-13 with the approved R2 boundaries. | Execution is limited to importer shapes, same-turn URL failure handling, direct recipe warnings, tests, and task docs. | Implement BTL-13A as the first red/green slice. |
| 2026-08-04 13:48 +02:00 | Completed BTL-13A–C and the local release gate. | Scalar and instruction shapes normalize safely; identical failed imports execute once and are visually deduplicated; a third distinct failure is capped; direct recipe saves receive narrow server-owned review warnings. Zero Svelte diagnostics, 121 Vitest files / 735 tests, primary Playwright 48 passed / 1 intentionally skipped, and the production build pass. | Commit only BTL-13 files, deliver to `main`, supervise exact Railway success, and run the authenticated canary. |
| 2026-08-04 14:10 +02:00 | Delivered BTL-13 and ran the production canary. | Railway deployment `079e41e9-bfc6-4a84-af92-a9f368d50a71` reached `SUCCESS` for exact remote `main` commit `14bbe8f`. Health returned 200/ok; both guarded current credentials worked and previous credentials failed; mobile Assistant and desktop Recipes logged-out boundaries had no overflow, console error, failed request, or HTTP 4xx/5xx. | Fixed; archive this issue. |

## Hypotheses

- [x] `add_recipe` validates field shape but has no semantic consistency check before persistence.
- [x] Review safety depends on the model honoring a prompt and setting an optional boolean; the server does not add its own warnings.
- [x] Array-shaped Schema.org fields reach string-only helpers through unchecked casts, causing the URL import failure.
- [x] Soft tool failures are not added to the existing turn failure map, allowing identical calls and duplicate error cards.

## Approaches Tried

- Authenticated, read-only production reproduction through the chat history and saved recipe views.
- Current source-page Schema.org shape check; the category and yield fields are arrays.
- Caller and test-seam trace through URL extraction, direct recipe creation, turn safety, and chat rendering.
- Independent `opus` plan critique; its false-positive and stale-cache findings are incorporated into BTL-13.
- Focused baseline: 3 test files and 26 tests pass against an isolated database.
- Focused implementation suite: 8 files and 56 tests pass against an isolated database.
- Complete latest-main gate: 123 Vitest files / 757 tests, primary Playwright 52 passed / 1
  intentionally skipped, and a successful production build.

## Related Files

- `src/lib/server/ai/recipe_ingest.ts`
- `src/lib/food_categories.ts`
- `src/lib/server/ai/tools.ts`
- `src/lib/server/ai/executors/recipes.ts`
- `src/lib/server/ai/executors/index.ts`
- `src/lib/server/ai/turn_safety.ts`
- `src/lib/server/ai/prompts/system.md`
- `src/routes/api/chat/+server.ts`
