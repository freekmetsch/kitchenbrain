<!--
	Add-to-stock form. Owns its drafts + the POST; on success the page
	reconciles the new item into its list, closes the form, and drops any filter
	that would hide it (via `onAdded`). Stays mounted with an `open` prop — the
	`{#if}` lives next to the transitioned <form>, and drafts survive a
	cancel/reopen exactly like the previous page-level draft state did.
-->
<script lang="ts">
	import { base } from '$app/paths';
	import { slide } from 'svelte/transition';
	import { m } from '$lib/paraglide/messages';
	import { FOOD_CLASS_ROOTS } from '$lib/food_class';
	import { composeQty, FOOD_CLASS_LABEL } from './shared';
	import type { Item, Kind, Section } from './shared';

	let {
		open,
		onCancel,
		onAdded,
		flashToast
	}: {
		open: boolean;
		onCancel: () => void;
		onAdded: (item: Item & { deletedAt?: unknown }, section: Section, name: string) => void;
		flashToast: (msg: string) => void;
	} = $props();

	// add draft
	let addName = $state('');
	let addQty = $state<number | null>(1);
	let addUnit = $state('');
	let addKind = $state<Kind>('ingredient');
	let addSection = $state<Section>('freezer');
	let addClass = $state('');
	let addStaple = $state(false);
	let addSubmitting = $state(false);

	async function submitAdd(e: SubmitEvent) {
		e.preventDefault();
		if (!addName.trim()) return;
		addSubmitting = true;
		// Leftovers are counted in portions (G2) — default the unit so the row reads
		// "1 portion", not a bare "1".
		const effectiveUnit = addUnit || (addKind === 'leftover' ? 'portion' : '');
		try {
			const res = await fetch(`${base}/api/inventory`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name: addName.trim(),
					section: addSection,
					kind: addKind,
					qty_num: addQty ?? undefined,
					qty_text: addQty !== null ? composeQty(addQty, effectiveUnit || null) : undefined,
					unit: effectiveUnit || undefined,
					food_class: addClass || undefined,
					is_staple: addStaple || undefined
				})
			});
			if (res.ok) {
				const { item } = await res.json();
				const savedName = addName.trim();
				const savedSection = addSection;
				addName = '';
				addQty = 1;
				addUnit = '';
				addClass = '';
				addStaple = false;
				onAdded(item, savedSection, savedName);
			} else {
				flashToast(m.inventory_toast_add_item_failed());
			}
		} finally {
			addSubmitting = false;
		}
	}
</script>

{#if open}
	<form onsubmit={submitAdd} class="ui-form-card mx-4 mt-3" transition:slide={{ duration: 180 }}>
		<div class="grid grid-cols-2 gap-2.5">
			<label class="col-span-2 flex flex-col gap-1">
				<span class="ui-field-label">{m.inventory_addform_name_label()}</span>
				<input class="input input-bordered input-sm w-full" placeholder={m.inventory_addform_name_placeholder()} bind:value={addName} required />
			</label>
			<label class="flex flex-col gap-1">
				<span class="ui-field-label">{m.inventory_addform_kind_label()}</span>
				<select class="select select-bordered select-sm w-full" bind:value={addKind}>
					<option value="leftover">{m.inventory_addform_kind_meal()}</option>
					<option value="ingredient">{m.inventory_addform_kind_ingredient()}</option>
					<option value="processed">{m.inventory_addform_kind_ready_made()}</option>
				</select>
			</label>
			<label class="flex flex-col gap-1">
				<span class="ui-field-label">{m.inventory_addform_section_label()}</span>
				<select class="select select-bordered select-sm w-full" bind:value={addSection}>
					<option value="freezer">{m.inventory_section_freezer()}</option>
					<option value="pantry">{m.inventory_section_pantry()}</option>
				</select>
			</label>
			<label class="flex flex-col gap-1">
				<span class="ui-field-label">{m.inventory_addform_qty_label()}</span>
				<input type="number" inputmode="decimal" min="0" step="any" class="input input-bordered input-sm w-full" bind:value={addQty} />
			</label>
			<label class="flex flex-col gap-1">
				<span class="ui-field-label">{m.inventory_addform_unit_label()}</span>
				<input class="input input-bordered input-sm w-full" placeholder={addKind === 'leftover' ? m.inventory_addform_unit_placeholder_portion() : m.inventory_addform_unit_placeholder_default()} bind:value={addUnit} />
			</label>
			<label class="col-span-2 flex flex-col gap-1">
				<span class="ui-field-label">{m.inventory_addform_class_label()}</span>
				<select class="select select-bordered select-sm w-full" bind:value={addClass}>
					<option value="">—</option>
					{#each FOOD_CLASS_ROOTS as fc (fc)}
						<option value={fc}>{FOOD_CLASS_LABEL[fc] ?? fc}</option>
					{/each}
				</select>
			</label>
			{#if addKind !== 'leftover'}
				<label class="col-span-2 flex cursor-pointer items-center gap-2 pt-0.5">
					<input type="checkbox" class="checkbox checkbox-sm" bind:checked={addStaple} />
					<span class="text-xs text-base-content/70">{m.inventory_addform_staple_label()}</span>
				</label>
			{/if}
		</div>
		<div class="mt-3 flex items-center justify-end gap-1.5">
			<button type="button" class="btn btn-ghost btn-sm h-8 min-h-0" onclick={() => onCancel()}>{m.inventory_addform_cancel_button()}</button>
			<button type="submit" class="btn btn-primary btn-sm h-8 min-h-0 px-4" disabled={addSubmitting || !addName.trim()}>
				{addSubmitting ? m.inventory_addform_saving() : m.inventory_addform_submit_button()}
			</button>
		</div>
	</form>
{/if}
