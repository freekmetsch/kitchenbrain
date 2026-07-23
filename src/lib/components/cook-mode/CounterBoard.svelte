<script lang="ts">
	import { tick } from 'svelte';
	import type { Ingredient } from '$lib/recipe_ingredient';
	import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
	import type { SessionIngredientSwap } from './cook_counter';
	import { m } from '$lib/paraglide/messages';

	type Props = {
		ingredients: Ingredient[];
		canonicalIngredients: Ingredient[];
		checks: Record<string, boolean>;
		swaps: Record<string, SessionIngredientSwap>;
		streamLabelsByIngredient?: Record<string, string>;
		onToggle: (ingredientId: string) => void;
		onSwap: (ingredientId: string, substituteIndex: number) => void;
		onSaveDefault: (ingredientId: string, substituteIndex: number) => void;
		savingIngredientId?: string | null;
	};

	let {
		ingredients,
		canonicalIngredients,
		checks,
		swaps,
		streamLabelsByIngredient = {},
		onToggle,
		onSwap,
		onSaveDefault,
		savingIngredientId = null
	}: Props = $props();

	const canonicalById = $derived(
		new Map(canonicalIngredients.flatMap((ingredient) => (ingredient.id ? [[ingredient.id, ingredient] as const] : [])))
	);

	let swapOpen = $state(false);
	let swapIngredientId = $state<string | null>(null);
	let swapTrigger: HTMLButtonElement | null = null;
	let swapIngredient = $derived(
		ingredients.find((ingredient) => (ingredient.id ?? ingredient.name) === swapIngredientId) ?? null
	);
	let swapCanonical = $derived(
		swapIngredientId == null ? null : canonicalById.get(swapIngredientId) ?? null
	);
	let selectedSwap = $derived(
		swapIngredientId == null ? null : swaps[swapIngredientId] ?? null
	);

	function openSwap(event: MouseEvent, ingredientId: string) {
		swapTrigger = event.currentTarget as HTMLButtonElement;
		swapIngredientId = ingredientId;
		swapOpen = true;
	}

	async function restoreSwapFocus() {
		const target = swapTrigger;
		swapIngredientId = null;
		await tick();
		requestAnimationFrame(() => {
			target?.focus();
			swapTrigger = null;
		});
	}

	function useForCook(substituteIndex: number) {
		if (!swapIngredientId) return;
		onSwap(swapIngredientId, substituteIndex);
		swapOpen = false;
	}
</script>

<section class="rounded-2xl border border-base-300/70 bg-base-100 p-3 shadow-sm" aria-labelledby="counter-heading">
	<div class="mb-2 flex items-baseline gap-2">
		<h2 id="counter-heading" class="text-sm font-bold">{m.cookmode_counter_heading()}</h2>
		<span class="text-[11px] text-base-content/50">
			{m.cookmode_counter_count({
				ready: Object.values(checks).filter(Boolean).length,
				total: ingredients.length
			})}
		</span>
	</div>
	<ul class="flex flex-wrap gap-1.5 md:grid md:grid-cols-1">
		{#each ingredients as ingredient}
			{@const ingredientId = ingredient.id ?? ingredient.name}
			{@const canonical = canonicalById.get(ingredientId)}
			{@const selected = swaps[ingredientId]}
			<li class="min-w-0">
				<div class="flex min-h-11 items-center rounded-full border border-base-300 bg-base-100 pl-1 pr-1.5 md:rounded-xl">
					<button
						type="button"
						class="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-full px-1.5 text-left md:rounded-xl"
						aria-pressed={Boolean(checks[ingredientId])}
						onclick={() => onToggle(ingredientId)}
					>
						<span class="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border {checks[ingredientId] ? 'border-success bg-success' : 'border-base-content/30'}" aria-hidden="true">
							{#if checks[ingredientId]}<span class="h-1.5 w-1.5 rounded-full bg-success-content"></span>{/if}
						</span>
						<span class="min-w-0 text-sm leading-tight {checks[ingredientId] ? 'text-base-content/55' : ''}">
							<span class="tabular-nums">{ingredient.amount}{ingredient.unit ? ` ${ingredient.unit}` : ''}</span>
							{selected?.displayName ?? ingredient.name}
							{#if streamLabelsByIngredient[ingredientId]}
								<span class="mt-0.5 hidden text-[10px] text-base-content/45 md:block">{streamLabelsByIngredient[ingredientId]}</span>
							{/if}
						</span>
					</button>
					{#if ingredient.substitutes?.length && canonical?.substitutes?.length}
						<button
							type="button"
							class="btn btn-ghost btn-xs h-11 min-h-0 px-2"
							aria-haspopup="dialog"
							onclick={(event) => openSwap(event, ingredientId)}
						>{m.cookmode_swap_button()}</button>
					{/if}
				</div>
			</li>
		{/each}
	</ul>
</section>

<BottomSheet
	bind:open={swapOpen}
	desktopCentered
	title={swapIngredient
		? m.cookmode_swap_title({ ingredient: swapIngredient.name })
		: m.cookmode_swap_button()}
	onclose={restoreSwapFocus}
>
	{#if swapIngredient?.substitutes?.length && swapCanonical?.substitutes?.length}
		<p class="mb-3 text-sm text-base-content/60">{m.cookmode_swap_session_hint()}</p>
		<div class="space-y-2">
			{#each swapIngredient.substitutes as substitute, substituteIndex}
				<div class="grid grid-cols-[minmax(0,1fr)_auto] gap-2 rounded-xl border border-base-300 p-1.5">
					<button
						type="button"
						class="btn min-h-11 min-w-0 justify-start px-3 {selectedSwap?.substituteIndex === substituteIndex ? 'btn-primary' : 'btn-ghost'}"
						aria-label={m.cookmode_swap_use_session({ name: substitute.name })}
						onclick={() => useForCook(substituteIndex)}
					>
						<span class="truncate">{substitute.name}</span>
					</button>
					<button
						type="button"
						class="btn btn-ghost min-h-11 px-3 text-xs"
						disabled={savingIngredientId === swapIngredientId}
						aria-label={m.cookmode_swap_save_default_named({ name: substitute.name })}
						onclick={() => {
							if (swapIngredientId) onSaveDefault(swapIngredientId, substituteIndex);
						}}
					>
						{m.cookmode_swap_default_short()}
					</button>
				</div>
			{/each}
		</div>
	{/if}
</BottomSheet>
