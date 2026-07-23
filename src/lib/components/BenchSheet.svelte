<!--
	Inline bench-sheet — recipe page's primary cooking surface.

	Owns: deterministic cooking steps, current-step state, timer state,
	timer-fire alarm (Web Audio + vibrate + best-effort SW notification),
	screen Wake Lock, and an optional history log action.

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
	import { onDestroy, tick, untrack } from 'svelte';
	import { m } from '$lib/paraglide/messages';
	import { toast } from '$lib/stores/toast.svelte';
	import type { BenchSheetRating, CookModeDisplayRecipe, StoredCookModeRecipe } from '$lib/types';
	import type { Ingredient } from '$lib/recipe_ingredient';
	import { projectIngredient } from '$lib/recipe_scale';
	import CookStepCard from './cook-mode/CookStepCard.svelte';
	import CounterBoard from './cook-mode/CounterBoard.svelte';
	import TimerStack from './cook-mode/TimerStack.svelte';
	import { cookPaletteGraph, fmtClock, paletteFor } from './cook-mode/palette';
	import { isStaleCookMode, localizeCookMode } from './cook-mode/staleness';
	import { cookStepKey, normalizeCookProgress, selectCookStep } from './cook-mode/cook_progress';
	import {
		decodeCookSession,
		migrateLegacyCookSession,
		type FrozenCookRecipe
	} from './cook-mode/cook_session';
	import {
		applySessionSwapsToSteps,
		toggleCounterIngredient,
		type SessionIngredientSwap
	} from './cook-mode/cook_counter';
	import {
		cookingStepsFromDirections,
		preparationAsFirstStep
	} from './cook-mode/cooking_steps';
	import OriginalRecipeView from './OriginalRecipeView.svelte';
	import TimerWorker from '$lib/timer/worker?worker';
	import type {
		ServiceWorkerFireMessage,
		TimerWorkerOutbound
	} from '$lib/timer/messages';

	export type BenchSheetController = {
		resetSession: () => void;
		hasActiveTimer: boolean;
		hasProgress: boolean;
	};

	type FallbackContext = {
		directions: string[];
		directionIds?: string[];
		ingredients: Ingredient[];
		canonicalIngredients?: Ingredient[];
		ingredientStock: boolean[];
		viewLang: 'en' | 'nl';
		baselineServings: number | null;
		servings: number | null;
		sourceUrl: string | null;
		scalingMode?: 'scalable' | 'fixed_batch';
		sourceDirections?: string[];
		sourceIngredients?: Ingredient[];
		sourceServings?: number | null;
		sourceSnapshotUrl?: string | null;
		sourceProvenance?: 'imported_source' | 'legacy_baseline' | null;
	};

	type Props = {
		recipeSlug: string;
		recipeRevision: number;
		recipeTitle: string;
		initial: StoredCookModeRecipe | null;
		requiresPlan: boolean;
		progressSignature: string;
		fallback: FallbackContext;
		view: 'cook' | 'original';
		viewLang: 'en' | 'nl';
		onEdit: () => void;
		onCooked?: () => void;
		planMealId?: number | null;
		controller: BenchSheetController;
	};

	let {
		recipeSlug,
		recipeRevision,
		recipeTitle,
		initial,
		requiresPlan,
		progressSignature,
		fallback,
		view,
		viewLang,
		onEdit,
		onCooked,
		planMealId = null,
		controller = $bindable<BenchSheetController>()
	}: Props = $props();

	let storedCookMode = $state<StoredCookModeRecipe | null>(
		untrack(() => (requiresPlan ? initial : null))
	);
	let frozenRecipe = $state<FrozenCookRecipe | null>(null);
	let sessionStarted = $state(false);
	let activeDirections = $derived(frozenRecipe?.directions ?? fallback.directions);
	let activeDirectionIds = $derived(frozenRecipe?.directionIds ?? fallback.directionIds ?? []);
	let activeIngredients = $derived(frozenRecipe?.ingredients ?? fallback.ingredients);
	let activeCanonicalIngredients = $derived(
		frozenRecipe?.canonicalIngredients ?? fallback.canonicalIngredients ?? fallback.ingredients
	);
	let activeBaselineServings = $derived(
		frozenRecipe?.baselineServings ?? fallback.baselineServings
	);
	let activeStoredCookMode = $derived(frozenRecipe?.storedCookMode ?? storedCookMode);
	let servingDraft = $state(
		untrack(() => (initial?.version === 3 ? initial.servings : (fallback.servings ?? 4)))
	);
	let localizedPlan = $derived(
		requiresPlan
			? localizeCookMode(activeStoredCookMode, viewLang, {
					ingredients: activeIngredients,
					baselineServings: activeBaselineServings,
					targetServings: servingDraft,
					directions: activeDirections,
					directionIds: activeDirectionIds
				})
			: null
	);

	let deterministicCookMode = $derived(
		cookingStepsFromDirections(activeDirections, {
			language: viewLang,
			recipeTitle,
			servings: servingDraft,
			directionIds: activeDirectionIds,
			ingredients: activeIngredients
		})
	);
	let cookMode = $derived(
		requiresPlan ? (preparationAsFirstStep(localizedPlan) ?? deterministicCookMode) : deterministicCookMode
	);
	let loading = $state(false);
	let loadError = $state('');
	// Connection drops and transient server errors are retryable: the server
	// finishes and caches the generation even when the phone kills the fetch
	// (backgrounding, navigation), and a re-POST either joins the in-flight
	// generation or returns the cached sheet instantly. Budget/no-directions
	// failures are terminal until the user acts.
	let loadErrorRetryable = false;
	let autoRetries = 0;
	let retryTimer: ReturnType<typeof setTimeout> | null = null;
	let regenerating = $state(false);
	let cookedSubmitting = $state(false);
	let cookedDone = $state(false);

	// Only composed meals retain the planning seam. Ordinary recipes always
	// render their saved directions immediately and never enter this path.
	let genStartedAt: number | null = null;
	let genElapsedSec = $state(0);

	$effect(() => {
		if (!loading) return;
		const id = setInterval(() => {
			if (genStartedAt != null) genElapsedSec = Math.floor((Date.now() - genStartedAt) / 1000);
		}, 1000);
		return () => clearInterval(id);
	});

	function adoptCookMode(cm: StoredCookModeRecipe) {
		storedCookMode = cm;
		if (cm.version === 3) servingDraft = cm.servings;
		if (!sessionStarted) {
			progressRestored = false;
			currentStepKey = null;
		}
	}

	let currentStepKey = $state<string | null>(null);
	let counterChecks = $state<Record<string, boolean>>({});
	let sessionSwaps = $state<Record<string, SessionIngredientSwap>>({});
	let savingIngredientId = $state<string | null>(null);

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
		// A composed-meal plan may still be finishing when the phone returns.
		if (requiresPlan && !localizedPlan && !loading && loadError && loadErrorRetryable) {
			autoRetries = 0;
			void loadCookMode(false);
		}
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
		if (requiresPlan && !localizedPlan && !loading && !loadError) {
			void loadCookMode();
		}
	});

	async function loadCookMode(force = false) {
		if (retryTimer) {
			clearTimeout(retryTimer);
			retryTimer = null;
		}
		loading = true;
		loadError = '';
		loadErrorRetryable = false;
		if (genStartedAt == null) {
			genStartedAt = Date.now();
			genElapsedSec = 0;
		}
		try {
			const params = new URLSearchParams({
				lang: viewLang,
				servings: String(servingDraft)
			});
			if (force) params.set('force', 'true');
			const res = await fetch(`${base}/api/recipes/${recipeSlug}/cook-mode?${params}`, {
				method: 'POST'
			});
			const body = await res.json();
			if (res.ok && body.cookMode) {
				if (
					typeof body.recipeRevision === 'number' &&
					body.recipeRevision > recipeRevision &&
					!sessionStarted
				) {
					location.reload();
					return;
				}
				const incoming = body.cookMode as Partial<StoredCookModeRecipe>;
				if (!force && isStaleCookMode(incoming)) {
					regenerating = true;
					loading = false;
					return loadCookMode(true);
				}
				autoRetries = 0;
				adoptCookMode(body.cookMode as StoredCookModeRecipe);
			} else if (body.reason === 'daily_cap_exceeded') {
				loadError = m.benchsheet_error_budget_reached();
			} else if (body.reason === 'no_directions') {
				loadError = m.benchsheet_error_no_directions();
			} else {
				loadError = body.message ?? m.benchsheet_error_load_failed();
				loadErrorRetryable = true;
			}
		} catch {
			loadError = m.benchsheet_error_connection_failed();
			loadErrorRetryable = true;
		}
		loading = false;
		regenerating = false;
		genStartedAt = null;
		// One bounded background retry ladder for retryable failures (the tab
		// never left, so onVisibilityChange won't fire). A rejoin is cheap —
		// it never double-spends thanks to the server's in-flight dedup.
		if (loadErrorRetryable && autoRetries < 2) {
			autoRetries += 1;
			retryTimer = setTimeout(() => {
				retryTimer = null;
				if (!localizedPlan && !loading && loadError && loadErrorRetryable) void loadCookMode(false);
			}, autoRetries * 5000);
		}
	}

	function startTimer(idx: number, seconds: number) {
		beginSession();
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
	function currentKeys(cm: CookModeDisplayRecipe | null = cookMode): string[] {
		return (
			cm?.steps.map((step, index) =>
				cookStepKey(index, step.stream_id, step.step_id ?? step.direction_id)
			) ?? []
		);
	}

	async function centerStep(index: number) {
		await tick();
		document.getElementById(`cook-step-${index}`)?.scrollIntoView({
			behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
			block: 'center'
		});
	}

	function applyCookProgress(next: { currentKey: string | null }, shouldCenter: boolean) {
		const keys = currentKeys();
		const previous = currentStepKey;
		currentStepKey = next.currentKey;
		if (shouldCenter && currentStepKey && currentStepKey !== previous) {
			const index = keys.indexOf(currentStepKey);
			if (index >= 0) void centerStep(index);
		}
	}

	function selectStep(idx: number) {
		const keys = currentKeys();
		const key = keys[idx];
		if (!key || !cookMode) return;
		beginSession();
		applyCookProgress(selectCookStep(keys, { currentKey: currentStepKey }, key), true);
	}

	// ────────── Local progress persistence ──────────
	// Current position and running timers survive navigation, reload, and PWA
	// eviction via localStorage. Timer end times
	// are wall-clock, so restore stays honest; a timer that expired while away
	// restores as done without re-firing the alarm.
	const PROGRESS_KEY = `cookmode-progress:${untrack(() => recipeSlug)}:${untrack(() => planMealId ?? 'direct')}`;
	let progressRestored = false;

	function stepsSig(cm: CookModeDisplayRecipe): string {
		return cm.generation_id ?? progressSignature;
	}

	function copySessionValue<T>(value: T): T {
		return JSON.parse(JSON.stringify(value)) as T;
	}

	function currentFrozenRecipe(cm: CookModeDisplayRecipe = cookMode!): FrozenCookRecipe {
		return {
			signature: stepsSig(cm),
			storedCookMode: copySessionValue(storedCookMode),
			directions: [...fallback.directions],
			directionIds: [...(fallback.directionIds ?? [])],
			ingredients: copySessionValue(fallback.ingredients),
			canonicalIngredients: copySessionValue(
				fallback.canonicalIngredients ?? fallback.ingredients
			),
			baselineServings: fallback.baselineServings
		};
	}

	function beginSession() {
		if (sessionStarted || !cookMode) return;
		sessionStarted = true;
		frozenRecipe = currentFrozenRecipe(cookMode);
	}

	function restoreProgress(cm: CookModeDisplayRecipe) {
		try {
			const raw = localStorage.getItem(PROGRESS_KEY);
			const parsed = raw ? JSON.parse(raw) : null;
			const saved =
				decodeCookSession(parsed) ??
				migrateLegacyCookSession(parsed, cm, stepsSig(cm), currentFrozenRecipe(cm));
			if (!saved) {
				currentStepKey = normalizeCookProgress(currentKeys(cm), null).currentKey;
				return;
			}
			sessionStarted = true;
			frozenRecipe = saved.frozenRecipe;
			servingDraft = saved.servings;
			counterChecks = saved.counterChecks;
			sessionSwaps = saved.sessionSwaps;
			const t = Date.now();
			const ends: Record<number, number> = {};
			const order: number[] = [];
			for (const idx of saved.timerOrder ?? []) {
				const end = saved.timerEnds?.[idx];
				if (typeof end !== 'number' || idx < 0) continue;
				if (end <= t) firedFor.add(idx);
				ends[idx] = end;
				order.push(idx);
			}
			timerEnds = ends;
			timerOrder = order;
			currentStepKey =
				typeof saved.currentStepKey === 'string'
					? saved.currentStepKey
					: normalizeCookProgress(currentKeys(cm), null).currentKey;
		} catch {
			// Corrupt or inaccessible storage — start clean.
			currentStepKey = normalizeCookProgress(currentKeys(cm), null).currentKey;
		}
	}

	function saveProgress() {
		try {
			if (!cookMode || !sessionStarted || !frozenRecipe) return;
			localStorage.setItem(
				PROGRESS_KEY,
				JSON.stringify({
					v: 2,
					sig: frozenRecipe.signature,
					currentStepKey,
					timerEnds,
					timerOrder,
					servings: servingDraft,
					frozenRecipe,
					counterChecks,
					sessionSwaps
				})
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
		frozenRecipe = null;
		sessionStarted = false;
		counterChecks = {};
		sessionSwaps = {};
		currentStepKey = cookMode ? normalizeCookProgress(currentKeys(cookMode), null).currentKey : null;
		timerEnds = {};
		timerOrder = [];
		firedFor.clear();
		benchSheetRating = null;
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
		if (retryTimer) clearTimeout(retryTimer);
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
			const res = await fetch(planMealId ? `${base}/api/meal-plan/${planMealId}` : `${base}/api/recipes/${recipeSlug}/cook`, {
				method: planMealId ? 'PUT' : 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(planMealId ? { status: 'cooked' } : { benchSheetRating })
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

	let ingredientNamesById = $derived(
		Object.fromEntries(
			activeIngredients.flatMap((ingredient) =>
				ingredient.id ? [[ingredient.id, ingredient.name]] : []
			)
		)
	);
	let steps = $derived(
		applySessionSwapsToSteps(cookMode?.steps ?? [], sessionSwaps, ingredientNamesById)
	);
	let currentStepIndex = $derived(currentKeys().indexOf(currentStepKey ?? ''));
	let projectedIngredients = $derived(
		activeIngredients.map((ingredient) => {
			const projected = projectIngredient(
				ingredient,
				activeBaselineServings,
				servingDraft
			);
			const swap = ingredient.id ? sessionSwaps[ingredient.id] : undefined;
			return swap ? { ...projected, name: swap.displayName } : projected;
		})
	);
	let hasProgress = $derived(
		sessionStarted ||
			currentStepIndex > 0 ||
			timerOrder.length > 0 ||
			Object.values(counterChecks).some(Boolean) ||
			Object.keys(sessionSwaps).length > 0
	);

	function toggleCounter(ingredientId: string) {
		beginSession();
		counterChecks = toggleCounterIngredient(counterChecks, ingredientId);
	}

	function selectSwap(ingredientId: string, substituteIndex: number) {
		const display = activeIngredients.find((ingredient) => ingredient.id === ingredientId);
		const canonical = activeCanonicalIngredients.find(
			(ingredient) => ingredient.id === ingredientId
		);
		const displayName = display?.substitutes?.[substituteIndex]?.name;
		const canonicalName = canonical?.substitutes?.[substituteIndex]?.name;
		if (!displayName || !canonicalName) return;
		beginSession();
		sessionSwaps = {
			...sessionSwaps,
			[ingredientId]: { substituteIndex, displayName, canonicalName }
		};
	}

	async function saveSwapDefault(ingredientId: string, substituteIndex: number) {
		savingIngredientId = ingredientId;
		try {
			const response = await fetch(
				`${base}/api/recipes/${recipeSlug}/ingredient-swap`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						ingredientId,
						substituteIndex,
						expectedRecipeRevision: recipeRevision
					})
				}
			);
			if (!response.ok) throw new Error();
			toast.success(m.cookmode_swap_saved());
			location.reload();
		} catch {
			savingIngredientId = null;
			toast.error(m.cookmode_swap_save_failed());
		}
	}

	function changeServings(delta: number) {
		beginSession();
		servingDraft = Math.max(1, Math.min(99, servingDraft + delta));
		void tick().then(saveProgress);
	}

	function setServingMultiplier(multiplier: number) {
		beginSession();
		const baseline = activeBaselineServings ?? fallback.servings ?? 4;
		servingDraft = Math.max(1, Math.min(99, Math.round(baseline * multiplier)));
		void tick().then(saveProgress);
	}

	let palettes = $derived(
		cookMode
			? cookPaletteGraph(cookMode.streams, cookMode.steps)
			: []
	);
	let streamNames = $derived(
		Object.fromEntries((cookMode?.streams ?? []).map((stream) => [stream.id, stream.name]))
	);
	let streamLabelsByIngredient = $derived.by<Record<string, string>>(() => {
		const labels = new Map<string, Set<string>>();
		for (const step of steps) {
			const streamName = streamNames[step.stream_id];
			if (!streamName) continue;
			for (const ingredientId of step.ingredient_ids ?? []) {
				const names = labels.get(ingredientId) ?? new Set<string>();
				names.add(streamName);
				labels.set(ingredientId, names);
			}
		}
		return Object.fromEntries(
			[...labels].map(([ingredientId, names]) => [ingredientId, [...names].join(' · ')])
		);
	});

	// Guard each write so a per-tick rerun (anyTimerRunning, nowSec) doesn't
	// fire the parent's reactive graph for unchanged values. The parent
	// reads `hasActiveTimer` on click (edit-raw guard), so per-tick churn
	// would re-run any of the parent's effects that touch the controller.
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
</script>

{#if fallback.directions.length > 0 && view === 'original'}
	<div class="flex min-h-11 items-center gap-2 px-3 py-1.5">
		<div
			class="inline-flex min-h-9 items-center rounded-lg border border-base-300 bg-base-100"
			aria-label={m.recipes_fallback_servings_label()}
		>
			<span class="pl-2.5 pr-1 text-xs text-base-content/60">{m.recipes_fallback_servings_label()}</span>
			<button
				type="button"
				class="btn btn-ghost btn-xs min-h-9 min-w-9 px-0 text-base"
				aria-label={m.benchsheet_servings_decrease()}
				disabled={servingDraft <= 1 || loading}
				onclick={() => changeServings(-1)}>−</button
			>
			<span class="w-7 text-center text-sm font-semibold tabular-nums">{servingDraft}</span>
			<button
				type="button"
				class="btn btn-ghost btn-xs min-h-9 min-w-9 px-0 text-base"
				aria-label={m.benchsheet_servings_increase()}
				disabled={servingDraft >= 99 || loading}
				onclick={() => changeServings(1)}>+</button
			>
		</div>
		<button type="button" class="btn btn-sm btn-ghost ml-auto min-h-9" onclick={onEdit}>
			{m.recipes_edit_heading()}
		</button>
	</div>
{/if}

{#if view === 'original'}
	<OriginalRecipeView
		directions={fallback.sourceDirections ?? fallback.directions}
		ingredients={fallback.sourceIngredients ?? fallback.ingredients}
		ingredientStock={fallback.ingredientStock}
		viewLang={fallback.viewLang}
		servings={fallback.sourceServings ?? fallback.baselineServings}
		targetServings={servingDraft}
		sourceUrl={fallback.sourceSnapshotUrl ?? fallback.sourceUrl}
		provenance={fallback.sourceProvenance ?? null}
	/>
{:else if cookMode}
	{#if loading}
		<div class="mx-3 my-2 flex min-h-11 items-center gap-2 rounded-xl border border-info/25 bg-info/5 px-3 py-2 text-xs text-base-content/65" role="status">
			<Spinner size="xs" />
			<span>{regenerating ? m.benchsheet_refreshing_label() : m.benchsheet_writing_label()} <span class="tabular-nums">{fmtClock(genElapsedSec)}</span></span>
		</div>
	{:else if loadError}
		<div class="mx-3 my-2 flex min-h-11 items-center gap-2 rounded-xl border border-warning/25 bg-warning/5 px-3 py-2 text-xs">
			<span class="min-w-0 flex-1">{loadError}</span>
			<button class="btn btn-xs btn-ghost" onclick={() => loadCookMode(false)}>{m.recipes_retry_cooking_view()}</button>
		</div>
	{/if}
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

	{#if steps.length}
	<div class="sticky top-[3.25rem] z-20 border-y border-base-200 bg-base-100/95 px-3 py-2 shadow-sm backdrop-blur" aria-label={m.cookmode_progress_position({ current: Math.max(1, currentStepIndex + 1), total: steps.length })}>
		<div class="mx-auto flex max-w-5xl flex-wrap items-center gap-2">
			<div class="min-w-0 flex-1">
				<div class="mb-1 text-xs font-semibold">{m.cookmode_progress_position({ current: Math.max(1, currentStepIndex + 1), total: steps.length })}</div>
				<progress class="progress progress-primary h-2 w-full" value={Math.max(1, currentStepIndex + 1)} max={steps.length}></progress>
			</div>
			<div class="inline-flex min-h-11 items-center rounded-lg border border-base-300 bg-base-100" aria-label={m.recipes_fallback_servings_label()}>
				<button type="button" class="btn btn-ghost btn-xs h-11 min-h-0 w-11 px-0 text-lg" aria-label={m.benchsheet_servings_decrease()} disabled={servingDraft <= 1 || loading} onclick={() => changeServings(-1)}>−</button>
				<span class="w-8 text-center text-sm font-semibold tabular-nums">{servingDraft}</span>
				<button type="button" class="btn btn-ghost btn-xs h-11 min-h-0 w-11 px-0 text-lg" aria-label={m.benchsheet_servings_increase()} disabled={servingDraft >= 99 || loading} onclick={() => changeServings(1)}>+</button>
			</div>
			{#if fallback.scalingMode !== 'fixed_batch'}
				<div class="flex min-h-9 items-center gap-1" aria-label={m.recipes_fallback_servings_label()}>
					{#each [1, 1.5, 2] as multiplier}
						<button
							type="button"
							class="btn btn-xs min-h-9 px-2 {servingDraft === Math.round((activeBaselineServings ?? fallback.servings ?? 4) * multiplier) ? 'btn-primary' : 'btn-ghost'}"
							aria-pressed={servingDraft === Math.round((activeBaselineServings ?? fallback.servings ?? 4) * multiplier)}
							onclick={() => setServingMultiplier(multiplier)}
						>{multiplier === 1.5 ? '1½×' : `${multiplier}×`}</button>
					{/each}
				</div>
			{/if}
		</div>
	</div>
	{/if}

	<div class="mx-auto max-w-5xl px-3 py-3 md:grid md:grid-cols-[minmax(15rem,20rem)_minmax(0,1fr)] md:items-start md:gap-5">
	{#if projectedIngredients.length}
		<aside class="mb-3 md:sticky md:top-36 md:mb-0">
			<CounterBoard
				ingredients={projectedIngredients}
				canonicalIngredients={activeCanonicalIngredients}
				checks={counterChecks}
				swaps={sessionSwaps}
				{streamLabelsByIngredient}
				onToggle={toggleCounter}
				onSwap={selectSwap}
				onSaveDefault={(ingredientId, substituteIndex) =>
					void saveSwapDefault(ingredientId, substituteIndex)}
				{savingIngredientId}
			/>
		</aside>
	{/if}

	<div class="min-w-0">
	<ul class="space-y-3 pb-4">
		{#each steps as step, index (cookStepKey(index, step.stream_id))}
			<CookStepCard
				{step}
				{index}
				palette={palettes[index]?.result ?? paletteFor(index)}
				streamName={streamNames[step.stream_id] ?? null}
				mergeNames={(step.merges_from ?? []).map((streamId) => streamNames[streamId]).filter(Boolean)}
				current={currentStepKey === cookStepKey(index, step.stream_id, step.step_id ?? step.direction_id)}
				timerActive={timerSnapshot.runningIdxs.has(index)}
				timerDone={timerSnapshot.doneIdxs.has(index)}
				timerRemaining={timerSnapshot.runningIdxs.has(index)
					? Math.max(0, Math.ceil((timerEnds[index] - nowSec * 1000) / 1000))
					: null}
				onSelect={() => selectStep(index)}
				onStartTimer={() => {
					const seconds = step.timer_seconds;
					if (seconds) startTimer(index, seconds);
				}}
				onResetTimer={() => cancelTimer(index)}
			/>
		{/each}
	</ul>

	<details class="mb-8 rounded-xl border border-base-200 bg-base-100">
		<summary class="min-h-11 cursor-pointer px-3 py-3 text-xs font-semibold text-base-content/55">
			{m.cookmode_history_actions()}
		</summary>
		<div class="border-t border-base-200 p-3">
			{#if !cookedDone}
				<div class="mb-2 flex items-center gap-2">
					<span class="flex-1 text-xs text-base-content/65">{m.benchsheet_rating_prompt()}</span>
					<button type="button" class="btn btn-xs {benchSheetRating === 'good' ? 'btn-success' : 'btn-ghost'}" aria-label={m.benchsheet_rating_good_aria()} aria-pressed={benchSheetRating === 'good'} onclick={() => (benchSheetRating = benchSheetRating === 'good' ? null : 'good')}>👍</button>
					<button type="button" class="btn btn-xs {benchSheetRating === 'bad' ? 'btn-error' : 'btn-ghost'}" aria-label={m.benchsheet_rating_bad_aria()} aria-pressed={benchSheetRating === 'bad'} onclick={() => (benchSheetRating = benchSheetRating === 'bad' ? null : 'bad')}>👎</button>
				</div>
			{/if}
			<button class="btn btn-sm btn-ghost w-full" onclick={markCooked} disabled={cookedSubmitting || cookedDone}>
				{#if cookedDone}{m.benchsheet_cooked_logged()}{:else if cookedSubmitting}…{:else}{m.cookmode_log_cooked()}{/if}
			</button>
		</div>
	</details>
	</div>
	</div>

	<!-- Pass the second-quantized time so pills only re-render on second
	     changes (4× fewer re-renders than the raw 250 ms `now`). -->
	<TimerStack
		ids={timerOrder}
		{timerEnds}
		{steps}
		now={nowSec * 1000}
		bottomClearanceRem={0}
		onDismiss={cancelTimer}
	/>
{/if}
