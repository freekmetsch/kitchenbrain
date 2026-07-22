<!--
	Manual add form — name/qty/unit inputs plus submit. Owns the field drafts
	and the add_manual POST; on success it hands the created row to the page
	via `onAdded` so the page's items state stays the single source of truth.
-->
<script lang="ts">
	import { base } from '$app/paths';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import Icon from '$lib/components/ui/icons/Icon.svelte';
	import { m } from '$lib/paraglide/messages';
	import { toast } from '$lib/stores/toast.svelte';
	import { tick } from 'svelte';
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
	let open = $state(false);
	let nameInput: HTMLInputElement | null = $state(null);

	async function openForm() {
		open = true;
		await tick();
		nameInput?.focus();
	}

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
			onAdded({
				name,
				amount,
				unit,
				bought: false,
				manual: true,
				manualContribution: true,
				manualAmount: amount,
				manualUnit: unit,
				included: true,
				selectedName: name,
				covered: false
			});
			addName = '';
			addAmount = '';
			addUnit = '';
			open = false;
		} catch {
			toast.error(m.shopping_toast_add_failed());
		} finally {
			addSubmitting = false;
		}
	}
</script>

{#if open}
	<section class="ui-form-card mt-4">
	<form
		onsubmit={(e) => {
			e.preventDefault();
			addManual();
		}}
		class="flex items-center gap-2"
	>
		<input
			bind:this={nameInput}
			type="text"
			class="input input-bordered input-sm min-w-0 flex-1"
			placeholder={m.shopping_additem_name_placeholder()}
			aria-label={m.shopping_additem_name_aria()}
			autocomplete="off"
			bind:value={addName}
		/>
		<input
			type="text"
			inputmode="decimal"
			class="input input-bordered input-sm w-14"
			placeholder={m.shopping_additem_qty_placeholder()}
			aria-label={m.shopping_additem_qty_aria()}
			autocomplete="off"
			bind:value={addAmount}
		/>
		<input
			type="text"
			class="input input-bordered input-sm w-14"
			placeholder={m.shopping_additem_unit_placeholder()}
			aria-label={m.shopping_additem_unit_aria()}
			autocomplete="off"
			bind:value={addUnit}
		/>
		<button
			type="submit"
			class="btn btn-outline btn-sm btn-square shrink-0"
			disabled={addSubmitting || !addName.trim()}
			aria-label={m.shopping_additem_submit_aria()}
		>
			{#if addSubmitting}
				<Spinner size="xs" />
			{:else}
				<Icon name="plus" />
			{/if}
		</button>
		<button
			type="button"
			class="btn btn-ghost btn-sm btn-square shrink-0"
			aria-label={m.ui_bottomsheet_close()}
			onclick={() => (open = false)}
		>
			<Icon name="x" />
		</button>
	</form>
	</section>
{:else}
	<button
		type="button"
		class="mt-4 flex w-full items-center gap-2 rounded-xl border border-dashed border-base-300 px-3 py-2.5 text-left text-sm text-base-content/55 hover:border-primary/40 hover:text-primary"
		aria-expanded="false"
		onclick={openForm}
	>
		<Icon name="plus" class="h-4 w-4" />
		{m.shopping_additem_name_placeholder()}
	</button>
{/if}
