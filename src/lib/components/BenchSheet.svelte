<!--
	Inline bench-sheet — recipe page's primary cooking surface.

	Owns: cook-mode load/regen, beat-toggle state, mise-en-place, timer state,
	timer-fire alarm (Web Audio + vibrate + best-effort SW notification),
	screen Wake Lock, end-of-cook bench-sheet rating, "I cooked it" footer.

	Phase 2b foreground-locked timer architecture is grounded in §0 of the
	feature list (FEATURE_LIST_V2_COOKMODE_FLATTEN_AND_TIMER_INFRA.md):
	verified that SW setTimeout is unreliable past ~30 s of idle, so the
	clock lives in a dedicated Web Worker, not the SW. The worker tick
	drives `now`; the cook view holds Wake Lock + AudioContext for as long
	as it's mounted; SW notifications are best-effort piggy-backs.
-->
<script lang="ts">
	import { base } from '$app/paths';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import { onDestroy, untrack } from 'svelte';
	import { m } from '$lib/paraglide/messages';
	import { toast } from '$lib/stores/toast.svelte';
	import type { BenchSheetRating, CookModeRecipe, CookModeStep } from '$lib/types';
	import ComponentCard from './cook-mode/ComponentCard.svelte';
	import MergeCard from './cook-mode/MergeCard.svelte';
	import TimerStack from './cook-mode/TimerStack.svelte';
	import FixedBottomBar from './ui/FixedBottomBar.svelte';
	import { fmtClock, paletteFor, streamPalette, type BeatPalette } from './cook-mode/palette';
	import { isStaleCookMode } from './cook-mode/staleness';
	import RawDirectionsFallback from './RawDirectionsFallback.svelte';
	import TimerWorker from '$lib/timer/worker?worker';
	import type {
		ServiceWorkerFireMessage,
		TimerWorkerOutbound
	} from '$lib/timer/messages';

	export type BenchSheetController = {
		regenerate: () => void;
		resetSession: () => void;
		hasActiveTimer: boolean;
		hasProgress: boolean;
		// Surface so the page can render an inline AI-paused banner above the
		// raw fallback rather than a centered error block. Null = no fallback.
		aiPausedReason: string | null;
	};

	type FallbackContext = {
		directions: string[];
		ingredients: { name: string; amount: string; unit?: string }[];
		ingredientStock: boolean[];
		notes: string | null;
		viewLang: 'en' | 'nl';
		servings: number | null;
	};

	type Props = {
		recipeSlug: string;
		recipeTitle: string;
		initial: CookModeRecipe | null;
		fallback: FallbackContext;
		onCooked?: () => void;
		controller: BenchSheetController;
	};

	let {
		recipeSlug,
		recipeTitle,
		initial,
		fallback,
		onCooked,
		controller = $bindable<BenchSheetController>()
	}: Props = $props();

	let cookMode = $state<CookModeRecipe | null>(untrack(() => initial));
	let loading = $state(false);
	let loadError = $state('');
	let regenerating = $state(false);
	let cookedSubmitting = $state(false);
	let cookedDone = $state(false);

	// Generation is non-blocking: while the AI writes the bench sheet the raw
	// recipe renders below a progress banner, so the cook can read/start and
	// can navigate away (the server finishes and caches regardless; returning
	// joins the same in-flight generation). If a raw-view timer is running
	// when the sheet arrives, it parks in `pendingCookMode` instead of
	// swapping — unmounting the raw view would kill the timer.
	let pendingCookMode = $state<CookModeRecipe | null>(null);
	let rawTimerActive = $state(false);
	let genStartedAt: number | null = null;
	let genElapsedSec = $state(0);

	$effect(() => {
		if (!loading) return;
		const id = setInterval(() => {
			if (genStartedAt != null) genElapsedSec = Math.floor((Date.now() - genStartedAt) / 1000);
		}, 1000);
		return () => clearInterval(id);
	});

	function adoptCookMode(cm: CookModeRecipe) {
		cookMode = cm;
		pendingCookMode = null;
		// The raw view unmounts with the swap, taking its timers — its binding
		// can't reset this itself, and a stale true would park the next regen.
		rawTimerActive = false;
		checked = {};
		mep = {};
	}

	let checked = $state<Record<number, boolean>>({});
	let mep = $state<Record<number, boolean>>({});
	let mepExpanded = $state(false);

	// Canonical timer state. `timerEnds` holds wall-clock fire times keyed by
	// step idx; `timerOrder` holds insertion order so the multi-pill stack can
	// keep oldest-at-the-bottom (Object.keys iteration would sort numerically
	// instead). `firedFor` is non-reactive — fires are imperative side
	// effects, not render inputs.
	let timerEnds = $state<Record<number, number>>({});
	let timerOrder = $state<number[]>([]);
	const firedFor = new Set<number>();

	// `now` ticks every 250 ms from the worker; `nowSec` quantizes to seconds
	// so derivations and pill renders only re-fire ~once per second instead of
	// 4×. `checkTimerFires` reads `now` directly for ms-precision zero
	// detection, so it doesn't suffer from the quantization.
	let now = $state(Date.now());
	let nowSec = $derived(Math.floor(now / 1000));

	let benchSheetRating = $state<BenchSheetRating | null>(null);
	let ratingDismissed = $state(false);

	// In-app notification permission primer. Soft ask before the browser
	// dialog; if requestPermission() throws (broken browser), the second flag
	// keeps us from re-showing the primer in a loop.
	let notificationPrimerVisible = $state(false);
	let notificationPrimerShown = false;

	type TimerSnapshot = {
		runningIdxs: Set<number>;
		doneIdxs: Set<number>;
	};
	let timerSnapshot = $derived.by<TimerSnapshot>(() => {
		void nowSec;
		const t = Date.now();
		const runningIdxs = new Set<number>();
		const doneIdxs = new Set<number>();
		for (const k of Object.keys(timerEnds)) {
			const i = Number(k);
			if (timerEnds[i] > t) runningIdxs.add(i);
			else doneIdxs.add(i);
		}
		return { runningIdxs, doneIdxs };
	});
	let anyTimerRunning = $derived(timerSnapshot.runningIdxs.size > 0);

	// ────────── Web Worker tick (foreground-locked clock) ──────────
	// One module worker for the bench-sheet lifetime. We subscribe/unsubscribe
	// rather than terminate/recreate across timer cycles — the worker idles at
	// zero cost when there are no subscribers (its setInterval stops), and
	// keeping the thread warm avoids the ~10 ms reconstruct cost on
	// back-to-back timer starts.
	let timerWorker: Worker | null = null;
	// recipeSlug is fixed for the component lifetime (the [slug] route
	// unmounts BenchSheet on slug change); untrack silences the
	// state_referenced_locally warning without capturing reactivity we don't
	// need for a stable subscriber id.
	const WORKER_SUB_ID = `bench-sheet-${untrack(() => recipeSlug)}`;
	let workerSubscribed = false;

	function ensureTimerWorker() {
		if (timerWorker) return;
		try {
			timerWorker = new TimerWorker();
			timerWorker.addEventListener('message', (e: MessageEvent<TimerWorkerOutbound>) => {
				if (e.data?.type === 'tick') {
					tickNow(e.data.t);
				}
			});
		} catch {
			// Worker construction failed — fall back to a main-thread interval.
			timerWorker = null;
		}
	}

	function subscribeWorker() {
		if (!timerWorker || workerSubscribed) return;
		timerWorker.postMessage({ type: 'subscribe', id: WORKER_SUB_ID });
		workerSubscribed = true;
	}

	function unsubscribeWorker() {
		if (!timerWorker || !workerSubscribed) return;
		timerWorker.postMessage({ type: 'unsubscribe', id: WORKER_SUB_ID });
		workerSubscribed = false;
	}

	function terminateWorker() {
		unsubscribeWorker();
		timerWorker?.terminate();
		timerWorker = null;
	}

	function tickNow(t: number) {
		now = t;
		checkTimerFires(t);
	}

	$effect(() => {
		if (anyTimerRunning) {
			ensureTimerWorker();
			subscribeWorker();
		} else {
			unsubscribeWorker();
		}
	});

	// Fallback main-thread interval — only fires when the worker failed to
	// construct AND a timer is running. Keeps the pill clock advancing in the
	// degraded path; loses the worker's background-resilience.
	$effect(() => {
		if (!anyTimerRunning) return;
		if (timerWorker) return;
		const id = setInterval(() => tickNow(Date.now()), 250);
		return () => clearInterval(id);
	});

	function checkTimerFires(t: number) {
		for (const k of Object.keys(timerEnds)) {
			const idx = Number(k);
			if (timerEnds[idx] <= t && !firedFor.has(idx)) {
				firedFor.add(idx);
				fireAlarm(idx);
			}
		}
	}

	// ────────── Wake Lock (keep screen on while cooking) ──────────
	// The cook is using the screen the whole session — Wake Lock isn't gated
	// on active timers. Re-acquire on visibilitychange→visible because the
	// browser releases the sentinel when the tab backgrounds.
	let wakeLock: WakeLockSentinel | null = null;

	async function acquireWakeLock() {
		try {
			if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;
			if (wakeLock) return;
			wakeLock = await navigator.wakeLock.request('screen');
			// `{ once: true }` so we don't accumulate listeners across
			// successive acquire/release cycles (visibilitychange churn).
			wakeLock.addEventListener(
				'release',
				() => {
					wakeLock = null;
				},
				{ once: true }
			);
		} catch {
			// Older iOS / Safari pre-16.4: silent fallback. Audio + vibrate
			// still fire from the main thread; pill clock still advances.
			wakeLock = null;
		}
	}

	function releaseWakeLock() {
		try {
			void wakeLock?.release();
		} catch {
			// release() rarely throws, but guard against revoked sentinels.
		}
		wakeLock = null;
	}

	function onVisibilityChange() {
		if (typeof document === 'undefined') return;
		if (document.visibilityState !== 'visible') return;
		if (!wakeLock) void acquireWakeLock();
		// AudioContext goes into `suspended` state when phone backgrounds.
		// Resume on return so the next alarm fires audibly.
		if (audioCtx && audioCtx.state === 'suspended') {
			void audioCtx.resume().catch(() => {});
		}
	}

	$effect(() => {
		if (typeof document === 'undefined') return;
		void acquireWakeLock();
		document.addEventListener('visibilitychange', onVisibilityChange);
		return () => {
			document.removeEventListener('visibilitychange', onVisibilityChange);
			releaseWakeLock();
		};
	});

	// ────────── Web Audio alarm ──────────
	// AudioContext is lazy-built on the first `startTimer` click — that tap is
	// the verified user gesture iOS Safari requires to unlock playback. The
	// pre-built buffer is 3 × 200 ms 880 Hz square-wave beeps separated by
	// 100 ms silence; total ~800 ms. Synthesized rather than shipped so we
	// don't add an asset to the PWA bundle.
	let audioCtx: AudioContext | null = null;
	let alarmBuffer: AudioBuffer | null = null;

	function ensureAudio() {
		try {
			if (typeof window === 'undefined') return;
			if (!audioCtx) {
				const Ctor = (window.AudioContext ??
					(window as unknown as { webkitAudioContext?: typeof AudioContext })
						.webkitAudioContext) as typeof AudioContext | undefined;
				if (!Ctor) return;
				audioCtx = new Ctor();
			}
			if (audioCtx.state === 'suspended') void audioCtx.resume().catch(() => {});
			if (!alarmBuffer && audioCtx) alarmBuffer = buildAlarmBuffer(audioCtx);
		} catch {
			audioCtx = null;
			alarmBuffer = null;
		}
	}

	function buildAlarmBuffer(ctx: AudioContext): AudioBuffer {
		const sampleRate = ctx.sampleRate;
		const beepMs = 200;
		const gapMs = 100;
		const totalMs = beepMs * 3 + gapMs * 2;
		const length = Math.round((totalMs / 1000) * sampleRate);
		const buf = ctx.createBuffer(1, length, sampleRate);
		const data = buf.getChannelData(0);
		const beepSamples = Math.round((beepMs / 1000) * sampleRate);
		const gapSamples = Math.round((gapMs / 1000) * sampleRate);
		const freq = 880;
		const amplitude = 0.35;
		for (let beep = 0; beep < 3; beep++) {
			const start = beep * (beepSamples + gapSamples);
			for (let s = 0; s < beepSamples; s++) {
				const t = s / sampleRate;
				const phase = (t * freq) % 1;
				data[start + s] = phase < 0.5 ? amplitude : -amplitude;
			}
		}
		return buf;
	}

	function playAlarm() {
		if (!audioCtx || !alarmBuffer) return;
		try {
			const src = audioCtx.createBufferSource();
			src.buffer = alarmBuffer;
			src.connect(audioCtx.destination);
			src.start();
		} catch (err) {
			// Surface real audio failures so we notice them in DevTools — the
			// cook would otherwise get a silent miss.
			console.warn('cook-mode alarm playback failed', err);
		}
	}

	const VIBRATE_PATTERN: number[] = [200, 100, 200, 100, 200];
	function fireAlarm(idx: number) {
		playAlarm();
		try {
			if (typeof navigator !== 'undefined' && navigator.vibrate) {
				navigator.vibrate(VIBRATE_PATTERN);
			}
		} catch {}
		void postFireToServiceWorker(idx);
	}

	async function postFireToServiceWorker(idx: number) {
		try {
			if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
			if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
			const step = steps[idx];
			if (!step) return;
			const action = (step.timer_action ?? 'Timer').toUpperCase();
			const location = step.timer_location ?? '';
			const title = location ? `${action} · ${location}` : action;
			const body = step.timer_purpose ?? step.goal ?? recipeTitle;
			const reg = await navigator.serviceWorker.ready;
			const message: ServiceWorkerFireMessage = {
				type: 'fire',
				id: String(idx),
				title,
				body,
				vibrate: VIBRATE_PATTERN
			};
			reg.active?.postMessage(message);
		} catch {
			// Best-effort by design: SW eviction during fire-attempt is
			// acceptable failure (audio + vibrate already fired).
		}
	}

	function maybeShowNotificationPrimer() {
		if (notificationPrimerShown) return;
		if (typeof Notification === 'undefined') return;
		if (Notification.permission !== 'default') return;
		notificationPrimerShown = true;
		notificationPrimerVisible = true;
	}

	async function acceptNotifications() {
		notificationPrimerVisible = false;
		try {
			await Notification.requestPermission();
		} catch {
			// Broken browser path — primer stays dismissed (notificationPrimerShown
			// is already true) so we don't loop on re-prompts.
		}
	}
	function dismissNotificationPrimer() {
		notificationPrimerVisible = false;
	}

	$effect(() => {
		if (!cookMode && !pendingCookMode && !loading && !loadError) void loadCookMode();
	});

	async function loadCookMode(force = false) {
		loading = true;
		loadError = '';
		if (genStartedAt == null) {
			genStartedAt = Date.now();
			genElapsedSec = 0;
		}
		try {
			const res = await fetch(
				`${base}/api/recipes/${recipeSlug}/cook-mode${force ? '?force=true' : ''}`,
				{ method: 'POST' }
			);
			const body = await res.json();
			if (res.ok && body.cookMode) {
				const incoming = body.cookMode as Partial<CookModeRecipe>;
				if (!force && isStaleCookMode(incoming)) {
					regenerating = true;
					return loadCookMode(true);
				}
				if (rawTimerActive) {
					pendingCookMode = body.cookMode;
				} else {
					adoptCookMode(body.cookMode);
				}
			} else if (body.reason === 'daily_cap_exceeded') {
				loadError = m.benchsheet_error_budget_reached();
			} else if (body.reason === 'no_directions') {
				loadError = m.benchsheet_error_no_directions();
			} else {
				loadError = body.message ?? m.benchsheet_error_load_failed();
			}
		} catch {
			loadError = m.benchsheet_error_connection_failed();
		}
		loading = false;
		regenerating = false;
		genStartedAt = null;
	}

	function regenerate() {
		regenerating = true;
		cookMode = null;
		pendingCookMode = null;
		// A fresh sheet invalidates old progress AND running timers — their
		// step indices point into the old generation.
		resetCookSession();
		void loadCookMode(true);
	}

	function startTimer(idx: number, seconds: number) {
		ensureAudio();
		maybeShowNotificationPrimer();
		timerEnds[idx] = Date.now() + seconds * 1000;
		if (!timerOrder.includes(idx)) timerOrder = [...timerOrder, idx];
		firedFor.delete(idx);
	}
	function cancelTimer(idx: number) {
		delete timerEnds[idx];
		timerOrder = timerOrder.filter((i) => i !== idx);
		firedFor.delete(idx);
	}
	function toggleStep(idx: number) {
		checked[idx] = !checked[idx];
	}

	// ────────── Local progress persistence ──────────
	// Cook progress (checked beats, mise ticks, running timers) survives
	// navigation, reload, and PWA eviction via localStorage. Timer end times
	// are wall-clock, so restore stays honest; a timer that expired while away
	// restores as done WITHOUT re-firing the alarm (firedFor pre-seeded). A
	// steps signature guards against restoring progress from a previous
	// generation after a regen or schema-staleness rewrite.
	const PROGRESS_KEY = `cookmode-progress:${untrack(() => recipeSlug)}`;
	let progressRestored = false;

	function stepsSig(cm: CookModeRecipe): string {
		return cm.steps.map((s) => s.goal).join('|');
	}

	function restoreProgress(cm: CookModeRecipe) {
		try {
			const raw = localStorage.getItem(PROGRESS_KEY);
			if (!raw) return;
			const saved = JSON.parse(raw);
			if (saved?.sig !== stepsSig(cm)) {
				localStorage.removeItem(PROGRESS_KEY);
				return;
			}
			const t = Date.now();
			const ends: Record<number, number> = {};
			const order: number[] = [];
			for (const idx of saved.timerOrder ?? []) {
				const end = saved.timerEnds?.[idx];
				if (typeof end !== 'number' || idx >= cm.steps.length) continue;
				if (end <= t) firedFor.add(idx);
				ends[idx] = end;
				order.push(idx);
			}
			checked = saved.checked ?? {};
			mep = saved.mep ?? {};
			timerEnds = ends;
			timerOrder = order;
		} catch {
			// Corrupt or inaccessible storage — start clean.
		}
	}

	function saveProgress() {
		try {
			if (!cookMode) return;
			localStorage.setItem(
				PROGRESS_KEY,
				JSON.stringify({ sig: stepsSig(cookMode), checked, mep, timerEnds, timerOrder })
			);
		} catch {
			// Quota / private-mode failures degrade to the old ephemeral behavior.
		}
	}

	function clearProgress() {
		try {
			localStorage.removeItem(PROGRESS_KEY);
		} catch {}
	}

	function resetCookSession() {
		clearProgress();
		checked = {};
		mep = {};
		mepExpanded = false;
		timerEnds = {};
		timerOrder = [];
		firedFor.clear();
		benchSheetRating = null;
		ratingDismissed = false;
		cookedDone = false;
		cookedSubmitting = false;
	}

	$effect(() => {
		if (cookMode && !progressRestored) {
			progressRestored = true;
			restoreProgress(cookMode);
		}
	});

	$effect(() => {
		if (!progressRestored || !cookMode) return;
		// saveProgress stringifies the progress objects, which reads them deeply
		// — that's what registers property-level dependencies for this effect.
		saveProgress();
	});

	let cookedAckTimeout: ReturnType<typeof setTimeout> | null = null;
	onDestroy(() => {
		if (cookedAckTimeout) clearTimeout(cookedAckTimeout);
		terminateWorker();
		releaseWakeLock();
		// AudioContext.close() rejects if already closed; guard rather than
		// swallow with try/catch around `void`.
		if (audioCtx && audioCtx.state !== 'closed') {
			audioCtx.close().catch(() => {});
		}
		audioCtx = null;
		alarmBuffer = null;
	});

	async function markCooked() {
		cookedSubmitting = true;
		try {
			const res = await fetch(`${base}/api/recipes/${recipeSlug}/cook`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ benchSheetRating })
			});
			if (!res.ok) {
				toast.error(m.benchsheet_cook_failed());
				cookedSubmitting = false;
				return;
			}
			cookedDone = true;
			clearProgress();
			onCooked?.();
			if (cookedAckTimeout) clearTimeout(cookedAckTimeout);
			cookedAckTimeout = setTimeout(() => {
				// The acknowledgement is the session boundary: leave the same recipe
				// ready for a second batch instead of exposing a live double-log button.
				resetCookSession();
				cookedAckTimeout = null;
			}, 1200);
		} catch {
			cookedSubmitting = false;
			toast.error(m.benchsheet_cook_failed());
		}
	}

	let steps = $derived(cookMode?.steps ?? []);
	let totalDone = $derived(steps.filter((_, i) => checked[i]).length);
	let allDone = $derived(steps.length > 0 && totalDone === steps.length);
	let mepList = $derived(cookMode?.mise_en_place ?? []);
	let mepDone = $derived(mepList.filter((_, i) => mep[i]).length);
	let hasProgress = $derived(
		Object.values(checked).some(Boolean) ||
			Object.values(mep).some(Boolean) ||
			timerOrder.length > 0
	);

	let streams = $derived(cookMode?.streams ?? []);
	let streamPaletteMap = $derived(streamPalette(streams));
	let streamNameById = $derived(new Map(streams.map((s) => [s.id, s.name])));

	type BeatBase = {
		step: CookModeStep;
		globalIdx: number;
		palette: BeatPalette;
		firstInStream: boolean;
		streamName: string;
		streamId: string;
	};
	type SubBeat = BeatBase & { kind: 'sub' };
	type MergeBeat = BeatBase & {
		kind: 'merge';
		mergesFromPalettes: BeatPalette[];
		streamNames: string[];
	};
	type Beat = SubBeat | MergeBeat;

	let beats = $derived.by<Beat[]>(() => {
		if (!steps.length) return [];
		const seenStreams = new Set<string>();
		return steps.map((step, i) => {
			const isMerge = (step.merges_from?.length ?? 0) >= 2;
			const sid = step.stream_id;
			const streamName = streamNameById.get(sid) ?? sid;
			const palette = streamPaletteMap[sid] ?? paletteFor(0);
			// Merge beats count for stream introduction too: a stream born AT a
			// merge (wet + dry → batter) gets its divider above the merge card,
			// not dangling after it — and absorption merges (already-seen stream)
			// correctly get none.
			const firstInStream = !seenStreams.has(sid);
			seenStreams.add(sid);
			if (isMerge) {
				const mergesFromPalettes = step.merges_from
					.map((id) => streamPaletteMap[id])
					.filter((p): p is BeatPalette => !!p);
				const streamNames = step.merges_from
					.map((id) => streamNameById.get(id))
					.filter((n): n is string => !!n);
				return {
					kind: 'merge',
					step,
					globalIdx: i,
					palette,
					firstInStream,
					streamName,
					streamId: sid,
					mergesFromPalettes,
					streamNames
				};
			}
			return {
				kind: 'sub',
				step,
				globalIdx: i,
				palette,
				firstInStream,
				streamName,
				streamId: sid
			};
		});
	});

	// AI-paused fallback path: no cached cookMode, daily cap reached, but the
	// raw recipe still has directions. Render <RawDirectionsFallback> so the
	// cook can still cook. F4 in the plan: this also covers the post-deploy
	// regen storm — recipes that fail to regen get the raw view, not a dead
	// error block.
	let aiPausedReason = $derived(
		!loading && !cookMode && loadError && fallback.directions.length > 0 ? loadError : null
	);

	// Guard each write so a per-tick rerun (anyTimerRunning, nowSec) doesn't
	// fire the parent's reactive graph for unchanged values. The parent
	// reads `hasActiveTimer` on click (edit-raw guard), so per-tick churn
	// would re-run any of the parent's effects that touch the controller.
	$effect(() => {
		if (controller.regenerate !== regenerate) controller.regenerate = regenerate;
	});
	$effect(() => {
		if (controller.resetSession !== resetCookSession) controller.resetSession = resetCookSession;
	});
	$effect(() => {
		const next = anyTimerRunning;
		if (controller.hasActiveTimer !== next) controller.hasActiveTimer = next;
	});
	$effect(() => {
		if (controller.hasProgress !== hasProgress) controller.hasProgress = hasProgress;
	});
	$effect(() => {
		if (controller.aiPausedReason !== aiPausedReason) controller.aiPausedReason = aiPausedReason;
	});
