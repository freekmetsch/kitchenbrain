<!--
	In-place row editor (V3 dense-row design): field grid, keep-stocked toggle
	for linked meals (patches the RECIPE — UX-STOCK-6/14), remove/cancel/save
	actions, recipe-coverage list and per-item history. The page owns the draft
	(single open editor at a time) and all writes. The `{#if editing}` lives
	here, next to the transitioned element, so the open/close slide keeps its
	original block-local semantics.
-->
<script lang="ts">
	import { base } from '$app/paths';
	import { slide } from 'svelte/transition';
	import { m } from '$lib/paraglide/messages';
	import { FOOD_CLASS_ROOTS } from '$lib/food_class';
	import HistoryList from './HistoryList.svelte';
	import { foodClassText } from './shared';
	import type { EditDraft, HistoryEvent, RecipeLink, RecipeMatch } from './shared';
	import { MOTION_CONTENT_MS } from '$lib/motion';

	let {
		editing,
		link,
		matches,
		history,
		draft = $bindable(),
		saving,
		onDelete,
		onCancel,
		onSave,
		onUndoEvent
	}: {
		editing: boolean;
		link: RecipeLink | null;
		matches: RecipeMatch[];
		history: HistoryEvent[] | undefined;
		draft: EditDraft;
		saving: boolean;
		onDelete: () => void;
		onCancel: () => void;
		onSave: () => void;
		onUndoEvent: (ev: HistoryEvent) => void;
	} = $props();
</script>

{#if editing}
	<!-- Content-motion slide keeps the open/close legible; the global
	     prefers-reduced-motion guard in app.css neutralizes it. -->
	<div transition:slide={{ duration: MOTION_CONTENT_MS }} class="mt-2.5 rounded-xl border border-base-300/70 bg-base-200/40 p-3">
		<div class="grid grid-cols-2 gap-2.5">
			<label class="col-span-2 flex flex-col gap-1">
				<span class="ui-field-label">{m.inventory_editor_name_label()}</span>
				<input class="input input-bordered input-sm w-full" bind:value={draft.name} />
			</label>
			<label class="flex flex-col gap-1">
				<span class="ui-field-label">{m.inventory_editor_qty_label()}</span>
				<input type="number" inputmode="decimal" min="0" step="any" class="input input-bordered input-sm w-full" bind:value={draft.qty} />
			</label>
			<label class="flex flex-col gap-1">
				<span class="ui-field-label">{m.inventory_editor_unit_label()}</span>
				<input class="input input-bordered input-sm w-full" placeholder={m.inventory_editor_unit_placeholder()} bind:value={draft.unit} />
			</label>
			<label class="flex flex-col gap-1">
				<span class="ui-field-label">{m.inventory_editor_kind_label()}</span>
				<select class="select select-bordered select-sm w-full" bind:value={draft.kind}>
					<option value="">—</option>
					<option value="leftover">{m.inventory_editor_kind_leftover()}</option>
					<option value="ingredient">{m.inventory_editor_kind_ingredient()}</option>
					<option value="processed">{m.inventory_editor_kind_ready_made()}</option>
				</select>
			</label>
			<label class="flex flex-col gap-1">
				<span class="ui-field-label">{m.inventory_editor_section_label()}</span>
				<select class="select select-bordered select-sm w-full" bind:value={draft.section}>
					<option value="freezer">{m.inventory_section_freezer()}</option>
					<option value="pantry">{m.inventory_section_pantry()}</option>
				</select>
			</label>
			<label class="flex flex-col gap-1">
				<span class="ui-field-label">{m.inventory_editor_class_label()}</span>
				<select class="select select-bordered select-sm w-full" bind:value={draft.foodClass}>
					{#if draft.foodClass && !FOOD_CLASS_ROOTS.includes(draft.foodClass as (typeof FOOD_CLASS_ROOTS)[number])}
						<option value={draft.foodClass}>{foodClassText(draft.foodClass)}</option>
					{/if}
					<option value="">—</option>
					{#each FOOD_CLASS_ROOTS as fc (fc)}
						<option value={fc}>{foodClassText(fc)}</option>
					{/each}
				</select>
			</label>
			<label class="flex flex-col gap-1">
				<span class="ui-field-label">{m.inventory_editor_expiry_label()}</span>
				<input type="date" class="input input-bordered input-sm w-full" bind:value={draft.expiry} />
			</label>
			{#if draft.kind === 'leftover'}
				{#if link}
					<!-- Same control as the recipe page: patches the recipe; off
					     records the opt-out (UX-STOCK-6/14 — one toggle, one word). -->
					<div class="col-span-2 flex min-h-8 items-center justify-between gap-2 pt-0.5">
						<label class="flex cursor-pointer items-center gap-2">
							<input type="checkbox" class="toggle toggle-sm toggle-primary" bind:checked={draft.keepStocked} />
							<span class="text-xs text-base-content/70">{m.inventory_editor_keep_stocked_label()}</span>
						</label>
						{#if draft.keepStocked}
							<label class="flex items-center gap-1.5 text-xs text-base-content/70">
								{m.inventory_editor_target_prefix()}
								<input type="number" min="1" inputmode="numeric" class="input input-bordered input-sm w-16" bind:value={draft.target} />
								{m.inventory_editor_target_suffix()}
							</label>
						{/if}
					</div>
				{/if}
			{:else}
				<label class="col-span-2 flex cursor-pointer items-center gap-2 pt-0.5">
					<input type="checkbox" class="checkbox checkbox-sm" bind:checked={draft.staple} />
					<span class="text-xs text-base-content/70">{m.inventory_editor_staple_label()}</span>
				</label>
			{/if}
		</div>

		<div class="mt-3 flex items-center justify-between">
			<button type="button" class="btn btn-ghost btn-sm h-8 min-h-0 px-2.5 text-error" onclick={() => onDelete()}>{m.inventory_action_remove()}</button>
			<div class="flex items-center gap-1.5">
				<button type="button" class="btn btn-ghost btn-sm h-8 min-h-0" onclick={() => onCancel()}>{m.inventory_addform_cancel_button()}</button>
				<button type="button" class="btn btn-primary btn-sm h-8 min-h-0 px-4" disabled={saving || !draft.name.trim()} onclick={() => onSave()}>
					{saving ? m.inventory_addform_saving() : m.inventory_editor_save_button()}
				</button>
			</div>
		</div>

		{#if matches.length > 0}
			<div class="mt-3 border-t border-base-300/70 pt-3">
				<p class="mb-1.5 ui-section-label">
					{matches.length === 1 ? m.inventory_editor_used_in_singular({ count: matches.length }) : m.inventory_editor_used_in_plural({ count: matches.length })}
				</p>
				<ul class="space-y-1">
					{#each matches as m (m.slug)}
						<a href="{base}/recipes/{m.slug}" class="flex items-center justify-between gap-2 rounded-lg bg-base-100 px-2 py-1.5 text-sm hover:bg-base-200">
							<span class="truncate">{m.title}</span>
							<span class="ui-chip-muted shrink-0 tabular-nums">{m.coverage}/{m.total}</span>
						</a>
					{/each}
				</ul>
			</div>
		{/if}

		{#if history?.length}
			<div class="mt-3 border-t border-base-300/70 pt-3">
				<p class="mb-1.5 ui-section-label">{m.inventory_editor_history_label()}</p>
				<HistoryList events={history} showName={false} onUndo={onUndoEvent} />
			</div>
		{/if}
	</div>
{/if}
