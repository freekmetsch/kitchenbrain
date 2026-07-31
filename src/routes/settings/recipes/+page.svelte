<script lang="ts">
	import { base } from '$app/paths';
	import { invalidateAll } from '$app/navigation';
	import SegmentedControl from '$lib/components/ui/SegmentedControl.svelte';
	import SettingsPanelHeader from '$lib/components/settings/SettingsPanelHeader.svelte';
	import { optimistic } from '$lib/optimistic';
	import { m } from '$lib/paraglide/messages';
	import { toast } from '$lib/stores/toast.svelte';
	import { sortOptions, type SortBy } from '$lib/recipe_sort';
	import { untrack } from 'svelte';
	import type { PageData } from './$types';
	import type { RotationSeason } from '$lib/meal_rotation';

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
	let recipeTogglesSaving = $state(false);
	let normalizationRunning = $state(false);
	let normalizationStatus = $state('');
	type SeasonProposal = {
		recipeId: number;
		title: string;
		seasons: RotationSeason[];
		reason: string;
		expectedUpdatedAt: number;
	};
	type SeasonUndo = {
		recipeId: number;
		previousSeasons: RotationSeason[];
		appliedSeasons: RotationSeason[];
		appliedUpdatedAt: number;
	};
	const seasonOptions: Array<{ value: RotationSeason; label: () => string }> = [
		{ value: 'spring', label: m.recipes_rhythm_spring },
		{ value: 'summer', label: m.recipes_rhythm_summer },
		{ value: 'autumn', label: m.recipes_rhythm_autumn },
		{ value: 'winter', label: m.recipes_rhythm_winter }
	];
	let seasonProposals = $state<SeasonProposal[]>([]);
	let seasonUndo = $state<SeasonUndo[]>([]);
	let seasonRunning = $state(false);
	let seasonApplying = $state(false);
	let seasonStatus = $state('');

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

	async function saveRecipeToggles(enabled: boolean) {
		const previous = autoTranslate;
		autoTranslate = enabled ? 'on' : 'off';
		recipeTogglesSaving = true;
		const ok = await optimistic(
			() =>
				fetch(`${base}/api/settings/recipe-toggles`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ autoTranslateOnImport: enabled })
				}),
			() => {
				autoTranslate = previous;
			},
			m.settings_recipes_save_failed()
		);
		recipeTogglesSaving = false;
		if (ok) {
			toast.success(m.settings_recipes_saved_autotranslate());
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

	async function proposeSeasons() {
		if (seasonRunning) return;
		seasonRunning = true;
		seasonStatus = '';
		seasonUndo = [];
		try {
			const response = await fetch(`${base}/api/settings/recipes/rotation-seasons`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'propose' })
			});
			if (response.status === 429) {
				seasonStatus = m.settings_recipes_rotation_cap_reached();
				toast.error(seasonStatus);
				return;
			}
			if (!response.ok) throw new Error();
			const body = (await response.json()) as { proposals: SeasonProposal[] };
			seasonProposals = body.proposals;
			if (seasonProposals.length === 0) seasonStatus = m.settings_recipes_rotation_none();
		} catch {
			seasonStatus = m.settings_recipes_rotation_failed();
			toast.error(seasonStatus);
		} finally {
			seasonRunning = false;
		}
	}

	function toggleProposalSeason(recipeId: number, season: RotationSeason) {
		seasonProposals = seasonProposals.map((proposal) =>
			proposal.recipeId !== recipeId
				? proposal
				: {
						...proposal,
						seasons: proposal.seasons.includes(season)
							? proposal.seasons.filter((value) => value !== season)
							: [...proposal.seasons, season]
					}
		);
	}

	async function applySeasons() {
		const items = seasonProposals
			.filter((proposal) => proposal.seasons.length > 0)
			.map(({ recipeId, seasons, expectedUpdatedAt }) => ({ recipeId, seasons, expectedUpdatedAt }));
		if (seasonApplying || items.length === 0) return;
		seasonApplying = true;
		try {
			const response = await fetch(`${base}/api/settings/recipes/rotation-seasons`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'apply', items })
			});
			if (response.status === 409) {
				seasonStatus = m.settings_recipes_rotation_stale();
				return;
			}
			if (response.status === 429) {
				seasonStatus = m.settings_recipes_rotation_cap_reached();
				toast.error(seasonStatus);
				return;
			}
			if (!response.ok) throw new Error();
			const body = (await response.json()) as { applied: number; undo: SeasonUndo[] };
			seasonUndo = body.undo;
			seasonProposals = [];
			seasonStatus = m.settings_recipes_rotation_applied({ count: body.applied });
			toast.success(seasonStatus);
			await invalidateAll();
		} catch {
			seasonStatus = m.settings_recipes_rotation_failed();
			toast.error(seasonStatus);
		} finally {
			seasonApplying = false;
		}
	}

	async function undoSeasons() {
		if (seasonApplying || seasonUndo.length === 0) return;
		seasonApplying = true;
		try {
			const response = await fetch(`${base}/api/settings/recipes/rotation-seasons`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'undo', items: seasonUndo })
			});
			if (response.status === 409) {
				seasonStatus = m.settings_recipes_rotation_stale();
				return;
			}
			if (!response.ok) throw new Error();
			seasonUndo = [];
			seasonStatus = m.settings_recipes_rotation_undone();
			toast.success(seasonStatus);
			await invalidateAll();
		} catch {
			seasonStatus = m.settings_recipes_rotation_undo_failed();
			toast.error(seasonStatus);
		} finally {
			seasonApplying = false;
		}
	}
