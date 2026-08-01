<script lang="ts">
	import { tick } from 'svelte';
	import Icon from '$lib/components/ui/icons/Icon.svelte';
	import FilterChip from '$lib/components/ui/FilterChip.svelte';
	import { m } from '$lib/paraglide/messages';
	import type { RecurringShoppingItem } from './list-controller.svelte';

	type RecurringInput = { name: string; amount: string | null; unit: string | null };
	type Props = {
		items: RecurringShoppingItem[];
		editable: boolean;
		onAdd: (input: RecurringInput) => Promise<{ id: number } | null>;
		onEdit: (
			item: RecurringShoppingItem,
			input: RecurringInput
		) => Promise<{ id: number } | null>;
		onIncluded: (item: RecurringShoppingItem, included: boolean) => Promise<boolean>;
		onDisable: (item: RecurringShoppingItem) => Promise<boolean>;
	};

	let { items, editable, onAdd, onEdit, onIncluded, onDisable }: Props = $props();
	let mode = $state<'none' | 'add' | 'edit' | 'stop'>('none');
	let selectedId = $state<number | null>(null);
	let name = $state('');
	let amount = $state('');
	let unit = $state('');
	let pending = $state(false);
	let nameInput = $state<HTMLInputElement>();

	function selectedItem(): RecurringShoppingItem | null {
		return items.find((item) => item.id === selectedId) ?? null;
	}

	function closeDraft() {
		mode = 'none';
		selectedId = null;
	}

	async function focusName() {
		await tick();
		nameInput?.focus();
	}

	async function showAdd() {
		selectedId = null;
		name = '';
		amount = '';
		unit = '';
		mode = 'add';
		await focusName();
	}

	async function showEdit(item: RecurringShoppingItem) {
		selectedId = item.id;
		name = item.name;
		amount = item.amount ?? '';
		unit = item.unit ?? '';
		mode = 'edit';
		await focusName();
	}

	async function focusItem(id: number) {
		await tick();
		const target = [...document.querySelectorAll<HTMLElement>('[data-recurring-id]')].find(
			(element) => Number(element.dataset.recurringId) === id
		);
		target?.focus();
	}

	async function save() {
		if (pending || !name.trim()) return;
		pending = true;
		const input = {
			name: name.trim(),
			amount: amount.trim() || null,
			unit: unit.trim() || null
		};
		const current = selectedItem();
		const saved =
			mode === 'edit' && current ? await onEdit(current, input) : await onAdd(input);
		pending = false;
		if (!saved) return;
		closeDraft();
		await focusItem(saved.id);
	}

	async function toggleIncluded(item: RecurringShoppingItem) {
		if (pending || !item.entryId || !item.entryRevision) return;
		pending = true;
		const saved = await onIncluded(item, !item.included);
		pending = false;
		if (saved) await focusItem(item.id);
	}

	async function stop(item: RecurringShoppingItem) {
		if (pending) return;
		pending = true;
		const saved = await onDisable(item);
		pending = false;
		if (saved) closeDraft();
	}
</script>

