<!--
	Raw recipe view used when the bench-sheet rewrite is unavailable: AI cap
	reached, no cached cookModeJson, but recipe.directions[] still exists.

	Mirrors the legacy /recipes/[slug] layout (ingredients with stock badges,
	servings scaler, numbered directions with naive timer extraction) so a cook
	isn't blocked by a paused AI budget. Notes render once, at the page bottom.

	The banner at the top explains the fallback and offers a retry button so
	the cook can ask for the bench sheet again later (e.g. once the cap rolls
	over).
-->
<script lang="ts">
	import { scaleAmount as scaleIngredientAmount } from '$lib/recipe_scale';
	import { extractTimers } from '$lib/timer_extract';
	import { fmtClock } from './cook-mode/palette';
	import { m } from '$lib/paraglide/messages';
	import { parseRecipeSource } from '$lib/recipe_source';

	type Ingredient = { name: string; amount: string; unit?: string };

	type Props = {
		directions: string[];
		ingredients: Ingredient[];
		ingredientStock: boolean[];
		viewLang: 'en' | 'nl';
		servings: number | null;
		targetServings: number;
		sourceUrl?: string | null;
		// Optional: the generating path renders its own progress banner above
		// this component instead.
		bannerMessage?: string;
		onRetry?: () => void;
		// Surfaced to the parent so it can avoid unmounting this view (killing a
		// running kitchen timer) when the bench sheet arrives mid-cook.
		activeTimer?: boolean;
	};

	let {
		directions,
		ingredients,
		ingredientStock,
		viewLang,
		servings,
		targetServings,
		sourceUrl,
		bannerMessage,
		onRetry,
		activeTimer = $bindable(false)
	}: Props = $props();

	let servingsMultiplier = $derived(targetServings / (servings ?? 4));

	function scaleAmount(amount: string, name: string): string {
		return scaleIngredientAmount(amount, name, servingsMultiplier);
	}

	let timerEnds = $state<Record<string, number>>({});
	let nowMs = $state(Date.now());

	let anyTimerRunning = $derived.by(() => {
		void nowMs;
		const now = Date.now();
		for (const k of Object.keys(timerEnds)) {
			if (timerEnds[k] > now) return true;
		}
		return false;
	});

	$effect(() => {
		if (!anyTimerRunning) return;
		const id = setInterval(() => {
			nowMs = Date.now();
		}, 500);
		return () => clearInterval(id);
	});

	$effect(() => {
		if (activeTimer !== anyTimerRunning) activeTimer = anyTimerRunning;
	});

	function timerRemaining(key: string): number {
		if (!timerEnds[key]) return 0;
		return Math.max(0, Math.ceil((timerEnds[key] - nowMs) / 1000));
	}
	function startTimer(key: string, seconds: number) {
		timerEnds[key] = Date.now() + seconds * 1000;
	}

	// Cache the regex scan per directions[] reference. Bench-sheet flips
	// (lang toggle, etc.) shouldn't re-scan the same text.
	let timersByDirection = $derived(directions.map(extractTimers));

	let source = $derived(parseRecipeSource(sourceUrl));
</script>

<div class="px-3 pt-3 pb-32">
	{#if bannerMessage}
		<div class="alert alert-warning text-sm mb-4 flex items-start gap-2">
			<div class="flex-1">{bannerMessage}</div>
			{#if onRetry}
				<button class="btn btn-xs btn-ghost border border-base-content/20" onclick={onRetry}>{m.recipes_retry_cooking_view()}</button>
			{/if}
		</div>
	{/if}

	{#if source}
		<p class="mb-4 text-xs text-base-content/60">
			{m.recipes_source_label()}
			<a
				href={source.href}
				target="_blank"
				rel="noopener noreferrer"
				class="font-medium text-base-content underline underline-offset-2">{source.host} ↗</a
			>
		</p>
	{/if}

	{#if ingredients.length > 0}
		<h2 class="text-base font-semibold mb-2">
			{viewLang === 'en' ? 'Ingredients' : 'Ingrediënten'}
		</h2>
		<ul class="space-y-1.5 mb-5">
			{#each ingredients as ing, i}
				<li class="flex items-baseline gap-2 text-sm">
					<span class="font-medium text-primary tabular-nums min-w-[5rem] text-right shrink-0">
						{scaleAmount(ing.amount, ing.name)}{ing.unit ? ' ' + ing.unit : ''}
					</span>
					<span class="flex-1">{ing.name}</span>
					{#if ingredientStock[i]}
						<span class="badge badge-xs badge-success shrink-0" title={m.recipes_fallback_in_stock_title()}>{m.recipes_fallback_in_stock_badge()}</span>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}

	{#if directions.length > 0}
		<h2 class="text-base font-semibold mb-2">
			{viewLang === 'en' ? 'Directions' : 'Bereiding'}
		</h2>
		<ol class="space-y-4 mb-5">
			{#each directions as step, i}
				{@const timers = timersByDirection[i]}
				<li class="flex gap-3">
					<span
						class="shrink-0 w-6 h-6 rounded-full bg-primary text-primary-content text-xs flex items-center justify-center font-bold mt-0.5"
						>{i + 1}</span
					>
					<div class="flex-1 min-w-0">
						<p class="text-sm leading-relaxed">{step}</p>
						{#if timers.length > 0}
							<div class="flex gap-1 mt-1.5 flex-wrap">
								{#each timers as timer}
									{@const remaining = timerRemaining(timer.key)}
									{@const active = !!timerEnds[timer.key] && remaining > 0}
									{@const done = !!timerEnds[timer.key] && remaining === 0}
									<button
										class="btn btn-xs {done
											? 'btn-success'
											: active
												? 'btn-warning'
												: 'btn-ghost border border-base-300'}"
										onclick={() => startTimer(timer.key, timer.seconds)}
									>
										⏱ {active ? fmtClock(remaining) : done ? m.recipes_fallback_timer_done() : timer.label}
									</button>
								{/each}
							</div>
						{/if}
					</div>
				</li>
			{/each}
		</ol>
	{/if}
</div>