</script>

<svelte:head>
	<title>{m.settings_recipes_title()}</title>
</svelte:head>

<div class="settings-panel-page ui-grove-page ui-grove-surface ui-page-shell px-4 pt-4">
	<SettingsPanelHeader title={m.settingsshell_panel_recipes()} />

	<div class="flex flex-col gap-5">
		<section class="ui-form-card">
			<h2 class="ui-section-title mb-3">{m.settingsshell_panel_display()}</h2>
			<div class="flex flex-col gap-4">
				<div>
					<span class="ui-field-label mb-1.5 block" id="recipe-language-label">{m.settings_recipes_language_label()}</span>
					<div
						class:pointer-events-none={recipePrefsSaving}
						class:opacity-60={recipePrefsSaving}
						aria-labelledby="recipe-language-label"
					>
						<SegmentedControl
							options={languageTabs}
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
						<SegmentedControl
							options={sortOptions()}
							value={defaultSort}
							onchange={(v) => saveRecipePrefs({ defaultSort: v })}
							cols={2}
						/>
					</div>
				</div>
			</div>
		</section>

		<section class="ui-form-card">
			<h2 class="ui-section-title mb-3">{m.settings_recipes_imports_heading()}</h2>
			<div class="flex flex-col gap-4">
				<div>
					<span class="ui-field-label mb-1.5 block" id="auto-translate-label">{m.settings_recipes_autotranslate_label()}</span>
					<div
						class:pointer-events-none={recipeTogglesSaving}
						class:opacity-60={recipeTogglesSaving}
						aria-labelledby="auto-translate-label"
					>
						<SegmentedControl
							options={onOffTabs}
							value={autoTranslate}
							onchange={(v) => saveRecipeToggles(v === 'on')}
						/>
					</div>
					<p class="mt-1.5 text-xs text-base-content/50">
						{m.settings_recipes_autotranslate_hint()}
					</p>
				</div>
			</div>
		</section>

		<section class="ui-form-card">
			<h2 class="ui-section-title mb-2">{m.settings_recipes_rotation_heading()}</h2>
			<p class="text-sm leading-relaxed text-base-content/70">{m.settings_recipes_rotation_hint()}</p>
			<button
				type="button"
				class="ui-action ui-action-secondary mt-3"
				disabled={seasonRunning || seasonApplying}
				onclick={proposeSeasons}
			>
				{seasonRunning ? m.settings_recipes_rotation_running() : m.settings_recipes_rotation_button()}
			</button>

			{#if seasonProposals.length > 0}
				<div class="mt-4 space-y-2">
					{#each seasonProposals as proposal (proposal.recipeId)}
						<article class="rounded-xl border border-base-300 bg-base-100 p-3">
							<div class="flex items-start justify-between gap-3">
								<div class="min-w-0">
									<h3 class="font-semibold">{proposal.title}</h3>
									<p class="text-xs text-base-content/60">{proposal.reason}</p>
								</div>
								<button
									type="button"
									class="ui-action ui-action-tertiary"
									onclick={() => (seasonProposals = seasonProposals.filter((item) => item.recipeId !== proposal.recipeId))}
								>{m.settings_recipes_rotation_remove()}</button
								>
							</div>
							<div class="mt-3 grid grid-cols-2 gap-2">
								{#each seasonOptions as season}
									<label class="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-base-300 px-3">
										<input
											type="checkbox"
											class="checkbox checkbox-sm"
											checked={proposal.seasons.includes(season.value)}
											onchange={() => toggleProposalSeason(proposal.recipeId, season.value)}
										/>
										<span class="text-sm">{season.label()}</span>
									</label>
								{/each}
							</div>
						</article>
					{/each}
				</div>
				<button
					type="button"
					class="ui-action ui-action-primary mt-3"
					disabled={seasonApplying || !seasonProposals.some((proposal) => proposal.seasons.length > 0)}
					onclick={applySeasons}
				>{m.settings_recipes_rotation_apply()}</button
				>
			{/if}
			{#if seasonUndo.length > 0}
				<button type="button" class="ui-action ui-action-tertiary mt-3" disabled={seasonApplying} onclick={undoSeasons}>
					{m.settings_recipes_rotation_undo()}
				</button>
			{/if}
			{#if seasonStatus}<p class="mt-2 text-xs" role="status">{seasonStatus}</p>{/if}
		</section>

		<section class="ui-form-card">
			<h2 class="ui-section-title mb-2">{m.settings_recipes_normalize_heading()}</h2>
			<p class="text-sm leading-relaxed text-base-content/70">{m.settings_recipes_normalize_hint()}</p>
			<p class="mt-2 text-xs text-base-content/55">
				{m.settings_recipes_normalize_counts({ remaining: data.legacyRecipeCount, review: data.reviewDraftCount })}
			</p>
			<button
				type="button"
				class="ui-action ui-action-secondary mt-3"
				disabled={normalizationRunning || data.legacyRecipeCount === 0}
				onclick={improveExistingRecipes}
			>
				{normalizationRunning ? m.settings_recipes_normalize_running() : m.settings_recipes_normalize_button()}
			</button>
			{#if normalizationStatus}<p class="mt-2 text-xs" role="status">{normalizationStatus}</p>{/if}
		</section>
	</div>
</div>
