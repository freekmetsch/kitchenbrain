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
	let open = $state(false);
	let view = $state<'list' | 'add' | 'edit' | 'actions'>('list');
	let selected = $state<Recurring | null>(null);
	let name = $state('');
	let amount = $state('');
	let unit = $state('');
	let pending = $state(false);
	let nameInput = $state<HTMLInputElement>();

	function resetFields(item?: Recurring) {
		name = item?.name ?? '';
		amount = item?.amount ?? '';
		unit = item?.unit ?? '';
	}

	async function focusName() {
		await tick();
		nameInput?.focus();
	}

	export async function openManager() {
		selected = null;
		view = 'list';
		open = true;
		await tick();
	}

	async function showAdd() {
		selected = null;
		resetFields();
		view = 'add';
		await focusName();
	}

	async function showEdit(item: Recurring) {
		selected = item;
		resetFields(item);
		view = 'edit';
		await focusName();
	}

	function showActions(item: Recurring) {
		selected = item;
		view = 'actions';
	}

	async function save() {
		if (!name.trim() || pending) return;
		pending = true;
		const input = {
			name: name.trim(),
			amount: amount.trim() || null,
			unit: unit.trim() || null
		};
		const saved = view === 'edit' && selected
			? await onEdit(selected, input)
			: await onAdd(input);
		pending = false;
		if (saved) view = 'list';
	}

	async function runAction(action: 'skip' | 'disable') {
		if (!selected || pending) return;
		pending = true;
		const saved = await (action === 'skip' ? onSkip(selected) : onDisable(selected));
		pending = false;
		if (saved) {
			selected = null;
			view = 'list';
		}
	}
</script>

<BottomSheet
	bind:open
	title={m.shopping_manage_weekly_items()}
	desktopSide
	dismissible={!pending}
	onclose={() => {
		if (!open) {
			selected = null;
			view = 'list';
		}
	}}
