<script lang="ts">
	import { tick } from 'svelte';
	import Icon from '$lib/components/ui/icons/Icon.svelte';
	import { m } from '$lib/paraglide/messages';
	import {
		createRecipeEditId,
		type IngredientDraft,
		type SubstituteDraft
	} from '$lib/recipe_edit';

	let { ingredients = $bindable<IngredientDraft[]>() }: { ingredients: IngredientDraft[] } = $props();
	let addButton: HTMLButtonElement | null = $state(null);
	let openAlternatives = $state<Record<string, boolean>>({});

	async function focusSelector(selector: string) {
		await tick();
		const control = document.querySelector<HTMLElement>(selector);
		control?.scrollIntoView({ block: 'center' });
		control?.focus();
	}

	function addIngredient() {
		const clientId = createRecipeEditId('ingredient');
		ingredients = [...ingredients, { clientId, name: '', amount: '', unit: '', substitutes: [] }];
		void focusSelector(`[data-ingredient-id="${clientId}"] input`);
	}

	function removeIngredient(index: number) {
		const focusId = ingredients[index + 1]?.clientId ?? ingredients[index - 1]?.clientId;
		ingredients = ingredients.filter((_, itemIndex) => itemIndex !== index);
		if (focusId) void focusSelector(`[data-ingredient-id="${focusId}"] input`);
		else void tick().then(() => addButton?.focus());
	}

	function addSubstitute(ingredientIndex: number) {
		const clientId = createRecipeEditId('substitute');
		const ingredient = ingredients[ingredientIndex];
		const substitute: SubstituteDraft = { clientId, name: '', kind: 'other', note: '' };
		ingredient.substitutes = [...(ingredient.substitutes ?? []), substitute];
		openAlternatives[ingredient.clientId] = true;
		ingredients = [...ingredients];
		void focusSelector(`[data-substitute-id="${clientId}"] input`);
	}

	function removeSubstitute(ingredientIndex: number, substituteIndex: number) {
		const ingredient = ingredients[ingredientIndex];
		const substitutes = ingredient.substitutes ?? [];
		const focusId = substitutes[substituteIndex + 1]?.clientId ?? substitutes[substituteIndex - 1]?.clientId;
		ingredient.substitutes = substitutes.filter((_, index) => index !== substituteIndex);
		ingredients = [...ingredients];
		if (focusId) void focusSelector(`[data-substitute-id="${focusId}"] input`);
		else void focusSelector(`[data-add-alternative="${ingredient.clientId}"]`);
	}
</script>

