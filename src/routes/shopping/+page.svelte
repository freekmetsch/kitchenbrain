<script lang="ts">
	import { base } from '$app/paths';
	import { invalidateAll } from '$app/navigation';
	import { m } from '$lib/paraglide/messages';
	import AddItemForm from '$lib/components/shopping/AddItemForm.svelte';
	import AhSheet from '$lib/components/shopping/AhSheet.svelte';
	import PushHistory from '$lib/components/shopping/PushHistory.svelte';
	import ShoppingLists from '$lib/components/shopping/ShoppingLists.svelte';
	import WeekNav from '$lib/components/shopping/WeekNav.svelte';
	import ShoppingNotices from '$lib/components/shopping/ShoppingNotices.svelte';
	import ShoppingMealPortions from '$lib/components/shopping/ShoppingMealPortions.svelte';
	import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
	import Icon from '$lib/components/ui/icons/Icon.svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import type { PageData } from './$types';
	import type { ShoppingListSource } from '$lib/components/shopping/types';
	import { untrack } from 'svelte';
	import type { ShoppingNeed } from '$lib/components/shopping/ShoppingSourceQuickControls.svelte';

	type Item = PageData['items'][number];
	type SourceMutationStatus = 'saved' | 'stale' | 'failed';
	type MutationResult<T> =
		| { status: 'saved'; data: T }
		| { status: 'stale' | 'failed'; data: null };
	let { data }: { data: PageData } = $props();
	let items = $state<Item[]>(untrack(() => data.items.map((item) => ({ ...item }))));
	let bonusByName = $state<Record<string, boolean>>({});
	let ahSheet = $state<{ openAhModal: () => Promise<void> }>();
	let addItemForm = $state<{ openAddModal: () => Promise<void> }>();
	let shoppingLists = $state<{ openWeeklyEditor: () => Promise<void> }>();
	let addItemOpen = $state(false);
	let showCovered = $state(false);
	let historyOpen = $state(false);
	let preparationOpen = $state(false);
	let weeklyHandoffAfterPreparation = $state(false);
	let plannedServingPending = $state(false);
	let shoppingListRevision = $state(0);

	let pending = $derived(items.filter((item) => !item.bought));
	let done = $derived(items.filter((item) => item.bought));
	let visibleToBuyCount = $derived(pending.filter((item) => !item.covered).length);
	let emptyState = $derived(data.emptyState === 'no_meals' ? ('no_meals' as const) : ('nothing_needed' as const));

	$effect(() => {
		items = data.items.map((item) => ({ ...item }));
	});

	async function postMutation<T>(
		path: string,
		body: Record<string, unknown>
	): Promise<MutationResult<T>> {
		try {
			const response = await fetch(`${base}${path}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});
			if (!response.ok) {
				if (response.status === 409) {
					await invalidateAll();
					return { status: 'stale', data: null };
				}
				throw new Error(`HTTP ${response.status}`);
			}
			const result = (await response.json()) as T;
			await invalidateAll();
			return { status: 'saved', data: result };
		} catch {
			return { status: 'failed', data: null };
		}
	}

	function showMutationFailure(status: 'stale' | 'failed') {
		toast.error(
			status === 'stale' ? m.shopping_choice_stale() : m.shopping_mutation_failed()
		);
	}

	async function mutate(body: Record<string, unknown>, success?: string): Promise<boolean> {
		const result = await postMutation<unknown>('/api/shopping', body);
		if (result.status !== 'saved') {
			showMutationFailure(result.status);
			return false;
		}
		if (success) toast.success(success);
		return true;
	}

	async function mutateReturning<T>(
		body: Record<string, unknown>,
		success?: string
	): Promise<T | null> {
		const result = await postMutation<T>('/api/shopping', body);
		if (result.status !== 'saved') {
			showMutationFailure(result.status);
			return null;
		}
		if (success) toast.success(success);
		return result.data;
	}

	async function toggleBought(item: Item) {
		const before = item.bought;
		item.bought = !before;
		items = [...items];
		if (
			!(await mutate({
				action: 'set_bought_entries',
				entryIds: item.entryIds,
				weekStart: data.weekStart,
				bought: !before
			}))
		) {
			item.bought = before;
			items = [...items];
			return false;
		}
		return true;
	}

	async function mutateSource(
		source: ShoppingListSource,
		input: { action: 'term'; term: string } | { action: 'need'; need: ShoppingNeed }
	): Promise<SourceMutationStatus> {
		const result = await postMutation<unknown>('/api/shopping/recipe-choice', {
			entryId: source.id,
			expectedEntryRevision: source.revision,
			...(input.action === 'need'
				? { expectedRecipeRevision: source.recipeRevision }
				: {}),
			...input
		});
		return result.status;
	}

	async function setSourceIncluded(
		source: ShoppingListSource,
		included: boolean
	): Promise<SourceMutationStatus> {
		const result = await postMutation<unknown>('/api/shopping', {
			action: 'update_source',
			entryId: source.id,
			expectedRevision: source.revision,
			included
		});
		return result.status;
	}

	function addItem(_item: Item) {
		return invalidateAll();
	}

	function removeManual(source: ShoppingListSource) {
		return mutate({
			action: 'remove_source_manual',
			entryId: source.id,
			expectedRevision: source.revision
		});
	}

	function restoreManual(source: ShoppingListSource) {
		return mutate({
			action: 'add_source_manual',
			weekStart: data.weekStart,
			name: source.name,
			amount: source.amount,
			unit: source.unit
		});
	}

	async function restoreThisWeek(item: { name: string }): Promise<boolean> {
		return mutate({
			action: 'restore_week_item',
			weekStart: data.weekStart,
			term: item.name
		});
	}

	async function removeThisWeek(item: Item): Promise<boolean> {
		const removed = await mutate({
			action: 'exclude_week_item',
			weekStart: data.weekStart,
			term: item.name
		});
		if (removed) {
			toast.undo(m.shopping_toast_removed({ name: item.name }), () => void restoreThisWeek(item));
		}
		return removed;
	}

	function markBought(refs: Set<string>) {
		items = items.map((item) => {
			const ref = `entries:${[...(item.entryIds ?? [])].sort((a, b) => a - b).join(',')}`;
			return refs.has(ref) ? { ...item, bought: true } : item;
		});
	}

	function handleServingsSettled(_mealId: number, saved: boolean) {
		if (!saved) return;
		shoppingListRevision += 1;
	}

	function handoffPreparationToWeeklyItems() {
		weeklyHandoffAfterPreparation = true;
		preparationOpen = false;
	}

	function handlePreparationClose() {
		if (!weeklyHandoffAfterPreparation) return;
		queueMicrotask(() => {
			weeklyHandoffAfterPreparation = false;
			void shoppingLists?.openWeeklyEditor();
		});
	}
</script>

<svelte:head><title>{m.shopping_title()}</title></svelte:head>

<div class="shopping-market ui-grove-page">
	<WeekNav
		weekStart={data.weekStart}
		currentWeekStart={data.currentWeekStart}
		prevWeek={data.prevWeek}
		nextWeek={data.nextWeek}
		isDefaultWeek={data.isDefaultWeek}
		deliveryDate={data.deliveryDate}
		ahConnected={data.ah.connected}
		onOpenSetup={() => (preparationOpen = true)}
		setupOpen={preparationOpen}
	/>

	<div class="shopping-market-layout ui-grove-surface">
		<main class="min-w-0">
			{#if data.pushHistory.length}
				<div class="shopping-history-tools">
					<PushHistory
						pushHistory={data.pushHistory}
						mode="attention"
						compact
						showHeading={false}
						headingId="shopping-push-attention"
						onOpenHistory={() => (historyOpen = true)}
					/>
				</div>
			{/if}

			<div class="shopping-market-dock" aria-label={m.shopping_heading()}>
				<button type="button" class="market-add-action ui-action ui-action-secondary" disabled={!data.isEditable} aria-haspopup="dialog" aria-expanded={addItemOpen} onclick={() => addItemForm?.openAddModal()}>
					<Icon name="plus" />
					{m.shopping_additem_submit_aria()}
				</button>
				{#if data.ah.connected}
					<button
						type="button"
						class="market-ah-action ui-action ui-action-primary"
						disabled={visibleToBuyCount === 0 || plannedServingPending}
						aria-busy={plannedServingPending}
						onclick={() => ahSheet?.openAhModal()}
						aria-label={m.shopping_review_ah_order()}
					>
						<Icon name="cart" />
						{m.shopping_review_ah_short()}
						{#if visibleToBuyCount > 0}<span>{visibleToBuyCount}</span>{/if}
					</button>
				{:else}
					<a
						class="market-ah-action ui-action ui-action-primary"
						href="{base}/settings/connections"
						aria-label={m.shopping_connect_settings_link()}
					>
						<Icon name="cart" />
						{m.shopping_connect_ah_short()}
					</a>
				{/if}
			</div>

			<ShoppingLists
				bind:this={shoppingLists}
				weekStart={data.weekStart}
				{pending}
				{done}
				sources={data.sources}
				recurring={data.recurring}
				legacy={data.legacy}
				excludedWeekItems={data.excluded}
				{emptyState}
				bind:showCovered
				{bonusByName}
				onToggleBought={toggleBought}
				onDeleteManual={removeManual}
				onRestoreManual={restoreManual}
				onRemoveThisWeek={removeThisWeek}
				onRestoreThisWeek={restoreThisWeek}
				editable={data.isEditable}
				onChangeSourceTerm={(source, term) =>
					mutateSource(source, { action: 'term', term })}
				onChangeSourceNeed={(source, need) =>
					mutateSource(source, { action: 'need', need })}
				onSetSourceIncluded={setSourceIncluded}
				onAddRecurring={(input) =>
					mutateReturning<{ id: number }>(
						{ action: 'add_recurring', startWeek: data.weekStart, ...input },
						m.shopping_choice_saved()
					)}
				onEditRecurring={(item, input) =>
					mutateReturning<{ id: number }>(
						{
							action: 'edit_recurring',
							itemId: item.id,
							expectedRevision: item.revision,
							effectiveWeek: data.weekStart,
							...input
						},
						m.shopping_choice_saved()
					)}
				onSetRecurringIncluded={(item, included) =>
					item.entryId && item.entryRevision
						? mutate({
								action: 'set_recurring_included',
								entryId: item.entryId,
								expectedRevision: item.entryRevision,
								included
							})
						: Promise.resolve(false)}
				onDisableRecurring={(item) =>
					mutate({
						action: 'disable_recurring',
						itemId: item.id,
						expectedRevision: item.revision,
						effectiveWeek: data.weekStart
					})}
				onResolveLegacy={(item, resolution, targetEntryId) => {
					const target = item.candidates.find((candidate) => candidate.id === targetEntryId);
					void mutate({
						action: 'resolve_legacy',
						legacyEntryId: item.id,
						expectedLegacyRevision: item.revision,
						resolution,
						targetEntryId,
						expectedTargetRevision: target?.revision
					});
				}}
			>
				{#snippet notices()}
					<ShoppingNotices
						mealsWithoutRecipe={data.mealsWithoutRecipe}
						freezerMeals={data.freezerMeals}
						freezerMealsMissingFreshInfo={data.freezerMealsMissingFreshInfo}
					/>
				{/snippet}
			</ShoppingLists>
		</main>
	</div>
</div>

<AddItemForm
	bind:this={addItemForm}
	bind:open={addItemOpen}
	weekStart={data.weekStart}
	onAdded={addItem}
	onManageWeekly={() => void shoppingLists?.openWeeklyEditor()}
/>
<AhSheet
	bind:this={ahSheet}
	weekStart={data.weekStart}
	listRevision={shoppingListRevision}
	pending={pending}
	bind:bonusByName
	onMarkedBought={markBought}
/>
<BottomSheet
	bind:open={preparationOpen}
	title={m.shopping_preparation_title()}
	desktopCentered
	dismissible={!plannedServingPending}
	restoreFocus={!weeklyHandoffAfterPreparation}
	onclose={handlePreparationClose}
>
	{#if plannedServingPending}
		<span class="shopping-edit-plan ui-action ui-action-primary" aria-disabled="true">
			<Icon name="calendar" />
			{m.shopping_edit_meal_plan()}
		</span>
	{:else}
		<a
			href="{base}/meal-plan?week={data.weekStart}"
			class="shopping-edit-plan ui-action ui-action-primary"
		>
			<Icon name="calendar" />
			{m.shopping_edit_meal_plan()}
		</a>
	{/if}
	<ShoppingMealPortions
		meals={data.plannedMeals}
		editable={data.isEditable}
		weekStart={data.weekStart}
		hasPriorPush={data.pushHistory.length > 0}
		active={preparationOpen}
		onpendingchange={(value) => (plannedServingPending = value)}
		onservingssettled={handleServingsSettled}
	/>
	<button
		type="button"
		class="shopping-manage-weekly ui-action ui-action-secondary"
		disabled={plannedServingPending}
		onclick={handoffPreparationToWeeklyItems}
	>
		<Icon name="clipboard" />
		{m.shopping_manage_weekly()}
	</button>
</BottomSheet>
<BottomSheet
	bind:open={historyOpen}
	title={m.shopping_sent_to_ah_heading()}
	desktopCentered
>
	<PushHistory
		pushHistory={data.pushHistory}
		mode="history"
		showHeading={false}
		headingId="shopping-push-history-sheet"
	/>
</BottomSheet>

<style>
	.shopping-market {
		--market-olive: var(--kitchen-olive);
		--market-olive-ink: var(--kitchen-olive);
		--market-honey: var(--kitchen-honey);
		--market-terra: var(--kitchen-terra);
		--market-paper: var(--kitchen-paper);
		--market-card: var(--kitchen-card);
		min-height: 100%;
		background: var(--kitchen-grove);
		color: var(--color-base-content);
	}

	.shopping-market-layout {
		width: min(calc(100% - (2 * var(--kitchen-frame-width))), var(--kitchen-focus-width));
		margin-inline: auto;
		padding-block: 0.65rem 1rem;
	}

	.shopping-history-tools {
		display: grid;
		gap: 0.4rem;
		margin-bottom: 0.65rem;
	}

	.shopping-history-tools :global(.push-history) {
		margin-bottom: 0;
	}

	.shopping-market-dock {
		position: relative;
		z-index: 20;
		display: grid;
		grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.35fr);
		gap: 0.5rem;
		max-width: 24rem;
		margin: 0 0 0.65rem auto;
		border: 1px solid color-mix(in oklab, var(--market-olive) 18%, var(--color-base-300));
		border-radius: 0.9rem;
		padding: 0.45rem;
		background: color-mix(in oklab, var(--market-card) 95%, transparent);
		box-shadow: 0 8px 20px rgb(48 60 49 / 12%);
	}

	.shopping-market-dock :global(.ui-action) {
		min-width: 0;
		padding-inline: 0.7rem;
	}

	@media (max-width: 47.99rem) {
		:global(.app-shell:has(.shopping-market) .app-main) {
			margin-bottom: var(--shopping-shelf-height);
		}

		.shopping-market-dock {
			position: fixed;
			top: auto;
			right: var(--kitchen-frame-width);
			bottom: var(--ui-nav-offset);
			left: var(--kitchen-frame-width);
			height: var(--shopping-shelf-height);
			max-width: none;
			margin: 0;
			border-bottom: 0;
			border-radius: var(--kitchen-surface-radius) var(--kitchen-surface-radius) 0 0;
			background: var(--kitchen-card);
			box-shadow: 0 -8px 22px rgb(35 58 46 / 13%);
		}
	}

	.market-ah-action span {
		display: inline-grid;
		min-width: 1.25rem;
		height: 1.25rem;
		place-items: center;
		border-radius: 999px;
		background: rgb(255 255 255 / 17%);
		font-size: 0.63rem;
	}

	:global(html[data-theme='dark']) .shopping-market {
		--market-olive-ink: #a4c8ac;
		--market-paper: #1c221e;
		--market-card: #252c27;
	}

	@media (min-width: 48rem) {
		.shopping-market-layout {
			padding-block: 0.85rem 1.25rem;
		}
	}

	.shopping-manage-weekly {
		width: 100%;
		margin-top: 0.75rem;
	}

	.shopping-edit-plan {
		width: 100%;
		margin-bottom: 0.75rem;
	}

	.shopping-edit-plan[aria-disabled='true'] {
		cursor: wait;
		opacity: 0.55;
	}
</style>
