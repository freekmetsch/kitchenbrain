<script lang="ts">
	import type { Ingredient } from '$lib/recipe_ingredient';
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
				<div class="flex min-h-10 items-center rounded-full border border-base-300 bg-base-100 pl-1 pr-1.5 md:rounded-xl">
					<button
						type="button"
						class="flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-full px-1.5 text-left md:rounded-xl"
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
						<details class="dropdown dropdown-end">
							<summary class="btn btn-ghost btn-xs min-h-9 px-2">{m.cookmode_swap_button()}</summary>
							<div class="dropdown-content z-30 mt-1 w-64 rounded-xl border border-base-300 bg-base-100 p-2 shadow-xl">
								<p class="px-2 pb-1 text-[11px] text-base-content/55">{m.cookmode_swap_session_hint()}</p>
								{#each ingredient.substitutes as substitute, substituteIndex}
									<button
										type="button"
										class="btn btn-ghost btn-sm min-h-11 w-full justify-start {selected?.substituteIndex === substituteIndex ? 'btn-active' : ''}"
										onclick={() => onSwap(ingredientId, substituteIndex)}
									>
										{substitute.name}
									</button>
								{/each}
								{#if selected}
									<label class="mt-1 flex min-h-11 cursor-pointer items-center gap-2 border-t border-base-200 px-2 pt-2 text-xs">
										<input
											type="checkbox"
											class="checkbox checkbox-sm"
											disabled={savingIngredientId === ingredientId}
											onchange={(event) => {
												if (event.currentTarget.checked) {
													onSaveDefault(ingredientId, selected.substituteIndex);
												}
											}}
										/>
										<span>{m.cookmode_swap_save_default()}</span>
									</label>
								{/if}
							</div>
						</details>
					{/if}
				</div>
			</li>
		{/each}
	</ul>
</section>
