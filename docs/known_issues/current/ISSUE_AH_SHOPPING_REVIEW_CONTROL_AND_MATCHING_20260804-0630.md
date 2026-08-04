# Issue: AH shopping review loses user control and accepts implausible matches
Created: 2026-08-04 06:30
Status: AWAITING VERIFICATION

## Symptom

The Albert Heijn (AH) review cannot search manually for more products. Choosing an alternative
can demand a full-basket rematch. The review uses a side menu rather than a centred decision
surface. Attention items are helpfully placed first, but adding another candidate abruptly advances
to the next item. Either/or ingredients can match the wrong concept; `munt of peterselie` selected
`AH Pepermunt`.

## Expected Behavior

A household user can review, search, replace, and confirm one shopping item at a time without
discarding accepted choices or losing their place. The matcher should split explicit alternatives,
prefer plausible grocery meanings, and send ambiguity to review instead of confidently choosing an
unrelated product.

## Investigation Log

| Date | Action | Result | Next Step |
|------|--------|--------|-----------|
| 2026-08-04 | Located the owning Household Brain repository and isolated a clean branch from remote `main`. | The report belongs to `/shopping`, its AH preview API, and the AH matching modules; no TrueColours files are involved. | Build a deterministic repro, walk the isolated browser journey, and map state transitions before planning. |
| 2026-08-04 | Ran source lineage, a 1.6-second matching probe, and isolated browser walkthroughs at 375×812 and 1280×800 with intercepted AH responses. | All reported symptoms are deterministic. Candidate selection moves the row and leaves focus on `BODY`; desktop is a 512 px right drawer; no manual search renders; favorite-sensitive validation forces 409 recovery; complete alternatives collapse to the first term. | Execute `FEATURE_LIST_AH_SHOPPING_REVIEW_CONTROL.md` through focused regressions and production delivery. |
| 2026-08-04 | Implemented token-bound row search, alternative-aware matching, favorite-safe staleness, explicit review confirmation/focus, and centered responsive presentation. Ran focused and full repository gates plus intercepted-AH browser coverage at 320–1280 px and 200% text. | All automated checks pass: 736 unit tests, 48 standard Chromium tests, production build, and the opt-in connected-AH scenario. No real AH or household data was mutated. | Await household verification after the supervised production deployment. |

## Hypotheses

- [x] The basket-wide token is sound, but its preference signature includes a favorite changed inside the same review, so push rejects the review itself.
- [x] Candidate selection sets `reviewed=true`; reactive grouping moves the row and destroys focus.
- [x] Search candidates are limited to the initial server result set; secure token binding removed the legacy unbound re-search path.
- [x] Complete either/or wording is reduced to its first term; compound-only `pepermunt` scores as a full `munt` match.

## Approaches Tried

- Rejected restoration of the legacy unbound search request because its candidates are not authorized by the active preview token.
- Selected a bounded row-scoped token extension, explicit attention confirmation, recipe-only preference staleness, and alternative-aware ranking.

## Related Files

- `src/routes/shopping/+page.svelte`
- `src/routes/api/shopping/ah-preview/+server.ts`
- `src/routes/api/shopping/ah-push/+server.ts`
- `src/lib/server/ah/`
- `src/lib/components/shopping/`
- `tests/e2e/kitchen-flows.e2e.ts`