{#snippet weeklyFields()}
	<div class="weekly-fields">
		<label>
			<span>{m.shopping_recurring_name()}</span>
			<input class="ui-field" bind:this={nameInput} required maxlength="256" disabled={pending} bind:value={name} />
		</label>
		<label>
			<span>{m.shopping_recurring_amount()}</span>
			<input class="ui-field" maxlength="64" disabled={pending} bind:value={amount} />
		</label>
		<label>
			<span>{m.shopping_recurring_unit()}</span>
			<input class="ui-field" maxlength="64" disabled={pending} bind:value={unit} />
		</label>
	</div>
{/snippet}

<div class="weekly-editor">
	{#if !editable}
		<p class="weekly-readonly">{m.shopping_weekly_past_readonly()}</p>
	{/if}

	{#if editable && mode === 'add'}
		<form
			class="weekly-form add"
			onsubmit={(event) => {
				event.preventDefault();
				void save();
			}}
		>
			<h3 class="ui-section-title">{m.shopping_recurring_add()}</h3>
			{@render weeklyFields()}
			<div class="weekly-form-actions">
				<button class="ui-action ui-action-tertiary" type="button" disabled={pending} onclick={closeDraft}>{m.shopping_cancel_button()}</button>
				<button class="ui-action ui-action-primary" type="submit" disabled={pending || !name.trim()}>
					{pending ? m.shopping_saving_label() : m.shopping_recurring_add()}
				</button>
			</div>
		</form>
	{:else if editable}
		<button
			type="button"
			class="ui-action ui-action-secondary weekly-add"
			data-weekly-add-button
			onclick={() => void showAdd()}
		>
			<Icon name="plus" />
			{m.shopping_recurring_add()}
		</button>
	{/if}

	{#if items.length}
		<ul class="weekly-definitions">
			{#each items as item (item.id)}
				<li>
					{#if mode === 'edit' && selectedId === item.id}
						<form
							class="weekly-form"
							onsubmit={(event) => {
								event.preventDefault();
								void save();
							}}
						>
							{@render weeklyFields()}
							<p class="effective-copy">{m.shopping_weekly_effective_from_here()}</p>
							<div class="weekly-form-actions">
								<button class="ui-action ui-action-tertiary" type="button" disabled={pending} onclick={closeDraft}>{m.shopping_cancel_button()}</button>
								<button class="ui-action ui-action-primary" type="submit" disabled={pending || !name.trim()}>
									{pending ? m.shopping_saving_label() : m.shopping_save_choice()}
								</button>
							</div>
						</form>
					{:else}
						<div class="weekly-definition-row">
							<button
								type="button"
								class="weekly-definition-copy"
								data-recurring-id={item.id}
								disabled={!editable || pending}
								onclick={() => editable && void showEdit(item)}
							>
								<strong>{item.name}</strong>
								{#if item.amount || item.unit}
									<small>{[item.amount, item.unit].filter(Boolean).join(' ')}</small>
								{/if}
							</button>
							{#if editable}
								<FilterChip
									selected={item.included}
									tone="success"
									disabled={pending || !item.entryId || !item.entryRevision}
									aria-label={m.shopping_weekly_state_aria({
										name: item.name,
										state: item.included
											? m.shopping_weekly_this_week()
											: m.shopping_weekly_skipped()
									})}
									onclick={() => void toggleIncluded(item)}
								>
									{item.included ? m.shopping_weekly_this_week() : m.shopping_weekly_skipped()}
								</FilterChip>
								<button
									type="button"
									class="ui-action ui-action-danger ui-action-icon weekly-stop"
									disabled={pending}
									aria-label={m.shopping_recurring_disable()}
									onclick={() => {
										selectedId = item.id;
										mode = 'stop';
									}}
								>
									<Icon name="trash" />
								</button>
							{/if}
						</div>
						{#if mode === 'stop' && selectedId === item.id}
							<div class="weekly-stop-confirm">
								<p>{m.shopping_weekly_stop_confirm({ name: item.name })}</p>
								<div>
									<button class="ui-action ui-action-tertiary" type="button" disabled={pending} onclick={closeDraft}>{m.shopping_cancel_button()}</button>
									<button class="ui-action ui-action-danger" type="button" disabled={pending} onclick={() => void stop(item)}>
										{m.shopping_recurring_disable()}
									</button>
								</div>
							</div>
						{/if}
					{/if}
				</li>
			{/each}
		</ul>
	{:else if mode !== 'add'}
		<p class="weekly-empty">{m.shopping_recurring_empty()}</p>
	{/if}
</div>

<style>
	.weekly-editor {
		border-top: 1px solid var(--color-base-200);
		background: color-mix(in oklab, var(--market-olive, #304b3a) 3%, var(--color-base-100));
	}

	.weekly-readonly,
	.weekly-empty {
		margin: 0;
		padding: 0.8rem;
		color: color-mix(in oklab, var(--color-base-content) 65%, transparent);
		font-size: 0.68rem;
		line-height: 1.4;
		text-align: center;
	}

	.weekly-readonly {
		border-bottom: 1px solid var(--color-base-200);
		background: color-mix(in oklab, var(--color-warning) 8%, var(--color-base-100));
	}

	.weekly-add {
		margin: 0.5rem 0.65rem;
		font-size: 0.66rem;
	}

	.weekly-add :global(svg) {
		width: 0.9rem;
		height: 0.9rem;
	}

	.weekly-definitions {
		margin: 0;
		padding: 0;
		border-top: 1px solid var(--color-base-200);
		list-style: none;
	}

	.weekly-definitions > li {
		border-bottom: 1px solid var(--color-base-200);
	}

	.weekly-definitions > li:last-child {
		border-bottom: 0;
	}

	.weekly-definition-row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto 2.75rem;
		align-items: center;
		min-height: 3.25rem;
		padding-left: 0.7rem;
	}

	.weekly-definition-copy {
		min-width: 0;
		text-align: left;
	}

	.weekly-definition-copy strong,
	.weekly-definition-copy small {
		display: block;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.weekly-definition-copy strong {
		font-size: 0.75rem;
	}

	.weekly-definition-copy small {
		margin-top: 0.1rem;
		color: color-mix(in oklab, var(--color-base-content) 64%, transparent);
		font-size: 0.6rem;
	}

	.weekly-stop {
		align-self: stretch;
	}

	.weekly-stop :global(svg) {
		width: 0.95rem;
		height: 0.95rem;
	}

	.weekly-form {
		padding: 0.7rem;
		background: var(--color-base-100);
	}

	.weekly-form.add {
		border-bottom: 1px solid var(--color-base-200);
	}

	.weekly-form h3 {
		margin-bottom: 0.6rem;
	}

	.weekly-fields {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(4.25rem, 0.38fr) minmax(4.25rem, 0.38fr);
		gap: 0.4rem;
	}

	.weekly-fields label {
		min-width: 0;
		color: color-mix(in oklab, var(--color-base-content) 72%, transparent);
		font-size: 0.58rem;
		font-weight: 750;
	}

	.weekly-fields label span {
		display: block;
		margin-bottom: 0.25rem;
	}

	.weekly-fields :global(.ui-field) {
		width: 100%;
		font-size: 0.72rem;
	}

	.effective-copy {
		margin: 0.45rem 0 0;
		color: color-mix(in oklab, var(--color-base-content) 62%, transparent);
		font-size: 0.58rem;
	}

	.weekly-form-actions,
	.weekly-stop-confirm > div {
		display: flex;
		justify-content: flex-end;
		gap: 0.35rem;
		margin-top: 0.55rem;
	}

	.weekly-form-actions :global(.ui-action),
	.weekly-stop-confirm :global(.ui-action) {
		padding-inline: 0.65rem;
		font-size: 0.64rem;
	}

	.weekly-stop-confirm {
		padding: 0.65rem 0.7rem;
		background: color-mix(in oklab, var(--color-error) 7%, var(--color-base-100));
	}

	.weekly-stop-confirm p {
		font-size: 0.66rem;
		line-height: 1.4;
	}

	button:focus-visible,
	input:focus-visible {
		outline: 3px solid var(--color-accent);
		outline-offset: 2px;
	}

	button:disabled,
	input:disabled {
		opacity: 0.55;
	}

	@media (max-width: 24rem) {
		.weekly-fields {
			grid-template-columns: minmax(0, 1fr) minmax(4rem, 0.42fr);
		}

		.weekly-fields label:first-child {
			grid-column: 1 / -1;
		}
	}
</style>
