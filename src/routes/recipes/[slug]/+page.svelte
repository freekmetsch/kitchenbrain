<script lang="ts">
	import { base } from '$app/paths';
	import { goto, invalidateAll } from '$app/navigation';
	import { onMount, untrack } from 'svelte';
	import BenchSheet, { type BenchSheetController } from '$lib/components/BenchSheet.svelte';
	import FreezePortionsModal from '$lib/components/FreezePortionsModal.svelte';
	import RecipeHeader from '$lib/components/recipe-detail/RecipeHeader.svelte';
	import ImportReviewBanner from '$lib/components/recipe-detail/ImportReviewBanner.svelte';
	import RecipeMetaChips from '$lib/components/recipe-detail/RecipeMetaChips.svelte';
	import MealComposition from '$lib/components/recipe-detail/MealComposition.svelte';
	import AiEditBar from '$lib/components/recipe-detail/AiEditBar.svelte';
	import FreezerStockPanel from '$lib/components/recipe-detail/FreezerStockPanel.svelte';
	import AddToPlanSheet from '$lib/components/recipe-detail/AddToPlanSheet.svelte';
	import { labelWeeks, type Recipe } from '$lib/components/recipe-detail/types';
	import { toast } from '$lib/stores/toast.svelte';
	import { m } from '$lib/paraglide/messages';

	let {
		data
	}: {
		data: {
			recipe: Recipe;
			weeks: { weekStartDate: string; weekNumber: number }[];
			recipeLang: 'en' | 'nl';
			ingredientStock: boolean[];
			frozenPortions: number;
			serveFresh: Array<{ name: string; amount: string | null; unit: string | null }>;
			hasRoles: boolean;
			currentWeekStart: string;
			subRecipes: Array<{ id: number; slug: string; title: string; titleEn: string | null; sortOrder: number }>;
			partOfMeals: Array<{ id: number; slug: string; title: string; titleEn: string | null }>;
		};
	} = $props();

	let recipe = $state(untrack(() => data.recipe));
	let weeks = $derived(
		labelWeeks(data.weeks, {
			thisWeek: m.recipes_week_this(),
			nextWeek: m.recipes_week_next(),
			weekOf: (date) => m.recipes_freezer_week_of({ date })
		})
	);

	let viewLang = $state<'en' | 'nl'>(untrack(() => data.recipeLang));
	let translationLoading = $state(false);
	let translationMessage = $state('');
	let displayTitle = $derived(viewLang === 'en' ? (recipe.titleEn ?? recipe.title) : recipe.title);
	let displayNotes = $derived(viewLang === 'en' ? (recipe.notesEn ?? recipe.notes) : recipe.notes);
	let displayCategory = $derived(viewLang === 'en' ? (recipe.categoryEn ?? recipe.category) : recipe.category);
	let displayCuisine = $derived(viewLang === 'en' ? (recipe.cuisineEn ?? recipe.cuisine) : recipe.cuisine);
	let displayDirections = $derived(
		viewLang === 'en' && recipe.directionsEn?.length === recipe.directions.length
			? recipe.directionsEn
			: recipe.directions
	);
	let displayIngredients = $derived(
		recipe.ingredients.map((ing, i) => ({
			...ing,
			name:
				viewLang === 'en' && recipe.ingredientsEn?.length === recipe.ingredients.length
					? (recipe.ingredientsEn[i]?.name ?? ing.name)
					: ing.name
		}))
	);

	let addToPlanOpen = $state(false);

	let editAiOpen = $state(false);
	let editAiInput = $state('');

	function subDisplayTitle(s: { title: string; titleEn: string | null }): string {
		return viewLang === 'en' ? (s.titleEn ?? s.title) : s.title;
	}

	let benchSheetController = $state<BenchSheetController>({
		regenerate: () => {},
		hasActiveTimer: false,
		aiPausedReason: null
	});

	let benchSheetFallback = $derived({
		directions: displayDirections,
		ingredients: displayIngredients,
		ingredientStock: data.ingredientStock,
		notes: displayNotes,
		viewLang,
		servings: recipe.servings
	});

	let imageUploading = $state(false);
	let imageUploadError = $state('');
	let imageFileInput: HTMLInputElement | null = $state(null);

	// P4.1 freeze-on-cook prompt
	let freezeOpen = $state(false);

	async function uploadImage(file: File) {
		imageUploadError = '';
		if (file.size > 5 * 1024 * 1024) {
			imageUploadError = m.recipes_toast_image_too_large();
			return;
		}
		imageUploading = true;
		try {
			const fd = new FormData();
			fd.append('image', file);
			const res = await fetch(`${base}/api/recipes/${recipe.slug}/image`, {
				method: 'POST',
				body: fd
			});
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				imageUploadError = body.message ?? m.recipes_toast_upload_failed({ status: res.status });
			} else {
				const body = await res.json();
				recipe = { ...recipe, imageUrl: body.imageUrl };
				await invalidateAll();
			}
		} catch {
			imageUploadError = m.recipes_toast_connection_failed();
			toast.error(imageUploadError);
		}
		imageUploading = false;
	}

	function onImagePicked(e: Event) {
		const input = e.target as HTMLInputElement;
		const f = input.files?.[0];
		if (f) void uploadImage(f);
		input.value = '';
	}

	async function deleteImage() {
		if (!recipe.imageUrl) return;
		if (!confirm(m.recipes_confirm_remove_photo())) return;
		imageUploadError = '';
		imageUploading = true;
		try {
			const res = await fetch(`${base}/api/recipes/${recipe.slug}/image`, { method: 'DELETE' });
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				imageUploadError = body.message ?? m.recipes_toast_delete_failed({ status: res.status });
			} else {
				recipe = { ...recipe, imageUrl: null };
				await invalidateAll();
			}
		} catch {
			imageUploadError = m.recipes_toast_connection_failed();
			toast.error(imageUploadError);
		}
		imageUploading = false;
	}

	async function requestTranslation(force = false) {
		if (translationLoading) return;
		translationLoading = true;
		translationMessage = '';
		try {
			const res = await fetch(
				`${base}/api/recipes/${recipe.slug}/translate${force ? '?force=true' : ''}`,
				{ method: 'POST' }
			);
			const body = await res.json();
			if (res.ok && body.recipe) {
				recipe = body.recipe;
				if (body.status === 'error')
					translationMessage = m.recipes_translation_failed_retry();
			} else if (body.reason === 'daily_cap_exceeded') {
				translationMessage = m.recipes_translation_paused_budget();
			} else {
				translationMessage = body.message ?? m.recipes_translation_failed_retry();
			}
		} catch {
			translationMessage = m.recipes_translation_connection_failed();
		}
		translationLoading = false;
	}

	function setViewLanguage(lang: 'en' | 'nl') {
		viewLang = lang;
		translationMessage = '';
		if (lang === 'en' && recipe.translationStatus === 'pending') {
			void requestTranslation(false);
		}
	}

	// Plan §F8: T2a.2 active-timer guard. Editing the raw recipe in the
	// middle of a cook would silently cancel any running timer (route nav
	// unmounts <BenchSheet>). Confirm before navigating; if the cook
	// genuinely wants to leave they can say yes.
	function openEditRaw() {
		if (
			benchSheetController.hasActiveTimer &&
			!confirm(m.recipes_confirm_leave_timer())
		) {
			return;
		}
		void goto(`${base}/recipes/${recipe.slug}/edit`);
	}

	// The AI chat's edit_recipe tool is the designed path for setting roles —
	// prefill the ask so one tap away from the hint does the right thing.
	function openRolesAiEdit() {
		editAiInput = m.recipes_ai_roles_prefill();
		editAiOpen = true;
	}

	onMount(() => {
		if (viewLang === 'en' && recipe.translationStatus === 'pending') {
			void requestTranslation(false);
		}
	});
