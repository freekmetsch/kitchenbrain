# Issue: Cooking timer does not reliably sound on mobile
Created: 2026-07-28 14:10
Status: AWAITING VERIFICATION

## Symptom

The cooking timer can finish on a mobile device without an audible alarm.

## Expected Behavior

After the cook starts a timer, it gives the strongest reliable audible completion signal the
installed or browser-hosted PWA can provide, including when the cooking view is backgrounded or
the screen is locked. The UI must explain any platform limit that prevents this guarantee.

## Investigation Log

| Date | Action | Result | Next Step |
|------|--------|--------|-----------|
| 2026-07-28 14:10 | Opened fix-mode diagnosis and located the existing timer media, worker, service-worker, notification copy, and archived timer plan. | The app already tries to keep one long encoded audio file playing from the timer-start gesture, but physical mobile behavior remains unverified and the user reports that sound does not reliably fire. | Trace the runtime path, build the cheapest reproducible browser/device matrix, and verify current iOS/Android browser constraints from primary sources. |
| 2026-07-28 14:17 | Ran the three focused timer suites. | All 10 tests passed in under one second, but they only prove the mocked page-owned lifecycle. They do not cover OS suspension, Web Push, a restored timer's audio path, or physical sound. | Specify the missing correct-seam tests before implementation and keep physical devices as a release gate. |
| 2026-07-28 14:18 | Inspected the shipped audio with `ffprobe` and `ffmpeg`. | It is a 12:00:30 AAC file: 12 hours of digital silence followed by roughly 30 seconds of alarm pulses. The page starts this media on the timer tap and seeks into the silent lead-in. | Retire the silent-lead-in workaround once an independent background delivery path exists; retain a short foreground alarm. |
| 2026-07-28 14:24 | Traced timer start, restore, expiry, and notification delivery. | The service-worker notification is posted only from `#fireAlarm`, which itself runs after a page worker or page interval ticks. It cannot wake a suspended or terminated page. Restored timers also bypass `startTimer()`, so they never re-arm the media or Web Audio context. | Give background delivery its own durable server deadline and make restored foreground sound readiness explicit. |
| 2026-07-28 14:31 | Checked current WebKit, W3C/IETF, Chrome, SvelteKit, Railway, and Notifications documentation. | iOS/iPadOS 16.4+ Home Screen web apps can receive standards-based Web Push on the Lock Screen; ordinary Safari tabs cannot. The web platform has no shipped cross-platform local scheduled-notification API, standard notifications have device-default rather than custom sound, and Push timing remains network/OS dependent. Railway can run the required long-lived process, but its optional Serverless mode would put an idle scheduler to sleep. | Recommend durable SQLite jobs plus standards-based Web Push, retain foreground audio, require always-on hosting, and state the remaining OS/silent-mode limits honestly. |
| 2026-07-28 | Completed stack, UI/UX, hardening, migration, rollback, and physical-device planning. | The lowest-complexity durable PWA fix is one SQLite-backed in-process deadline scheduler plus per-device Web Push. Capacitor is the correct alternative only if “sound” means an offline, persistent native alarm. The current production dependency audit reports zero known vulnerabilities. | Execute `docs/feature-lists/archive/FEATURE_LIST_MOBILE_TIMER_SOUND.md` through `$run`, stage the R3 change, and keep the issue open until the household device gate passes. |
| 2026-07-28 | Implemented the durable timer-alert path on `codex/mobile-timer-sound`. | Authenticated per-device subscriptions and SQLite jobs now survive page suspension/restart; the service worker handles classic/declarative push and subscription rotation; Cook Mode exposes armed/fallback/cancel-pending state; the long silent audio path is removed. | Complete the automated gate and stage-first verification. |
| 2026-07-28 | Rehearsed migration and automated recovery boundaries. | A real 0022→0023 upgrade preserved existing users with SQLite integrity `ok` and no FK problems. The complete primary-account gate and a clean secondary-account gate passed; production audit reports zero advisories. | Acquire VAPID through the audited secret bridge, configure always-on beta staging, then run the physical matrix. |
| 2026-07-28 | Invoked the required independent R3 Opus review and pre-edit secret-adapter review. | The Claude account hit its session limit; no independent findings were accepted. No PowerShell adapter or secret was created without that required second opinion. Missing VAPID remains a tested foreground-only state. | Resume the independent review after quota reset before creating the machine-level adapter. |
| 2026-07-28 | Freek confirmed the complete household device scope. | Freek and Ylfa are the only users and both use Android, so iPhone behavior is not a release requirement for this deployment. The standards-compatible iOS path remains in the app for self-hosters, without a household verification claim. | Configure the existing always-on production-beta service and verify the installed PWA on both Android devices. |
| 2026-07-28 | Created stable VAPID material through the agent-only 1Password bridge and staged the two Railway variables without deploying. | The bridge returned only `op://Dev-Agents/kitchenbrain-vapid/private_key`; Railway's value-safe readback confirmed `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` are present. The existing service has one running replica, persistent `/data`, and App Sleeping disabled. | Merge the verified branch, observe the deployment and migration, then run the two-device Android sound check. |
| 2026-07-28 | Merged the durable alert implementation in PR #16 and inspected the first production runtime. | The migration and app started, but the production ESM bundle exposed `web-push` under its CommonJS default export. The namespace import lacked `setVapidDetails`, so the caught startup error disabled background delivery despite valid Railway VAPID configuration. | Correct the production import, add a real-client regression test, and redeploy. |
| 2026-07-28 | Merged hotfix PR #19 and ran the production canary on Railway deployment `c6b5da85-6ed6-4712-a388-cf49ae819b97`. | Deployment `158e3ad` reached `SUCCESS`; the server started without disabling VAPID, `/api/healthz` returned 200, the mobile auth boundary rendered cleanly, and Railway reported no deployment errors or HTTP 5xx responses. | On both Android phones, enable timer alerts, run the test alert, then finish a one-minute timer with the PWA backgrounded and the screen locked. |
| 2026-07-28 | Freek ran the physical Android verification. | The foreground timer alert worked, but the Test alert produced no notification and the timer did not persist reliably after navigating away or turning the screen off. This reopens the issue and strongly separates the working page-owned alarm from the unproven independent Web Push path. | Build a direct push-delivery feedback loop and trace subscription creation, test-send result, stored timer job, provider response, and service-worker display behavior before changing code. |
| 2026-07-28 | Correlated Freek's test window with sanitized production HTTP and scheduler logs. | Readiness, subscription persistence, and all three timer-job writes returned 200. Three due jobs were accepted by the browser push service, and the first Test alert returned 200; two immediate retries correctly returned 429. The failure is therefore after provider acceptance, not in timer persistence, Railway scheduling, authentication, or the Test button's HTTP call. | Distinguish device receipt, service-worker display, and Android channel suppression instead of treating provider acceptance as delivery. |
| 2026-07-28 | Traced notification construction and ran the four focused timer-alert suites. | All 11 tests passed, but the notification test explicitly requires `silent: true` whenever any same-origin window is visible. That deterministically silences the Test alert and a timer fired after navigating from Cook Mode to another visible Keukenbrein page. The worker has no proof that the page which caused suppression will play foreground audio. | Remove the origin-wide visibility heuristic, make valid Test and timer notifications audible by default, and lock that fail-loud contract at the service-worker seam. |
| 2026-07-28 | Audited late-delivery and user-feedback boundaries. | Provider TTL and scheduler stale grace are both only 60 seconds, so a temporarily unreachable or sleeping phone permanently loses the alert. “Background timer alerts are ready” and Test success describe subscription/provider acceptance without proving device receipt or display; repeat taps remain enabled and fall into the 30-second rate limit. | Add privacy-safe receipt/display evidence, extend the useful delivery window, expose sending/accepted/displayed/failed states, and give exact Android notification-setting guidance. |
| 2026-07-28 | Rechecked current W3C, Chrome/web.dev, Android, and Capacitor primary documentation. | Web Push is designed to wake a service worker, but push service acceptance and urgency do not prove timely device display. Android notification sound remains user/channel controlled. Native `AlarmManager` operates while an app is not running and the device sleeps; Capacitor exposes exact-alarm and channel APIs, but its remote `server.url` is explicitly not for production and this SSR app has no bundled native client boundary. | Repair and instrument the existing Web Push path first; use a separately planned native Android client only if receipt-confirmed Web Push still misses the household reliability threshold or offline/custom alarm behavior becomes required. |
| 2026-07-28 | Implemented the reliability repair on `wide-sweep/schema-mobile-timer-reliability`. | Timers now have an app-shell owner and compact global bar, survive route changes and hard reloads, always request audible notifications, retain push delivery for five minutes, and report provider acceptance, worker receipt, display, failure, and click evidence through authenticated owned routes. The Test control waits for device display instead of calling provider acceptance success. | Publish through the production-beta path, supervise the additive migration, and run the two-Android matrix. |
| 2026-07-28 | Rehearsed the additive 0023→0024 migration and ran automated gates. | An existing sent job retained its physical `sent_at` rollback field and passed SQLite integrity/FK checks. All 594 unit tests, authenticated primary and secondary timer persistence flows, the production/service-worker build, the bundle capability scan, and `npm audit --omit=dev` passed. One unrelated Chromium context launch was flaky and passed on retry. | Keep the issue open until Freek's and Ylfa's installed Android apps pass Test, route-away, locked-screen, and swipe-away checks. |
| 2026-07-28 | Merged PR #23 and supervised Railway deployment `5f2a22ef-6eec-4af9-aa42-b17a3de612dc`. | Deployment `94cbe50` reached `SUCCESS` on exact remote `main`; health, both household authentication canaries, the logged-out mobile boundary, and bounded Railway application/HTTP error checks passed. | Run the physical Android Test, route-away, locked-screen, and swipe-away checks on both phones. |
| 2026-07-28 | Resolved the valid post-merge review findings in PR #24 and supervised Railway deployment `ad01acf8-933c-40a2-88d6-cd0c80174605`. | Deployment `107449d` reached `SUCCESS` on exact remote `main`; health and both household authentication canaries passed, and bounded Railway application/HTTP error checks were empty. Persisted registries are now user-scoped, valid sessions survive a corrupt sibling entry, offline cancellations retry, and asynchronous push/receipt/click paths are race-hardened. | Run the physical Android Test, route-away, locked-screen, and swipe-away checks on both phones. |

