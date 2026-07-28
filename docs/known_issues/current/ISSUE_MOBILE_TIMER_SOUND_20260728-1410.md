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

## Hypotheses

- [x] **High:** page-owned execution is suspended or terminated, so neither `#fireAlarm` nor its service-worker message runs. This is proven by the call graph; exact device suspension timing remains platform-specific.
- [x] **High:** restored timers cannot make foreground sound because restore bypasses both media scheduling and Web Audio initialization. This is proven by the source path.
- [ ] **Medium:** the 12-hour digital-silence media workaround is paused, optimized away, or otherwise loses its audio session on the affected device. The design is brittle and physical behavior is unverified, but it is not necessary to isolate this as the sole root cause.
- [x] **High:** the current notification is not an independent fallback and the Notifications API cannot request a custom alarm sound. It only respects device defaults when the page succeeds in posting it.

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
- `docs/feature-lists/archive/FEATURE_LIST_MOBILE_TIMER_SOUND.md`
- `docs/feature-lists/archive/FEATURE_LIST_UX_CHAT_ASSISTANT_AND_TIMER.md`
