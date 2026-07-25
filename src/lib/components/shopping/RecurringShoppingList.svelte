<script lang="ts">
	import { tick } from 'svelte';
	import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
	import Icon from '$lib/components/ui/icons/Icon.svelte';
	import { m } from '$lib/paraglide/messages';

	type Recurring = {
		id: number;
		revision: number;
		name: string;
		amount: string | null;
		unit: string | null;
		entryId: number | null;
		entryRevision: number | null;
		included: boolean;
		bought: boolean;
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
	let editName = $state('');
	let editAmount = $state('');
	let editUnit = $state('');
	let addOpen = $state(false);
	let editOpen = $state(false);
	let actionItem = $state<Recurring | null>(null);
	let actionOpen = $state(false);
	let pending = $state(false);
	let addNameInput = $state<HTMLInputElement>();
	let editNameInput = $state<HTMLInputElement>();
	let openEditAfterAction = false;

	async function openAdd() {
		addOpen = true;
		await tick();
		addNameInput?.focus();
	}

	function startEdit(item: Recurring) {
		editName = item.name;
		editAmount = item.amount ?? '';
		editUnit = item.unit ?? '';
		openEditAfterAction = true;
		actionOpen = false;
	}

	async function handleActionClose() {
		if (!openEditAfterAction) {
			actionItem = null;
			return;
		}
		openEditAfterAction = false;
		editOpen = true;
		await tick();
		editNameInput?.focus();
	}

	async function addRecurring() {
		if (!name.trim() || pending) return;
		pending = true;
		const saved = await onAdd({
			name: name.trim(),
			amount: amount.trim() || null,
			unit: unit.trim() || null
		});
		pending = false;
		if (!saved) return;
		name = '';
		amount = '';
		unit = '';
		addOpen = false;
	}

	async function editRecurring() {
		if (!actionItem || !editName.trim() || pending) return;
		pending = true;
		const saved = await onEdit(actionItem, {
			name: editName.trim(),
			amount: editAmount.trim() || null,
			unit: editUnit.trim() || null
		});
		pending = false;
		if (!saved) return;
		editOpen = false;
		actionItem = null;
	}

	async function runAction(action: 'skip' | 'disable') {
		if (!actionItem || pending) return;
		pending = true;
		const saved = await (action === 'skip' ? onSkip(actionItem) : onDisable(actionItem));
		pending = false;
		if (saved) actionOpen = false;
	}
</script>

<button type="button" class="market-weekly-add" onclick={() => void openAdd()}>
	<Icon name="plus" />
	{m.shopping_recurring_add()}
</button>

{#if items.length}
	<ul class="market-weekly-list">
		{#each items as item (item.id)}
			<li>
				<div>
					<p>{item.name}</p>
					{#if item.amount || item.unit}
						<span>{[item.amount, item.unit].filter(Boolean).join(' ')}</span>
					{/if}
				</div>
				<button
					type="button"
					aria-label={m.shopping_recurring_actions_aria({ name: item.name })}
					onclick={() => {
						actionItem = item;
						actionOpen = true;
					}}
				>
					{m.shopping_recurring_manage()}
				</button>
			</li>
		{/each}
	</ul>
{:else}
	<div class="market-weekly-empty">{m.shopping_recurring_empty()}</div>
{/if}

<BottomSheet bind:open={addOpen} title={m.shopping_recurring_add()} desktopSide>
	<form
		onsubmit={(event) => {
			event.preventDefault();
			void addRecurring();
		}}
	>
		<div class="market-weekly-fields">
			<label>
				{m.shopping_recurring_name()}
				<input bind:this={addNameInput} class="input min-h-11" required maxlength="256" disabled={pending} bind:value={name} />
			</label>
			<label>
				{m.shopping_recurring_amount()}
				<input class="input min-h-11" maxlength="64" disabled={pending} bind:value={amount} />
			</label>
			<label>
				{m.shopping_recurring_unit()}
				<input class="input min-h-11" maxlength="64" disabled={pending} bind:value={unit} />
			</label>
		</div>
		<div class="mt-4 flex justify-end gap-2">
			<button type="button" class="btn btn-ghost min-h-11" disabled={pending} onclick={() => (addOpen = false)}>
				{m.shopping_cancel_button()}
			</button>
			<button type="submit" class="btn btn-primary min-h-11" disabled={pending || !name.trim()}>
				{pending ? m.shopping_saving_label() : m.shopping_recurring_add()}
			</button>
		</div>
	</form>
</BottomSheet>

<BottomSheet bind:open={editOpen} title={actionItem?.name} desktopSide>
	{#if actionItem}
		<form
			onsubmit={(event) => {
				event.preventDefault();
				void editRecurring();
			}}
		>
			<div class="market-weekly-fields">
				<label>
					{m.shopping_recurring_name()}
					<input bind:this={editNameInput} class="input min-h-11" required disabled={pending} bind:value={editName} />
				</label>
				<label>
					{m.shopping_recurring_amount()}
					<input class="input min-h-11" disabled={pending} bind:value={editAmount} />
				</label>
				<label>
					{m.shopping_recurring_unit()}
					<input class="input min-h-11" disabled={pending} bind:value={editUnit} />
				</label>
			</div>
			<div class="mt-4 flex justify-end gap-2">
				<button type="button" class="btn btn-ghost min-h-11" disabled={pending} onclick={() => (editOpen = false)}>
					{m.shopping_cancel_button()}
				</button>
				<button type="submit" class="btn btn-primary min-h-11" disabled={pending || !editName.trim()}>
					{pending ? m.shopping_saving_label() : m.shopping_save_choice()}
				</button>
			</div>
		</form>
	{/if}
</BottomSheet>

<BottomSheet bind:open={actionOpen} title={actionItem?.name} onclose={handleActionClose} desktopSide>
	{#if actionItem}
		<div class="grid gap-1">
			<button
				type="button"
				class="btn btn-ghost min-h-11 justify-start"
				disabled={pending || !actionItem.entryId || !actionItem.included}
				onclick={() => void runAction('skip')}
			>
				{m.shopping_recurring_skip()}
			</button>
			<button
				type="button"
				class="btn btn-ghost min-h-11 justify-start"
				disabled={pending}
				onclick={() => startEdit(actionItem!)}
			>
				{m.shopping_recurring_edit()}
			</button>
			<button
				type="button"
				class="btn btn-ghost min-h-11 justify-start text-error"
				disabled={pending}
				onclick={() => void runAction('disable')}
			>
				{m.shopping_recurring_disable()}
			</button>
		</div>
	{/if}
</BottomSheet>

<style>
	.market-weekly-add {
		display: flex;
		width: 100%;
		min-height: 2.75rem;
		align-items: center;
		gap: 0.45rem;
		margin-bottom: 0.55rem;
		border: 1px dashed color-mix(in oklab, var(--market-olive, #304b3a) 30%, var(--color-base-300));
		border-radius: 0.75rem;
		padding: 0 0.75rem;
		background: color-mix(in oklab, var(--color-base-100) 76%, transparent);
		color: var(--market-olive-ink, #304b3a);
		font-size: 0.72rem;
		font-weight: 750;
	}

	.market-weekly-list {
		overflow: hidden;
		margin: 0;
		padding: 0;
		border: 1px solid color-mix(in oklab, var(--market-olive, #304b3a) 18%, var(--color-base-300));
		border-radius: 0.85rem;
		background: var(--color-base-100);
		box-shadow: 0 6px 18px rgb(48 75 58 / 5%);
		list-style: none;
	}

	.market-weekly-list li {
		display: flex;
		min-height: 4rem;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		border-bottom: 1px solid var(--color-base-200);
		padding: 0.55rem 0.65rem 0.55rem 0.8rem;
	}

	.market-weekly-list li:last-child {
		border-bottom: 0;
	}

	.market-weekly-list p {
		font-size: 0.78rem;
		font-weight: 700;
	}

	.market-weekly-list span {
		display: block;
		margin-top: 0.15rem;
		color: color-mix(in oklab, var(--color-base-content) 70%, transparent);
		font-size: 0.65rem;
	}

	.market-weekly-list li > button {
		min-height: 2.75rem;
		border: 1px solid var(--color-base-300);
		border-radius: 0.6rem;
		padding: 0 0.7rem;
		color: var(--market-olive-ink, #304b3a);
		font-size: 0.68rem;
		font-weight: 750;
	}

	.market-weekly-empty {
		border: 1px dashed var(--color-base-300);
		border-radius: 0.8rem;
		padding: 2rem 1rem;
		background: color-mix(in oklab, var(--color-base-100) 70%, transparent);
		color: color-mix(in oklab, var(--color-base-content) 70%, transparent);
		font-size: 0.75rem;
		text-align: center;
	}

	.market-weekly-fields {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 5.5rem 4.75rem;
		gap: 0.5rem;
	}

	.market-weekly-fields label {
		display: grid;
		min-width: 0;
		gap: 0.25rem;
		font-size: 0.72rem;
		font-weight: 700;
	}

	.market-weekly-fields input {
		min-width: 0;
	}

	@media (max-width: 20rem) {
		.market-weekly-fields {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
