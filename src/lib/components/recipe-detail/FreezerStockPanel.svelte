<script lang="ts">
	import { base } from '$app/paths';
	import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
	import Icon from '$lib/components/ui/icons/Icon.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import {
		parseRecipeRhythmResponse,
		recipeRhythmPayload,
		type RecipeRhythmState
	} from '$lib/recipe_rhythm';
	import type { RotationPolicy, RotationSeason } from '$lib/meal_rotation';
	import { m } from '$lib/paraglide/messages';
	import type { Recipe } from './types';

	let { recipe, frozenPortions, onSaved }: {
		recipe: Recipe;
		frozenPortions: number;
		onSaved: (state: RecipeRhythmState) => void;
	} = $props();

	let editorOpen = $state(false);
	let draftPolicy = $state<RotationPolicy | null>(null);
	let draftSeasons = $state<RotationSeason[]>([]);
	let draftKeepStocked = $state(false);
	let draftTarget = $state(2);
	let saving = $state(false);
	let saveError = $state('');
	let unsaved = $state(false);

	let target = $derived(recipe.targetPortions ?? recipe.servings ?? 2);
	let portionsShort = $derived(Math.max(0, target - frozenPortions));
	let seasonRequired = $derived(draftPolicy === 'seasonal' && draftSeasons.length === 0);

	const policyOptions: Array<{ value: RotationPolicy | null; label: () => string }> = [
		{ value: null, label: m.recipes_rhythm_unconfigured_option },
		{ value: 'never', label: m.recipes_rhythm_never_option },
		{ value: 'weekly', label: m.recipes_rhythm_weekly_option },
		{ value: 'fortnightly', label: m.recipes_rhythm_fortnightly_option },
		{ value: 'monthly', label: m.recipes_rhythm_monthly_option },
		{ value: 'seasonal', label: m.recipes_rhythm_seasonal_option },
		{ value: 'special', label: m.recipes_rhythm_special_option }
	];
	const seasonOptions: Array<{ value: RotationSeason; label: () => string }> = [
		{ value: 'spring', label: m.recipes_rhythm_spring },
		{ value: 'summer', label: m.recipes_rhythm_summer },
		{ value: 'autumn', label: m.recipes_rhythm_autumn },
		{ value: 'winter', label: m.recipes_rhythm_winter }
	];

	function rhythmSummary(policy: RotationPolicy | null): string {
		if (policy === 'never') return m.recipes_rhythm_summary_never();
		if (policy === 'weekly') return m.recipes_rhythm_summary_weekly();
		if (policy === 'fortnightly') return m.recipes_rhythm_summary_fortnightly();
		if (policy === 'monthly') return m.recipes_rhythm_summary_monthly();
		if (policy === 'seasonal') return m.recipes_rhythm_summary_seasonal();
		if (policy === 'special') return m.recipes_rhythm_summary_special();
		return m.recipes_rhythm_summary_unconfigured();
	}

	function openEditor() {
		draftPolicy = recipe.rotationPolicy;
		draftSeasons = [...recipe.rotationSeasonsJson];
		draftKeepStocked = recipe.isFreezerStaple;
		draftTarget = Math.max(1, Math.min(99, Math.round(target)));
		saveError = '';
		unsaved = false;
		editorOpen = true;
	}

	function markChanged() {
		unsaved = true;
		saveError = '';
	}

	function setPolicy(value: string) {
		draftPolicy = value === '' ? null : (value as RotationPolicy);
		if (draftPolicy === null || draftPolicy === 'never' || draftPolicy === 'special') {
			draftSeasons = [];
		}
		markChanged();
	}

	function toggleSeason(season: RotationSeason) {
		draftSeasons = draftSeasons.includes(season)
			? draftSeasons.filter((value) => value !== season)
			: [...draftSeasons, season];
		markChanged();
	}

	function stepTarget(delta: number) {
		draftTarget = Math.max(1, Math.min(99, draftTarget + delta));
		markChanged();
	}

	async function saveRhythm() {
		if (saving || seasonRequired) return;
		saving = true;
		saveError = '';
		try {
			const res = await fetch(`${base}/api/recipes/${recipe.slug}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(recipeRhythmPayload(draftPolicy, draftSeasons, draftKeepStocked, draftTarget))
			});
			const body = await res.json().catch(() => null);
			if (!res.ok) {
				saveError = body?.message ?? m.recipes_freezer_toast_save_failed({ status: res.status });
				return;
			}
			const canonical = parseRecipeRhythmResponse(body);
			if (!canonical) {
				saveError = m.recipes_freezer_invalid_response();
				return;
			}
			onSaved(canonical);
			unsaved = false;
			editorOpen = false;
		} catch {
			saveError = m.recipes_toast_connection_failed();
		} finally {
			saving = false;
		}
	}
</script>

<section class="h-full">
	<button
		type="button"
		class="flex min-h-full w-full min-w-0 items-center gap-2 rounded-2xl border border-base-200 bg-base-100 p-2 text-left transition-colors hover:bg-base-200/50 md:gap-3 md:p-3"
		aria-label={m.recipes_rhythm_open_editor_aria()}
		onclick={openEditor}
	>
		<span class="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-info/10 text-info md:h-9 md:w-9">
			<Icon name="snowflake" class="h-3.5 w-3.5 md:h-4 md:w-4" />
		</span>
		<span class="min-w-0 flex-1">
			<span class="block text-sm font-medium">{rhythmSummary(recipe.rotationPolicy)}</span>
			<span class="mt-0.5 block text-xs {recipe.isFreezerStaple && portionsShort > 0 ? 'text-warning' : 'text-base-content/55'}">
				{recipe.isFreezerStaple
					? m.recipes_freezer_portions_of_target({ frozen: frozenPortions, target })
					: m.recipes_freezer_set_target()}
			</span>
		</span>
		<Icon name="chevronRight" class="h-4 w-4 shrink-0 text-base-content/35" />
	</button>
</section>

<BottomSheet bind:open={editorOpen} title={m.recipes_rhythm_editor_title()} desktopCentered>
	<form class="space-y-5" onsubmit={(event) => { event.preventDefault(); void saveRhythm(); }}>
		<fieldset class="space-y-3" disabled={saving}>
			<label class="form-control gap-1">
				<span class="text-sm font-semibold">{m.recipes_rhythm_cadence_label()}</span>
				<select class="ui-field" value={draftPolicy ?? ''} onchange={(event) => setPolicy(event.currentTarget.value)}>
					{#each policyOptions as option}<option value={option.value ?? ''}>{option.label()}</option>{/each}
				</select>
			</label>
			{#if draftPolicy !== null && draftPolicy !== 'never' && draftPolicy !== 'special'}
				<fieldset>
					<legend class="mb-2 text-sm font-semibold">{m.recipes_rhythm_seasons_label()}</legend>
					<div class="grid grid-cols-2 gap-2">
						{#each seasonOptions as season}
							<label class="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-base-300 px-3">
								<input
									type="checkbox"
									class="checkbox checkbox-sm"
									checked={draftSeasons.includes(season.value)}
									aria-describedby={seasonRequired ? 'recipe-rhythm-season-error' : undefined}
									onchange={() => toggleSeason(season.value)}
								/>
								<span class="text-sm">{season.label()}</span>
							</label>
						{/each}
					</div>
					{#if seasonRequired}<p id="recipe-rhythm-season-error" class="mt-2 text-sm text-error" role="alert">{m.recipes_rhythm_season_required()}</p>{/if}
				</fieldset>
			{/if}
		</fieldset>

		<fieldset class="space-y-3 border-t border-base-300 pt-4" disabled={saving}>
			<div class="rounded-xl bg-base-200/60 px-3 py-2 text-sm">
				<span class="text-base-content/60">{m.recipes_freezer_current_stock()}</span>
				<span class="ml-2 font-semibold tabular-nums">{m.recipes_freezer_portions_plural_in_freezer({ count: frozenPortions })}</span>
			</div>
			<label class="flex min-h-11 cursor-pointer items-center justify-between gap-3">
				<span class="text-sm font-medium">{m.recipes_freezer_keep_stocked_label()}</span>
				<input type="checkbox" class="toggle toggle-primary" checked={draftKeepStocked} onchange={(event) => { draftKeepStocked = event.currentTarget.checked; markChanged(); }} />
			</label>
			<div class="flex items-center justify-between gap-3 rounded-xl border border-base-300 px-3 py-2">
				<span class="text-sm text-base-content/70">{m.recipes_freezer_target_portions_label()}</span>
				<div class="flex items-center gap-1">
					<button type="button" class="btn btn-ghost h-11 min-h-11 w-11 p-0" aria-label={m.recipes_freezer_decrease_target_aria()} disabled={!draftKeepStocked || draftTarget <= 1} onclick={() => stepTarget(-1)}><Icon name="minus" class="h-4 w-4" /></button>
					<span class="w-10 text-center text-base font-semibold tabular-nums">{draftTarget}</span>
					<button type="button" class="btn btn-ghost h-11 min-h-11 w-11 p-0" aria-label={m.recipes_freezer_increase_target_aria()} disabled={!draftKeepStocked || draftTarget >= 99} onclick={() => stepTarget(1)}><Icon name="plus" class="h-4 w-4" /></button>
				</div>
			</div>
		</fieldset>

		{#if saveError}<p class="text-sm text-error" role="alert">{saveError}</p>{:else if unsaved}<p class="text-xs text-base-content/55">{m.recipes_freezer_unsaved()}</p>{/if}
		<div class="flex justify-end gap-2 pt-1">
			<button type="button" class="ui-action ui-action-tertiary" disabled={saving} onclick={() => (editorOpen = false)}>{m.recipes_freezer_cancel_button()}</button>
			<button type="submit" class="ui-action ui-action-primary" disabled={saving || seasonRequired}>{#if saving}<Spinner size="xs" />{/if}{m.recipes_rhythm_save_button()}</button>
		</div>
	</form>
</BottomSheet>
