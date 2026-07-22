<script lang="ts">
	import { tick } from 'svelte';
	import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
	import { m } from '$lib/paraglide/messages';
	type Recurring = {
		id: number; revision: number; name: string; amount: string | null; unit: string | null;
		entryId: number | null; entryRevision: number | null; included: boolean; bought: boolean;
	};
	type RecurringInput = { name: string; amount: string | null; unit: string | null };
	type Props = {
		items: Recurring[];
		onAdd: (input: RecurringInput) => Promise<boolean>;
		onEdit: (item: Recurring, input: RecurringInput) => Promise<boolean>;
		onSkip: (item: Recurring) => Promise<boolean>;
		onDisable: (item: Recurring) => Promise<boolean>;
	};
	let { items, onAdd, onEdit, onSkip, onDisable }: Props = $props();
	let name = $state('');
	let amount = $state('');
	let unit = $state('');
	let editingId = $state<number | null>(null);
	let editName = $state('');
	let editAmount = $state('');
	let editUnit = $state('');
	let actionItem = $state<Recurring | null>(null);
	let actionOpen = $state(false);
	let pending = $state(false);
	let editNameInput = $state<HTMLInputElement>();
	let focusEditAfterClose = false;

	function startEdit(item: Recurring) {
		editingId = item.id;
		editName = item.name;
		editAmount = item.amount ?? '';
		editUnit = item.unit ?? '';
		focusEditAfterClose = true;
		actionOpen = false;
	}

	async function handleActionClose() {
		actionItem = null;
		if (!focusEditAfterClose) return;
		focusEditAfterClose = false;
		await tick();
		editNameInput?.focus();
	}

	async function addRecurring() {
		if (!name.trim() || pending) return;
		pending = true;
		const saved = await onAdd({ name: name.trim(), amount: amount || null, unit: unit || null });
		pending = false;
		if (!saved) return;
		name = '';
		amount = '';
		unit = '';
	}

	async function editRecurring(item: Recurring) {
		if (!editName.trim() || pending) return;
		pending = true;
		const saved = await onEdit(item, { name: editName.trim(), amount: editAmount || null, unit: editUnit || null });
		pending = false;
		if (saved) editingId = null;
	}

	async function runAction(action: 'skip' | 'disable') {
		if (!actionItem || pending) return;
		pending = true;
		const saved = await (action === 'skip' ? onSkip(actionItem) : onDisable(actionItem));
		pending = false;
		if (saved) actionOpen = false;
	}
</script>

<form class="ui-list-card mb-3 grid grid-cols-1 gap-2 p-3 sm:grid-cols-[1fr_5.5rem_4.5rem]" onsubmit={(event) => { event.preventDefault(); void addRecurring(); }}>
	<h2 class="text-sm font-semibold sm:col-span-3">{m.shopping_recurring_add()}</h2>
	<label class="grid gap-1 text-xs font-semibold">{m.shopping_recurring_name()}<input class="input input-sm min-w-0" required maxlength="256" bind:value={name} /></label>
	<label class="grid gap-1 text-xs font-semibold">{m.shopping_recurring_amount()}<input class="input input-sm min-w-0" maxlength="64" bind:value={amount} /></label>
	<label class="grid gap-1 text-xs font-semibold">{m.shopping_recurring_unit()}<input class="input input-sm min-w-0" maxlength="64" bind:value={unit} /></label>
	<button class="btn btn-primary btn-sm sm:col-span-3" type="submit" disabled={pending}>{m.shopping_recurring_add()}</button>
</form>

{#if items.length}
	<ul class="ui-list-card divide-y divide-base-200">
		{#each items as item (item.id)}
			<li class="p-3">
				{#if editingId === item.id}
					<form class="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_5.5rem_4.5rem]" onsubmit={(event) => { event.preventDefault(); void editRecurring(item); }}>
						<label class="grid gap-1 text-xs font-semibold">{m.shopping_recurring_name()}<input class="input input-sm min-w-0" required bind:this={editNameInput} bind:value={editName} /></label>
						<label class="grid gap-1 text-xs font-semibold">{m.shopping_recurring_amount()}<input class="input input-sm min-w-0" bind:value={editAmount} /></label>
						<label class="grid gap-1 text-xs font-semibold">{m.shopping_recurring_unit()}<input class="input input-sm min-w-0" bind:value={editUnit} /></label>
						<button class="btn btn-primary btn-sm sm:col-span-2" type="submit" disabled={pending}>{m.shopping_save_choice()}</button>
						<button class="btn btn-ghost btn-sm" type="button" disabled={pending} onclick={() => (editingId = null)}>{m.shopping_cancel_button()}</button>
					</form>
				{:else}
					<div class="flex items-start justify-between gap-3">
						<div><p class="text-sm font-semibold">{item.name}</p>{#if item.amount || item.unit}<p class="text-xs text-base-content/60">{[item.amount, item.unit].filter(Boolean).join(' ')}</p>{/if}</div>
						<button type="button" class="btn btn-ghost btn-sm min-w-24" aria-label={m.shopping_recurring_actions_aria({ name: item.name })} onclick={() => { actionItem = item; actionOpen = true; }}>{m.shopping_recurring_manage()}</button>
					</div>
				{/if}
			</li>
		{/each}
	</ul>
{:else}
	<p class="py-8 text-center text-sm text-base-content/60">{m.shopping_recurring_empty()}</p>
{/if}

<BottomSheet bind:open={actionOpen} title={actionItem?.name} onclose={handleActionClose}>
	{#if actionItem}
		<div class="grid gap-2">
			<button type="button" class="btn btn-ghost justify-start" disabled={pending || !actionItem.entryId || !actionItem.included} onclick={() => void runAction('skip')}>{m.shopping_recurring_skip()}</button>
			<button type="button" class="btn btn-ghost justify-start" disabled={pending} onclick={() => startEdit(actionItem!)}>{m.shopping_recurring_edit()}</button>
			<button type="button" class="btn btn-ghost justify-start text-error" disabled={pending} onclick={() => void runAction('disable')}>{m.shopping_recurring_disable()}</button>
		</div>
	{/if}
</BottomSheet>
