<!--
	Manual add form — name/qty/unit inputs plus submit. Owns the field drafts
	and the add_manual POST; on success it hands the created row to the page
	via `onAdded` so the page's items state stays the single source of truth.
-->
<script lang="ts">
	import { base } from '$app/paths';
	import Icon from '$lib/components/ui/icons/Icon.svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import type { ShoppingListItem } from './types';

	type Props = {
		weekStart: string;
		onAdded: (item: ShoppingListItem) => void;
	};
	let { weekStart, onAdded }: Props = $props();

	let addName = $state('');
	let addAmount = $state('');
	let addUnit = $state('');
	let addSubmitting = $state(false);

	async function addManual() {
		const name = addName.trim();
		if (!name) return;
		addSubmitting = true;
		const amount = addAmount.trim() || null;
		const unit = addUnit.trim() || null;
		try {
			const r = await fetch(`${base}/api/shopping`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'add_manual',
					weekStart,
					name,
					amount,
					unit
				})
			});
			if (!r.ok) throw new Error(`HTTP ${r.status}`);
			onAdded({ name, amount, unit, bought: false, manual: true, covered: false });
			addName = '';
			addAmount = '';
			addUnit = '';
		} catch {
			toast.error('Could not add the item.');
		} finally {
			addSubmitting = false;
		}
	}
</script>

<section class="ui-form-card mt-4">
	<form
		onsubmit={(e) => {
			e.preventDefault();
			addManual();
		}}
		class="flex items-center gap-2"
	>
		<input
			type="text"
			class="input input-bordered input-sm min-w-0 flex-1"
			placeholder="Add an item..."
			aria-label="Item name"
			autocomplete="off"
			bind:value={addName}
		/>
		<input
			type="text"
			inputmode="decimal"
			class="input input-bordered input-sm w-14"
			placeholder="Qty"
			aria-label="Quantity"
			autocomplete="off"
			bind:value={addAmount}
		/>
		<input
			type="text"
			class="input input-bordered input-sm w-14"
			placeholder="Unit"
			aria-label="Unit"
			autocomplete="off"
			bind:value={addUnit}
		/>
		<button
			type="submit"
			class="btn btn-outline btn-sm btn-square shrink-0"
			disabled={addSubmitting || !addName.trim()}
			aria-label="Add item"
		>
			{#if addSubmitting}
				<span class="loading loading-spinner loading-xs"></span>
			{:else}
				<Icon name="plus" />
			{/if}
		</button>
	</form>
</section>
