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
				flashToast('Could not add item');
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
				<span class="ui-field-label">Name</span>
				<input class="input input-bordered input-sm w-full" placeholder="e.g. Spinazie" bind:value={addName} required />
			</label>
			<label class="flex flex-col gap-1">
				<span class="ui-field-label">Kind</span>
				<select class="select select-bordered select-sm w-full" bind:value={addKind}>
					<option value="leftover">Meal</option>
					<option value="ingredient">Ingredient</option>
					<option value="processed">Ready-made</option>
				</select>
			</label>
			<label class="flex flex-col gap-1">
				<span class="ui-field-label">Section</span>
				<select class="select select-bordered select-sm w-full" bind:value={addSection}>
					<option value="freezer">Freezer</option>
					<option value="pantry">Pantry</option>
				</select>
			</label>
			<label class="flex flex-col gap-1">
				<span class="ui-field-label">Quantity</span>
				<input type="number" inputmode="decimal" min="0" step="any" class="input input-bordered input-sm w-full" bind:value={addQty} />
			</label>
			<label class="flex flex-col gap-1">
				<span class="ui-field-label">Unit</span>
				<input class="input input-bordered input-sm w-full" placeholder={addKind === 'leftover' ? 'portion' : 'g · ml · stuk'} bind:value={addUnit} />
			</label>
			<label class="col-span-2 flex flex-col gap-1">
				<span class="ui-field-label">Food class</span>
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
					<span class="text-xs text-base-content/70">Keep on hand — suggest when out</span>
				</label>
			{/if}
		</div>
		<div class="mt-3 flex items-center justify-end gap-1.5">
			<button type="button" class="btn btn-ghost btn-sm h-8 min-h-0" onclick={() => onCancel()}>Cancel</button>
			<button type="submit" class="btn btn-primary btn-sm h-8 min-h-0 px-4" disabled={addSubmitting || !addName.trim()}>
				{addSubmitting ? 'Saving…' : 'Add to stock'}
			</button>
		</div>
	</form>
{/if}
