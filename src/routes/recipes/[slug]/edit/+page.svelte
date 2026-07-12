<script lang="ts">
	import { enhance } from '$app/forms';
	import { beforeNavigate } from '$app/navigation';
	import { base } from '$app/paths';
	import FixedBottomBar from '$lib/components/ui/FixedBottomBar.svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import { untrack } from 'svelte';
	import type { PageData, ActionData } from './$types';

	type Ingredient = {
		name: string;
		amount: string;
		unit?: string;
		// Set via the AI chat, not this form — must survive a manual save.
		role?: 'cook_in' | 'serve_fresh';
	};

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let title = $state(untrack(() => data.recipe.title));
	let language = $state<'nl' | 'en'>(untrack(() => (data.recipe.language as 'nl' | 'en') ?? 'nl'));
	let notes = $state(untrack(() => data.recipe.notes ?? ''));
	let servings = $state<number | null>(untrack(() => data.recipe.servings));
	let ingredients = $state<Ingredient[]>(
		untrack(() =>
			(data.recipe.ingredients as Ingredient[]).map((i) => ({
				name: i.name,
				amount: i.amount,
				unit: i.unit ?? '',
				role: i.role
			}))
		)
	);
	let directions = $state<string[]>(untrack(() => [...(data.recipe.directions as string[])]));

	let submitting = $state(false);

	function addIngredient() {
		ingredients = [...ingredients, { name: '', amount: '', unit: '' }];
	}
	function removeIngredient(i: number) {
		ingredients = ingredients.filter((_, idx) => idx !== i);
	}
	function addDirection() {
		directions = [...directions, ''];
	}
	function removeDirection(i: number) {
		directions = directions.filter((_, idx) => idx !== i);
	}

	function moveDirection(i: number, delta: number) {
		const j = i + delta;
		if (j < 0 || j >= directions.length) return;
		const next = [...directions];
		[next[i], next[j]] = [next[j], next[i]];
		directions = next;
	}

	let serializedIngredients = $derived(
		JSON.stringify(
			ingredients
				.map((ing) => ({
					name: ing.name.trim(),
					amount: ing.amount.trim(),
					unit: ing.unit?.trim() || undefined,
					role: ing.role
				}))
				.filter((ing) => ing.name)
		)
	);
	let serializedDirections = $derived(
		JSON.stringify(directions.map((d) => d.trim()).filter((d) => d.length > 0))
	);

	function snapshot(): string {
		return JSON.stringify({
			title,
			language,
			notes,
			servings,
			ingredients: serializedIngredients,
			directions: serializedDirections
		});
	}

	const initialSnapshot = untrack(snapshot);
	let dirty = $derived(snapshot() !== initialSnapshot);

	beforeNavigate(({ cancel }) => {
		if (!dirty || submitting) return;
		if (!confirm('Discard your unsaved recipe edits?')) cancel();
	});
</script>

<svelte:head>
	<title>Edit {data.recipe.title} · Recipes</title>
</svelte:head>