>
	{#if view === 'list'}
		<button type="button" class="weekly-add" onclick={() => void showAdd()}>
			<Icon name="plus" />
			{m.shopping_recurring_add()}
		</button>
		{#if items.length}
			<ul class="weekly-list">
				{#each items as item (item.id)}
					<li>
						<div>
							<strong>{item.name}</strong>
							{#if item.amount || item.unit}
								<span>{[item.amount, item.unit].filter(Boolean).join(' ')}</span>
							{/if}
						</div>
						<button
							type="button"
							aria-label={m.shopping_recurring_actions_aria({ name: item.name })}
							onclick={() => showActions(item)}
						>
							{m.shopping_recurring_manage()}
						</button>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="weekly-empty">{m.shopping_recurring_empty()}</p>
		{/if}
	{:else if view === 'add' || view === 'edit'}
		<form
			onsubmit={(event) => {
				event.preventDefault();
				void save();
			}}
		>
			<button type="button" class="weekly-back" disabled={pending} onclick={() => (view = 'list')}>
				<Icon name="chevronLeft" />
				{m.shopping_back_to_list()}
			</button>
			<div class="weekly-fields">
				<label>
					{m.shopping_recurring_name()}
					<input bind:this={nameInput} class="input min-h-11" required maxlength="256" disabled={pending} bind:value={name} />
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
				<button type="button" class="btn btn-ghost min-h-11" disabled={pending} onclick={() => (view = 'list')}>
					{m.shopping_cancel_button()}
				</button>
				<button type="submit" class="btn btn-primary min-h-11" disabled={pending || !name.trim()}>
					{pending
						? m.shopping_saving_label()
						: view === 'add'
							? m.shopping_recurring_add()
							: m.shopping_save_choice()}
				</button>
			</div>
		</form>
	{:else if selected}
		<button type="button" class="weekly-back" disabled={pending} onclick={() => (view = 'list')}>
			<Icon name="chevronLeft" />
			{m.shopping_back_to_list()}
		</button>
		<div class="weekly-action-heading">
			<strong>{selected.name}</strong>
			{#if selected.amount || selected.unit}
				<span>{[selected.amount, selected.unit].filter(Boolean).join(' ')}</span>
			{/if}
		</div>
		<div class="weekly-actions">
			<button
				type="button"
				disabled={pending || !selected.entryId || !selected.included}
				onclick={() => void runAction('skip')}
			>
				{m.shopping_recurring_skip()}
			</button>
			<button type="button" disabled={pending} onclick={() => void showEdit(selected!)}>
				{m.shopping_recurring_edit()}
			</button>
			<button class="danger" type="button" disabled={pending} onclick={() => void runAction('disable')}>
				{m.shopping_recurring_disable()}
			</button>
		</div>
	{/if}
</BottomSheet>

<style>
	.weekly-add,
	.weekly-back {
		display: inline-flex;
		min-height: 2.75rem;
		align-items: center;
		gap: 0.45rem;
		border-radius: 0.7rem;
		padding: 0 0.75rem;
		font-size: 0.72rem;
		font-weight: 750;
	}

	.weekly-add :global(svg),
	.weekly-back :global(svg) {
		width: 1rem;
		height: 1rem;
	}

	.weekly-add {
		width: 100%;
		justify-content: flex-start;
		border: 1px dashed color-mix(in oklab, var(--market-olive, #304b3a) 30%, var(--color-base-300));
		background: color-mix(in oklab, var(--color-base-100) 76%, transparent);
		color: var(--market-olive-ink, #304b3a);
	}

	.weekly-list {
		overflow: hidden;
		margin-top: 0.65rem;
		border: 1px solid var(--color-base-300);
		border-radius: 0.85rem;
	}

	.weekly-list li {
		display: flex;
		min-height: 3.5rem;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		border-bottom: 1px solid var(--color-base-200);
		padding: 0.45rem 0.55rem 0.45rem 0.75rem;
	}

	.weekly-list li:last-child {
		border-bottom: 0;
	}

	.weekly-list div,
	.weekly-action-heading {
		min-width: 0;
	}

	.weekly-list strong,
	.weekly-action-heading strong {
		display: block;
		font-size: 0.78rem;
	}

	.weekly-list span,
	.weekly-action-heading span {
		display: block;
		margin-top: 0.1rem;
		color: color-mix(in oklab, var(--color-base-content) 65%, transparent);
		font-size: 0.68rem;
	}

	.weekly-list li > button {
		min-height: 2.75rem;
		flex: 0 0 auto;
		border-radius: 0.6rem;
		padding: 0 0.65rem;
		color: var(--market-olive-ink, #304b3a);
		font-size: 0.7rem;
		font-weight: 750;
	}

	.weekly-empty {
		margin-top: 0.65rem;
		border: 1px dashed var(--color-base-300);
		border-radius: 0.8rem;
		padding: 1.5rem 1rem;
		color: color-mix(in oklab, var(--color-base-content) 65%, transparent);
		font-size: 0.75rem;
		text-align: center;
	}

	.weekly-back {
		margin: -0.4rem 0 0.65rem -0.5rem;
		color: var(--market-olive-ink, #304b3a);
	}

	.weekly-fields {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 5.5rem 4.75rem;
		gap: 0.5rem;
	}

	.weekly-fields label {
		display: grid;
		min-width: 0;
		gap: 0.25rem;
		font-size: 0.72rem;
		font-weight: 700;
	}

	.weekly-fields input {
		min-width: 0;
	}

	.weekly-action-heading {
		border-radius: 0.75rem;
		padding: 0.75rem;
		background: var(--color-base-200);
	}

	.weekly-actions {
		display: grid;
		gap: 0.2rem;
		margin-top: 0.55rem;
	}

	.weekly-actions button {
		min-height: 2.75rem;
		border-radius: 0.65rem;
		padding: 0 0.75rem;
		text-align: left;
		font-size: 0.75rem;
		font-weight: 700;
	}

	.weekly-actions button:hover,
	.weekly-actions button:focus-visible {
		background: var(--color-base-200);
	}

	.weekly-actions .danger {
		color: var(--color-error);
	}

	@media (max-width: 20rem) {
		.weekly-fields {
			grid-template-columns: minmax(0, 1fr);
		}

	}
</style>