</script>

<svelte:head>
	<title>{displayTitle} · {m.recipes_title_suffix()}</title>
</svelte:head>

<RecipeHeader
	{recipe}
	{displayTitle}
	{viewLang}
	{translationLoading}
	{translationMessage}
	{imageUploading}
	{imageUploadError}
	onAddToPlan={() => {
		addToPlanOpen = true;
	}}
	onToggleLanguage={() => setViewLanguage(viewLang === 'en' ? 'nl' : 'en')}
	onEditRaw={openEditRaw}
	onRegenerateCookMode={() => benchSheetController.regenerate()}
	onForceRetranslate={() => void requestTranslation(true)}
	onAiEdit={() => {
		editAiOpen = true;
	}}
	onPickPhoto={() => imageFileInput?.click()}
	onRemovePhoto={() => void deleteImage()}
	onRetryTranslation={(force) => void requestTranslation(force)}
/>

{#if recipe.needsReview}
	<ImportReviewBanner
		slug={recipe.slug}
		reason={recipe.reviewReason}
		onEditRaw={openEditRaw}
		onDismissed={() => {
			recipe = { ...recipe, needsReview: false, reviewReason: null };
		}}
	/>
{/if}

<RecipeMetaChips {recipe} {displayCategory} {displayCuisine} {displayNotes} />

<MealComposition
	slug={recipe.slug}
	subRecipes={data.subRecipes}
	partOfMeals={data.partOfMeals}
	{subDisplayTitle}
/>

<AiEditBar bind:open={editAiOpen} bind:value={editAiInput} recipeTitle={displayTitle} />

<input
	bind:this={imageFileInput}
	type="file"
	accept="image/*"
	capture="environment"
	class="hidden"
	onchange={onImagePicked}
/>

<!-- Serve-week tabs are a segmented control — keep it to the two nearest
     weeks; the full planning window lives in the Add-to-plan sheet below. -->
<FreezerStockPanel
	{recipe}
	weeks={weeks.slice(0, 2)}
	currentWeekStart={data.currentWeekStart}
	frozenPortions={data.frozenPortions}
	hasRoles={data.hasRoles}
	serveFresh={data.serveFresh}
	onSaved={(payload) => {
		recipe = {
			...recipe,
			isFreezerStaple: payload.is_freezer_staple ?? recipe.isFreezerStaple,
			targetPortions: payload.target_portions ?? recipe.targetPortions
		};
	}}
	onOpenRolesAiEdit={openRolesAiEdit}
/>

<BenchSheet
	recipeSlug={recipe.slug}
	recipeTitle={displayTitle}
	initial={recipe.cookModeJson}
	fallback={benchSheetFallback}
	onCooked={() => {
		void invalidateAll();
		freezeOpen = true;
	}}
	bind:controller={benchSheetController}
/>

<AddToPlanSheet
	bind:open={addToPlanOpen}
	weeks={weeks}
	recipeSlug={recipe.slug}
	dinnerTitle={displayTitle}
/>

<FreezePortionsModal
	bind:open={freezeOpen}
	slug={recipe.slug}
	title={displayTitle}
	defaultPortions={recipe.targetPortions ?? recipe.servings ?? 2}
	targets={data.subRecipes.length
		? [
				{ slug: recipe.slug, title: displayTitle },
				...data.subRecipes.map((s) => ({ slug: s.slug, title: subDisplayTitle(s) }))
			]
		: []}
	onFrozen={() => invalidateAll()}
/>
