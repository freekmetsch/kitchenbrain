<!--
	Inline bench-sheet — recipe page's primary cooking surface.

	Owns: deterministic cooking steps, timer/browser adapters, timer-fire alarm
	(background media + Web Audio fallback + notification),
	screen Wake Lock, and after-cooking feedback/log actions.

	Per-instance timer, browser lifecycle, persisted-session, and network state
	live in focused controllers; rendering stays local here.

	SW setTimeout is unreliable past ~30 s of idle, so wall-clock UI state
	lives in a dedicated Web Worker. A media track started by the timer tap
	carries the alarm through normal browser backgrounding; physical-device
	locked-screen behavior remains a release gate. Wake Lock, Web Audio,
	vibrate, and SW notifications remain layered fallbacks while mounted.
-->
<script lang="ts">
	import { base } from '$app/paths';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import { onDestroy, tick, untrack } from 'svelte';
	import { m } from '$lib/paraglide/messages';
	import { toast } from '$lib/stores/toast.svelte';
	import type { CookModeDisplayRecipe, StoredCookModeRecipe } from '$lib/types';
	import type { Ingredient } from '$lib/recipe_ingredient';
	import { projectIngredient } from '$lib/recipe_scale';
	import CookStepCard from './cook-mode/CookStepCard.svelte';
	import CounterBoard from './cook-mode/CounterBoard.svelte';
	import { cookPaletteGraph, fmtClock, paletteFor, type BeatPalette } from './cook-mode/palette';
	import { localizeCookMode } from './cook-mode/staleness';
	import { cookStepKey, normalizeCookProgress, selectCookStep } from './cook-mode/cook_progress';
	import type { FrozenCookRecipe } from './cook-mode/cook_session';
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
	import { CookTimerController } from './cook-mode/timer-controller.svelte';
	import { CookSessionStorageController } from './cook-mode/session-controller.svelte';
	import { CookModeNetworkController } from './cook-mode/network-controller.svelte';
	import {
		CookModeLifecycleController,
		createCookModeLifecycleBrowserAdapters
	} from './cook-mode/lifecycle-controller.svelte';

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
	let frozenViewLang = $state<'en' | 'nl' | null>(null);
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
	let activeViewLang = $derived(frozenViewLang ?? viewLang);
	let servingDraft = $state(untrack(() => fallback.servings ?? 4));
	let localizedPlan = $derived(
		requiresPlan
			? localizeCookMode(activeStoredCookMode, activeViewLang, {
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
			language: activeViewLang,
			recipeTitle,
			servings: servingDraft,
			directionIds: activeDirectionIds,
			ingredients: activeIngredients
		})
	);
	let cookMode = $derived(
		requiresPlan ? (preparationAsFirstStep(localizedPlan, activeIngredients) ?? deterministicCookMode) : deterministicCookMode
	);
	let sessionNotice = $state('');

	function adoptCookMode(cm: StoredCookModeRecipe) {
		storedCookMode = cm;
		if (!sessionStarted) {
			progressRestored = false;
			currentStepKey = null;
		}
	}

	// Connection drops and transient server errors are retryable: the server
	// finishes and caches the generation even when the phone kills the fetch.
	// The per-instance controller owns that retry ladder together with cook-log
	// and ingredient-default writes; this component supplies browser adapters.
	const network = new CookModeNetworkController({
		basePath: base,
		recipeSlug: untrack(() => recipeSlug),
		recipeRevision: untrack(() => recipeRevision),
		fetcher: (input, init) => globalThis.fetch(input, init),
		readGenerationContext: () => ({
			viewLang,
			servings: servingDraft,
			sessionStarted,
			hasPlan: localizedPlan != null
		}),
		adoptCookMode,
		reload: () => location.reload(),
		clearProgress,
		onCooked: () => onCooked?.(),
		resetSession: resetCookSession,
		notifySuccess: (message) => toast.success(message),
		notifyError: (message) => toast.error(message),
		messages: {
			loadFailed: () => m.benchsheet_error_load_failed(),
			budgetReached: () => m.benchsheet_error_budget_reached(),
			noDirections: () => m.benchsheet_error_no_directions(),
			connectionFailed: () => m.benchsheet_error_connection_failed(),
			cookFailed: () => m.benchsheet_cook_failed(),
			swapSaved: () => m.cookmode_swap_saved(),
			swapSaveFailed: () => m.cookmode_swap_save_failed()
		}
	});
	let loading = $derived(network.loading);
	let loadError = $derived(network.loadError);
	let loadErrorRetryable = $derived(network.loadErrorRetryable);
	let regenerating = $derived(network.regenerating);
	let genElapsedSec = $derived(network.genElapsedSec);
	let cookedSubmitting = $derived(network.cookedSubmitting);
	let cookedDone = $derived(network.cookedDone);
	let savingIngredientId = $derived(network.savingIngredientId);

	// Every recipe renders source directions immediately. Structured generation
	// enhances that fallback without making the cooking surface depend on it.
	$effect(() => {
		if (!loading) return;
		const id = setInterval(() => network.updateElapsed(), 1000);
		return () => clearInterval(id);
	});

	let currentStepKey = $state<string | null>(null);
	let counterChecks = $state<Record<string, boolean>>({});
	let sessionSwaps = $state<Record<string, SessionIngredientSwap>>({});

	const timers = new CookTimerController();
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
	const lifecycle = new CookModeLifecycleController({
		timers,
		subscriberId: `bench-sheet-${untrack(() => recipeSlug)}`,
		alarmAudioSrc: `${base}/audio/cook-timer-alarm.m4a`,
		recipeTitle: () => recipeTitle,
		readAlarmStep: (index) => steps[index],
		shouldRetryAfterVisibility: () =>
			requiresPlan && !localizedPlan && !loading && Boolean(loadError) && loadErrorRetryable,
		retryAfterVisibility: () => network.retryAfterVisibility(),
		browser: createCookModeLifecycleBrowserAdapters(() => new TimerWorker())
	});

	$effect(() => {
		lifecycle.mount();
	});
	$effect(() => {
		lifecycle.syncTimerActivity(timers.anyRunning);
	});

	$effect(() => {
		if (requiresPlan && !localizedPlan && !loading && !loadError) {
			void network.loadCookMode();
		}
	});

	function startTimer(idx: number, seconds: number) {
		beginSession();
		lifecycle.startTimer(idx, seconds);
	}
	function cancelTimer(idx: number) {
		lifecycle.cancelTimer(idx);
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
	const sessionStorage = new CookSessionStorageController(PROGRESS_KEY);
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
		frozenViewLang = activeViewLang;
	}

	function restoreProgress(cm: CookModeDisplayRecipe) {
		try {
			const result = sessionStorage.read();
			if (result.state === 'empty') {
				currentStepKey = normalizeCookProgress(currentKeys(cm), null).currentKey;
				return;
			}
			if (result.state === 'discard') {
				timers.reset();
				sessionNotice = m.benchsheet_session_reset_notice();
				currentStepKey = normalizeCookProgress(currentKeys(cm), null).currentKey;
				return;
			}
			const saved = result.session;
			sessionStarted = true;
			frozenRecipe = saved.frozenRecipe;
			frozenViewLang = saved.frozenViewLang;
			servingDraft = saved.servings;
			counterChecks = saved.counterChecks;
			sessionSwaps = saved.sessionSwaps;
			const ends: Record<number, number> = {};
			const order: number[] = [];
			for (const idx of saved.timerOrder ?? []) {
				const end = saved.timerEnds?.[idx];
				if (typeof end !== 'number' || idx < 0) continue;
				ends[idx] = end;
				order.push(idx);
			}
			timers.restore(ends, order);
			currentStepKey =
				typeof saved.currentStepKey === 'string'
					? saved.currentStepKey
					: normalizeCookProgress(currentKeys(cm), null).currentKey;
		} catch {
			clearProgress();
			timers.reset();
			sessionNotice = m.benchsheet_session_reset_notice();
			currentStepKey = normalizeCookProgress(currentKeys(cm), null).currentKey;
		}
	}

	function saveProgress() {
		if (!cookMode || !sessionStarted || !frozenRecipe) return;
		sessionStorage.save({
			v: 3,
			sig: frozenRecipe.signature,
			frozenViewLang: activeViewLang,
			currentStepKey,
			timerEnds: timers.ends,
			timerOrder: timers.order,
			servings: servingDraft,
			frozenRecipe,
			counterChecks,
			sessionSwaps
		});
	}

	function clearProgress() {
		sessionStorage.clear();
	}

	function resetCookSession() {
		clearProgress();
		frozenRecipe = null;
		frozenViewLang = null;
		sessionStarted = false;
		sessionNotice = '';
		counterChecks = {};
		sessionSwaps = {};
		currentStepKey = cookMode ? normalizeCookProgress(currentKeys(cookMode), null).currentKey : null;
		lifecycle.resetTimers();
		network.resetCooked();
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

	onDestroy(() => {
		network.destroy();
		lifecycle.destroy();
	});

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
			(currentStepKey != null && currentStepKey !== currentKeys()[0]) ||
			timers.order.length > 0 ||
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
	let paletteByIngredient = $derived.by<Record<string, BeatPalette>>(() => {
		const result: Record<string, BeatPalette> = {};
		for (const step of steps) {
			const palette = palettes[steps.indexOf(step)]?.result;
			if (!palette) continue;
			for (const ingredientId of step.ingredient_ids ?? []) result[ingredientId] ??= palette;
		}
		return result;
	});

	// Guard each write so a per-tick rerun doesn't
	// fire the parent's reactive graph for unchanged values. The parent
	// reads `hasActiveTimer` on click (edit-raw guard), so per-tick churn
	// would re-run any of the parent's effects that touch the controller.
	$effect(() => {
		if (controller.resetSession !== resetCookSession) controller.resetSession = resetCookSession;
	});
	$effect(() => {
		const next = timers.anyRunning;
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
	{#if sessionNotice}
		<div class="mx-3 my-2 min-h-11 rounded-xl border border-info/25 bg-info/5 px-3 py-2 text-xs text-base-content/70" role="status">
			{sessionNotice}
		</div>
	{/if}
	{#if loading}
		<div class="mx-3 my-2 flex min-h-11 items-center gap-2 rounded-xl border border-info/25 bg-info/5 px-3 py-2 text-xs text-base-content/65" role="status">
			<Spinner size="xs" />
			<span>{regenerating ? m.benchsheet_refreshing_label() : m.benchsheet_writing_label()} <span class="tabular-nums">{fmtClock(genElapsedSec)}</span></span>
		</div>
	{:else if loadError}
		<div class="mx-3 my-2 flex min-h-11 items-center gap-2 rounded-xl border border-warning/25 bg-warning/5 px-3 py-2 text-xs">
			<span class="min-w-0 flex-1">{loadError}</span>
			{#if loadErrorRetryable}
				<button class="btn btn-xs btn-ghost h-11 min-h-0 shrink-0" onclick={() => network.loadCookMode(false)}>{m.recipes_retry_cooking_view()}</button>
			{/if}
		</div>
	{/if}
	{#if lifecycle.notificationPrimerVisible}
		<div
			class="px-3 py-2 border-b border-warning/30 bg-warning/10 text-base-content text-[12px] flex items-start gap-2"
			role="status"
		>
			<span class="flex-1 leading-snug">
				{m.benchsheet_notif_primer_desc()}
			</span>
			<button
				type="button"
				class="btn btn-xs btn-warning h-11 min-h-0 shrink-0"
				onclick={() => lifecycle.acceptNotifications()}>{m.benchsheet_notif_allow_button()}</button
			>
			<button
				type="button"
				class="btn btn-xs btn-ghost h-11 min-h-0 shrink-0"
				onclick={() => lifecycle.dismissNotificationPrimer()}>{m.benchsheet_notif_not_now_button()}</button
			>
		</div>
	{/if}

	{#if steps.length}
		<div class="mx-auto flex max-w-5xl flex-wrap items-center gap-2 px-3 py-2">
			<span class="text-xs font-semibold text-base-content/55">{m.recipes_fallback_servings_label()}</span>
			<div class="inline-flex min-h-11 items-center rounded-lg border border-base-300 bg-base-100">
				<button type="button" class="btn btn-ghost btn-xs h-11 min-h-0 w-11 px-0 text-lg" aria-label={m.benchsheet_servings_decrease()} disabled={servingDraft <= 1 || loading} onclick={() => changeServings(-1)}>−</button>
				<span class="w-8 text-center text-sm font-semibold tabular-nums">{servingDraft}</span>
				<button type="button" class="btn btn-ghost btn-xs h-11 min-h-0 w-11 px-0 text-lg" aria-label={m.benchsheet_servings_increase()} disabled={servingDraft >= 99 || loading} onclick={() => changeServings(1)}>+</button>
			</div>
			{#if fallback.scalingMode !== 'fixed_batch'}
				<div class="flex min-h-11 items-center gap-1" aria-label={m.recipes_fallback_servings_label()}>
					{#each [1, 1.5, 2] as multiplier}
						<button type="button" class="btn btn-xs h-11 min-h-0 min-w-11 px-2.5 {servingDraft === Math.round((activeBaselineServings ?? fallback.servings ?? 4) * multiplier) ? 'btn-primary' : 'btn-ghost'}" aria-pressed={servingDraft === Math.round((activeBaselineServings ?? fallback.servings ?? 4) * multiplier)} onclick={() => setServingMultiplier(multiplier)}>{multiplier === 1.5 ? '1½×' : `${multiplier}×`}</button>
					{/each}
				</div>
			{/if}
		</div>
	{/if}

	<div class="mx-auto max-w-5xl px-3 py-3 md:grid md:grid-cols-[minmax(15rem,20rem)_minmax(0,1fr)] md:items-start md:gap-5">
	{#if projectedIngredients.length}
		<aside class="mb-3 md:mb-0">
			<CounterBoard
				ingredients={projectedIngredients}
				canonicalIngredients={activeCanonicalIngredients}
				checks={counterChecks}
				swaps={sessionSwaps}
				{streamLabelsByIngredient}
				{paletteByIngredient}
				onToggle={toggleCounter}
				onSwap={selectSwap}
				onSaveDefault={(ingredientId, substituteIndex) =>
					void network.saveSwapDefault(ingredientId, substituteIndex)}
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
				timerActive={timers.snapshot.runningIdxs.has(index)}
				timerDone={timers.snapshot.doneIdxs.has(index)}
				timerRemaining={timers.snapshot.runningIdxs.has(index)
					? Math.max(0, Math.ceil((timers.ends[index] - timers.nowSec * 1000) / 1000))
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

	<div class="mb-8 border-t border-base-200 pt-4">
		<button class="btn btn-primary min-h-12 w-full" onclick={() => network.markCooked(planMealId)} disabled={cookedSubmitting || cookedDone}>
			{#if cookedDone}{m.benchsheet_cooked_logged()}{:else if cookedSubmitting}…{:else}{m.cookmode_log_cooked()}{/if}
		</button>
	</div>
	</div>
	</div>
{/if}
