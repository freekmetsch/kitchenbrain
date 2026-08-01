<!--
	Source-owned one-off item form. The Shopping page opens it from the fixed
	action dock; drafts stay in this component and survive a failed write.
-->
<script lang="ts">
	import { base } from '$app/paths';
	import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import { m } from '$lib/paraglide/messages';
	import { toast } from '$lib/stores/toast.svelte';
	import { tick } from 'svelte';
	import type { ShoppingListItem } from './types';

	type Props = {
		weekStart: string;
		onAdded: (item: ShoppingListItem) => void | Promise<void>;
		onManageWeekly: () => void | Promise<void>;
		open?: boolean;
	};

	let { weekStart, onAdded, onManageWeekly, open = $bindable(false) }: Props = $props();
	let addName = $state('');
	let addAmount = $state('');
	let addUnit = $state('');
	let addSubmitting = $state(false);
	let addError = $state('');
	let nameInput = $state<HTMLInputElement | null>(null);
	let weeklyHandoffAfterClose = $state(false);

	export async function openAddModal() {
		addError = '';
		open = true;
		await tick();
		nameInput?.focus();
	}

	async function addManual() {
		const name = addName.trim();
		if (!name || addSubmitting) return;
		addSubmitting = true;
		addError = '';
		const amount = addAmount.trim() || null;
		const unit = addUnit.trim() || null;
		try {
			const response = await fetch(`${base}/api/shopping`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'add_source_manual', weekStart, name, amount, unit })
			});
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			await onAdded({
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
			addError = m.shopping_toast_add_failed();
			toast.error(addError);
		} finally {
			addSubmitting = false;
		}
	}

	function handoffToWeeklyItems() {
		weeklyHandoffAfterClose = true;
		open = false;
	}

	function handleClose() {
		if (!weeklyHandoffAfterClose) return;
		queueMicrotask(() => {
			weeklyHandoffAfterClose = false;
			void onManageWeekly();
		});
	}
</script>

<BottomSheet
	bind:open
	title={m.shopping_add_one_off_title()}
	desktopSide
	restoreFocus={!weeklyHandoffAfterClose}
	onclose={handleClose}
>
	<p class="mb-4 text-sm text-base-content/70">{m.shopping_add_one_off_help()}</p>
	<button
		type="button"
		class="manage-weekly-link ui-action ui-action-tertiary"
		onclick={handoffToWeeklyItems}
	>
		{m.shopping_manage_weekly()}
	</button>
	<form
		onsubmit={(event) => {
			event.preventDefault();
			void addManual();
		}}
	>
		<div class="market-add-grid">
			<label class="grid min-w-0 gap-1 text-xs font-semibold">
				{m.shopping_recurring_name()}
				<input
					bind:this={nameInput}
					type="text"
					class="ui-field min-w-0"
					placeholder={m.shopping_additem_name_placeholder()}
					autocomplete="off"
					maxlength="256"
					required
					disabled={addSubmitting}
					aria-describedby={addError ? 'shopping-add-error' : undefined}
					bind:value={addName}
				/>
			</label>
			<label class="grid min-w-0 gap-1 text-xs font-semibold">
				{m.shopping_recurring_amount()}
				<input
					type="text"
					inputmode="decimal"
					class="ui-field min-w-0"
					placeholder={m.shopping_additem_qty_placeholder()}
					autocomplete="off"
					maxlength="64"
					disabled={addSubmitting}
					bind:value={addAmount}
				/>
			</label>
			<label class="grid min-w-0 gap-1 text-xs font-semibold">
				{m.shopping_recurring_unit()}
				<input
					type="text"
					class="ui-field min-w-0"
					placeholder={m.shopping_additem_unit_placeholder()}
					autocomplete="off"
					maxlength="64"
					disabled={addSubmitting}
					bind:value={addUnit}
				/>
			</label>
		</div>

		{#if addError}
			<p id="shopping-add-error" class="mt-2 text-sm text-error" role="alert">{addError}</p>
		{/if}

		<div class="mt-4 flex justify-end gap-2">
			<button type="button" class="ui-action ui-action-tertiary" disabled={addSubmitting} onclick={() => (open = false)}>
				{m.shopping_cancel_button()}
			</button>
			<button type="submit" class="ui-action ui-action-primary" disabled={addSubmitting || !addName.trim()}>
				{#if addSubmitting}<Spinner size="xs" />{/if}
				{addSubmitting ? m.shopping_saving_label() : m.shopping_additem_submit_aria()}
			</button>
		</div>
	</form>
</BottomSheet>

<style>
	.market-add-grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 4.75rem 4.75rem;
		gap: 0.5rem;
	}

	.manage-weekly-link {
		margin: -0.75rem 0 0.75rem -0.75rem;
	}

	@media (max-width: 20rem) {
		.market-add-grid {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
