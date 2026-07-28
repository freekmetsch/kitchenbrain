<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import type { ShoppingListSource } from './types';

	type Need = 'required' | 'optional' | 'stocked';
	type Props = {
		source: ShoppingListSource;
		onSave: (
			source: ShoppingListSource,
			input: { need: Need; term: string; useInRecipe: boolean }
		) => Promise<boolean>;
		onCancel: () => void;
		onSaved?: () => void;
	};

	let { source, onSave, onCancel, onSaved }: Props = $props();
	let need = $state<Need>('required');
	let term = $state('');
	let useInRecipe = $state(false);
	let pending = $state(false);
	let loadedRevision = $state('');

	const choices = $derived([
		{ value: 'required' as const, label: m.shopping_need_every_time(), description: m.shopping_need_every_time_desc() },
		{ value: 'optional' as const, label: m.shopping_need_nice_to_have(), description: m.shopping_need_nice_to_have_desc() },
		{ value: 'stocked' as const, label: m.shopping_need_usually_stocked(), description: m.shopping_need_usually_stocked_desc() }
	]);

	$effect(() => {
		const revisionKey = `${source.id}:${source.revision}:${source.recipeRevision ?? ''}`;
		if (loadedRevision === revisionKey) return;
		loadedRevision = revisionKey;
		need = source.staple ? 'stocked' : source.optional ? 'optional' : 'required';
		term = source.term;
		useInRecipe = false;
	});

	async function save() {
		if (pending) return;
		pending = true;
		const saved = await onSave(source, { need, term, useInRecipe });
		pending = false;
		if (saved) onSaved?.();
	}
</script>

<form
	class="shopping-rule-editor"
	onsubmit={(event) => {
		event.preventDefault();
		void save();
	}}
>
	<fieldset disabled={pending}>
		<legend>{m.shopping_need_label()}</legend>
		<div class="need-options">
			{#each choices as choice}
				<label>
					<input
						type="radio"
						name={`shopping-need-${source.id}`}
						value={choice.value}
						bind:group={need}
					/>
					<span>
						<strong>{choice.label}</strong>
						<small>{choice.description}</small>
					</span>
				</label>
			{/each}
		</div>
	</fieldset>

	<label class="term-choice">
		<span>{m.shopping_this_week_term()}</span>
		<select class="select min-h-11 w-full" disabled={pending} bind:value={term}>
			{#each source.approvedTerms as approved}<option value={approved}>{approved}</option>{/each}
		</select>
	</label>

	{#if term !== source.name}
		<label class="recipe-choice">
			<input class="checkbox checkbox-primary" type="checkbox" disabled={pending} bind:checked={useInRecipe} />
			<span><strong>{m.shopping_use_in_recipe()}</strong><small>{m.shopping_use_in_recipe_help()}</small></span>
		</label>
	{/if}

	<div class="editor-actions">
		<button type="button" disabled={pending} onclick={onCancel}>{m.shopping_cancel_button()}</button>
		<button type="submit" class="save" disabled={pending}>
			{pending ? m.shopping_saving_label() : m.shopping_save_choice()}
		</button>
	</div>
</form>

<style>
	.shopping-rule-editor {
		display: grid;
		gap: 0.8rem;
		margin-top: 0.65rem;
		border-top: 1px solid var(--color-base-200);
		padding-top: 0.75rem;
	}

	fieldset {
		min-width: 0;
	}

	legend,
	.term-choice > span {
		margin-bottom: 0.35rem;
		font-size: 0.7rem;
		font-weight: 800;
	}

	.need-options {
		display: grid;
		gap: 0.35rem;
	}

	.need-options label,
	.recipe-choice {
		display: flex;
		min-height: 2.75rem;
		align-items: flex-start;
		gap: 0.55rem;
		border: 1px solid var(--color-base-300);
		border-radius: 0.7rem;
		padding: 0.55rem;
		cursor: pointer;
	}

	.need-options input {
		margin-top: 0.15rem;
		accent-color: var(--market-olive, #304b3a);
	}

	.need-options span,
	.recipe-choice span {
		min-width: 0;
	}

	.need-options strong,
	.need-options small,
	.recipe-choice strong,
	.recipe-choice small {
		display: block;
	}

	.need-options strong,
	.recipe-choice strong {
		font-size: 0.72rem;
	}

	.need-options small,
	.recipe-choice small {
		margin-top: 0.1rem;
		color: color-mix(in oklab, var(--color-base-content) 62%, transparent);
		font-size: 0.62rem;
		line-height: 1.4;
	}

	.term-choice {
		display: grid;
	}

	.term-choice select {
		font-size: 0.72rem;
	}

	.recipe-choice {
		background: var(--color-base-200);
	}

	.editor-actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.4rem;
	}

	.editor-actions button {
		min-height: 2.75rem;
		border-radius: 0.65rem;
		padding: 0 0.75rem;
		font-size: 0.7rem;
		font-weight: 800;
	}

	.editor-actions .save {
		background: var(--market-olive, #304b3a);
		color: white;
	}
</style>