<section class="ui-form-card" aria-labelledby="ingredients-heading">
	<div class="mb-2 flex items-baseline gap-2">
		<h2 id="ingredients-heading" class="ui-section-label">{m.recipes_edit_ingredients_label()}</h2>
		<button
			bind:this={addButton}
			type="button"
			class="btn btn-xs btn-ghost ml-auto min-h-9 border border-base-300"
			onclick={addIngredient}>{m.recipes_edit_add_ingredient_button()}</button
		>
	</div>
	<div class="divide-y divide-base-300/70">
		{#each ingredients as ingredient, index (ingredient.clientId)}
			<div class="py-4 first:pt-1 last:pb-1" data-ingredient-id={ingredient.clientId}>
				<div class="flex items-end gap-2">
					<label class="flex min-w-0 flex-1 flex-col gap-1.5">
						<span class="ui-field-label">{m.recipes_edit_name_label()}</span>
						<input type="text" bind:value={ingredient.name} class="input input-bordered input-sm w-full" />
					</label>
					<button
						type="button"
						class="btn btn-ghost h-10 min-h-10 w-10 shrink-0 p-0 text-error"
						aria-label={m.recipes_edit_remove_ingredient_aria()}
						onclick={() => removeIngredient(index)}><Icon name="x" class="h-4 w-4" /></button
					>
				</div>

				<div class="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(12rem,1.6fr)]">
					<label class="flex min-w-0 flex-col gap-1.5">
						<span class="ui-field-label">{m.recipes_edit_amount_label()}</span>
						<input type="text" bind:value={ingredient.amount} class="input input-bordered input-sm w-full" />
					</label>
					<label class="flex min-w-0 flex-col gap-1.5">
						<span class="ui-field-label">{m.recipes_edit_unit_label()}</span>
						<input type="text" bind:value={ingredient.unit} class="input input-bordered input-sm w-full" />
					</label>
					<label class="col-span-2 flex min-w-0 flex-col gap-1.5 sm:col-span-1">
						<span class="ui-field-label">{m.recipes_edit_role_label()}</span>
						<select bind:value={ingredient.role} class="select select-bordered select-sm w-full">
							<option value={undefined}>{m.recipes_edit_role_unclassified()}</option>
							<option value="cook_in">{m.recipes_edit_role_cook_in()}</option>
							<option value="serve_fresh">{m.recipes_edit_role_serve_fresh()}</option>
						</select>
					</label>
				</div>

				{#if (ingredient.substitutes?.length ?? 0) === 0}
					<button
						type="button"
						data-add-alternative={ingredient.clientId}
						class="btn btn-ghost btn-xs mt-2 min-h-9 px-2 text-base-content/60"
						onclick={() => addSubstitute(index)}>{m.recipes_edit_substitutes_add()}</button
					>
				{:else}
					<details
						class="mt-3 border-l-2 border-base-300 pl-3"
						open={openAlternatives[ingredient.clientId]}
						ontoggle={(event) => {
							openAlternatives[ingredient.clientId] = (event.currentTarget as HTMLDetailsElement).open;
						}}
					>
						<summary class="flex min-h-9 cursor-pointer list-none items-center gap-2 text-xs text-base-content/65">
							<span class="flex-1">{m.recipes_edit_substitutes_summary({ count: ingredient.substitutes?.length ?? 0 })}</span>
							<span aria-hidden="true">⌄</span>
						</summary>
						<div class="pt-2">
							<p class="mb-2 text-xs leading-relaxed text-base-content/60">{m.recipes_substitutes_disclaimer()}</p>
							<div class="space-y-3">
								{#each ingredient.substitutes ?? [] as substitute, substituteIndex (substitute.clientId)}
									<div class="grid grid-cols-[minmax(0,1fr)_7rem_2.5rem] gap-2" data-substitute-id={substitute.clientId}>
										<input
											type="text"
											bind:value={substitute.name}
											placeholder={m.recipes_edit_substitute_name()}
											aria-label={m.recipes_edit_substitute_name()}
											class="input input-bordered input-sm min-w-0 w-full"
										/>
										<select
											bind:value={substitute.kind}
											aria-label={m.recipes_edit_substitute_kind()}
											class="select select-bordered select-sm min-w-0 w-full"
										>
											<option value="protein">{m.recipes_substitutes_kind_protein()}</option>
											<option value="spice">{m.recipes_substitutes_kind_spice()}</option>
											<option value="vegetable">{m.recipes_substitutes_kind_vegetable()}</option>
											<option value="other">{m.recipes_substitutes_kind_other()}</option>
										</select>
										<button
											type="button"
											class="btn btn-ghost h-10 min-h-10 w-10 p-0 text-error"
											aria-label={m.recipes_edit_substitute_remove_aria({ name: substitute.name || m.recipes_edit_substitute_name() })}
											onclick={() => removeSubstitute(index, substituteIndex)}><Icon name="x" class="h-4 w-4" /></button
										>
										<input
											type="text"
											bind:value={substitute.note}
											placeholder={m.recipes_edit_substitute_note()}
											aria-label={m.recipes_edit_substitute_note()}
											class="input input-bordered input-sm col-span-3 min-w-0 w-full"
										/>
									</div>
								{/each}
							</div>
							<button
								type="button"
								data-add-alternative={ingredient.clientId}
								class="btn btn-ghost btn-xs mt-2 min-h-9 border border-base-300"
								onclick={() => addSubstitute(index)}>{m.recipes_edit_substitutes_add()}</button
							>
						</div>
					</details>
				{/if}
			</div>
		{/each}
	</div>
</section>
