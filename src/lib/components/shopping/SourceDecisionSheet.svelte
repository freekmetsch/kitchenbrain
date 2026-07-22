<script lang="ts">
	import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
	import { m } from '$lib/paraglide/messages';
	import type { ShoppingListSource } from './types';

	type Need = 'required' | 'optional' | 'stocked';
	type Props = {
		open: boolean;
		source: ShoppingListSource | null;
		onSave: (source: ShoppingListSource, input: { need: Need; term: string; useInRecipe: boolean }) => Promise<boolean>;
	};

	let { open = $bindable(), source, onSave }: Props = $props();
	let need = $state<Need>('required');
	let term = $state('');
	let useInRecipe = $state(false);
	let pending = $state(false);

	$effect(() => {
		if (!source) return;
		need = source.staple ? 'stocked' : source.optional ? 'optional' : 'required';
		term = source.term;
		useInRecipe = false;
	});

	const choices = $derived([
		{ value: 'required' as const, label: m.shopping_need_every_time(), description: m.shopping_need_every_time_desc() },
		{ value: 'optional' as const, label: m.shopping_need_nice_to_have(), description: m.shopping_need_nice_to_have_desc() },
		{ value: 'stocked' as const, label: m.shopping_need_usually_stocked(), description: m.shopping_need_usually_stocked_desc() }
	]);

	async function save() {
		if (!source || pending) return;
		pending = true;
		const saved = await onSave(source, { need, term, useInRecipe });
		pending = false;
		if (saved) open = false;
	}
</script>

<BottomSheet bind:open title={m.shopping_source_title()}>
	{#if source}
		<div class="space-y-4">
			<div>
				<p class="font-semibold">{source.name}</p>
				{#if source.recipeTitle}<p class="text-sm text-base-content/60">{source.recipeTitle}</p>{/if}
			</div>
			<fieldset>
				<legend class="mb-2 text-sm font-semibold">{m.shopping_need_label()}</legend>
				<div class="space-y-2">
					{#each choices as choice}
						<label class="flex cursor-pointer gap-3 rounded-xl border border-base-300 p-3">
							<input class="radio radio-primary mt-0.5" type="radio" name="shopping-need" value={choice.value} bind:group={need} />
							<span><span class="block text-sm font-semibold">{choice.label}</span><span class="block text-xs text-base-content/60">{choice.description}</span></span>
						</label>
					{/each}
				</div>
			</fieldset>
			<label class="block text-sm font-semibold">
				{m.shopping_this_week_term()}
				<select class="select mt-1 w-full" bind:value={term}>
					{#each source.approvedTerms as approved}<option value={approved}>{approved}</option>{/each}
				</select>
			</label>
			{#if term !== source.name}
				<label class="flex cursor-pointer gap-3 rounded-xl bg-base-200/70 p-3">
					<input class="checkbox checkbox-primary" type="checkbox" bind:checked={useInRecipe} />
					<span><span class="block text-sm font-semibold">{m.shopping_use_in_recipe()}</span><span class="block text-xs text-base-content/60">{m.shopping_use_in_recipe_help()}</span></span>
				</label>
			{/if}
			<div class="flex justify-end gap-2">
				<button type="button" class="btn btn-ghost" disabled={pending} onclick={() => (open = false)}>{m.shopping_cancel_button()}</button>
				<button type="button" class="btn btn-primary" disabled={pending} onclick={() => void save()}>{m.shopping_save_choice()}</button>
			</div>
		</div>
	{/if}
</BottomSheet>
