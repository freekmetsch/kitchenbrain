<script lang="ts">
	import { enhance } from '$app/forms';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import Icon from '$lib/components/ui/icons/Icon.svelte';
	import { beforeNavigate } from '$app/navigation';
	import { base } from '$app/paths';
	import FixedBottomBar from '$lib/components/ui/FixedBottomBar.svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import { onMount, untrack } from 'svelte';
	import { m } from '$lib/paraglide/messages';
	import type { PageData, ActionData } from './$types';
	import { useChatAgent } from '$lib/chat/agent_context';

	type Ingredient = {
		name: string;
		amount: string;
		unit?: string;
		// Set via the AI chat, not this form — must survive a manual save.
		role?: 'cook_in' | 'serve_fresh';
		substitutes?: Array<{
			name: string;
			kind?: 'protein' | 'spice' | 'vegetable' | 'other';
			note?: string;
		}>;
	};

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const chatAgent = useChatAgent();
	const { slug: draftSlug, updatedAt: draftUpdatedAt } = untrack(() => data.recipe);
	const draftKey = `kitchenbrain:recipe-draft:${draftSlug}`;
	const baseUpdatedAt = new Date(draftUpdatedAt).toISOString();

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
				role: i.role,
				substitutes: (i.substitutes ?? []).map((substitute) => ({ ...substitute }))
			}))
		)
	);
	let directions = $state<string[]>(untrack(() => [...(data.recipe.directions as string[])]));

	let submitting = $state(false);
	let draftReady = $state(false);
	let draftRecovered = $state(false);

	function addIngredient() {
		ingredients = [...ingredients, { name: '', amount: '', unit: '' }];
	}
	function removeIngredient(i: number) {
		ingredients = ingredients.filter((_, idx) => idx !== i);
	}
	function addSubstitute(ingredientIndex: number) {
		const ingredient = ingredients[ingredientIndex];
		ingredient.substitutes = [
			...(ingredient.substitutes ?? []),
			{ name: '', kind: 'other', note: '' }
		];
		ingredients = [...ingredients];
	}
	function removeSubstitute(ingredientIndex: number, substituteIndex: number) {
		const ingredient = ingredients[ingredientIndex];
		ingredient.substitutes = (ingredient.substitutes ?? []).filter(
			(_, index) => index !== substituteIndex
		);
		ingredients = [...ingredients];
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
					role: ing.role,
					substitutes: (ing.substitutes ?? [])
						.map((substitute) => ({
							name: substitute.name.trim(),
							kind: substitute.kind,
							note: substitute.note?.trim() || undefined
						}))
						.filter((substitute) => substitute.name.length > 0)
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
	let classifiedCount = $derived(
		ingredients.filter((ingredient) => ingredient.role === 'cook_in' || ingredient.role === 'serve_fresh').length
	);

	function applyDraft(draft: {
		title: string;
		language: 'nl' | 'en';
		notes: string;
		servings: number | null;
		ingredients: Ingredient[];
		directions: string[];
	}) {
		title = draft.title;
		language = draft.language;
		notes = draft.notes;
		servings = draft.servings;
		ingredients = draft.ingredients.map((ingredient) => ({
			...ingredient,
			substitutes: (ingredient.substitutes ?? []).map((substitute) => ({ ...substitute }))
		}));
		directions = [...draft.directions];
	}

	function serverDraft() {
		return {
			title: data.recipe.title,
			language: (data.recipe.language as 'nl' | 'en') ?? 'nl',
			notes: data.recipe.notes ?? '',
			servings: data.recipe.servings,
			ingredients: (data.recipe.ingredients as Ingredient[]).map((ingredient) => ({
				...ingredient,
				unit: ingredient.unit ?? '',
				substitutes: (ingredient.substitutes ?? []).map((substitute) => ({ ...substitute }))
			})),
			directions: [...(data.recipe.directions as string[])]
		};
	}

	function discardRecoveredDraft() {
		applyDraft(serverDraft());
		draftRecovered = false;
		sessionStorage.removeItem(draftKey);
	}

	onMount(() => {
		try {
			const stored = JSON.parse(sessionStorage.getItem(draftKey) ?? 'null');
			if (stored?.v === 1 && stored.baseUpdatedAt === baseUpdatedAt && stored.draft) {
				applyDraft(stored.draft);
				draftRecovered = true;
			} else if (stored) sessionStorage.removeItem(draftKey);
		} catch {
			sessionStorage.removeItem(draftKey);
		}
		draftReady = true;
	});

	$effect(() => {
		if (!draftReady) return;
		const draft = { title, language, notes, servings, ingredients, directions };
		if (dirty) sessionStorage.setItem(draftKey, JSON.stringify({ v: 1, baseUpdatedAt, draft }));
		else sessionStorage.removeItem(draftKey);
	});

	$effect(() =>
		chatAgent.publishScreen({
			v: 1,
			routeId: '/recipes/[slug]/edit',
			label: m.recipes_agent_context_label({ title: data.recipe.title }),
			entity: { kind: 'recipe', id: data.recipe.slug, label: data.recipe.title },
			facts: [
				{ key: 'ingredientRoleCoverage', value: `${classifiedCount}/${ingredients.length}` },
				{ key: 'language', value: language }
			],
			interaction: { mode: 'edit', dirty }
		})
	);

	beforeNavigate(({ cancel }) => {
		if (!dirty || submitting) return;
		if (!confirm(m.recipes_edit_confirm_discard())) cancel();
	});
</script>

<svelte:head>
	<title>{m.recipes_edit_heading()} {data.recipe.title} · {m.recipes_title_suffix()}</title>
</svelte:head>

<div class="ui-page-shell px-4 pt-4">
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
	{#if draftRecovered}
		<div class="mb-3 flex items-center gap-3 rounded-xl border border-info/30 bg-info/10 px-3 py-2 text-sm text-info">
			<span class="min-w-0 flex-1">{m.recipes_edit_draft_restored()}</span>
			<button type="button" class="btn btn-ghost btn-sm min-h-9" onclick={discardRecoveredDraft}
				>{m.recipes_edit_draft_discard()}</button
			>
		</div>
	{/if}

	<form
		method="POST"
		use:enhance={() => {
			submitting = true;
			return async ({ result, update }) => {
				if (result.type === 'redirect' || result.type === 'success') {
					sessionStorage.removeItem(draftKey);
					draftRecovered = false;
				}
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
				<button type="button" class="btn btn-xs btn-ghost min-h-9 border border-base-300 ml-auto" onclick={addIngredient}
					>{m.recipes_edit_add_ingredient_button()}</button
				>
			</div>
			<div class="flex flex-col gap-2.5">
				{#each ingredients as ing, i (i)}
					<div class="rounded-xl border border-base-300/70 bg-base-200/45 p-2.5">
						<label class="flex min-w-0 flex-col gap-1">
							<span class="ui-field-label">{m.recipes_edit_name_label()}</span>
							<input type="text" bind:value={ing.name} class="input input-bordered input-sm w-full" />
						</label>
						<div class="mt-2 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2 sm:grid-cols-[6rem_6rem_minmax(0,1fr)_2.25rem]">
							<label class="flex min-w-0 flex-col gap-1">
								<span class="ui-field-label">{m.recipes_edit_amount_label()}</span>
								<input type="text" bind:value={ing.amount} class="input input-bordered input-sm min-w-0 w-full" />
							</label>
							<label class="flex min-w-0 flex-col gap-1">
								<span class="ui-field-label">{m.recipes_edit_unit_label()}</span>
								<input type="text" bind:value={ing.unit} class="input input-bordered input-sm min-w-0 w-full" />
							</label>
							<label class="col-span-2 flex min-w-0 flex-col gap-1 sm:col-span-1">
								<span class="ui-field-label">{m.recipes_edit_role_label()}</span>
								<select bind:value={ing.role} class="select select-bordered select-sm min-w-0 w-full">
									<option value={undefined}>{m.recipes_edit_role_unclassified()}</option>
									<option value="cook_in">{m.recipes_edit_role_cook_in()}</option>
									<option value="serve_fresh">{m.recipes_edit_role_serve_fresh()}</option>
								</select>
							</label>
							<button
								type="button"
								class="btn btn-ghost h-9 min-h-9 w-9 self-end p-0 text-error"
								aria-label={m.recipes_edit_remove_ingredient_aria()}
								onclick={() => removeIngredient(i)}><Icon name="x" class="h-3.5 w-3.5" /></button
							>
						</div>

						<details class="mt-2 rounded-lg border border-base-300/60 bg-base-100/60">
							<summary class="flex min-h-9 cursor-pointer list-none items-center gap-2 px-2.5 text-xs text-base-content/65">
								<span class="flex-1">{m.recipes_edit_substitutes_summary({ count: ing.substitutes?.length ?? 0 })}</span>
								<span aria-hidden="true">⌄</span>
							</summary>
							<div class="border-t border-base-300/50 p-2.5">
								<p class="mb-2 text-xs leading-relaxed text-base-content/60">
									{m.recipes_substitutes_disclaimer()}
								</p>
								<div class="space-y-2">
									{#each ing.substitutes ?? [] as substitute, substituteIndex}
										<div class="rounded-lg border border-base-300/60 bg-base-200/35 p-2">
											<div class="grid grid-cols-[minmax(0,1fr)_7rem_2.25rem] gap-2">
												<label class="flex min-w-0 flex-col gap-1">
													<span class="ui-field-label">{m.recipes_edit_substitute_name()}</span>
													<input type="text" bind:value={substitute.name} class="input input-bordered input-sm min-w-0 w-full" />
												</label>
												<label class="flex min-w-0 flex-col gap-1">
													<span class="ui-field-label">{m.recipes_edit_substitute_kind()}</span>
													<select bind:value={substitute.kind} class="select select-bordered select-sm min-w-0 w-full">
														<option value="protein">{m.recipes_substitutes_kind_protein()}</option>
														<option value="spice">{m.recipes_substitutes_kind_spice()}</option>
														<option value="vegetable">{m.recipes_substitutes_kind_vegetable()}</option>
														<option value="other">{m.recipes_substitutes_kind_other()}</option>
													</select>
												</label>
												<button
													type="button"
													class="btn btn-ghost h-9 min-h-9 w-9 self-end p-0 text-error"
													aria-label={m.recipes_edit_substitute_remove_aria({ name: substitute.name || m.recipes_edit_substitute_name() })}
													onclick={() => removeSubstitute(i, substituteIndex)}><Icon name="x" class="h-3.5 w-3.5" /></button
												>
											</div>
											<label class="mt-2 flex min-w-0 flex-col gap-1">
												<span class="ui-field-label">{m.recipes_edit_substitute_note()}</span>
												<input type="text" bind:value={substitute.note} class="input input-bordered input-sm min-w-0 w-full" />
											</label>
										</div>
									{/each}
								</div>
								<button type="button" class="btn btn-ghost btn-xs mt-2 border border-base-300" onclick={() => addSubstitute(i)}>
									{m.recipes_edit_substitutes_add()}
								</button>
							</div>
						</details>
					</div>
				{/each}
			</div>
		</section>

		<section class="ui-form-card">
			<div class="flex items-baseline gap-2 mb-2">
				<span class="ui-section-label">{m.recipes_edit_directions_label()}</span>
				<span class="text-[11px] text-base-content/50">{m.recipes_edit_directions_hint()}</span>
				<button type="button" class="btn btn-xs btn-ghost min-h-9 border border-base-300 ml-auto" onclick={addDirection}
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
								class="btn btn-xs btn-ghost min-h-9 min-w-9"
								aria-label={m.recipes_edit_move_up_aria()}
								disabled={i === 0}
								onclick={() => moveDirection(i, -1)}>▴</button
							>
							<button
								type="button"
								class="btn btn-xs btn-ghost min-h-9 min-w-9"
								aria-label={m.recipes_edit_move_down_aria()}
								disabled={i === directions.length - 1}
								onclick={() => moveDirection(i, 1)}>▾</button
							>
							<button
								type="button"
								class="btn btn-xs btn-ghost min-h-9 min-w-9 text-error"
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
