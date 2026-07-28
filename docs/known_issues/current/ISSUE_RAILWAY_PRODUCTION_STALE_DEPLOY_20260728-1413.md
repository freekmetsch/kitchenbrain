# Issue: Railway production does not show the shipped Shopping UI
Created: 2026-07-28 14:13
Status: FIX IN PROGRESS

## Symptom

The authenticated Shopping page at
`https://household-brain-production.up.railway.app/shopping` does not appear to include the mobile
density refinement and progress-bar removal shipped in commit `0440545`.

## Expected Behavior

Production should run a commit containing `0440545`: mobile Shopping controls occupy one compact
row, low-frequency controls open through `List options`, and the header has no visual progress
track on mobile or desktop.

## Repro Path

1. Open the production `/shopping` route in an authenticated browser.
2. Inspect the controls above the first shopping row and the header status treatment.
3. Compare the deployed revision and source branch with commit `0440545` and the repository's
   current default branch.

## Investigation Log

| Date | Action | Result | Next Step |
|------|--------|--------|-----------|
| 2026-07-28 14:13 | Opened a deterministic deployment-lineage investigation from the reported production URL. | Symptom is user-confirmed; deployment revision and source branch are not yet verified. | Compare Git ancestry, Railway deployment metadata, and the authenticated live render. |
| 2026-07-28 14:17 | Compared local and remote ancestry. | `0440545` is on `codex/assistant-write-safety` and is not an ancestor of `origin/main` (`52e0a51`). | Compare the configured Railway source and running deployment. |
| 2026-07-28 14:18 | Read Railway project/service/deployment metadata. | Production watches GitHub `main`, but the serving deployment `96370ca4` is a successful manual local upload created before `0440545`. | Check the authenticated live DOM and rule out a stale client cache. |
| 2026-07-28 14:20 | Probed the authenticated production Shopping page in the existing Chrome session. | The serving DOM has one progressbar/track, the old direct mobile controls, and no `List options` trigger; there are no console errors. | Plan source-lineage reconciliation and a revision-matched canary. |
| 2026-07-28 14:21 | Assessed diagnostic handling after a Railway environment-config read returned plaintext values in protected tool output. | Production AI, backup, and household-login credentials must be treated as exposed; values are not repeated or persisted in artifacts. | Put replacement-first rotation and an R3 checkpoint ahead of any production deployment. |
| 2026-07-28 14:29 | Started guarded execution from the approved recovery feature list. | GitHub/Railway access and the stale manual deployment were revalidated; no live mutation was made. The mandatory Opus review remains rate-limited until 14:50. | Finish the names-only credential/consumer inventory, obtain the independent review, then present the R3 checkpoint. |
| 2026-07-28 15:02 | Completed read-only containment preflight and the independent Opus critique. | The public branch and recovery artifacts passed a redacted Gitleaks scan; the latest Litestream generation restored with full SQLite integrity (`22` tables, `994` rows); a scratch invalid-bucket probe returned 403 while the supervised app process stayed running. Opus returned GO WITH CHANGES and required source reconciliation before credential rotation, one-account deployments, a named rollback floor, and a short-lived OpenRouter management key. No live mutation was made. | Present the adjusted R3 checkpoint before expanding the secret bridge, merging, deploying, or rotating anything. |
| 2026-07-28 15:34 | Freek approved the adjusted R3 cutover; implemented the local secret bridge, provider adapters, stdin-only Railway stager, and names-only deployment inspector. | Dummy-provider/bridge suite passed; production-tooling tests passed; redacted Gitleaks scans found no leaks; diagnostics, 555 unit tests, production build, the secondary-account browser gate, and the one retried primary browser case passed. One full primary run had a browser-process closure while 18/19 cases passed. The mandatory exact-diff Opus review hit its session limit until 19:50, so no source was published and no live mutation was made. | Retry Opus, resolve all P0/P1 findings, rerun the primary gate, then publish and reconcile exact `main` before credentials. |

## Hypotheses

- [x] Production tracks `main`, while the Shopping commit exists only on
  `codex/assistant-write-safety`.
- [x] Railway did not receive this feature-branch push through GitHub; the deployment serving the
  production domain is an earlier successful manual upload.
- [x] The expected build is not live. The deployment revision and authenticated DOM refute a
  browser/service-worker cache explanation.
- [ ] After containment, the complete feature branch can be reviewed and promoted to `main`
  without dropping safety behavior that is currently live only through the manual deployment.

## Approaches Tried

### Read-only Git ancestry

- `origin/main` resolves to `52e0a51`.
- `origin/codex/assistant-write-safety` resolves to `10df9cd`.
- Shopping commit `0440545` is contained by the feature branch and not by `origin/main`.
- The feature branch also contains assistant-write safety and Linux startup fixes that production
  already received through manual uploads. Cherry-picking only Shopping would make the next
  source deployment omit those live-only fixes.

### Railway deployment metadata

- The service source is GitHub `freekmetsch/kitchenbrain`, branch `main`, repository root.
- The serving deployment is `96370ca4`, status `SUCCESS`, and is a manual local upload created
  before the Shopping commit.
- Railway's configured source therefore behaved as designed: pushing a non-source branch did not
  trigger the production GitHub deployment.

### Authenticated live canary

- `/shopping` renders one `role="progressbar"` and one `.market-progress-track`.
- The old direct sort/maintenance controls render and `List options` does not.
- The browser console has no warnings or errors.
- No authenticated screenshot was persisted because this public repository must not publish
  household list content.

### Rejected recovery shortcuts

- **Manual `railway up` from the feature branch:** would make the UI appear but preserve the
  source-versus-runtime drift.
- **Retarget production to the feature branch:** would turn a temporary work branch into the
  production contract.
- **Cherry-pick only `0440545` to `main`:** could remove safety behavior already running in
  production but absent from `main`.

The planned durable recovery is a reviewed full-branch promotion to `main`, a Railway deployment
whose commit exactly matches that merged tip, boundary-by-boundary credential containment, and
authenticated mobile/desktop canaries throughout.

## Related Files

- `docs/feature-lists/archive/FEATURE_LIST_SHOPPING_MOBILE_DENSITY_REFINEMENT.md`
- `docs/feature-lists/FEATURE_LIST_PRODUCTION_DEPLOYMENT_LINEAGE_RECOVERY.md`
- `docs/artifacts/2026-07-28-canary-shopping-stale-deployment.html`
- `docs/artifacts/2026-07-28-plan-production-deployment-lineage-recovery.html`
- `src/lib/components/shopping/ShoppingLists.svelte`
- `src/lib/components/shopping/WeekNav.svelte`
- `src/routes/shopping/+page.svelte`
- `src/lib/server/db/index.ts`
- `Dockerfile`
- `start.sh`