## Hypotheses

- [x] **Resolved by the first implementation:** page-owned execution could not independently post a
  notification after OS suspension. SQLite jobs plus the Railway scheduler now send Web Push
  without the page.
- [x] **Resolved by the first implementation:** the restored timer and 12-hour silent-media
  workaround could not reliably preserve foreground audio. The obsolete media path was removed.
- [x] **Resolved in code, awaiting device verification:** valid Test and timer notifications now
  request audible behavior regardless of another visible Keukenbrein route.
- [x] **Resolved in code, awaiting device verification:** the app shell owns the foreground timer;
  route changes and hard reloads retain the global countdown and cancellation path.
- [x] **Resolved in code, awaiting device verification:** Test success now requires a
  `notification-shown` receipt; provider acceptance and worker receipt are separate states.
- [ ] **Medium, current:** after the application defects are repaired, Chrome transport, Android
  power policy, or the notification channel may still cause a locked-screen miss. Delivery receipts
  and the two-phone gate distinguish those cases.

## Approaches Tried

- Focused unit feedback loop:
  `npm run test:unit -- src/lib/timer/background_audio.test.ts src/lib/components/cook-mode/lifecycle-controller.test.ts src/lib/components/cook-mode/timer-controller.test.ts`
  — 3 files and 10 tests passed.
