<script lang="ts">
	import { base } from '$app/paths';
	import { invalidateAll } from '$app/navigation';
	import SegmentedTabs from '$lib/components/ui/SegmentedTabs.svelte';
	import SettingsPanelHeader from '$lib/components/settings/SettingsPanelHeader.svelte';
	import { optimistic } from '$lib/optimistic';
	import { m } from '$lib/paraglide/messages';
	import { toast } from '$lib/stores/toast.svelte';
	import { sortOptions, type SortBy } from '$lib/recipe_sort';
	import { untrack } from 'svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	type RecipeLanguage = 'en' | 'nl';
	type OnOff = 'on' | 'off';

	const languageTabs = [
		{ value: 'en', label: m.recipes_edit_language_english() },
		{ value: 'nl', label: m.recipes_edit_language_dutch() }
	] satisfies { value: RecipeLanguage; label: string }[];

	const onOffTabs = [
		{ value: 'off', label: m.settings_common_off() },
		{ value: 'on', label: m.settings_common_on() }
	] satisfies { value: OnOff; label: string }[];

	let recipeLanguage = $state<RecipeLanguage>(untrack(() => data.recipeLanguage as RecipeLanguage));
	let defaultSort = $state<SortBy>(untrack(() => data.defaultSort as SortBy));
	let recipePrefsSaving = $state(false);
	let autoTranslate = $state<OnOff>(untrack(() => (data.autoTranslateOnImport ? 'on' : 'off')));
	let cookModePregen = $state<OnOff>(untrack(() => (data.cookModePreGeneration ? 'on' : 'off')));
	let recipeTogglesSaving = $state(false);
	let normalizationRunning = $state(false);
	let normalizationStatus = $state('');

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
			m.settings_recipes_save_failed()
		);
		recipePrefsSaving = false;
		if (ok) {
			toast.success(patch.recipeLanguage ? m.settings_recipes_saved_language() : m.settings_recipes_saved_sort());
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
			m.settings_recipes_save_failed()
		);
		recipeTogglesSaving = false;
		if (ok) {
			toast.success(patch.autoTranslateOnImport !== undefined ? m.settings_recipes_saved_autotranslate() : m.settings_recipes_saved_cookmode_pregen());
			await invalidateAll();
		}
	}

	async function improveExistingRecipes() {
		if (normalizationRunning) return;
		normalizationRunning = true;
		try {
			let remaining = data.legacyRecipeCount;
			let improved = 0;
			let review = 0;
			while (remaining > 0) {
				const response = await fetch(`${base}/api/settings/recipes/normalize`, { method: 'POST' });
				if (!response.ok) throw new Error(await response.text());
				const result = await response.json() as {
					improved: number;
					needsReview: number;
					remaining: number;
					capReached: boolean;
					processed: number;
				};
				improved += result.improved;
				review += result.needsReview;
				remaining = result.remaining;
				normalizationStatus = m.settings_recipes_normalize_progress({ improved, remaining, review });
				if (result.capReached || result.processed === 0) break;
			}
			toast.success(m.settings_recipes_normalize_done({ improved, review }));
			await invalidateAll();
		} catch {
			toast.error(m.settings_recipes_normalize_failed());
		} finally {
			normalizationRunning = false;
		}
	}
</script>

<svelte:head>
	<title>{m.settings_recipes_title()}</title>
</svelte:head>

<div class="ui-page-shell px-4 pt-4">
	<SettingsPanelHeader title={m.settingsshell_panel_recipes()} />

	<div class="flex flex-col gap-5">
		<section class="ui-form-card">
			<h2 class="ui-section-label mb-3">{m.settingsshell_panel_display()}</h2>
			<div class="flex flex-col gap-4">
				<div>
					<span class="ui-field-label mb-1.5 block" id="recipe-language-label">{m.settings_recipes_language_label()}</span>
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
					<span class="ui-field-label mb-1.5 block" id="default-sort-label">{m.settings_recipes_default_sort_label()}</span>
					<div
						class:pointer-events-none={recipePrefsSaving}
						class:opacity-60={recipePrefsSaving}
						aria-labelledby="default-sort-label"
					>
						<SegmentedTabs
							tabs={sortOptions()}
							value={defaultSort}
							onchange={(v) => saveRecipePrefs({ defaultSort: v })}
							cols={2}
						/>
					</div>
				</div>
			</div>
		</section>

		<section class="ui-form-card">
			<h2 class="ui-section-label mb-3">{m.settings_recipes_imports_heading()}</h2>
			<div class="flex flex-col gap-4">
				<div>
					<span class="ui-field-label mb-1.5 block" id="auto-translate-label">{m.settings_recipes_autotranslate_label()}</span>
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
						{m.settings_recipes_autotranslate_hint()}
					</p>
				</div>
				<div class="border-t border-base-300 pt-3">
					<span class="ui-field-label mb-1.5 block" id="cook-mode-pregen-label"
						>{m.settings_recipes_cookmode_pregen_label()}</span
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
						{m.settings_recipes_cookmode_pregen_hint()}
					</p>
				</div>
			</div>
		</section>

		<section class="ui-form-card">
			<h2 class="ui-section-label mb-2">{m.settings_recipes_normalize_heading()}</h2>
			<p class="text-sm leading-relaxed text-base-content/70">{m.settings_recipes_normalize_hint()}</p>
			<p class="mt-2 text-xs text-base-content/55">
				{m.settings_recipes_normalize_counts({ remaining: data.legacyRecipeCount, review: data.reviewDraftCount })}
			</p>
			<button
				type="button"
				class="btn btn-sm btn-outline mt-3"
				disabled={normalizationRunning || data.legacyRecipeCount === 0}
				onclick={improveExistingRecipes}
			>
				{normalizationRunning ? m.settings_recipes_normalize_running() : m.settings_recipes_normalize_button()}
			</button>
			{#if normalizationStatus}<p class="mt-2 text-xs" role="status">{normalizationStatus}</p>{/if}
		</section>
	</div>
</div>
