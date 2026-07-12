<script lang="ts">
	import { base } from '$app/paths';
	import { invalidateAll } from '$app/navigation';
	import SegmentedTabs from '$lib/components/ui/SegmentedTabs.svelte';
	import SettingsPanelHeader from '$lib/components/settings/SettingsPanelHeader.svelte';
	import { optimistic } from '$lib/optimistic';
	import { toast } from '$lib/stores/toast.svelte';
	import { SORT_OPTIONS, type SortBy } from '$lib/recipe_sort';
	import { untrack } from 'svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	type RecipeLanguage = 'en' | 'nl';
	type OnOff = 'on' | 'off';

	const languageTabs = [
		{ value: 'en', label: 'English' },
		{ value: 'nl', label: 'Dutch' }
	] satisfies { value: RecipeLanguage; label: string }[];

	const onOffTabs = [
		{ value: 'off', label: 'Off' },
		{ value: 'on', label: 'On' }
	] satisfies { value: OnOff; label: string }[];

	let recipeLanguage = $state<RecipeLanguage>(untrack(() => data.recipeLanguage as RecipeLanguage));
	let defaultSort = $state<SortBy>(untrack(() => data.defaultSort as SortBy));
	let recipePrefsSaving = $state(false);
	let autoTranslate = $state<OnOff>(untrack(() => (data.autoTranslateOnImport ? 'on' : 'off')));
	let cookModePregen = $state<OnOff>(untrack(() => (data.cookModePreGeneration ? 'on' : 'off')));
	let recipeTogglesSaving = $state(false);

	async function saveRecipePrefs(patch: { recipeLanguage?: RecipeLanguage; defaultSort?: SortBy }) {
		const previous = { recipeLanguage, defaultSort };
		if (patch.recipeLanguage) recipeLanguage = patch.recipeLanguage;
		if (patch.defaultSort) defaultSort = patch.defaultSort;
		recipePrefsSaving = true;
		const ok = await optimistic(
			() =>
				fetch(`${base}/api/settings/recipe-prefs`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(patch)
				}),
			() => {
				recipeLanguage = previous.recipeLanguage;
				defaultSort = previous.defaultSort;
			},
			'Could not save.'
		);
		recipePrefsSaving = false;
		if (ok) {
			toast.success(patch.recipeLanguage ? 'Saved recipe language' : 'Saved default sort');
			await invalidateAll();
		}
	}

	async function saveRecipeToggles(patch: { autoTranslateOnImport?: boolean; cookModePreGeneration?: boolean }) {
		const previous = { autoTranslate, cookModePregen };
		if (patch.autoTranslateOnImport !== undefined) autoTranslate = patch.autoTranslateOnImport ? 'on' : 'off';
		if (patch.cookModePreGeneration !== undefined) cookModePregen = patch.cookModePreGeneration ? 'on' : 'off';
		recipeTogglesSaving = true;
		const ok = await optimistic(
			() =>
				fetch(`${base}/api/settings/recipe-toggles`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(patch)
				}),
			() => {
				autoTranslate = previous.autoTranslate;
				cookModePregen = previous.cookModePregen;
			},
			'Could not save.'
		);
		recipeTogglesSaving = false;
		if (ok) {
			toast.success(patch.autoTranslateOnImport !== undefined ? 'Saved auto-translate' : 'Saved cook-mode pre-generation');
			await invalidateAll();
		}
	}
</script>

<svelte:head>
	<title>Recipes - Settings</title>
</svelte:head>

<div class="ui-page-shell px-4 pt-4">
	<SettingsPanelHeader title="Recipes" />

	<div class="flex flex-col gap-5">
		<section class="ui-form-card">
			<h2 class="ui-section-label mb-3">Display</h2>
			<div class="flex flex-col gap-4">
				<div>
					<span class="ui-field-label mb-1.5 block" id="recipe-language-label">Recipe language</span>
					<div
						class:pointer-events-none={recipePrefsSaving}
						class:opacity-60={recipePrefsSaving}
						aria-labelledby="recipe-language-label"
					>
						<SegmentedTabs
							tabs={languageTabs}
							value={recipeLanguage}
							onchange={(v) => saveRecipePrefs({ recipeLanguage: v })}
						/>
					</div>
				</div>
				<div class="border-t border-base-300 pt-3">
					<span class="ui-field-label mb-1.5 block" id="default-sort-label">Default sort</span>
					<div
						class:pointer-events-none={recipePrefsSaving}
						class:opacity-60={recipePrefsSaving}
						aria-labelledby="default-sort-label"
					>
						<SegmentedTabs
							tabs={[...SORT_OPTIONS]}
							value={defaultSort}
							onchange={(v) => saveRecipePrefs({ defaultSort: v })}
							cols={2}
						/>
					</div>
				</div>
			</div>
		</section>

		<section class="ui-form-card">
			<h2 class="ui-section-label mb-3">Recipe imports</h2>
			<div class="flex flex-col gap-4">
				<div>
					<span class="ui-field-label mb-1.5 block" id="auto-translate-label">Auto-translate on import</span>
					<div
						class:pointer-events-none={recipeTogglesSaving}
						class:opacity-60={recipeTogglesSaving}
						aria-labelledby="auto-translate-label"
					>
						<SegmentedTabs
							tabs={onOffTabs}
							value={autoTranslate}
							onchange={(v) => saveRecipeToggles({ autoTranslateOnImport: v === 'on' })}
						/>
					</div>
					<p class="mt-1.5 text-xs text-base-content/50">
						Translate new recipes to English right after import instead of waiting for the first
						English view. Counts against the background spend cap.
					</p>
				</div>
				<div class="border-t border-base-300 pt-3">
					<span class="ui-field-label mb-1.5 block" id="cook-mode-pregen-label"
						>Pre-generate Cook Mode on import</span
					>
					<div
						class:pointer-events-none={recipeTogglesSaving}
						class:opacity-60={recipeTogglesSaving}
						aria-labelledby="cook-mode-pregen-label"
					>
						<SegmentedTabs
							tabs={onOffTabs}
							value={cookModePregen}
							onchange={(v) => saveRecipeToggles({ cookModePreGeneration: v === 'on' })}
						/>
					</div>
					<p class="mt-1.5 text-xs text-base-content/50">
						Build the step-by-step Cook Mode sheet right after import instead of on first open.
					</p>
				</div>
			</div>
		</section>
	</div>
</div>