</script>

{#if (loading || pendingCookMode) && fallback.directions.length > 0}
	<!-- One RawDirectionsFallback instance across generating → ready: swapping
	     branches would remount it and kill any running raw-view timer — the
	     exact loss pendingCookMode exists to prevent. Only the banner changes. -->
	{#if pendingCookMode}
		<div
			class="mx-3 mt-3 rounded-xl border border-success/40 bg-success/10 px-3 py-2.5 flex items-center gap-2.5"
			role="status"
		>
			<div class="min-w-0 flex-1">
				<p class="text-[13px] font-medium">{m.benchsheet_ready_title()}</p>
				<p class="text-[11px] text-base-content/60 leading-snug">
					{m.benchsheet_ready_desc()}
				</p>
			</div>
			<button
				type="button"
				class="btn btn-xs btn-success shrink-0"
				onclick={() => pendingCookMode && adoptCookMode(pendingCookMode)}>{m.benchsheet_switch_button()}</button
			>
		</div>
	{:else}
		<div
			class="mx-3 mt-3 rounded-xl border border-base-200 bg-base-100 px-3 py-2.5 flex items-center gap-2.5"
			role="status"
		>
			<Spinner size="sm" class="text-primary shrink-0" />
			<div class="min-w-0 flex-1">
				<p class="text-[13px] font-medium">
					{regenerating ? m.benchsheet_refreshing_label() : m.benchsheet_writing_label()}
					<span class="tabular-nums text-base-content/50">{fmtClock(genElapsedSec)}</span>
				</p>
				<p class="text-[11px] text-base-content/60 leading-snug">
					{m.benchsheet_writing_hint_with_raw()}
				</p>
			</div>
		</div>
	{/if}
	<RawDirectionsFallback
		directions={fallback.directions}
		ingredients={fallback.ingredients}
		ingredientStock={fallback.ingredientStock}
		notes={fallback.notes}
		viewLang={fallback.viewLang}
		servings={fallback.servings}
		bind:activeTimer={rawTimerActive}
	/>
{:else if loading}
	<div class="flex flex-col items-center justify-center gap-3 text-center p-5 min-h-[40vh]">
		<Spinner size="lg" />
		<p class="text-sm text-base-content/70">
			{regenerating ? m.benchsheet_refreshing_label() : m.benchsheet_writing_label()}
			<span class="tabular-nums">{fmtClock(genElapsedSec)}</span>
		</p>
		<p class="text-xs text-base-content/50">{m.benchsheet_writing_hint_simple()}</p>
	</div>
{:else if aiPausedReason}
	<RawDirectionsFallback
		directions={fallback.directions}
		ingredients={fallback.ingredients}
		ingredientStock={fallback.ingredientStock}
		notes={fallback.notes}
		viewLang={fallback.viewLang}
		servings={fallback.servings}
		bannerMessage={m.benchsheet_paused_banner({ reason: aiPausedReason })}
		onRetry={() => loadCookMode(true)}
	/>
{:else if loadError}
	<div class="flex flex-col items-center justify-center gap-3 text-center p-5 min-h-[40vh]">
		<p class="text-sm">{loadError}</p>
		<button class="btn btn-sm btn-primary" onclick={() => loadCookMode(false)}>{m.benchsheet_try_again_button()}</button>
	</div>
{:else if cookMode}
	{#if notificationPrimerVisible}
		<div
			class="px-3 py-2 border-b border-warning/30 bg-warning/10 text-base-content text-[12px] flex items-start gap-2"
			role="status"
		>
			<span class="flex-1 leading-snug">
				{m.benchsheet_notif_primer_desc()}
			</span>
			<button
				type="button"
				class="btn btn-xs btn-warning shrink-0"
				onclick={acceptNotifications}>{m.benchsheet_notif_allow_button()}</button
			>
			<button
				type="button"
				class="btn btn-xs btn-ghost shrink-0"
				onclick={dismissNotificationPrimer}>{m.benchsheet_notif_not_now_button()}</button
			>
		</div>
	{/if}

	{#if mepList.length}
		<section class="border-y border-base-200 bg-base-100">
			<button
				class="w-full flex items-center gap-2 px-3 py-2 text-left"
				onclick={() => (mepExpanded = !mepExpanded)}
			>
				<span class="text-[10px] uppercase tracking-wide font-bold text-base-content/60 shrink-0"
					>{m.benchsheet_mise_label()}</span
				>
				<span class="text-[11px] text-base-content/70 flex-1 min-w-0 truncate">
					{#if mepExpanded}{m.benchsheet_mise_collapse()}{:else}{m.benchsheet_mise_progress({
							done: mepDone,
							total: mepList.length,
							preview: mepList.slice(0, 3).join(' · ') + (mepList.length > 3 ? '…' : '')
						})}{/if}
				</span>
				<span class="text-[10px] text-base-content/40 shrink-0">{mepExpanded ? '▴' : '▾'}</span>
			</button>
			{#if mepExpanded}
				<ul class="px-3 pb-2 grid gap-1">
					{#each mepList as item, i}
						<li>
							<button
								class="flex w-full items-start gap-2.5 text-left text-[13px] py-1.5"
								onclick={() => (mep[i] = !mep[i])}
							>
								<span
									class="shrink-0 w-5 h-5 rounded border-2 mt-[1px] flex items-center justify-center text-[10px] {mep[
										i
									]
										? 'bg-success border-success text-success-content'
										: 'border-base-300'}">{mep[i] ? '✓' : ''}</span
								>
								<span class={mep[i] ? 'line-through text-base-content/40' : ''}>{item}</span>
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	{/if}

	<ul class="divide-y divide-base-200 pb-32">
		{#each beats as beat (beat.globalIdx)}
			{#if beat.firstInStream}
				<li class="flex items-center gap-2 px-3 pt-3 pb-1.5">
					<span class="text-[10px] uppercase tracking-wider font-bold {beat.palette.text}"
						>{beat.streamName}</span
					>
					<span class="flex-1 h-px bg-base-200"></span>
				</li>
			{/if}
			{#if beat.kind === 'merge'}
				<MergeCard
					step={beat.step}
					mergesFromPalettes={beat.mergesFromPalettes}
					streamNames={beat.streamNames}
					done={!!checked[beat.globalIdx]}
					timerActive={timerSnapshot.runningIdxs.has(beat.globalIdx)}
					timerDone={timerSnapshot.doneIdxs.has(beat.globalIdx)}
					timerRemaining={timerSnapshot.runningIdxs.has(beat.globalIdx)
						? Math.max(0, Math.ceil((timerEnds[beat.globalIdx] - nowSec * 1000) / 1000))
						: null}
					onToggle={() => toggleStep(beat.globalIdx)}
					onStartTimer={() => {
						const seconds = beat.step.timer_seconds;
						if (seconds) startTimer(beat.globalIdx, seconds);
					}}
					onResetTimer={() => cancelTimer(beat.globalIdx)}
				/>
			{:else}
				<ComponentCard
					step={beat.step}
					globalIdx={beat.globalIdx}
					palette={beat.palette}
					done={!!checked[beat.globalIdx]}
					timerActive={timerSnapshot.runningIdxs.has(beat.globalIdx)}
					timerDone={timerSnapshot.doneIdxs.has(beat.globalIdx)}
					timerRemaining={timerSnapshot.runningIdxs.has(beat.globalIdx)
						? Math.max(0, Math.ceil((timerEnds[beat.globalIdx] - nowSec * 1000) / 1000))
						: null}
					onToggle={toggleStep}
					onStartTimer={(idx) => {
						const seconds = steps[idx]?.timer_seconds;
						if (seconds) startTimer(idx, seconds);
					}}
					onResetTimer={cancelTimer}
				/>
			{/if}
		{/each}
	</ul>

	<!-- Pass the second-quantized time so pills only re-render on second
	     changes (4× fewer re-renders than the raw 250 ms `now`). -->
	<TimerStack ids={timerOrder} {timerEnds} {steps} now={nowSec * 1000} onDismiss={cancelTimer} />

	{#if allDone}
		<FixedBottomBar contentClass="mx-auto flex max-w-2xl flex-col gap-2 px-3 py-2">
			{#if !cookedDone && !ratingDismissed}
				<div class="flex items-center gap-2">
					<span class="text-[12px] text-base-content/70 flex-1">{m.benchsheet_rating_prompt()}</span>
					<button
						type="button"
						class="btn btn-xs {benchSheetRating === 'good' ? 'btn-success' : 'btn-ghost'} text-base"
						aria-label={m.benchsheet_rating_good_aria()}
						aria-pressed={benchSheetRating === 'good'}
						onclick={() => (benchSheetRating = benchSheetRating === 'good' ? null : 'good')}
					>
						👍
					</button>
					<button
						type="button"
						class="btn btn-xs {benchSheetRating === 'bad' ? 'btn-error' : 'btn-ghost'} text-base"
						aria-label={m.benchsheet_rating_bad_aria()}
						aria-pressed={benchSheetRating === 'bad'}
						onclick={() => (benchSheetRating = benchSheetRating === 'bad' ? null : 'bad')}
					>
						👎
					</button>
					<button
						type="button"
						class="text-[10px] text-base-content/40 underline ml-1"
						onclick={() => {
							benchSheetRating = null;
							ratingDismissed = true;
						}}>{m.benchsheet_rating_skip_button()}</button
					>
				</div>
			{/if}
			<button
				class="btn btn-sm w-full btn-success"
				onclick={markCooked}
				disabled={cookedSubmitting || cookedDone}
			>
				{#if cookedDone}{m.benchsheet_cooked_logged()}{:else if cookedSubmitting}…{:else}{m.benchsheet_cook_button()}{/if}
			</button>
		</FixedBottomBar>
	{/if}
{/if}
