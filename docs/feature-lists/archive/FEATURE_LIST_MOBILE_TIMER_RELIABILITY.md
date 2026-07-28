# Mobile timer reliability

_Status: Shipped in code on 2026-07-28; awaiting the two-Android physical gate_

Related issue:
`docs/known_issues/current/ISSUE_MOBILE_TIMER_SOUND_20260728-1410.md`

## Recommendation

Repair and instrument the existing PWA before adding a native Android app.

Four changes belong together:

1. make every Test and timer push audible by default instead of silencing it merely because any
   Keukenbrein page is visible;
2. move the foreground timer coordinator from the Cook Mode page to the persistent app shell so
   navigating elsewhere in Keukenbrein does not destroy its ticker and alarm;
3. distinguish provider acceptance, service-worker receipt, and successful notification display so
   the UI and production evidence report what actually happened;
4. retain a late push for five minutes instead of discarding it after sixty seconds.

This is the smallest durable response to the physical result. Production already proved that
subscriptions, SQLite jobs, the Railway scheduler, and provider sends work. The current Test
notification is deterministically silent while the app is visible, and the foreground timer
lifecycle is deliberately destroyed when Cook Mode unmounts. These are application bugs, not a
reason to replace the stack.

Web Push remains a best-effort system notification: Android/Chrome can still suppress sound through
the notification channel, silent mode, Do Not Disturb, force-stop, or power/network policy. If the
repaired and measured path misses the household gate, or offline/loop-until-dismissed behavior
becomes required, plan a small native Android timer companion using on-device exact alarms. Do not
ship Capacitor's remote `server.url`; Capacitor documents it as a live-reload option, not production
architecture, and this adapter-node app is not a static bundle.

## Problem framing and observed evidence

Freek's Android check produced three useful distinctions:

- the timer sounded while Cook Mode remained active;
- leaving Cook Mode or letting the screen turn off made behavior inconsistent;
- the Test alert appeared to do nothing even though the timer alert had worked once.

Sanitized production evidence from the same window shows:

- Railway was on remote `main` commit `cecf1918e66...`, deployment status `SUCCESS`;
- readiness, subscription persistence, and three timer-job writes returned HTTP 200;
- all three due jobs reached the browser push provider;
- the first Test request returned HTTP 200; two quick repeats returned the expected HTTP 429.

Provider acceptance therefore works. It does not prove that the phone received the push, that the
service worker displayed it, or that Android played sound. RFC 8030 explicitly separates provider
acceptance from user-agent delivery.

The source then reveals two deterministic defects:

- `src/lib/timer/notification.ts` sets `silent: true` whenever **any** same-origin window is visible.
  The Test button is pressed from a visible window, so its own notification is intentionally silent.
  Navigating from Cook Mode to another Keukenbrein route causes the same suppression even though
  that route has no foreground timer alarm.
- `src/lib/components/BenchSheet.svelte` creates and destroys the timer/lifecycle controllers with
  the page. `localStorage` preserves the display data, and the server job remains scheduled, but
  navigation removes the live foreground ticker/audio path until Cook Mode mounts again.

The current focused suites pass 11 tests, but the notification test explicitly requires the broken
origin-wide silent behavior. This needs a contract correction, not broader test volume.

## Scope

In:

- an app-shell timer coordinator that survives SvelteKit route navigation;
- a compact global active-timer surface with return, cancel, and dismiss actions;
- an audible-by-default service-worker notification contract;
- classic `event.data` and declarative `event.notification` push handling;
- application-level delivery/display receipts for both Test and timer pushes;
- separate UI states for sending, provider accepted, browser received, notification shown,
  display failed, and unconfirmed;
- a five-minute push TTL and stale-delivery window with the original deadline preserved;
- Android-specific notification-setting recovery guidance and Test cooldown;
- append-only schema migration, authenticated ownership checks, focused tests, full gates, and the
  two-device physical matrix.

Out:

- a Capacitor or Kotlin production client in this change;
- a custom notification sound, alarm-clock full-screen intent, or DND/silent-mode override;
- iPhone household acceptance testing (the two household users are Android-only);
- cross-device household fan-out;
- unrelated cooking, recipe, navigation, auth, deployment, or AI changes.

## Current system and invariants

- SQLite timer jobs and authenticated per-device subscriptions are already shipped.
- The server-side scheduler is the correct place to own deadlines; a service worker must not hold
  an in-memory timer.
- The existing notification path uses `urgency: high`, a stable per-job topic/tag, and TTL 60.
- `timer_alert_jobs.state = sent` currently means only provider accepted.
- The Test path sends directly and has no durable delivery ID or status to poll.
- Cook session V4 is recipe-scoped in `localStorage`; it preserves progress but does not keep page
  controllers alive.
- `src/routes/+layout.svelte` persists through SvelteKit route navigation and is the correct owner
  for a household-wide active-timer coordinator and banner.
- Drizzle migrations are append-only. Rollback leaves additive columns/tables in place.
- Push endpoints and keys are bearer capabilities: never log, export, or expose them to client
  telemetry.
- Receipt endpoints must authenticate the current session, validate job/subscription ownership, and
  accept only bounded event names and timestamps.
- Production stays a single long-running Railway process sourced from GitHub `main`.

## Research and option decision

| Option | What it fixes | Cost and limits | Decision |
|---|---|---|---|
| Harden existing Web Push and keep timers in the app shell | Fixes the proven silent Test defect, preserves foreground timers across in-app navigation, and makes delivery observable | Still depends on browser/Android notification policy and connectivity | **Chosen now** |
| Firebase Messaging web SDK | Adds a vendor SDK and optional delayed analytics | Still ends at browser Push/service-worker notifications; no exact alarm or dedicated native channel | Rejected |
| Capacitor 8 + Local Notifications | Schedules on-device and can use Android exact-alarm access and a dedicated channel | Requires a bundled static client/API boundary, native auth, Gradle/signing/update ownership, permission reconciliation, and physical Doze tests; remote `server.url` is not production architecture | Conditional next step |
| Native Kotlin alarm companion | Strongest route to `AlarmManager.setAlarmClock()`, foreground service, or looping alarm behavior | Highest duplicate-client, auth, release, and maintenance cost for two users | Rejected unless alarm-clock semantics become mandatory |

Primary sources:

- [W3C Push API](https://www.w3.org/TR/push-api/) defines delivery to an inactive web app through a
  service worker and documents platform latency/restrictions.
- [RFC 8030](https://www.rfc-editor.org/rfc/rfc8030) states that a successful push-service response
  does not mean the message reached the user agent.
- [web.dev Push overview](https://web.dev/articles/push-notifications-overview) explains TTL,
  urgency, and notification display through the service worker.
- [Android alarms](https://developer.android.com/develop/background-work/services/alarms) explains
  exact alarms, Doze behavior, and Android 12+ special access.
- [Android notification channels](https://developer.android.com/develop/ui/compose/notifications/channels)
  explains that Android 8+ users control channel importance and sound.
- [Capacitor Local Notifications](https://capacitorjs.com/docs/apis/local-notifications) documents
  on-device scheduling, exact-alarm checks, `allowWhileIdle`, and channel sound.
- [Capacitor configuration](https://capacitorjs.com/docs/config) marks `server.url` as a live-reload
  feature not intended for production and requires a bundled `webDir`.

Context7 resolution for both `web-push` and Capacitor was attempted on 2026-07-28 but its monthly
quota was exhausted. Current official specifications, platform documentation, repositories, and
release records are therefore the load-bearing sources.

## Target design

### 1. Route-persistent foreground timer

Create one client-only `CookTimerCoordinator` owned by `src/routes/+layout.svelte`. It owns active
deadlines, ticks, foreground audio/vibration, timer-job IDs, dismiss state, and persistence. The
Cook Mode page becomes a view/controller client instead of owning the lifecycle.

Persist a global timer registry with a new versioned key. Import existing active V4 recipe timers
on first mount, preserve the old reader for rollback/upgrade compatibility, and prevent duplicate
job IDs. A restored timer whose deadline already passed remains visually expired and does not
replay foreground audio; its durable push status explains whether a background alert was attempted.

Add a small app-shell timer bar only while at least one timer is active or newly expired. It shows
the nearest countdown, the count of additional timers, a return-to-recipe action, and
cancel/dismiss. This is functional continuity, not a navigation redesign.

Screen-off and process termination still rely on Web Push. The app shell solves in-app navigation,
not OS suspension.

### 2. Fail-loud notification contract

Every valid timer or Test push requests normal notification behavior. Remove the
origin-wide-visible `silent` rule and its vibration suppression. A brief duplicate foreground sound
is preferable to a missed timer.

Do not add a visibility handshake in this iteration. “Some window is visible” was too weak, and a
new acknowledgement race would create another path to accidental silence. Stable notification
tags still bound duplicates. If the physical matrix proves duplicates disruptive, a later change
may silence only after the matching app-shell timer positively records that it played foreground
audio for that exact job.

Parse both push forms:

- classic Web Push: `event.data?.json()`;
- declarative push: `event.notification` when the browser has already constructed it.

Invalid data still falls back to a visible generic timer notification.

### 3. Delivery receipts and truthful status

Give Test pushes durable alert IDs rather than treating them as fire-and-forget calls. Extend the
existing job model additively so timer and Test alerts share these timestamps/categories:

- `provider_accepted_at`;
- `worker_received_at`;
- `notification_shown_at`;
- `display_failed_at` plus a bounded normalized error category;
- optional `clicked_at`;
- `kind` (`timer` or `test`), defaulting existing rows to `timer`.

Keep the existing terminal scheduling state for compatibility; rename UI/log language from `sent`
to `provider accepted`. Do not store notification contents, browser capabilities, endpoint data, or
raw exception text in delivery evidence.

The service worker posts authenticated, same-origin receipts after it receives the event and after
`showNotification()` resolves. Telemetry failure must never block display. Queue an unsent bounded
receipt in IndexedDB and retry on the next worker/page wake; deduplicate by alert ID + event.

Add owned status reads for the Test flow and active timers. The Test button shows:

1. Sending to browser service…
2. Accepted; waiting for this phone…
3. Notification shown. Did it make a sound?

If status remains unconfirmed, explain that the browser/phone did not acknowledge it and offer
Android notification settings. If display succeeds but sound is absent, direct the user to set
Chrome/Keukenbrein notifications to Alerting and check silent/DND. Disable Test while in progress
and for the existing 30-second rate-limit window.

### 4. Useful late-delivery window

Set push TTL and scheduler stale grace to five minutes. Include the original deadline in every
payload and mark late delivery in the body only when useful. This covers short sleep/connectivity
gaps without producing an hour-late kitchen alarm. Cancellation remains idempotent; a cancel that
cannot reach the server stays visibly pending.

## Phase plan

1. Correct the behavioral contract with failing tests at the notification, app-shell, receipt, and
   stale-delivery seams.
2. Move the timer coordinator and persistence into the app shell; integrate Cook Mode and the
   global active-timer bar.
3. Add the append-only receipt model and authenticated receipt/status API.
4. Make service-worker alerts fail loud, support both push forms, post receipts, and extend TTL.
5. Replace false readiness/Test copy with measured status and Android recovery guidance.
6. Rehearse migration, run all automated gates, deploy through production-beta as the controlled
   household stage, and run the two-phone matrix.

## Execution tickets

### TIMER-REL-1 — Correct-seam regression contract

- **Scope in:** failing tests for audible Test notifications, another visible app route, classic and
  declarative events, app-shell navigation continuity, delivery-state transitions, and five-minute
  late delivery.
- **Scope out:** implementation and physical sound assertions.
- **Targets:** `src/lib/timer/notification.test.ts`,
  `src/lib/components/cook-mode/lifecycle-controller.test.ts`,
  new coordinator/persistence tests, `src/lib/server/timer-alerts/{push,scheduler,service}.test.ts`,
  and focused route tests.
- **Risk / effort:** R1 / S.
- **Dependencies:** none.
- **Verification:** each new assertion fails for the exact current defect before implementation;
  existing focused suites stay green.
- **Rollback:** remove only contract tests if the product requirement is explicitly changed.

### TIMER-REL-2 — App-shell timer continuity

- **Scope in:** global coordinator/store, V4 import and versioned persistence, Cook Mode integration,
  timer bar, return/cancel/dismiss, and one foreground audio owner.
- **Scope out:** background delivery changes and general navigation redesign.
- **Targets:** new `src/lib/timer/cook-timer-coordinator.svelte.ts`,
  `src/routes/+layout.svelte`, `src/lib/components/BenchSheet.svelte`,
  `src/lib/components/cook-mode/{cook_session.ts,lifecycle-controller.svelte.ts,TimerChip.svelte}`,
  a focused timer-bar component, and tests.
- **Risk / effort:** R2 / M.
- **Dependencies:** TIMER-REL-1.
- **Verification:** timer continues and alarms after Cook Mode → Shopping/Recipes navigation;
  reload restores countdown; two recipes remain distinct; cancel updates the correct server job;
  expired restore does not replay; 320/375/1280 layouts, 44px controls, keyboard focus, and live
  countdown status pass.
- **Rollback:** keep the V4 reader and server jobs; switch BenchSheet back to its local controller.
  New local persistence is additive and can be ignored by the old app.

### TIMER-REL-3 — Receipt schema and authenticated status boundary

- **Scope in:** append-only receipt fields/table, Test alert IDs, idempotent receipt writes,
  authenticated/owned status reads, bounded IndexedDB retry payload contract, and retention cleanup
  for terminal Test evidence.
- **Scope out:** raw push-provider receipt protocols, capability logging, household export.
- **Targets:** `src/lib/server/db/schema.ts`, new `drizzle/0024_*.sql` plus append-only journal,
  `src/lib/server/timer-alerts/{repository,service,validation}.ts`,
  `src/routes/api/timer-alerts/{test,receipts,jobs}/**`, reset/export boundaries, and tests.
- **Risk / effort:** R3 / M.
- **Dependencies:** TIMER-REL-1.
- **Verification:** fresh and 0023→0024 migration rehearsals; existing rows read as timer jobs;
  401/cross-user/foreign-job receipt rejection; duplicate receipt idempotency; invalid
  event/timestamp/error rejection; capability/content exclusion from logs and export; terminal Test
  evidence expires after 30 days.
- **Rollback:** deploy the previous app and leave additive schema in place; do not edit or drop the
  migration.
- **Flags:** `requires_stage_gate: true`.

### TIMER-REL-4 — Audible worker, receipt delivery, and late window

- **Scope in:** remove origin-wide silence, handle `event.data` and `event.notification`, post/queue
  receipt events without blocking notification display, set TTL/grace to five minutes, and retain
  stable tags/topics.
- **Scope out:** custom sound, native channel creation, and an unproven foreground-silence handshake.
- **Targets:** `src/service-worker.ts`, `src/lib/timer/notification.ts`,
  `src/lib/timer/push-client.ts`, `src/lib/server/timer-alerts/{push,scheduler,runtime}.ts`, and
  focused tests.
- **Risk / effort:** R2 / M.
- **Dependencies:** TIMER-REL-1, TIMER-REL-3.
- **Verification:** valid Test/timer pushes never set `silent`; classic and declarative payloads
  display; fallback stays visible; receipt failure cannot prevent `showNotification()`; offline
  receipt retries deduplicate; 61-second delay sends, greater-than-five-minute stale job expires;
  no client bundle contains endpoint/key data.
- **Rollback:** restore the prior worker and 60-second window while retaining unused receipt fields.

### TIMER-REL-5 — Measured Test and recovery UX

- **Scope in:** sending/accepted/received/shown/failed/unconfirmed states, polling or foreground
  status refresh, Test busy/cooldown, Android Alerting/silent/DND guidance, and honest readiness
  language.
- **Scope out:** automatic settings changes or notification permission prompts without a gesture.
- **Targets:** `src/lib/components/BenchSheet.svelte`, `src/lib/timer/push-client.ts`, message
  catalogs, focused component tests, and authenticated Playwright.
- **Risk / effort:** R2 / S.
- **Dependencies:** TIMER-REL-3, TIMER-REL-4.
- **Verification:** no success copy before `notification_shown_at`; 429 maps to the visible
  cooldown rather than a generic failure; timeout gives recovery action; receipt-confirmed but
  silent result points to Android settings; Dutch and English remain equivalent; screen-reader
  announcements do not repeat every poll.
- **Rollback:** retain the status API and fall back to a single generic Test control.

### TIMER-REL-6 — Controlled deployment and two-phone gate

- **Scope in:** complete repository gate, migration rehearsal, production-beta deploy supervision,
  sanitized receipt evidence, and the Freek/Ylfa Android matrix.
- **Scope out:** native implementation and any destructive schema rollback.
- **Targets:** tests/fixtures only as needed, the issue record, deployment log, and feature-list
  status.
- **Risk / effort:** R3 / M.
- **Dependencies:** TIMER-REL-2 through TIMER-REL-5.
- **Verification:** `npm test`; `npm audit --omit=dev`; fresh/upgraded DB integrity; production
  deployment is `SUCCESS`, exact remote `main`, and authenticated canary passes; each phone runs
  three repetitions in each of four states: visible Test, another Keukenbrein route, locked screen,
  and app swiped away (24 alerts per phone, 48 total). Healthy-network gate: zero missing
  `notification_shown` receipts and zero sound misses with the Android channel set to Alerting.
  Record latency without retaining household content or authenticated browser artifacts.
- **Rollback:** disable new receipt/status UI if needed, redeploy the previous app, and leave the
  additive migration. Existing timer jobs and subscriptions remain usable.
- **Flags:** `requires_stage_gate: true`.

## UI/UX audit

| Priority | Finding | Response |
|---|---|---|
| P1 | “Background timer alerts are ready” describes a subscription, not delivery | Show the exact verified stage; call only `notification_shown` a successful Test |
| P1 | A visible Keukenbrein page can silence a notification even when it owns no alarm | Fail loud for every valid timer/Test push |
| P1 | Navigating away removes both the active countdown surface and foreground alarm owner | Persist the coordinator in the app shell and show a compact global timer bar |
| P2 | Repeat Test taps remain enabled and become unexplained 429 failures | Busy state plus visible 30-second cooldown |
| P2 | A silent displayed notification gives no recovery path | Explain Android Alerting, silent/DND, and browser notification settings |
| P2 | Polling delivery state can create noisy screen-reader updates | Announce only meaningful state transitions |

## Hardening audit

The focused production dependency audit reports zero known vulnerabilities. No debug logging,
unbounded `any`, TODO marker, or capability output was found in the timer-alert subsystem.

| Priority | Boundary | Failure | Mitigation / verification |
|---|---|---|---|
| P1 | Notification semantics | Provider acceptance is reported as delivery | Persist and name distinct accepted/received/shown states |
| P1 | Foreground suppression | Any visible app route silently suppresses the OS alert | Remove the heuristic; fail loud |
| P1 | Route lifecycle | Page destruction removes the only foreground alarm | One app-shell coordinator with teardown only at full app unload |
| P1 | Late delivery | 60-second TTL/grace turns short sleep/connectivity loss into a permanent miss | Five-minute bounded window plus original deadline |
| P1 | Receipt authorization | A signed-in client writes or reads another user's alert evidence | Session auth, user/job/subscription ownership, enum/size limits, negative tests |
| P2 | Receipt privacy | Endpoint, keys, titles, recipes, or raw browser errors leak into telemetry | Store IDs/timestamps/normalized categories only; no export/log values |
| P2 | Receipt availability | Telemetry failure prevents notification display | Display first; catch/queue receipt independently |
| P2 | IndexedDB growth | Offline receipts grow without bound | One record per alert/event, count/age cap, delete after confirmed POST |
| P2 | Duplicate foreground/push alert | Both valid paths sound | Accept as fail-loud default; stable tag bounds OS duplicates; measure before adding a silence handshake |
| P2 | Test abuse | Repeated Test sends hit the server rate limiter | UI busy/cooldown plus existing authenticated limiter |

## Risk and verification matrix

Overall risk: **R3** because the plan adds an append-only schema migration and an authenticated
service-worker write boundary. The application and transport edits are R2. Production-beta is the
stage because this household deployment has only two known Android users and the migration is
additive; promotion still stops at the explicit checkpoint before physical tests.

| Area | Automated evidence | Runtime evidence | Release boundary |
|---|---|---|---|
| Navigation continuity | App-shell controller and persistence tests | Timer survives route change and return on both phones | Zero lost active timers across supported in-app navigation |
| Push display | Notification and worker tests | Accepted → received → shown timestamps | No healthy-network alert stops before `notification_shown` |
| Sound | Audible options contract tests | Android channel Alerting, visible/background/locked/swiped | Zero sound misses in 48 total alerts |
| Late delivery | Fake-clock TTL/grace tests | Brief offline/sleep reconnect | ≤5-minute delay remains useful; older job expires |
| Auth/privacy | 401/cross-user/validation/export/log tests | Sanitized production logs only | No capability/content disclosure or foreign writes |
| Migration | Fresh and 0023→0024 rehearsals | Railway startup/integrity | Previous household data preserved; rollback needs no down migration |
| UX/accessibility | State/component/Playwright 320/375/1280 | Two-phone Test recovery check | UI never says successful before display confirmation |

## Failure-mode critique

| Failure mode | Trigger | Detectability | Mitigation | Residual risk |
|---|---|---|---|---|
| Provider accepts but phone never wakes worker | Push transport, Chrome, Android power/network policy | No `worker_received` receipt | Five-minute TTL, settings guidance, measured device gate | Medium; Web Push is not exact alarm delivery |
| Worker receives but display fails | Payload/permission/browser error | `worker_received`, then `display_failed` or no shown receipt | Both payload forms, generic visible fallback, normalized error | Low/medium |
| Notification displays without sound | Android channel muted, silent/DND | `notification_shown` plus user's Test result | Exact Android Alerting guidance; honest platform limit | Medium; web code cannot override device policy |
| In-app route change loses alarm | BenchSheet unmount | Source and route test | Persistent app-shell coordinator | Low |
| Both foreground and push sound | Both paths healthy | Device matrix/user report | Reliability-first default; stable tag; later exact-job acknowledgement only if needed | Low nuisance, preferred over silence |
| Receipt network call fails | Offline worker | Missing server receipt but local display may work | Bounded IndexedDB queue and retry | Low |
| Cancel stays offline | Phone cannot reach server before deadline | Visible cancel-pending state | Retry cancel; five-minute cap; keep idempotent ownership | Medium |
| Service worker version changes mid-timer | Deployment/update race | Versioned payload/receipt category | Backward-compatible payload parser and generic fallback | Low |
| Native fallback becomes another half-client | Premature Capacitor wrapper | Architecture review/build ownership | Enforce flip threshold and separate R3 plan | Avoided in this plan |

## Rollout, rollback, and native flip point

1. Implement behind backward-compatible APIs with VAPID and existing foreground timers remaining
   functional throughout.
2. Rehearse fresh and 0023→0024 upgrades locally; no down migration.
3. Merge only after the full secret-free gate. Treat the current production-beta deployment as the
   controlled stage: supervise Railway to terminal `SUCCESS`, prove exact remote `main`, then run the
   authenticated canary.
4. Run the full 48-alert matrix before resolving the issue.
5. On any P1 regression, redeploy the previous commit. Leave additive fields/table in place and
   inspect sanitized state before another attempt.

Create a separate native Android plan if either condition is true:

- after this implementation, any of the 48 healthy-network tests lacks
  `notification_shown`, or either phone misses a locked-screen sound while its Chrome/Keukenbrein
  channel is set to Alerting; or
- the requirement changes to offline exact timing, a custom channel sound, or an alarm that keeps
  ringing until dismissed.

The likely native shape is a small bundled Capacitor Android timer client that calls the existing
HTTPS API, schedules/cancels Local Notifications, rechecks Android 12+ exact-alarm access on resume,
and reconciles pending native IDs with server jobs. It needs its own auth boundary, Android project,
signing/update owner, reboot recovery, and Doze/multiple-timer testing. The existing PWA remains the
only code/deploy owner until that threshold is crossed.

## Open questions and defaults

> **Q: Is a brief duplicate foreground alert acceptable if it prevents another silent timer?**
> Default: yes. Reliability is the stated priority. Start fail-loud and add deduplication only after
> the physical matrix proves it necessary and a matching timer can positively acknowledge that it
> already sounded.

> **Q: Should this create a separate Railway staging service and database?**
> Default: no. Use production-beta as the controlled household stage because there are two known
> users, the migration is additive, the previous app can ignore it, and production truth/canary
> tooling already exists. Stop before the device matrix and preserve rollback readiness.

> **Q: How late is still useful?**
> Default: five minutes. Sixty seconds is too easy to miss during ordinary sleep/connectivity
> transitions; longer than five minutes risks a confusing stale kitchen alarm.

> **Q: Should native Android work start in parallel?**
> Default: no. The current code contains two proven defects and no receipt evidence. Fixing them is
> lower cost and produces the measurements needed to scope native work responsibly.

## Independent review

Model signal: `Model opus [verify]: unavailable — HTTP 429, "You've hit your session limit · resets
7:50pm (Europe/Amsterdam)."` No independent model findings were accepted or inferred.

The review gap is covered transparently, not silently: the plan includes a source-backed
failure-mode table, hardening and UX audits, direct production evidence, and two independent
stack-research passes (standards Web Push and Capacitor/Android exact alarms). Because the outside
R3 critic was unavailable, `$run` must re-invoke that critique before editing the migration or
authenticated receipt boundary. The default recommendation remains GO WITH THAT CHECKPOINT: the
PWA fixes are bounded and address proven defects, while the R3 receipt work waits for the required
pre-edit review.

## Resume pack

Goal: make timers survive in-app navigation, make Test/timer notifications audible by default, and
measure the path from provider acceptance through service-worker display on both household Android
phones.

Current state: production scheduling and provider acceptance are proven. The app still suppresses
sound whenever any Keukenbrein window is visible, destroys the foreground alarm on Cook Mode
navigation, has only a 60-second delivery window, and calls provider acceptance success.

First ticket: TIMER-REL-1.

First files:

- `docs/known_issues/current/ISSUE_MOBILE_TIMER_SOUND_20260728-1410.md`
- `src/lib/timer/notification.ts`
- `src/service-worker.ts`
- `src/lib/components/BenchSheet.svelte`
- `src/routes/+layout.svelte`
- `src/lib/server/db/schema.ts`
- `src/lib/server/timer-alerts/{repository,service,push,scheduler}.ts`
- `src/routes/api/timer-alerts/**`

First command:

`npm run test:unit -- src/lib/timer/notification.test.ts src/lib/components/cook-mode/lifecycle-controller.test.ts src/lib/server/timer-alerts/service.test.ts src/lib/server/timer-alerts/scheduler.test.ts`

Handoff: run `$run docs/feature-lists/FEATURE_LIST_MOBILE_TIMER_RELIABILITY.md` from the isolated
branch/worktree. Execute the R3 checkpoint before migration deployment and the production-beta
checkpoint before physical device tests.