- Source trace from `TimerChip.svelte` through `BenchSheet.svelte`,
  `lifecycle-controller.svelte.ts`, `background_audio.ts`, and `service-worker.ts`.
- Media inspection: AAC LC, 8 kHz mono, 43,230 seconds, with the first non-silent sample at
  about 43,200 seconds.
- Current primary-source review of Web Push, Notifications, Wake Lock, the discontinued
  Notification Triggers experiment, native local notifications, and the supported Railway
  process model.
- The exact locked-screen symptom was not reproduced in desktop automation because Playwright
  cannot emulate a phone OS suspending or killing a PWA. Freek's and Ylfa's Android devices are the
  physical release matrix for this household deployment.

## Related Files

- `src/lib/timer/background_audio.ts`
- `src/lib/timer/background_audio.test.ts`
- `src/lib/components/BenchSheet.svelte`
- `src/lib/components/cook-mode/lifecycle-controller.svelte.ts`
- `src/service-worker.ts`
- `static/audio/cook-timer-alarm.m4a`
- `docs/feature-lists/archive/FEATURE_LIST_MOBILE_TIMER_RELIABILITY.md`
- `docs/feature-lists/archive/FEATURE_LIST_MOBILE_TIMER_SOUND.md`
- `docs/feature-lists/archive/FEATURE_LIST_UX_CHAT_ASSISTANT_AND_TIMER.md`
