<!-- Compact freezer status with one deliberate, canonical save in a focused editor. -->
<script lang="ts">
	import { base } from '$app/paths';
	import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
	import Icon from '$lib/components/ui/icons/Icon.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import { freezerTargetPayload, parseFreezerTargetResponse, type FreezerTargetState } from '$lib/freezer_target';
	import { m } from '$lib/paraglide/messages';
	import type { Recipe } from './types';

	let {
		recipe,
		frozenPortions,
		onSaved
	}: {
		recipe: Recipe;
		frozenPortions: number;
		onSaved: (state: FreezerTargetState) => void;
	} = $props();

	let editorOpen = $state(false);
	let draftKeepStocked = $state(false);
	let draftTarget = $state(2);
	let saving = $state(false);
	let saveError = $state('');
	let unsaved = $state(false);

	let target = $derived(recipe.targetPortions ?? recipe.servings ?? 2);
	let portionsShort = $derived(Math.max(0, target - frozenPortions));

	function openEditor() {
		draftKeepStocked = recipe.isFreezerStaple;
		draftTarget = Math.max(1, Math.min(99, Math.round(target)));
		saveError = '';
		unsaved = false;
		editorOpen = true;
	}

	function updateKeepStocked(checked: boolean) {
		draftKeepStocked = checked;
		unsaved = true;
		saveError = '';
	}

	function stepTarget(delta: number) {
		draftTarget = Math.max(1, Math.min(99, draftTarget + delta));
		unsaved = true;
		saveError = '';
	}

	async function saveTarget() {
		if (saving) return;
		saving = true;
		saveError = '';
		try {
			const res = await fetch(`${base}/api/recipes/${recipe.slug}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(freezerTargetPayload(draftKeepStocked, draftTarget))
			});
			const body = await res.json().catch(() => null);
			if (!res.ok) {
				saveError = body?.message ?? m.recipes_freezer_toast_save_failed({ status: res.status });
				unsaved = true;
				return;
			}
			const canonical = parseFreezerTargetResponse(body);
			if (!canonical) {
				saveError = m.recipes_freezer_invalid_response();
				unsaved = true;
				return;
			}
			onSaved(canonical);
			unsaved = false;
			editorOpen = false;
		} catch {
			saveError = m.recipes_toast_connection_failed();
			unsaved = true;
		} finally {
			saving = false;
		}
	}
</script>

<section class="h-full">
	<button
		type="button"
		class="flex min-h-full w-full min-w-0 items-center gap-2 rounded-2xl border border-base-200 bg-base-100 p-2 text-left transition-colors hover:bg-base-200/50 md:gap-3 md:p-3"
		aria-label={m.recipes_freezer_open_editor_aria()}
		onclick={openEditor}
	>
		<span class="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-info/10 text-info md:h-9 md:w-9">
			<Icon name="snowflake" class="h-3.5 w-3.5 md:h-4 md:w-4" />
		</span>
		<span class="min-w-0 flex-1">
			<span class="block text-sm font-medium">
				{#if recipe.isFreezerStaple}
					{m.recipes_freezer_portions_of_target({ frozen: frozenPortions, target })}
				{:else}
					{frozenPortions === 1
						? m.recipes_freezer_portion_singular_in_freezer({ count: frozenPortions })
						: m.recipes_freezer_portions_plural_in_freezer({ count: frozenPortions })}
				{/if}
			</span>
			<span class="mt-0.5 block text-xs {recipe.isFreezerStaple && portionsShort > 0 ? 'text-warning' : 'text-base-content/55'}">
				{#if !recipe.isFreezerStaple}
					{m.recipes_freezer_set_target()}
				{:else if portionsShort > 0}
					{m.recipes_freezer_portions_short({ count: portionsShort })}
				{:else}
					{m.recipes_freezer_target_met()}
				{/if}
			</span>
		</span>
		<Icon name="chevronRight" class="h-4 w-4 shrink-0 text-base-content/35" />
	</button>
</section>

<BottomSheet bind:open={editorOpen} title={m.recipes_freezer_editor_title()} desktopCentered>
	<form
		class="space-y-4"
		onsubmit={(event) => {
			event.preventDefault();
			void saveTarget();
		}}
	>
		<div class="rounded-xl bg-base-200/60 px-3 py-2 text-sm">
			<span class="text-base-content/60">{m.recipes_freezer_current_stock()}</span>
			<span class="ml-2 font-semibold tabular-nums">
				{frozenPortions === 1
					? m.recipes_freezer_portion_singular_in_freezer({ count: frozenPortions })
					: m.recipes_freezer_portions_plural_in_freezer({ count: frozenPortions })}
			</span>
		</div>

		<label class="flex min-h-11 cursor-pointer items-center justify-between gap-3">
			<span class="text-sm font-medium">{m.recipes_freezer_keep_stocked_label()}</span>
			<input
				type="checkbox"
				class="toggle toggle-primary"
				checked={draftKeepStocked}
				disabled={saving}
				onchange={(event) => updateKeepStocked((event.currentTarget as HTMLInputElement).checked)}
			/>
		</label>

		<div class="flex items-center justify-between gap-3 rounded-xl border border-base-300 px-3 py-2">
			<span class="text-sm text-base-content/70">{m.recipes_freezer_target_portions_label()}</span>
			<div class="flex items-center gap-1">
				<button
					type="button"
					class="btn btn-ghost h-11 min-h-11 w-11 p-0"
					aria-label={m.recipes_freezer_decrease_target_aria()}
					disabled={saving || !draftKeepStocked || draftTarget <= 1}
					onclick={() => stepTarget(-1)}><Icon name="minus" class="h-4 w-4" /></button
				>
				<span class="w-10 text-center text-base font-semibold tabular-nums">{draftTarget}</span>
				<button
					type="button"
					class="btn btn-ghost h-11 min-h-11 w-11 p-0"
					aria-label={m.recipes_freezer_increase_target_aria()}
					disabled={saving || !draftKeepStocked || draftTarget >= 99}
					onclick={() => stepTarget(1)}><Icon name="plus" class="h-4 w-4" /></button
				>
			</div>
		</div>

		{#if saveError}
			<p class="text-sm text-error" role="alert">{saveError}</p>
		{:else if unsaved}
			<p class="text-xs text-base-content/55">{m.recipes_freezer_unsaved()}</p>
		{/if}

		<div class="flex justify-end gap-2 pt-1">
			<button type="button" class="btn btn-ghost" disabled={saving} onclick={() => (editorOpen = false)}>
				{m.recipes_freezer_cancel_button()}
			</button>
			<button type="submit" class="btn btn-primary" disabled={saving}>
				{#if saving}<Spinner size="xs" />{/if}
				{m.recipes_freezer_save_target_button()}
			</button>
		</div>
	</form>
</BottomSheet>
