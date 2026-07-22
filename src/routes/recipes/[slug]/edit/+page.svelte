<script lang="ts">
	import { enhance } from '$app/forms';
	import { beforeNavigate } from '$app/navigation';
	import { base } from '$app/paths';
	import { onMount, tick, untrack } from 'svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import Icon from '$lib/components/ui/icons/Icon.svelte';
	import IngredientListEditor from '$lib/components/recipe-edit/IngredientListEditor.svelte';
	import DirectionListEditor from '$lib/components/recipe-edit/DirectionListEditor.svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import { m } from '$lib/paraglide/messages';
	import type { PageData, ActionData } from './$types';
	import { useChatAgent } from '$lib/chat/agent_context';
	import {
		hydrateDirections,
		hydrateIngredients,
		serializeDirections,
		serializeIngredients,
		type DirectionDraft,
		type IngredientDraft
	} from '$lib/recipe_edit';

	type StoredDraft = {
		title: string;
		language: 'nl' | 'en';
		notes: string;
		sourceUrl: string;
		servings: number | null;
		ingredients: Parameters<typeof hydrateIngredients>[0];
		directions: Array<string | DirectionDraft>;
	};

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const chatAgent = useChatAgent();
	const { slug: draftSlug, updatedAt: draftUpdatedAt } = untrack(() => data.recipe);
	const draftKey = `kitchenbrain:recipe-draft:${draftSlug}`;
	const baseUpdatedAt = new Date(draftUpdatedAt).toISOString();

	let title = $state(untrack(() => data.recipe.title));
	let language = $state<'nl' | 'en'>(untrack(() => (data.recipe.language as 'nl' | 'en') ?? 'nl'));
	let notes = $state(untrack(() => data.recipe.notes ?? ''));
	let sourceUrl = $state(untrack(() => data.recipe.sourceUrl ?? ''));
	let servings = $state<number | null>(untrack(() => data.recipe.servings));
	let ingredients = $state<IngredientDraft[]>(
		untrack(() => hydrateIngredients(data.recipe.ingredients as Parameters<typeof hydrateIngredients>[0]))
	);
	let directions = $state<DirectionDraft[]>(
		untrack(() => hydrateDirections(data.recipe.directions as string[]))
	);

	let submitting = $state(false);
	let draftReady = $state(false);
	let draftRecovered = $state(false);
	let errorSummary: HTMLDivElement | null = $state(null);
	let imageUploading = $state(false);

	let serializedIngredients = $derived(serializeIngredients(ingredients));
	let serializedDirections = $derived(serializeDirections(directions));

	function snapshot(): string {
		return JSON.stringify({
			title,
			language,
			notes,
			sourceUrl,
			servings,
			ingredients: serializedIngredients,
			directions: serializedDirections
		});
	}

	const initialSnapshot = untrack(snapshot);
	let dirty = $derived(snapshot() !== initialSnapshot || data.reviewingStructureDraft);
	let classifiedCount = $derived(
		ingredients.filter((ingredient) => ingredient.role === 'cook_in' || ingredient.role === 'serve_fresh').length
	);

	function applyDraft(draft: StoredDraft) {
		title = draft.title;
		language = draft.language;
		notes = draft.notes;
		sourceUrl = draft.sourceUrl ?? '';
		servings = draft.servings;
		ingredients = hydrateIngredients(draft.ingredients);
		directions = hydrateDirections(draft.directions);
	}

	function serverDraft(): StoredDraft {
		return {
			title: data.recipe.title,
			language: (data.recipe.language as 'nl' | 'en') ?? 'nl',
			notes: data.recipe.notes ?? '',
			sourceUrl: data.recipe.sourceUrl ?? '',
			servings: data.recipe.servings,
			ingredients: data.recipe.ingredients as Parameters<typeof hydrateIngredients>[0],
			directions: data.recipe.directions as string[]
		};
	}

	function discardRecoveredDraft() {
		applyDraft(serverDraft());
		draftRecovered = false;
		sessionStorage.removeItem(draftKey);
	}

	async function handleImagePaste(event: ClipboardEvent) {
		const item = Array.from(event.clipboardData?.items ?? []).find((candidate) => candidate.type.startsWith('image/'));
		const file = item?.getAsFile();
		if (!file || imageUploading) return;
		event.preventDefault();
		imageUploading = true;
		try {
			const formData = new FormData();
			formData.append('image', file);
			const response = await fetch(`${base}/api/recipes/${data.recipe.slug}/image`, { method: 'POST', body: formData });
			if (!response.ok) throw new Error();
			toast.success(m.recipes_image_pasted());
		} catch {
			toast.error(m.recipes_toast_upload_failed({ status: 0 }));
		} finally {
			imageUploading = false;
		}
	}

	onMount(() => {
		try {
			const stored = JSON.parse(sessionStorage.getItem(draftKey) ?? 'null');
			if (stored?.v === 1 && stored.baseUpdatedAt === baseUpdatedAt && stored.draft) {
				applyDraft(stored.draft as StoredDraft);
				draftRecovered = true;
			} else if (stored) sessionStorage.removeItem(draftKey);
		} catch {
			sessionStorage.removeItem(draftKey);
		}
		draftReady = true;
	});

	$effect(() => {
		if (!draftReady) return;
		const draft = { title, language, notes, sourceUrl, servings, ingredients, directions };
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

<svelte:window onpaste={handleImagePaste} />

<div class="ui-page-shell px-4 pb-8">
	<header class="sticky top-0 z-30 -mx-4 mb-4 flex items-center gap-2 border-b border-base-200 bg-base-100/95 px-4 py-2 backdrop-blur">
		<a
			href="{base}/recipes/{data.recipe.slug}"
			class="btn btn-sm btn-ghost -ml-2 h-9 w-9 shrink-0 p-0"
			aria-label={m.recipes_cancel_button()}><Icon name="chevronLeft" /></a
		>
		<h1 class="min-w-0 flex-1 truncate text-lg font-bold">{m.recipes_edit_heading()}</h1>
		<button
			type="submit"
			form="recipe-edit-form"
			class="btn btn-sm btn-primary shrink-0"
			disabled={submitting || !dirty}
		>
			{#if submitting}<Spinner size="xs" />{/if}
			{m.recipes_edit_save_button()}
		</button>
	</header>

	{#if form?.error}
		<div
			bind:this={errorSummary}
			tabindex="-1"
			role="alert"
			class="mb-3 rounded-xl border border-error/30 bg-error/10 px-3 py-2 text-sm text-error"
		>
			{form.error}
		</div>
	{/if}
	{#if draftRecovered}
		<div class="mb-3 flex items-center gap-3 rounded-xl border border-info/30 bg-info/10 px-3 py-2 text-sm text-info">
			<span class="min-w-0 flex-1">{m.recipes_edit_draft_restored()}</span>
			<button type="button" class="btn btn-ghost btn-sm min-h-9" onclick={discardRecoveredDraft}>
				{m.recipes_edit_draft_discard()}
			</button>
		</div>
	{/if}
	{#if data.reviewingStructureDraft}
		<div class="mb-3 rounded-xl border border-info/30 bg-info/10 px-3 py-2 text-sm text-info">
			{m.recipes_edit_structure_review_hint()}
		</div>
	{/if}

	<form
		id="recipe-edit-form"
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
					const resultData = result.data as { error?: string } | undefined;
					toast.error(resultData?.error ?? m.recipes_edit_toast_save_failed());
					await tick();
					errorSummary?.focus();
				}
			};
		}}
		class="flex flex-col gap-3"
	>
		<section class="ui-form-card flex flex-col gap-2" aria-labelledby="basics-heading">
			<h2 id="basics-heading" class="ui-section-label">{m.recipes_edit_basics_label()}</h2>
			<label class="flex flex-col gap-1">
				<span class="ui-field-label">{m.recipes_edit_title_label()}</span>
				<input type="text" name="title" bind:value={title} required class="input input-bordered input-sm" />
			</label>
			<div class="grid grid-cols-[1fr_6rem] gap-2 sm:grid-cols-[minmax(0,1fr)_6rem_minmax(0,1.5fr)]">
				<label class="flex flex-col gap-1">
					<span class="ui-field-label">{m.recipes_edit_language_label()}</span>
					<select bind:value={language} name="language" class="select select-bordered select-sm">
						<option value="nl">{m.recipes_edit_language_dutch()}</option>
						<option value="en">{m.recipes_edit_language_english()}</option>
					</select>
				</label>
				<label class="flex flex-col gap-1">
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
				<label class="col-span-2 flex flex-col gap-1 sm:col-span-1">
					<span class="ui-field-label">{m.recipes_edit_source_url_label()}</span>
					<input
						type="url"
						name="sourceUrl"
						bind:value={sourceUrl}
						class="input input-bordered input-sm"
						placeholder="https://…"
					/>
				</label>
			</div>
		</section>

		<IngredientListEditor bind:ingredients />
		<DirectionListEditor bind:directions />

		<label class="ui-form-card flex flex-col gap-1">
			<span class="ui-section-label">{m.recipes_edit_notes_label()}</span>
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
		<input type="hidden" name="acceptStructureDraft" value={data.reviewingStructureDraft ? '1' : '0'} />
	</form>
</div>
