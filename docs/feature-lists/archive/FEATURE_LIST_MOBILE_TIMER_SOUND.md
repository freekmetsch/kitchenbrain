# Reliable mobile timer sound

_Status: Shipped - 2026-07-28 (durable Web Push implementation complete; stage/device verification remains in the issue)_

Related issue: `docs/known_issues/current/ISSUE_MOBILE_TIMER_SOUND_20260728-1410.md`

## Recommendation

Replace the page-owned “12 hours of silence, then alarm” workaround with a durable SQLite timer
deadline and standards-based Web Push to the device that started the timer. Keep a short foreground
alarm for an open cooking view.

The supported promise is deliberately narrower than a native alarm clock: when timer alerts are
enabled, the server is reachable, and the device permits notification sound, the installed PWA can
raise a device-default system notification while backgrounded or locked. A PWA cannot choose a
custom notification sound, override silent/Focus modes, or promise exact delivery while the device
or network is unavailable. If “sound” must instead mean a looping alarm that persists until
dismissed, this plan must switch to the rejected native-app option before implementation.

## Problem framing

The current timer has three coupled paths, all owned by the cooking page:

- the timer deadline is kept in local state/localStorage and ticked by a Web Worker or interval;
- foreground expiry plays a 0.8-second Web Audio beep and vibrates;
- the service-worker notification is posted only after that page-owned tick fires.

The background audio adapter tries to avoid timer throttling by starting a 12:00:30 AAC file from
the timer-button gesture and seeking into a 12-hour silent lead-in. This still depends on the mobile
browser retaining a page-owned media session. It cannot cover a killed PWA, and restored timers
bypass the lifecycle method that arms media and Web Audio. The UI currently describes
notifications as a backup even though they are not independently scheduled.

The focused timer suites are green (3 files, 10 tests), but they mock the browser lifecycle. They do
not exercise OS suspension, Web Push, restored audio, or physical sound. Playwright cannot emulate
a phone OS suspending or killing a PWA, so physical Android and iPhone checks remain a release gate.

## Scope

In:

- an authenticated, per-device Web Push subscription and explicit “Enable timer alerts” flow;
- durable per-timer alert jobs in the existing SQLite database;
- one in-process scheduler in the existing long-running Node service;
- push receipt, notification display, and click-to-return behavior in the existing service worker;
- idempotent schedule/cancel/restore integration with cook-session persistence;
- a short foreground alarm and honest readiness/failure states in English and Dutch;
- focused unit/API/service-worker tests, authenticated Playwright coverage, and a physical-device
  acceptance matrix;
- optional VAPID configuration through the existing `.env`/1Password contract.

Out:

- an App Store/Play Store wrapper, Capacitor, native signing/release pipelines, or native exact-alarm
  permissions;
- custom notification sounds, overriding silent/Focus/Do Not Disturb, or a “rings until dismissed”
  guarantee;
- broadcasting a household timer to every subscribed device;
- a managed queue or third-party notification dashboard;
- unrelated cooking-page, recipe, AI, Albert Heijn, authentication, or multi-user changes.

## Current system and invariants

- `src/lib/components/BenchSheet.svelte` owns timer actions and local cook-session persistence.
- `src/lib/components/cook-mode/lifecycle-controller.svelte.ts` owns Worker ticks, foreground audio,
  vibration, Wake Lock, and the current page-to-service-worker notification message.
- `src/lib/timer/background_audio.ts` owns the long silent media workaround.
- `src/service-worker.ts` currently has install/cache/fetch/message handlers but no `push` or
  `notificationclick` handler.
- `src/lib/server/db/index.ts` opens SQLite, enables WAL/foreign keys, and completes migrations
  before server-start modules can schedule work.
- `src/hooks.server.ts` already starts a production-only in-process background guardian. Timer
  scheduling should use one similarly guarded production singleton, with its logic isolated and
  dependency-injected for tests.
- The deployment is one long-running adapter-node process. Railway Serverless/App Sleeping must be
  disabled; Railway Cron is not accurate enough for kitchen timers.
