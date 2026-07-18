<script lang="ts">
	import { enhance } from '$app/forms';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import Icon from '$lib/components/ui/icons/Icon.svelte';
	import { beforeNavigate } from '$app/navigation';
	import { base } from '$app/paths';
	import FixedBottomBar from '$lib/components/ui/FixedBottomBar.svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import { untrack } from 'svelte';
	import { m } from '$lib/paraglide/messages';
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
		if (!confirm(m.recipes_edit_confirm_discard())) cancel();
	});
</script>

<svelte:head>
	<title>{m.recipes_edit_heading()} {data.recipe.title} · {m.recipes_title_suffix()}</title>
</svelte:head>

<div class="ui-page-shell px-4 py-4">
	<div class="flex items-center gap-2 mb-4">
		<a
			href="{base}/recipes/{data.recipe.slug}"
			class="btn btn-sm btn-ghost -ml-2 h-9 w-9 p-0"
			aria-label={m.recipes_cancel_button()}><Icon name="chevronLeft" /></a
		>
		<h1 class="text-lg font-bold flex-1">{m.recipes_edit_heading()}</h1>
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
					toast.error(data?.error ?? m.recipes_edit_toast_save_failed());
				}
			};
		}}
		class="flex flex-col gap-4"
	>
		<label class="ui-form-card flex flex-col gap-1.5">
			<span class="ui-field-label">{m.recipes_edit_title_label()}</span>
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
				<span class="ui-field-label">{m.recipes_edit_language_label()}</span>
				<select bind:value={language} name="language" class="select select-bordered select-sm">
					<option value="nl">{m.recipes_edit_language_dutch()}</option>
					<option value="en">{m.recipes_edit_language_english()}</option>
				</select>
			</label>
			<label class="ui-form-card flex flex-col gap-1.5">
				<span class="ui-field-label">{m.recipes_edit_servings_label()}</span>
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
				<span class="ui-section-label">{m.recipes_edit_ingredients_label()}</span>
				<button type="button" class="btn btn-xs btn-ghost border border-base-300 ml-auto" onclick={addIngredient}
					>{m.recipes_edit_add_ingredient_button()}</button
				>
			</div>
			<div class="flex flex-col gap-1.5">
				{#each ingredients as ing, i (i)}
					<div class="flex gap-1.5 items-start">
						<input
							type="text"
							placeholder={m.recipes_edit_amount_placeholder()}
							bind:value={ing.amount}
							class="input input-bordered input-sm w-20 shrink-0"
						/>
						<input
							type="text"
							placeholder={m.recipes_edit_unit_placeholder()}
							bind:value={ing.unit}
							class="input input-bordered input-sm w-16 shrink-0"
						/>
						<input
							type="text"
							placeholder={m.recipes_edit_name_placeholder()}
							bind:value={ing.name}
							class="input input-bordered input-sm flex-1 min-w-0"
						/>
						<button
							type="button"
							class="btn btn-xs btn-ghost text-error shrink-0"
							aria-label={m.recipes_edit_remove_ingredient_aria()}
				onclick={() => removeIngredient(i)}><Icon name="x" class="h-3.5 w-3.5" /></button
						>
					</div>
				{/each}
			</div>
		</section>

		<section class="ui-form-card">
			<div class="flex items-baseline gap-2 mb-2">
				<span class="ui-section-label">{m.recipes_edit_directions_label()}</span>
				<span class="text-[11px] text-base-content/50">{m.recipes_edit_directions_hint()}</span>
				<button type="button" class="btn btn-xs btn-ghost border border-base-300 ml-auto" onclick={addDirection}
					>{m.recipes_edit_add_step_button()}</button
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
							placeholder={m.recipes_edit_direction_placeholder()}
						></textarea>
						<div class="flex flex-col gap-0.5 shrink-0">
							<button
								type="button"
								class="btn btn-xs btn-ghost"
								aria-label={m.recipes_edit_move_up_aria()}
								disabled={i === 0}
								onclick={() => moveDirection(i, -1)}>▴</button
							>
							<button
								type="button"
								class="btn btn-xs btn-ghost"
								aria-label={m.recipes_edit_move_down_aria()}
								disabled={i === directions.length - 1}
								onclick={() => moveDirection(i, 1)}>▾</button
							>
							<button
								type="button"
								class="btn btn-xs btn-ghost text-error"
								aria-label={m.recipes_edit_remove_direction_aria()}
					onclick={() => removeDirection(i)}><Icon name="x" class="h-3.5 w-3.5" /></button
							>
						</div>
					</div>
				{/each}
			</div>
		</section>

		<label class="ui-form-card flex flex-col gap-1.5">
			<span class="ui-field-label">{m.recipes_edit_notes_label()}</span>
			<textarea
				name="notes"
				bind:value={notes}
				rows="3"
				class="textarea textarea-bordered textarea-sm leading-snug"
				placeholder={m.recipes_edit_notes_placeholder()}
			></textarea>
		</label>

		<input type="hidden" name="ingredients" value={serializedIngredients} />
		<input type="hidden" name="directions" value={serializedDirections} />

		<FixedBottomBar>
			<button type="submit" class="btn btn-sm btn-primary w-full" disabled={submitting || !dirty}>
				{#if submitting}
					<Spinner size="xs" />
				{/if}
				{dirty ? m.recipes_edit_save_button() : m.recipes_edit_saved_button()}
			</button>
		</FixedBottomBar>
	</form>
</div>
