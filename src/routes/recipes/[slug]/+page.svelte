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
	import FreezerStockPanel from '$lib/components/recipe-detail/FreezerStockPanel.svelte';
	import RoleCoverage from '$lib/components/recipe-detail/RoleCoverage.svelte';
	import SubstituteSuggestions from '$lib/components/recipe-detail/SubstituteSuggestions.svelte';
	import AddToPlanSheet from '$lib/components/recipe-detail/AddToPlanSheet.svelte';
	import { labelWeeks, type Recipe } from '$lib/components/recipe-detail/types';
	import { toast } from '$lib/stores/toast.svelte';
	import { m } from '$lib/paraglide/messages';
	import { useChatAgent } from '$lib/chat/agent_context';
	import type { IngredientRoleCoverage } from '$lib/server/recipe_links';
	import { isStaleCookMode } from '$lib/components/cook-mode/staleness';

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
			roleCoverage: IngredientRoleCoverage;
			currentWeekStart: string;
			subRecipes: Array<{ id: number; slug: string; title: string; titleEn: string | null; sortOrder: number }>;
			partOfMeals: Array<{ id: number; slug: string; title: string; titleEn: string | null }>;
		};
	} = $props();
	const chatAgent = useChatAgent();

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

	function hasCompleteEnglishDisplay(candidate: Recipe): boolean {
		if (candidate.language === 'en') return true;
		if (candidate.translationStatus !== 'ready' || !candidate.titleEn?.trim()) return false;
		if (candidate.ingredientsEn?.length !== candidate.ingredients.length) return false;
		if (candidate.directionsEn?.length !== candidate.directions.length) return false;
		if (candidate.category?.trim() && !candidate.categoryEn?.trim()) return false;
		if (candidate.cuisine?.trim() && !candidate.cuisineEn?.trim()) return false;
		if (candidate.notes?.trim() && !candidate.notesEn?.trim()) return false;
		return candidate.ingredients.every(
			(ingredient, index) =>
				(candidate.ingredientsEn?.[index]?.substitutes?.length ?? 0) ===
				(ingredient.substitutes?.length ?? 0)
		);
	}

	let englishDisplayReady = $derived(hasCompleteEnglishDisplay(recipe));
	// English is an all-or-nothing display mode. Until the complete translation
	// is ready, render the intact Dutch source rather than mixing field fallbacks.
	let showTranslated = $derived(viewLang === 'en' && englishDisplayReady && recipe.language !== 'en');
	let displayTitle = $derived(showTranslated ? recipe.titleEn! : recipe.title);
	let displayNotes = $derived(showTranslated ? recipe.notesEn : recipe.notes);
	let displayCategory = $derived(showTranslated ? recipe.categoryEn : recipe.category);
	let displayCuisine = $derived(showTranslated ? recipe.cuisineEn : recipe.cuisine);
	let displayDirections = $derived(
		showTranslated ? recipe.directionsEn! : recipe.directions
	);
	let displayIngredients = $derived(
		recipe.ingredients.map((ing, i) => ({
			...ing,
			name: showTranslated ? recipe.ingredientsEn![i].name : ing.name,
			substitutes: showTranslated
				? (ing.substitutes ?? []).map((substitute, substituteIndex) => ({
						...substitute,
						name:
							recipe.ingredientsEn![i].substitutes?.[substituteIndex]?.name ?? substitute.name,
						note:
							recipe.ingredientsEn![i].substitutes?.[substituteIndex]?.note ?? substitute.note
					}))
				: ing.substitutes
		}))
	);

	let addToPlanOpen = $state(false);

	function subDisplayTitle(s: { title: string; titleEn: string | null }): string {
		return viewLang === 'en' ? (s.titleEn ?? s.title) : s.title;
	}

	let benchSheetController = $state<BenchSheetController>({
		regenerate: () => {},
		resetSession: () => {},
		hasActiveTimer: false,
		hasProgress: false,
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
		if (lang === 'en' && recipe.language !== 'en') {
			if (recipe.translationStatus === 'pending') void requestTranslation(false);
			else if (recipe.translationStatus === 'ready' && !hasCompleteEnglishDisplay(recipe)) {
				void requestTranslation(true);
			}
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

	// Classification is a single, explicit action: open the contextual agent and
	// immediately submit the scoped request instead of leaving another draft for
	// the cook to send manually.
	function openRolesAiEdit() {
		chatAgent.open();
		void chatAgent.send(m.recipes_ai_roles_prefill());
	}

	function openRecipeAiEdit() {
		chatAgent.open({ draft: m.recipes_agent_edit_prefill({ title: displayTitle }) });
	}

	$effect(() =>
		chatAgent.publishScreen({
			v: 1,
			routeId: '/recipes/[slug]',
			label: m.recipes_agent_context_label({ title: displayTitle }),
			entity: { kind: 'recipe', id: recipe.slug, label: displayTitle },
			facts: [
				{ key: 'roleCoverage', value: `${data.roleCoverage.classified}/${data.roleCoverage.total}` },
				{ key: 'unknownRoleIngredients', value: data.roleCoverage.unknownNames.join(', ').slice(0, 256) },
				{ key: 'frozenPortions', value: data.frozenPortions },
				{ key: 'viewLanguage', value: viewLang }
			],
			interaction: { mode: 'view', dirty: false }
		})
	);

	function resetCookProgress() {
		if (!confirm(m.recipes_confirm_reset_cook_progress())) return;
		benchSheetController.resetSession();
	}

	onMount(() => {
		if (viewLang === 'en' && recipe.language !== 'en') {
			if (recipe.translationStatus === 'pending') void requestTranslation(false);
			else if (recipe.translationStatus === 'ready' && !hasCompleteEnglishDisplay(recipe)) {
				void requestTranslation(true);
			}
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
	hasCookProgress={benchSheetController.hasProgress}
	onResetCookProgress={resetCookProgress}
	onRegenerateCookMode={() => benchSheetController.regenerate()}
	onForceRetranslate={() => void requestTranslation(true)}
	onAiEdit={openRecipeAiEdit}
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

<RoleCoverage slug={recipe.slug} coverage={data.roleCoverage} onAskAi={openRolesAiEdit} />

<SubstituteSuggestions ingredients={displayIngredients} />

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
/>

<BenchSheet
	recipeSlug={recipe.slug}
	recipeTitle={displayTitle}
	initial={isStaleCookMode(recipe.cookModeJson) ? null : recipe.cookModeJson}
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
	frozenPortions={data.frozenPortions}
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