- Drizzle migrations and the journal are append-only. Never squash or edit historical migrations.
- Timer subscriptions and endpoints are scoped to `locals.user`. A timer alerts only the
  subscription on the device that created it.
- No plaintext secrets or client-bundled private values. Stable VAPID private material is acquired
  during `$run` through the `1password-secrets` procedure and exposed only to the server. The public
  VAPID key is returned from an authenticated readiness endpoint, not a `PUBLIC_*` variable.

## Research and option decision

| Option | Mobile background result | Cost and limits | Decision |
|---|---|---|---|
| Repair the long silent media track | May survive ordinary backgrounding on some devices; cannot wake a killed page and restored playback still needs a gesture | Smallest code change, but retains the failed platform assumption and offers no dependable readiness signal | Rejected |
| Durable SQLite job + Web Push | Can wake a service worker and show an OS notification when the PWA/page is inactive; iOS support requires a Home Screen web app on iOS/iPadOS 16.4+ | Preserves the PWA and current deployment; timing and sound remain subject to network, browser, OS, notification settings, and silent/Focus mode | Chosen |
| Capacitor native shell + local notifications | Schedules on-device system notifications; better offline behavior | Adds iOS/Android projects, signing, stores, native release testing, API-origin/auth redesign, Android exact-alarm/channel rules, and iOS sound constraints; still cannot override device policy | Rejected for this product stage |
| OneSignal/FCM or another managed sender | Outsources sending/operations, but still uses the same OS delivery surface | Adds a third-party account, data boundary, secret source, and operational dependency without fixing exactness or silent mode | Rejected |

Primary-source findings:

- [WebKit: Web Push for Web Apps on iOS and iPadOS](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)
  documents iOS/iPadOS 16.4+ Home Screen support, direct-gesture permission, and Lock Screen delivery.