<div class="ui-page-shell px-4 py-4">
	<div class="flex items-center gap-2 mb-4">
		<a href="{base}/recipes/{data.recipe.slug}" class="btn btn-sm btn-ghost -ml-2">← Cancel</a>
		<h1 class="text-lg font-bold flex-1">Edit recipe</h1>
	</div>

	{#if form?.error}
		<div class="mb-3 rounded-xl border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">{form.error}</div>
	{/if}

	<form
		method="POST"
		use:enhance={() => {
			submitting = true;
			return async ({ result, update }) => {
				await update();
				submitting = false;
				if (result.type === 'failure') {
					const data = result.data as { error?: string } | undefined;
					toast.error(data?.error ?? 'Could not save recipe.');
				}
			};
		}}
		class="flex flex-col gap-4"
	>
		<label class="ui-form-card flex flex-col gap-1.5">
			<span class="ui-field-label">Title</span>
			<input
				type="text"
				name="title"
				bind:value={title}
				required
				class="input input-bordered input-sm"
			/>
		</label>

		<div class="grid grid-cols-[1fr_6rem] gap-3">
			<label class="ui-form-card flex flex-col gap-1.5">
				<span class="ui-field-label">Language</span>
				<select bind:value={language} name="language" class="select select-bordered select-sm">
					<option value="nl">Dutch</option>
					<option value="en">English</option>
				</select>
			</label>
			<label class="ui-form-card flex flex-col gap-1.5">
				<span class="ui-field-label">Servings</span>
				<input
					type="number"
					name="servings"
					min="1"
					max="99"
					bind:value={servings}
					class="input input-bordered input-sm"
				/>
			</label>
		</div>

		<section class="ui-form-card">
			<div class="flex items-baseline gap-2 mb-2">
				<span class="ui-section-label">Ingredients</span>
				<button type="button" class="btn btn-xs btn-ghost border border-base-300 ml-auto" onclick={addIngredient}
					>+ Add</button
				>
			</div>
			<div class="flex flex-col gap-1.5">
				{#each ingredients as ing, i (i)}
					<div class="flex gap-1.5 items-start">
						<input
							type="text"
							placeholder="amount"
							bind:value={ing.amount}
							class="input input-bordered input-sm w-20 shrink-0"
						/>
						<input
							type="text"
							placeholder="unit"
							bind:value={ing.unit}
							class="input input-bordered input-sm w-16 shrink-0"
						/>
						<input
							type="text"
							placeholder="name"
							bind:value={ing.name}
							class="input input-bordered input-sm flex-1 min-w-0"
						/>
						<button
							type="button"
							class="btn btn-xs btn-ghost text-error shrink-0"
							aria-label="Remove ingredient"
							onclick={() => removeIngredient(i)}>✕</button
						>
					</div>
				{/each}
			</div>
		</section>

		<section class="ui-form-card">
			<div class="flex items-baseline gap-2 mb-2">
				<span class="ui-section-label">Directions</span>
				<span class="text-[11px] text-base-content/50">A saved edit refreshes cook mode next time.</span>
				<button type="button" class="btn btn-xs btn-ghost border border-base-300 ml-auto" onclick={addDirection}
					>+ Step</button
				>
			</div>
			<div class="flex flex-col gap-2">
				{#each directions as _, i (i)}
					<div class="flex gap-1.5 items-start">
						<span
							class="shrink-0 w-6 h-6 rounded-full bg-primary text-primary-content text-xs flex items-center justify-center font-bold mt-1"
							>{i + 1}</span
						>
						<textarea
							bind:value={directions[i]}
							rows="2"
							class="textarea textarea-bordered textarea-sm flex-1 min-w-0 leading-snug"
							placeholder="Direction step…"
						></textarea>
						<div class="flex flex-col gap-0.5 shrink-0">
							<button
								type="button"
								class="btn btn-xs btn-ghost"
								aria-label="Move up"
								disabled={i === 0}
								onclick={() => moveDirection(i, -1)}>▴</button
							>
							<button
								type="button"
								class="btn btn-xs btn-ghost"
								aria-label="Move down"
								disabled={i === directions.length - 1}
								onclick={() => moveDirection(i, 1)}>▾</button
							>
							<button
								type="button"
								class="btn btn-xs btn-ghost text-error"
								aria-label="Remove direction"
								onclick={() => removeDirection(i)}>✕</button
							>
						</div>
					</div>
				{/each}
			</div>
		</section>

		<label class="ui-form-card flex flex-col gap-1.5">
			<span class="ui-field-label">Notes</span>
			<textarea
				name="notes"
				bind:value={notes}
				rows="3"
				class="textarea textarea-bordered textarea-sm leading-snug"
				placeholder="Optional notes — substitutions, tips…"
			></textarea>
		</label>

		<input type="hidden" name="ingredients" value={serializedIngredients} />
		<input type="hidden" name="directions" value={serializedDirections} />

		<FixedBottomBar>
			<a href="{base}/recipes/{data.recipe.slug}" class="btn btn-sm btn-ghost flex-1">Cancel</a>
			<button type="submit" class="btn btn-sm btn-primary flex-1" disabled={submitting || !dirty}>
				{#if submitting}
					<span class="loading loading-spinner loading-xs"></span>
				{/if}
				{dirty ? 'Save' : 'Saved'}
			</button>
		</FixedBottomBar>
	</form>
</div>