- [WebKit: Meet Web Push](https://webkit.org/blog/12945/meet-web-push/) and the
  [W3C Push API](https://www.w3.org/TR/push-api/) establish that a push can reach an inactive web
  application and wake its service worker.
- [WebKit: Meet Declarative Web Push](https://webkit.org/blog/16535/meet-declarative-web-push/)
  adds a backward-compatible declarative payload on Safari 18.4+, but classic service-worker
  handling remains necessary for older supported devices.
- [MDN `showNotification()`](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerRegistration/showNotification)
  exposes `silent` and vibration behavior but no custom sound option.
- [Chrome Notification Triggers](https://developer.chrome.com/docs/web-platform/notification-triggers)
  records that cross-platform scheduled local notifications did not ship; Web Push is the available
  standards path but is not exact under network and power constraints.
- [RFC 8030](https://www.rfc-editor.org/rfc/rfc8030.html) defines urgency/TTL and makes clear that
  push-service acceptance is not device delivery; [RFC 8291](https://www.rfc-editor.org/rfc/rfc8291.html)
  defines encrypted Web Push payloads.
- [Railway Serverless](https://docs.railway.com/deployments/serverless) can sleep an idle service
  after ten minutes, while [Railway cron/workers guidance](https://docs.railway.com/guides/cron-workers-queues)
  confirms a continuously running service is the appropriate shape for sub-minute work.
- [`web-push`](https://github.com/web-push-libs/web-push) is the focused Node sender library. Its
  repository was active in July 2026. Re-verify the selected version and its audit result when adding
  it; the current production dependency audit reports zero known vulnerabilities.

Context7 was attempted for `web-push` and Capacitor, but its quota was unavailable. The plan therefore
uses the projects' current official documentation and standards as the load-bearing sources.

## Target design

### Data model

Add two append-only Drizzle tables:

1. `push_subscriptions`: generated ID, `user_id`, endpoint, `p256dh`, `auth`, optional browser/device
   label, created/updated/last-used timestamps, and a unique endpoint constraint. Treat the endpoint
   and keys as bearer capabilities: never log or export them.
2. `timer_alert_jobs`: UUID supplied by the client, `user_id`, `subscription_id`, deadline,
   notification title/body and same-origin recipe URL, state (`scheduled`, `claimed`, `sent`,
   `cancelled`, `failed`, `expired`), attempt count, next-attempt/claimed/sent timestamps, and last
   error category. Index `(state, deadline)` and foreign-key the subscription/user ownership.

The job UUID is the idempotency key across local session saves, retries, reloads, and repeated API
requests. Extend cook session V3 to a backward-compatible V4 that records the job UUID and alert
status beside each timer. V3 stays readable: its timer progress is preserved, but an old active
timer is explicitly “foreground only” until the user re-arms background alerts.

Keep both tables out of Settings data export/import. An endpoint plus encryption keys is a delivery
capability, not household content. Include the tables in the relevant authenticated reset/account
cleanup path so disabling alerts or removing local app data does not leave live subscriptions and
scheduled jobs behind.

### Authenticated API

Create a narrow `/api/timer-alerts` surface:

- `GET /readiness`: authenticated server readiness plus the public VAPID key when configured;
- `PUT /subscription`: validate and upsert the current browser subscription for the signed-in user;
- `DELETE /subscription`: disable only a subscription owned by the signed-in user and cancel its
  scheduled jobs;
- `POST /test`: send one generic test alert to that owned subscription;
- `PUT /jobs/[id]`: idempotently create/update a timer job for that same subscription;
- `DELETE /jobs/[id]`: idempotently cancel an owned scheduled job.

Validate bodies with Zod and strict size/character limits. Accept only HTTPS push endpoints from the
documented push-service origins used by the supported Chrome/Safari matrix; if future browser
support makes an origin allowlist impractical, the transport must resolve and pin a public address
through connect time so DNS rebinding cannot bypass a one-time check. Do not follow redirects.
Constrain notification navigation to a same-origin recipe route. Rate-limit subscription churn and
test sends, cap subscriptions/active jobs per user, and reject deadlines outside the supported timer
horizon. Return capability/readiness categories rather than subscription secrets. The browser must
never schedule a timer on another user's or another device's subscription.

The client supplies the existing wall-clock deadline so its countdown and server alert describe the
same event. The server validates that deadline against `now`, the declared duration, a small
clock-skew allowance, and the maximum horizon; it does not accept an arbitrary far-future timestamp.

### Scheduler and transport

Use `web-push` behind `src/lib/server/timer-alerts/push.ts`, configured by
`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT`. If configuration is absent or invalid,
the app still boots and foreground timers still work; readiness reports “server unavailable”.

Start one production scheduler after migrations. Poll/arm at one-second resolution, atomically claim
due rows, and use a short stale grace and TTL (default 60 seconds) with `urgency: high`. On startup,
recover scheduled work from SQLite. Retry only classified transient failures within the grace
window. Treat 404/410 from a push service as a dead subscription, cancel its jobs, and require
resubscription. Never ring an old timer after the grace window.

An accepted send records `sent`, not “heard” or “delivered”. A crash between provider acceptance and
the DB update can produce a duplicate; stable Web Push topic/notification tag, atomic claiming, and
`renotify: false` bound that failure without claiming exactly-once delivery.

### Browser and service worker

“Enable timer alerts” must be an explicit tap. It requests notification permission, registers or
refreshes the Push subscription, persists it server-side, and offers “Send test alert”. On iOS,
ordinary Safari shows “Add to Home Screen to enable timer alerts” instead of requesting an
unsupported permission.

The service worker handles `push`, `pushsubscriptionchange` where supported, and
`notificationclick`. Reconcile the current subscription again on cooking-view mount/visibility
because browser support for the change event varies. A valid push always produces a visible
notification. Use the standard declarative notification JSON shape and have the classic
service-worker handler render the same payload so Safari 18.4+ gains its fallback without dropping
iOS 16.4–18.3 or Chromium. A click focuses an existing same-origin cooking client or opens the recipe
route. If a visible cook view is already handling the deadline, prefer one foreground alarm and a
silent/deduplicated notification; otherwise let the OS use the device-default notification behavior.
Do not claim that client-side state can suppress a declarative fallback after an offline cancel; the
UI must surface a failed cancel sync and the short TTL bounds that race.

Remove `background_audio.ts`, its silent-lead-in tests, and the 12-hour asset. Keep or derive a short
committed alarm asset for the open-page path, play it from an audio object unlocked by the user's
timer/enable gesture, expose an explicit dismiss/reset control, and retain vibration as optional
progressive enhancement. Do not describe Wake Lock as a background guarantee.

## Phase plan

1. Lock the contract with failing correct-seam tests and pure data/notification builders.
2. Add the durable schema, repository, and scheduler with restart/cancel/stale/retry coverage.
3. Add authenticated subscription/job APIs and the encrypted Web Push sender.
4. Add service-worker push/click handling and client subscription/readiness control.
5. Integrate schedule/cancel/restore into cooking timers and replace the silent-media workaround.
6. Run the complete automated and physical-device beta gate, then stage the deployment and observe
   real timers before resolving the issue.

## Execution tickets

### TIMER-SOUND-1 — Correct-seam contract tests

- **Execution:** Complete on `codex/mobile-timer-sound`.
- **Scope in:** add failing tests for durable deadline ownership, restored-timer alert state,
  independent push notification construction, and current misleading fallback behavior.
- **Scope out:** product implementation and physical-device assertions.
- **Targets:** `src/lib/components/cook-mode/cook_session.test.ts`,
  `src/lib/components/cook-mode/lifecycle-controller.test.ts`, new pure
  `src/lib/timer/alert-state.test.ts`, and service-worker notification-builder tests.
- **Risk / effort:** R1 / S.
- **Dependencies:** none.
- **Verification:** each new test fails for the intended missing behavior before implementation;
  existing 10 focused timer tests remain green.
- **Rollback:** remove only the new tests if the product contract is explicitly changed.

### TIMER-SOUND-2 — Durable subscriptions and alert jobs

- **Execution:** Complete on `codex/mobile-timer-sound`; fresh/full-stack and 0022→0023 upgrade
  rehearsals passed.
- **Scope in:** add both schema tables, indexes, ownership foreign keys, repository operations,
  atomic claim/cancel/recovery logic, and a production scheduler singleton after DB migration.
- **Scope out:** push network calls and UI.
- **Targets:** `src/lib/server/db/schema.ts`, generated append-only `drizzle/0023_*.sql` and journal
  entry, `src/lib/server/timer-alerts/repository.ts`, `scheduler.ts`, focused tests, and the smallest
  startup hook in `src/hooks.server.ts`; explicitly exclude the capability tables from
  `src/routes/api/settings/export/+server.ts` and cover them in the appropriate
  `src/lib/server/settings/reset.ts` cleanup.
- **Risk / effort:** R3 / M.
- **Dependencies:** TIMER-SOUND-1.
- **Verification:** fresh-DB and upgraded-DB migration rehearsals; fake-clock tests for due ordering,
  one claim, concurrent timers, restart recovery, cancel-before-claim, stale expiry, bounded retry,
  reset cleanup, export exclusion, and crash/duplicate boundaries; `npm run check`, unit tests, and
  build.
- **Rollback:** deploy the previous app; leave additive unused tables in place. Do not edit/squash the
  migration or drop data during an incident.
- **Flags:** `requires_stage_gate: true`.

### TIMER-SOUND-3 — Authenticated Web Push boundary

- **Execution:** App boundary complete on `codex/mobile-timer-sound`; real VAPID material remains
  intentionally absent until the stage gate.
- **Scope in:** add `web-push`, server-only VAPID config, subscription/readiness/test/job endpoints,
  strict input validation, ownership checks, endpoint/redirect protections, encrypted payload
  sending, transient/permanent error classification, and 404/410 subscription cleanup.
- **Scope out:** third-party notification dashboards and cross-device fan-out.
- **Targets:** `package.json`, lockfile, `.env.example` with names/placeholders only,
  `src/lib/server/timer-alerts/{config,push,validation}.ts`,
  `src/routes/api/timer-alerts/**`, and endpoint/transport tests.
- **Risk / effort:** R2 / M.
- **Dependencies:** TIMER-SOUND-2.
- **Verification:** authenticated/unauthenticated and cross-user API tests; malformed/oversized/private
  destination and DNS-rebinding rejection; rate-limit/quota/horizon/clock-skew tests; idempotent job
  create/cancel; mocked success, transient, 404, and 410 sends; `npm audit --omit=dev`; VAPID private
  material absent from client output and logs.
- **Rollback:** unset optional VAPID configuration to return to foreground-only mode, or revert the
  routes/sender while retaining additive tables.
- **Secret procedure:** during `$run`, use `1password-secrets` for stable VAPID generation and
  `op://` references. Never expose the private key to the model, command arguments, files, or logs.

### TIMER-SOUND-4 — Service-worker receipt and device subscription

- **Execution:** Complete on `codex/mobile-timer-sound`, including subscription rotation that
  preserves already-armed jobs.
- **Scope in:** implement classic and declarative push payload compatibility, visible notification
  construction, stable tag/topic dedupe, click focus/open, explicit permission/subscription flow,
  subscription refresh/reconciliation, and test-alert control.
- **Scope out:** custom system sound and automatic permission prompts.
- **Targets:** `src/service-worker.ts`, new `src/lib/timer/push-client.ts`,
  `src/lib/timer/notification.ts`, targeted service-worker/client tests, and PWA-related types.
- **Risk / effort:** R2 / M.
- **Dependencies:** TIMER-SOUND-3.
- **Verification:** pure payload/notification/click tests; Chromium service-worker integration for
  granted/denied/unsupported and changed subscription; classic rendering of the declarative JSON
  payload; manual iOS Home Screen eligibility check; notification always visible for a valid
  background push.
- **Rollback:** feature-detect and disable the new subscription control; classic app caching/fetch
  behavior remains unchanged. Server jobs can be disabled through missing VAPID config.

### TIMER-SOUND-5 — Cooking lifecycle, restore, cancel, and UX

- **Execution:** Complete on `codex/mobile-timer-sound`; the obsolete long-silence media path and
  2.6 MB asset are removed.
- **Scope in:** schedule on the originating subscription, cancel/reset idempotently, migrate
  cook-session V3→V4 without losing progress, expose per-timer alert state, add short foreground
  alarm/dismiss behavior, update English/Dutch copy, and delete the long silent workaround/asset.
- **Scope out:** recipe layout changes and native alarms.
- **Targets:** `src/lib/components/BenchSheet.svelte`,
  `src/lib/components/cook-mode/{lifecycle-controller.svelte.ts,cook_session.ts,TimerChip.svelte}`,
  their tests, `src/lib/timer/background_audio.ts` and test (remove), `static/audio/`, and message
  catalogs.
- **Risk / effort:** R2 / M.
- **Dependencies:** TIMER-SOUND-4.
- **Verification:** unit tests for start/schedule, cancel/reset, offline/error state, duplicate start,
  reload/restore, expired restore, V3 compatibility, foreground alarm, and no double audible alert;
  authenticated Playwright at 375px and 1280px for ready, iOS-install-needed, denied, unavailable,
  schedule-failed, cancel-failed, restored, firing, and dismiss states; 44px timer/setup targets,
  keyboard focus, and live status announcements.
- **Rollback:** keep V4 reader backward-compatible, disable background scheduling, and restore the
  foreground timer path. Do not restore the 12-hour asset unless a separate measured device result
  justifies it.

### TIMER-SOUND-6 — Stage, physical-device gate, and release evidence

- **Execution:** Automated and migration portions complete. VAPID acquisition, beta staging,
  always-on-host proof, and Android/iPhone receipt-and-sound runs remain open.
- **Scope in:** complete repository gates, deploy to the beta staging path, verify always-on hosting,
  run the Android/iPhone matrix, observe scheduler/send errors without logging capabilities, and
  update/resolve the issue with evidence.
- **Scope out:** production promotion after any P1 miss and native-app work.
- **Targets:** Playwright fixtures/specs, deployment configuration/documentation only where the
  current host requires an explicit always-on setting, the issue artifact, and this feature list.
- **Risk / effort:** R3 / M.
- **Dependencies:** TIMER-SOUND-5.
- **Verification:** `npm test`; fresh/upgraded migration rehearsal; production-bundle secret scan;
  staging health/canary; ten healthy-network timers per platform with zero missing notifications,
  recorded latency, and the matrix below. Server dispatch target is within two seconds on a healthy
  running service; device receipt is observed and recorded, not represented as guaranteed.
- **Rollback:** disable VAPID config/scheduler, cancel pending jobs, redeploy the previous build, and
  leave additive tables intact. Promote only after the stage/device record passes.
- **Flags:** `requires_stage_gate: true`.

## UI/UX audit

| Priority | Finding | Planned response | Evidence status |
|---|---|---|---|
| P1 | “Allow notifications as a backup” implies an independent fallback, but the current service-worker message is sent only by the firing page | Replace with readiness-specific, platform-honest copy | Source-observed |
| P1 | A restored timer bypasses audio/media setup and can silently finish | Persist alert job/status; retain progress; show “foreground only” until re-armed | Source-observed |
| P1 | Background media scheduling returns a success boolean that the adapter erases, so the UI cannot report failure | Remove the workaround and expose schedule/readiness results as typed state | Source-observed |
| P1 | Users cannot verify whether their device will actually make a notification sound | Add an explicit, user-initiated test alert and device-setting guidance | Research-derived; runtime unverified |
| P2 | iPhone Safari and installed Home Screen apps have materially different capabilities | Detect eligibility and show “Add to Home Screen” before permission | Research-derived; runtime unverified |
| P2 | Foreground and background paths can duplicate an alert | Stable tags plus visible-client-aware foreground/silent notification handling | To verify on devices |

## Hardening audit

| Priority | Boundary | Failure | Mitigation / verification |
|---|---|---|---|
| P1 | Push endpoint egress | A stored attacker-controlled endpoint could become SSRF, DNS-rebinding, or redirect abuse | Authenticate; allowlist the supported browser push-service origins or pin public DNS resolution through connect time; do not follow redirects; negative API tests |
| P1 | Hosting | Railway Serverless sleeps the in-process scheduler | Stage gate proves Serverless/App Sleeping is disabled and the service remains long-running |
| P1 | Semantics | Provider acceptance is mistaken for device delivery or sound | Store/send wording as `sent`; UI says alerts depend on device/network/settings; physical canary is the close gate |
| P1 | Cancel/restart | A cancelled or stale timer rings late | Durable state, atomic claim, idempotent cancel, 60-second TTL/grace, startup recovery, and stale-expiry tests |
| P1 | Secrets | Stable VAPID private key leaks into repo/client/logs | 1Password-backed server env only; build/grep scan; public key only through authenticated readiness |
| P2 | Capability privacy | Endpoint, `p256dh`, or `auth` is logged/exported | Never log/export values; delete on unsubscribe/404/410; test redacted errors |
| P2 | Crash window | Push is accepted, process dies before DB update, then retries | Atomic claim plus stable topic/tag and `renotify: false`; document at-least-once residual |
| P2 | Abuse/volume | An authenticated client creates excessive jobs/subscriptions or test alerts | Supported timer horizon, per-user active caps, test/churn rate limits, and negative API tests |
| P2 | Dependency drift | Sender library or transitive package becomes unsafe | Pin through lockfile, current-doc review, `npm audit --omit=dev`, and future dependency updates |

## Risk and verification matrix

Risk: **R3**. The plan adds persisted capability-bearing data, a background scheduler, server egress,
and deployment requirements. The schema change is additive and recoverable, but the beta stage gate
is mandatory before production promotion.

| Area | Automated verification | Runtime/device verification | Release boundary |
|---|---|---|---|
| Timer correctness | Fake-clock repository/scheduler tests; idempotent API; V3/V4 restore tests | Multiple concurrent timers; reload; process restart; cancel/reset | No late or missing server dispatch under the healthy test conditions |
| Auth/security | 401/cross-user/ownership/validation/SSRF tests; client-bundle secret scan | Inspect redacted staging logs | No endpoint/key leakage or cross-user access |
| Push compatibility | Payload/classic/declarative builder tests; mocked provider responses | Android Chrome installed PWA; iPhone iOS 16.4+ Home Screen | Zero missing notifications in ten healthy-network timers per platform |
| Sound contract | Foreground alarm tests; visible-client dedupe tests | Visible, background, locked, and app-swiped-away; normal sound, silent/Focus, and denied permission | Normal-settings sound succeeds; silent/Focus is documented as device-controlled |
| Failure behavior | Offline/stale/retry/dead-subscription tests | Offline at deadline and later reconnect; service restart | No stale alarm after TTL/grace; UI never says “armed” after a failed schedule |
| UI/accessibility | State/component tests and authenticated Playwright at 375/1280 | iOS install guidance, test alert, touch/keyboard use in kitchen context | Every timer shows `armed`, `foreground only`, or actionable failure |
| Database/deploy | Fresh/upgraded migration rehearsal, full `npm test` | Stage canary with always-on hosting | Stage record passes before production |

Physical matrix:

1. Android Chrome installed PWA and iPhone iOS 16.4+ Home Screen PWA.
2. Timer visible, backgrounded, screen locked, and PWA swiped away after scheduling.
3. Normal notification sound, device silent/Focus mode, permission denied/revoked, and
   notification sound disabled in system settings.
4. Timer cancel/reset, reload/restore, two concurrent timers, offline deadline, process restart, dead
   subscription, and test alert.
5. Android first for the household's primary device; iPhone must pass before the feature is described
   as cross-platform.

## Failure-mode critique

| Failure mode | Trigger | Impact | Detectability | Mitigation | Residual risk |
|---|---|---|---|---|---|
| Device receives no notification | Offline/device power policy/push delay | Cook misses the deadline | Server only knows provider acceptance; physical test/user state | High urgency, short TTL, explicit readiness/test alert, foreground alarm, honest copy | Medium; Web Push is not an alarm-clock guarantee |
| Notification appears silently | Silent/Focus/system notification sound disabled | Visual alert without sound | Test alert and device inspection | Explain system control; give exact settings guidance without promising override | Medium |
| Scheduler sleeps | Host App Sleeping enabled | All background timers miss | Stage process/dispatch telemetry | Mandatory always-on deployment gate and canary | Low after gate |
| Cancel request is offline | User resets while disconnected | Previously scheduled push may still arrive | UI knows cancel sync failed | Immediate local cancel, conspicuous “background cancel pending”, short TTL, retry cancel | Medium |
| Page and push both alert | Page visible at deadline | Duplicate sound/notification | Browser/device matrix | Stable tag/topic, visible-client check, silent notification with local audio | Low; browser variation remains |
| Subscription rotates | Browser refreshes or replaces endpoint | Scheduling fails or targets dead capability | API error and 404/410 | Reconcile on visibility/start, prune dead subscription, actionable re-enable state | Low |
| Service restarts at deadline | Claim/send/update crash window | Delay or duplicate alert | Job state/log category | Startup recovery, atomic claim, stale grace, stable dedupe identifiers | Low/medium |
| Old V3 session reloads | Active timer predates deployment | Timer appears active without a durable job | Session reader knows version | Preserve progress, label foreground-only, offer explicit re-arm | Low |
| Stored endpoint is malicious | Authenticated browser submits arbitrary URL | Internal network probe/data exfiltration | Negative validation and transport tests | Public HTTPS validation, no redirects, strict sender boundary | Low |

Steelman: a native wrapper is the only credible direction if the real requirement is an offline,
locally scheduled, persistent alarm rather than a system notification sound. Capacitor's local
notification plugin is active and schedules on-device, but adopting it now would add two native
projects, signing/store distribution, OS-specific permission/channel behavior, and a client/server
origin and authentication decision to this single-process PWA. Web Push is the smallest durable fix
for the reported background/killed-page gap while preserving the repository's architecture. The
plan keeps the semantic limit explicit so a later native decision is not hidden behind “reliable.”

Critique record: the required cross-provider `opus` plan review was invoked with the plan, issue,
repository instructions, and core source paths, but the local Claude session was rate-limited until
14:50 and returned no review. No independent findings were accepted or silently substituted. The
failure-mode table above, hardening audit, UI/UX audit, two focused stack-research passes, source
trace, primary-source checks, and physical release gate remain the accepted critique evidence.

## Rollout and rollback

1. Add the migration and code with VAPID absent by default; deploy to beta staging in
   foreground-only mode and rehearse fresh/upgraded databases.
2. Use the `1password-secrets` flow to create one stable VAPID keypair and `VAPID_SUBJECT`, then
   configure staging through `op://` references. Do not rotate during the device matrix.
3. Prove Railway Serverless/App Sleeping is disabled, run the test-alert and physical matrix, and
   observe dispatch/error categories without capability values.
4. Promote only after zero missing notifications in the healthy-network sample on both target
   platforms. Keep wording at “background alert armed,” not “guaranteed alarm.”
5. If P1 behavior appears, unset VAPID config/stop scheduling, cancel scheduled rows, and deploy the
   previous app. Additive tables stay in place for forensic inspection and a later retry.

Operational flip points:

- If the service ever runs more than one replica, move the atomic claiming contract to a
  multi-process-safe queue/lease before enabling the second replica.
- Reconsider a managed queue if volume exceeds roughly 1,000 timers/month, there are more than ten
  active subscriptions, operational scheduler work exceeds two hours/quarter, or healthy-host
  server dispatch failures exceed 1%.
- Reconsider Capacitor/native delivery if cooks depend on locked/background timers at least three
  sessions per week and the 14-day device record shows any material Web Push miss, or if the product
  adds two or more other native-only requirements.

## Open Questions

> **Q: Does “go off with sound” mean a device-default notification sound, or an alarm that loops
> until dismissed and works offline?** — Default: device-default notification sound through Web
> Push, plus a short foreground alarm. Reason: this directly fixes the killed/background PWA gap
> without changing the product into a native app. Choose Capacitor before `$run` if the latter
> contract is required.

> **Q: Should a timer alert every household device?** — Default: no; alert only the subscription on
> the device that started it. Reason: cross-device fan-out would surprise other cooks and creates a
> new ownership/cancellation contract.

> **Q: Should missing VAPID configuration block the app?** — Default: no; foreground timers remain
> available and the UI reports “background alerts unavailable.” Reason: self-hosters can upgrade
> safely before configuring an optional capability.

> **Q: Should the beta deploy go straight to production after automation?** — Default: no; stage
> first and require the physical Android/iPhone record. Reason: this R3 change crosses mobile OS,
> network, secrets, scheduler, and database boundaries that desktop automation cannot prove.

## Resume pack

Goal: make cooking timers independently reach an audible system notification on supported mobile
PWAs while keeping foreground sound and explaining unavoidable device limits.

Current state: TIMER-SOUND-1 through TIMER-SOUND-5 are implemented on
`codex/mobile-timer-sound`. SQLite owns authenticated per-device jobs; the production scheduler
sends encrypted high-urgency Web Push; the service worker supports classic and declarative
notification payloads; Cook Mode exposes ready/armed/foreground-only/cancel-pending states; V3
sessions upgrade safely; capability data is resettable and excluded from exports; and the long
silent-media workaround is gone. Missing/invalid VAPID configuration keeps the app in an explicit,
safe foreground-only mode.

First command: resume TIMER-SOUND-6 only after a beta staging target and physical Android/iPhone
devices are available.

First files:

- `docs/known_issues/current/ISSUE_MOBILE_TIMER_SOUND_20260728-1410.md`
- `src/lib/components/BenchSheet.svelte`
- `src/lib/components/cook-mode/lifecycle-controller.svelte.ts`
- `src/lib/components/cook-mode/cook_session.ts`
- `src/lib/timer/background_audio.ts`
- `src/service-worker.ts`
- `src/lib/server/db/schema.ts`
- `src/lib/server/db/index.ts`
- `src/hooks.server.ts`

First remaining move: acquire stable VAPID material through the audited `1password-secrets` bridge,
configure beta staging, and prove the service does not sleep.

Pending verification: stage canary, always-on hosting proof, test alerts, and the complete physical
Android/iPhone matrix. Production promotion and issue resolution remain blocked on those gates.
