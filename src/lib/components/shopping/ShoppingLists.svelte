<script lang="ts">
	import { base } from '$app/paths';
	import { tick, type Snippet } from 'svelte';
	import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import Icon from '$lib/components/ui/icons/Icon.svelte';
	import { m } from '$lib/paraglide/messages';
	import {
		getShoppingFilterOptions,
		groupShoppingItems,
		nextVisibleShoppingKey,
		projectShoppingStates,
		shoppingItemKey,
		type ShoppingListFilter,
		type ShoppingListSort,
		type StoreRouteSection
	} from '$lib/shopping_list_view';
	import { toast } from '$lib/stores/toast.svelte';
	import { itemLabel, sourceContextLabels } from './format';
	import type { ShoppingListItem, ShoppingListSource } from './types';
	import SourceDecisionSheet from './SourceDecisionSheet.svelte';
	import RecurringShoppingList from './RecurringShoppingList.svelte';
	import LegacyShoppingReview from './LegacyShoppingReview.svelte';

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
	type Legacy = {
		id: number;
		revision: number;
		name: string;
		term: string;
		amount: string | null;
		unit: string | null;
		candidates: Array<{ id: number; revision: number; label: string }>;
	};
	type Props = {
		pending: ShoppingListItem[];
		done: ShoppingListItem[];
		sources: ShoppingListSource[];
		recurring: Recurring[];
		legacy: Legacy[];
		notices?: Snippet;
		emptyState: 'no_meals' | 'nothing_needed';
		showCovered: boolean;
		bonusByName: Record<string, boolean>;
		onToggleBought: (item: ShoppingListItem) => Promise<boolean>;
		onDeleteManual: (source: ShoppingListSource) => Promise<boolean>;
		onRestoreManual: (source: ShoppingListSource) => Promise<boolean>;
		onSaveSource: (
			source: ShoppingListSource,
			input: { need: 'required' | 'optional' | 'stocked'; term: string; useInRecipe: boolean }
		) => Promise<boolean>;
		onAddRecurring: (input: {
			name: string;
			amount: string | null;
			unit: string | null;
		}) => Promise<boolean>;
		onEditRecurring: (
			item: Recurring,
			input: { name: string; amount: string | null; unit: string | null }
		) => Promise<boolean>;
		onSkipRecurring: (item: Recurring) => Promise<boolean>;
		onDisableRecurring: (item: Recurring) => Promise<boolean>;
		onResolveLegacy: (
			item: Legacy,
			resolution: 'attach' | 'manual' | 'dismiss',
			targetEntryId?: number
		) => void;
	};

	let {
		pending,
		done,
		sources,
		recurring,
		legacy,
		notices,
		emptyState,
		showCovered = $bindable(),
		bonusByName,
		onToggleBought,
		onDeleteManual,
		onRestoreManual,
		onSaveSource,
		onAddRecurring,
		onEditRecurring,
		onSkipRecurring,
		onDisableRecurring,
		onResolveLegacy
	}: Props = $props();

	let filter = $state<ShoppingListFilter>({ kind: 'all' });
	let sort = $state<ShoppingListSort>('list');
	let sourceSheetOpen = $state(false);
	let selectedSource = $state<ShoppingListSource | null>(null);
	let itemActionOpen = $state(false);
	let selectedItem = $state<ShoppingListItem | null>(null);
	let rulesOpen = $state(false);
	let rulesScope = $state<'excluded' | 'all'>('all');
	let pendingSource = $state<ShoppingListSource | null>(null);
	let openWeeklyAfterAction = $state(false);
	let actionPending = $state(false);
	let basketOpen = $state(false);
	let shoppingStatus = $state('');
	let weeklyManager = $state<{ openManager: () => Promise<void> }>();

	let filterOptions = $derived(getShoppingFilterOptions([...pending, ...done]));
	let projected = $derived(projectShoppingStates(pending, done, filter, sort));
	let activePending = $derived(projected.active);
	let coveredPending = $derived(projected.covered);
	let completed = $derived(projected.done);
	let activeGroups = $derived(
		sort === 'store'
			? groupShoppingItems(activePending).filter((group) => group.items.length)
			: [{ section: null, items: activePending }]
	);
	let recipeSources = $derived(sources.filter((source) => source.sourceKind === 'recipe'));
	let excludedRecipeSources = $derived(recipeSources.filter((source) => !source.included));
	let visibleRuleSources = $derived(
		rulesScope === 'excluded' ? excludedRecipeSources : recipeSources
	);
	let filterHasResults = $derived(
		activePending.length + coveredPending.length + completed.length > 0
	);

	$effect(() => {
		if (
			(filter.kind === 'weekly' && !filterOptions.hasWeekly) ||
			(filter.kind === 'meal' && !filterOptions.meals.includes(filter.mealName))
		) {
			filter = { kind: 'all' };
		}
	});

	function filterIs(candidate: ShoppingListFilter): boolean {
		return candidate.kind === filter.kind &&
			(candidate.kind !== 'meal' ||
				(filter.kind === 'meal' && candidate.mealName === filter.mealName));
	}

	function routeLabel(section: StoreRouteSection): string {
		switch (section) {
			case 'Fresh': return m.shopping_store_fresh();
			case 'Bakery': return m.shopping_store_bakery();
			case 'Chilled': return m.shopping_store_chilled();
			case 'Pantry': return m.shopping_store_pantry();
			case 'Frozen': return m.shopping_store_frozen();
			case 'Household': return m.shopping_store_household();
			case 'Other': return m.shopping_store_other();
		}
	}

	function openActions(item: ShoppingListItem) {
		selectedItem = item;
		itemActionOpen = true;
	}

	function editSourceAfterClose(source: ShoppingListSource, owner: 'actions' | 'rules') {
		pendingSource = source;
		if (owner === 'actions') itemActionOpen = false;
		else rulesOpen = false;
	}

	async function handleActionClose() {
		if (itemActionOpen) return;
		if (pendingSource) {
			selectedSource = pendingSource;
			pendingSource = null;
			await tick();
			sourceSheetOpen = true;
		} else if (openWeeklyAfterAction) {
			openWeeklyAfterAction = false;
			await tick();
			await weeklyManager?.openManager();
		}
		if (!itemActionOpen) selectedItem = null;
	}

	async function handleRulesClose() {
		if (rulesOpen || !pendingSource) return;
		selectedSource = pendingSource;
		pendingSource = null;
		await tick();
		sourceSheetOpen = true;
	}

	function openRules(scope: 'excluded' | 'all' = 'all') {
		rulesScope = scope === 'excluded' && excludedRecipeSources.length ? 'excluded' : 'all';
		rulesOpen = true;
	}

	async function focusShoppingKey(key: string | null) {
		await tick();
		if (key) {
			const target = [...document.querySelectorAll<HTMLElement>('[data-shopping-key]')]
				.find((element) => element.dataset.shoppingKey === key);
			if (target) {
				target.focus();
				return;
			}
		}
		document.querySelector<HTMLElement>('#shopping-basket-toggle')?.focus();
	}

	async function undoBought(item: ShoppingListItem, key: string) {
		const restored = await onToggleBought(item);
		if (!restored) return;
		await focusShoppingKey(key);
		shoppingStatus = item.bought
			? m.shopping_bought_status({ name: item.name, count: activePending.length })
			: m.shopping_not_bought_status({ name: item.name, count: activePending.length });
	}

	async function toggleBought(item: ShoppingListItem) {
		const wasBought = item.bought;
		const key = shoppingItemKey(item);
		const before = wasBought ? [...completed] : [...activePending];
		const nextKey = wasBought ? key : nextVisibleShoppingKey(before, key);
		const saved = await onToggleBought(item);
		if (!saved) {
			await focusShoppingKey(key);
			return;
		}
		await focusShoppingKey(nextKey);
		shoppingStatus = wasBought
			? m.shopping_not_bought_status({ name: item.name, count: activePending.length })
			: m.shopping_bought_status({ name: item.name, count: activePending.length });
		toast.undo(shoppingStatus, () => void undoBought(item, key));
	}

	async function removeManual(item: ShoppingListItem, source: ShoppingListSource) {
		if (actionPending) return;
		actionPending = true;
		const removed = await onDeleteManual(source);
		actionPending = false;
		if (!removed) return;
		itemActionOpen = false;
		toast.undo(m.shopping_toast_removed({ name: item.name }), () => {
			void onRestoreManual(source).then((restored) => {
				if (!restored) toast.error(m.shopping_toast_restore_failed());
			});
		});
	}
</script>

<section class="shopping-controls" aria-label={m.shopping_list_controls()}>
	<div class="shopping-filter-rail" role="toolbar" aria-label={m.shopping_filter_label()}>
		<button
			type="button"
			class:active={filterIs({ kind: 'all' })}
			aria-pressed={filterIs({ kind: 'all' })}
			onclick={() => (filter = { kind: 'all' })}
		>
			{m.shopping_filter_all()}
		</button>
		{#each filterOptions.meals as meal}
			<button
				type="button"
				class:active={filterIs({ kind: 'meal', mealName: meal })}
				aria-pressed={filterIs({ kind: 'meal', mealName: meal })}
				title={meal}
				onclick={() => (filter = { kind: 'meal', mealName: meal })}
			>
				{meal}
			</button>
		{/each}
		{#if filterOptions.hasWeekly}
			<button
				type="button"
				class:active={filterIs({ kind: 'weekly' })}
				aria-pressed={filterIs({ kind: 'weekly' })}
				onclick={() => (filter = { kind: 'weekly' })}
			>
				{m.shopping_filter_weekly()}
			</button>
		{/if}
	</div>
	<div class="shopping-list-tools">
		<label>
			<span class="sr-only">{m.shopping_sort_label()}</span>
			<select
				class="select min-h-11"
				value={sort}
				aria-label={m.shopping_sort_label()}
				onchange={(event) => (sort = event.currentTarget.value as ShoppingListSort)}
			>
				<option value="list">{m.shopping_sort_list()}</option>
				<option value="alpha">{m.shopping_sort_az()}</option>
				<option value="store">{m.shopping_sort_store()}</option>
			</select>
		</label>
		<RecurringShoppingList
			bind:this={weeklyManager}
			items={recurring}
			onAdd={onAddRecurring}
			onEdit={onEditRecurring}
			onSkip={onSkipRecurring}
			onDisable={onDisableRecurring}
		/>
		<button
			type="button"
			class="shopping-rules-trigger"
			disabled={!recipeSources.length}
			onclick={() => openRules('all')}
		>
			<Icon name="settings" />
			{m.shopping_manage_rules()}
		</button>
	</div>
</section>

{#if excludedRecipeSources.length}
	<button type="button" class="shopping-excluded-rules" onclick={() => openRules('excluded')}>
		{m.shopping_excluded_rules({ count: excludedRecipeSources.length })}
	</button>
{/if}

{#if notices}{@render notices()}{/if}
<LegacyShoppingReview items={legacy} onResolve={onResolveLegacy} />
<p class="sr-only" aria-live="polite">{shoppingStatus}</p>

{#if coveredPending.length}
	<div class="market-covered-toggle">
		<button
			type="button"
			class:active={showCovered}
			aria-pressed={showCovered}
			onclick={() => (showCovered = !showCovered)}
		>
			{m.shopping_in_stock_chip({ count: coveredPending.length })}
		</button>
	</div>
{/if}

{#if pending.length === 0 && done.length === 0}
	<EmptyState
		iconName={emptyState === 'no_meals' ? 'calendar' : 'jar'}
		title={emptyState === 'no_meals' ? m.shopping_empty_no_meals_title() : m.shopping_empty_nothing_title()}
		description={emptyState === 'no_meals' ? m.shopping_empty_no_meals_desc() : m.shopping_empty_nothing_desc()}
	>
		{#snippet action()}
			<a
				class="btn btn-primary min-h-11"
				href={emptyState === 'no_meals' ? `${base}/meal-plan` : `${base}/inventory`}
			>
				{emptyState === 'no_meals' ? m.shopping_plan_meals_button() : m.shopping_view_stock_button()}
			</a>
		{/snippet}
	</EmptyState>
{:else if !filterHasResults}
	<div class="shopping-filter-empty">
		<h2>{m.shopping_filter_empty()}</h2>
		<button type="button" onclick={() => (filter = { kind: 'all' })}>{m.shopping_clear_filter()}</button>
	</div>
{:else if activePending.length}
	<div class="shopping-active-groups">
		{#each activeGroups as group}
			{#if group.section}<h2>{routeLabel(group.section)}</h2>{/if}
			<ul class="market-run-list">
				{#each group.items as item, index (shoppingItemKey(item))}
					{@const key = shoppingItemKey(item)}
					{@const recipeOwned = item.sources?.filter((source) => source.sourceKind === 'recipe') ?? []}
					<li class:warning={item.incompatibleQuantities} class="market-run-row">
						<label class="market-check-hit" aria-label={m.shopping_mark_bought_aria({ name: item.name })}>
							<input
								id={`buy-${key}`}
								data-shopping-key={key}
								type="checkbox"
								checked={item.bought}
								onchange={() => void toggleBought(item)}
							/>
							<span><Icon name="check" /></span>
						</label>
						<label for={`buy-${key}`} class="market-row-copy">
							<strong title={item.name}>{item.name}</strong>
							{#if itemLabel(item)}<span>{itemLabel(item)}</span>{/if}
							{#if !item.incompatibleQuantities && recipeOwned.length > 1}
								<span class="market-shared-context">
									{m.shopping_shared_recipes({ count: recipeOwned.length })} ·
									{recipeOwned.map((source) => source.recipeTitle).filter(Boolean).join(', ')}
								</span>
							{/if}
							{#if item.incompatibleQuantities && item.sources?.length}
								<ul class="market-source-lines" aria-label={m.shopping_quantity_sources_label()}>
									{#each item.sources as source (source.id)}
										{@const contexts = sourceContextLabels(source)}
										<li>
											<strong>{itemLabel(source) || source.name}</strong>
											<span>
												{contexts.length
													? contexts.join(' · ')
													: source.sourceKind === 'weekly'
														? m.shopping_filter_weekly()
														: m.shopping_source_manual()}
											</span>
										</li>
									{/each}
								</ul>
							{/if}
						</label>
						<div class="market-row-trailing">
							{#if bonusByName[item.name]}<span class="market-item-badge bonus">{m.shopping_bonus_chip()}</span>{/if}
							{#if item.sources?.length}
								<button
									type="button"
									class="market-row-more"
									aria-label={m.shopping_item_actions_aria({ name: item.name })}
									onclick={() => openActions(item)}
								>
									<span aria-hidden="true">•••</span>
								</button>
							{/if}
						</div>
					</li>
				{/each}
			</ul>
		{/each}
	</div>
{:else if completed.length}
	<div class="market-complete">
		<div><Icon name="check" /></div>
		<h2>{m.shopping_list_complete_title()}</h2>
		<p>{m.shopping_list_complete_desc()}</p>
		<button id="shopping-basket-toggle" type="button" onclick={() => (basketOpen = !basketOpen)}>
			{basketOpen ? m.shopping_hide_basket() : `${m.shopping_review_basket()} · ${completed.length}`}
		</button>
	</div>
{:else}
	<EmptyState mini title={m.shopping_empty_stock_covers()} />
{/if}

{#if showCovered && coveredPending.length}
	<ul class="market-run-list market-covered-list" aria-label={m.shopping_in_stock_chip({ count: coveredPending.length })}>
		{#each coveredPending as item (shoppingItemKey(item))}
			<li class="market-run-row covered">
				<div class="market-covered-marker" aria-hidden="true"><Icon name="check" /></div>
				<div class="market-row-copy">
					<strong title={item.name}>{item.name}</strong>
					{#if itemLabel(item)}<span>{itemLabel(item)}</span>{/if}
				</div>
				<div class="market-row-trailing">
					<span class="market-item-badge stock">{m.shopping_covered_badge()}</span>
					{#if item.sources?.length}
						<button
							type="button"
							class="market-row-more"
							aria-label={m.shopping_item_actions_aria({ name: item.name })}
							onclick={() => openActions(item)}
						><span aria-hidden="true">•••</span></button>
					{/if}
				</div>
			</li>
		{/each}
	</ul>
{/if}

{#if completed.length && activePending.length}
	<button
		id="shopping-basket-toggle"
		type="button"
		class="market-basket-summary"
		aria-expanded={basketOpen}
		onclick={() => (basketOpen = !basketOpen)}
	>
		<span><strong>{m.shopping_in_basket_heading({ count: completed.length })}</strong></span>
		<span>{basketOpen ? m.shopping_hide_basket() : m.shopping_review_basket()}</span>
	</button>
{/if}

{#if completed.length && basketOpen}
	<ul class="market-run-list market-done-list">
		{#each completed as item (shoppingItemKey(item))}
			{@const key = shoppingItemKey(item)}
			<li class="market-run-row">
				<label class="market-check-hit" aria-label={m.shopping_mark_not_bought_aria({ name: item.name })}>
					<input
						id={`done-${key}`}
						data-shopping-key={key}
						type="checkbox"
						checked
						onchange={() => void toggleBought(item)}
					/>
					<span><Icon name="check" /></span>
				</label>
				<label for={`done-${key}`} class="market-row-copy"><strong>{item.name}</strong></label>
				{#if item.sources?.length}
					<button
						type="button"
						class="market-row-more"
						aria-label={m.shopping_item_actions_aria({ name: item.name })}
						onclick={() => openActions(item)}
					><span aria-hidden="true">•••</span></button>
				{/if}
			</li>
		{/each}
	</ul>
{/if}

<SourceDecisionSheet bind:open={sourceSheetOpen} source={selectedSource} onSave={onSaveSource} />

<BottomSheet
	bind:open={itemActionOpen}
	title={selectedItem?.name ?? m.shopping_item_actions_title_generic()}
	desktopSide
	dismissible={!actionPending}
	onclose={handleActionClose}
>
	{#if selectedItem}
		{@const itemRecipeSources = selectedItem.sources?.filter((source) => source.sourceKind === 'recipe') ?? []}
		{@const itemManualSources = selectedItem.sources?.filter((source) => source.sourceKind === 'manual') ?? []}
		{@const hasWeeklySource = selectedItem.sources?.some((source) => source.sourceKind === 'weekly')}
		{#if itemRecipeSources.length}
			<div class="source-action-group">
				<h3>
					{itemRecipeSources.length > 1
						? m.shopping_choose_rule()
						: m.shopping_edit_rule()}
				</h3>
				{#each itemRecipeSources as source (source.id)}
					<button
						type="button"
						disabled={actionPending}
						onclick={() => editSourceAfterClose(source, 'actions')}
					>
						<span>
							<strong>{m.shopping_edit_rule()}</strong>
							<small>{[source.name, source.recipeTitle, source.component].filter(Boolean).join(' · ')}</small>
						</span>
						<Icon name="chevronRight" />
					</button>
				{/each}
			</div>
		{/if}
		{#if itemManualSources.length}
			<div class="source-action-group">
				<h3>{m.shopping_source_manual()}</h3>
				{#each itemManualSources as source (source.id)}
					<button
						type="button"
						class="danger"
						disabled={actionPending}
						onclick={() => void removeManual(selectedItem!, source)}
					>
						<span>
							<strong>{m.shopping_remove_this_week()}</strong>
							<small>{[source.name, itemLabel(source)].filter(Boolean).join(' · ')}</small>
						</span>
						<Icon name="trash" />
					</button>
				{/each}
			</div>
		{/if}
		{#if hasWeeklySource}
			<div class="source-action-group">
				<h3>{m.shopping_filter_weekly()}</h3>
				<button
					type="button"
					disabled={actionPending}
					onclick={() => {
						openWeeklyAfterAction = true;
						itemActionOpen = false;
					}}
				>
					<span><strong>{m.shopping_manage_weekly_items()}</strong></span>
					<Icon name="chevronRight" />
				</button>
			</div>
		{/if}
	{/if}
</BottomSheet>

<BottomSheet
	bind:open={rulesOpen}
	title={m.shopping_manage_rules()}
	desktopSide
	onclose={handleRulesClose}
>
	<p class="rules-help">{m.shopping_manage_rules_help()}</p>
	{#if excludedRecipeSources.length}
		<div class="rules-scope" role="group" aria-label={m.shopping_manage_rules()}>
			<button
				type="button"
				class:active={rulesScope === 'excluded'}
				aria-pressed={rulesScope === 'excluded'}
				onclick={() => (rulesScope = 'excluded')}
			>{m.shopping_rules_not_on_list({ count: excludedRecipeSources.length })}</button>
			<button
				type="button"
				class:active={rulesScope === 'all'}
				aria-pressed={rulesScope === 'all'}
				onclick={() => (rulesScope = 'all')}
			>{m.shopping_rules_all({ count: recipeSources.length })}</button>
		</div>
	{/if}
	{#if visibleRuleSources.length}
		<ul class="rules-list">
			{#each visibleRuleSources as source (source.id)}
				<li>
					<div>
						<strong>{source.name}</strong>
						<span>{[source.recipeTitle, source.component].filter(Boolean).join(' · ')}</span>
						<small>
							{source.staple
								? m.shopping_need_usually_stocked()
								: source.optional
									? m.shopping_need_nice_to_have()
									: m.shopping_need_every_time()}
						</small>
					</div>
					<button type="button" onclick={() => editSourceAfterClose(source, 'rules')}>
						{m.shopping_edit_rule()}
					</button>
				</li>
			{/each}
		</ul>
	{:else}
		<EmptyState mini title={m.shopping_rules_none_excluded()} />
	{/if}
</BottomSheet>

<style>
	.shopping-controls {
		display: grid;
		gap: 0.5rem;
		margin-bottom: 0.55rem;
	}

	.shopping-filter-rail {
		display: flex;
		gap: 0.35rem;
		overflow-x: auto;
		padding-bottom: 0.1rem;
		scrollbar-width: thin;
	}

	.shopping-filter-rail button,
	.shopping-excluded-rules {
		min-height: 2.75rem;
		flex: 0 0 auto;
		border: 1px solid color-mix(in oklab, var(--market-olive, #304b3a) 20%, var(--color-base-300));
		border-radius: 999px;
		padding: 0 0.8rem;
		background: var(--color-base-100);
		color: color-mix(in oklab, var(--color-base-content) 76%, transparent);
		font-size: 0.7rem;
		font-weight: 750;
	}

	.shopping-filter-rail button.active {
		border-color: var(--market-olive, #304b3a);
		background: var(--market-olive, #304b3a);
		color: white;
	}

	.shopping-list-tools {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}

	.shopping-list-tools label {
		min-width: 8.5rem;
		flex: 1 1 8.5rem;
	}

	.shopping-list-tools select {
		width: 100%;
		border-color: color-mix(in oklab, var(--market-olive, #304b3a) 20%, var(--color-base-300));
		background-color: var(--color-base-100);
		font-size: 0.72rem;
		font-weight: 700;
	}

	.shopping-rules-trigger {
		display: inline-flex;
		min-height: 2.75rem;
		align-items: center;
		justify-content: center;
		gap: 0.45rem;
		border: 1px solid color-mix(in oklab, var(--market-olive, #304b3a) 24%, var(--color-base-300));
		border-radius: 0.7rem;
		padding: 0 0.75rem;
		background: var(--color-base-100);
		color: var(--market-olive-ink, #304b3a);
		font-size: 0.72rem;
		font-weight: 750;
	}

	.shopping-rules-trigger:disabled {
		opacity: 0.45;
	}

	.shopping-rules-trigger :global(svg) {
		width: 1rem;
		height: 1rem;
	}

	.shopping-excluded-rules {
		min-height: 2.4rem;
		margin: -0.2rem 0 0.55rem;
		border-style: dashed;
		color: var(--market-olive-ink, #304b3a);
	}

	.market-covered-toggle {
		display: flex;
		justify-content: flex-end;
		margin: 0.5rem 0 0.45rem;
	}

	.market-covered-toggle button {
		min-height: 2.75rem;
		border: 1px solid color-mix(in oklab, var(--market-olive, #304b3a) 22%, var(--color-base-300));
		border-radius: 999px;
		padding: 0 0.75rem;
		background: color-mix(in oklab, #dfe8dd 70%, var(--color-base-100));
		color: var(--market-olive-ink, #304b3a);
		font-size: 0.68rem;
		font-weight: 750;
	}

	.market-covered-toggle button.active {
		background: var(--market-olive, #304b3a);
		color: white;
	}

	.shopping-filter-empty {
		display: grid;
		justify-items: center;
		gap: 0.65rem;
		border: 1px dashed var(--color-base-300);
		border-radius: 0.85rem;
		padding: 1.5rem 1rem;
		background: var(--color-base-100);
		text-align: center;
	}

	.shopping-filter-empty h2 {
		font-size: 0.85rem;
		font-weight: 700;
	}

	.shopping-filter-empty button {
		min-height: 2.75rem;
		border-radius: 0.65rem;
		padding: 0 0.8rem;
		background: var(--market-olive, #304b3a);
		color: white;
		font-size: 0.72rem;
		font-weight: 750;
	}

	.shopping-active-groups {
		display: grid;
		gap: 0.45rem;
	}

	.shopping-active-groups h2 {
		padding: 0.25rem 0.2rem 0;
		color: color-mix(in oklab, var(--color-base-content) 62%, transparent);
		font-size: 0.64rem;
		font-weight: 850;
		letter-spacing: 0.09em;
		text-transform: uppercase;
	}

	.market-run-list {
		overflow: hidden;
		margin: 0;
		padding: 0;
		border: 1px solid color-mix(in oklab, var(--market-olive, #304b3a) 18%, var(--color-base-300));
		border-radius: 0.85rem;
		background: var(--color-base-100);
		box-shadow: 0 6px 18px rgb(48 75 58 / 5%);
		list-style: none;
	}

	.market-run-row {
		display: grid;
		grid-template-columns: 2.75rem minmax(0, 1fr) auto;
		align-items: center;
		min-height: 3.125rem;
		border-bottom: 1px solid var(--color-base-200);
	}

	.market-run-row:last-child {
		border-bottom: 0;
	}

	.market-run-row.warning {
		background: color-mix(in oklab, var(--color-warning) 8%, var(--color-base-100));
	}

	.market-run-row.covered {
		opacity: 0.62;
	}

	.market-check-hit,
	.market-covered-marker {
		display: grid;
		width: 2.75rem;
		height: 2.75rem;
		place-items: center;
	}

	.market-check-hit {
		cursor: pointer;
	}

	.market-covered-marker {
		color: var(--market-olive-ink, #304b3a);
	}

	.market-covered-marker :global(svg) {
		width: 1rem;
		height: 1rem;
	}

	.market-check-hit input {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		clip-path: inset(50%);
		white-space: nowrap;
	}

	.market-check-hit span {
		display: grid;
		width: 1.5rem;
		height: 1.5rem;
		place-items: center;
		border: 1.5px solid color-mix(in oklab, var(--color-base-content) 42%, transparent);
		border-radius: 999px;
		background: var(--color-base-100);
		color: transparent;
		transition:
			background var(--motion-micro) var(--ease-standard),
			border-color var(--motion-micro) var(--ease-standard);
	}

	.market-check-hit input:focus-visible + span {
		outline: 3px solid var(--color-accent);
		outline-offset: 2px;
	}

	.market-check-hit input:checked + span {
		border-color: var(--market-olive, #304b3a);
		background: var(--market-olive, #304b3a);
		color: white;
	}

	.market-check-hit :global(svg) {
		width: 0.9rem;
		height: 0.9rem;
	}

	.market-row-copy {
		min-width: 0;
		cursor: pointer;
		padding: 0.4rem 0.3rem 0.4rem 0;
	}

	.market-row-copy > strong {
		display: block;
		overflow: hidden;
		font-size: 0.78rem;
		line-height: 1.25;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.market-row-copy > span {
		display: block;
		overflow: hidden;
		margin-top: 0.1rem;
		color: color-mix(in oklab, var(--color-base-content) 70%, transparent);
		font-size: 0.63rem;
		line-height: 1.3;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.market-shared-context {
		color: color-mix(in oklab, var(--market-olive-ink, #304b3a) 78%, transparent) !important;
	}

	.market-source-lines {
		margin-top: 0.35rem;
		border-left: 2px solid color-mix(in oklab, var(--color-warning) 55%, transparent);
		padding-left: 0.5rem;
	}

	.market-source-lines li {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.15rem 0.45rem;
		color: color-mix(in oklab, var(--color-base-content) 72%, transparent);
		font-size: 0.64rem;
		line-height: 1.45;
	}

	.market-source-lines strong {
		font-variant-numeric: tabular-nums;
	}

	.market-row-trailing {
		display: flex;
		align-items: center;
		gap: 0.15rem;
		padding-right: 0.15rem;
	}

	.market-item-badge {
		border-radius: 999px;
		padding: 0.25rem 0.4rem;
		font-size: 0.56rem;
		font-weight: 800;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.market-item-badge.bonus {
		background: color-mix(in oklab, var(--color-warning) 20%, var(--color-base-100));
		color: color-mix(in oklab, var(--color-warning) 72%, var(--color-base-content));
	}

	.market-item-badge.stock {
		background: color-mix(in oklab, var(--color-success) 16%, var(--color-base-100));
		color: color-mix(in oklab, var(--color-success) 65%, var(--color-base-content));
	}

	.market-row-more {
		display: grid;
		width: 2.75rem;
		height: 2.75rem;
		place-items: center;
		border-radius: 0.6rem;
		color: color-mix(in oklab, var(--color-base-content) 58%, transparent);
		font-size: 0.72rem;
		font-weight: 800;
		letter-spacing: 0.06em;
	}

	.market-basket-summary {
		display: flex;
		width: 100%;
		min-height: 2.75rem;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		margin-top: 0.5rem;
		border: 1px dashed color-mix(in oklab, var(--market-olive, #304b3a) 25%, var(--color-base-300));
		border-radius: 0.75rem;
		padding: 0 0.75rem;
		background: color-mix(in oklab, var(--color-base-100) 72%, transparent);
		color: color-mix(in oklab, var(--color-base-content) 72%, transparent);
		font-size: 0.68rem;
		text-align: left;
	}

	.market-basket-summary > span:last-child {
		color: var(--market-olive-ink, #304b3a);
		font-weight: 750;
	}

	.market-done-list,
	.market-covered-list {
		margin-top: 0.45rem;
	}

	.market-done-list {
		opacity: 0.62;
	}

	.market-done-list .market-row-copy strong {
		text-decoration: line-through;
	}

	.market-complete {
		border: 1px solid color-mix(in oklab, var(--color-success) 35%, var(--color-base-300));
		border-radius: 0.9rem;
		padding: 2rem 1.25rem;
		background: color-mix(in oklab, var(--color-success) 8%, var(--color-base-100));
		text-align: center;
	}

	.market-complete > div {
		display: grid;
		width: 3rem;
		height: 3rem;
		margin: 0 auto 0.7rem;
		place-items: center;
		border-radius: 999px;
		background: color-mix(in oklab, var(--color-success) 18%, var(--color-base-100));
		color: var(--color-success);
	}

	.market-complete h2 {
		font-family: var(--kitchen-display);
		font-size: 1.35rem;
		font-weight: 500;
	}

	.market-complete p {
		max-width: 23rem;
		margin: 0.35rem auto 0;
		color: color-mix(in oklab, var(--color-base-content) 72%, transparent);
		font-size: 0.72rem;
		line-height: 1.5;
	}

	.market-complete button {
		min-height: 2.75rem;
		margin-top: 0.9rem;
		border-radius: 0.65rem;
		padding: 0 0.9rem;
		background: var(--market-olive, #304b3a);
		color: white;
		font-size: 0.72rem;
		font-weight: 750;
	}

	.source-action-group + .source-action-group {
		margin-top: 0.8rem;
		border-top: 1px solid var(--color-base-200);
		padding-top: 0.8rem;
	}

	.source-action-group h3 {
		margin-bottom: 0.35rem;
		color: color-mix(in oklab, var(--color-base-content) 60%, transparent);
		font-size: 0.65rem;
		font-weight: 850;
		letter-spacing: 0.07em;
		text-transform: uppercase;
	}

	.source-action-group button {
		display: flex;
		width: 100%;
		min-height: 2.75rem;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		border-radius: 0.65rem;
		padding: 0.45rem 0.6rem;
		text-align: left;
	}

	.source-action-group button:hover,
	.source-action-group button:focus-visible {
		background: var(--color-base-200);
	}

	.source-action-group button span {
		min-width: 0;
	}

	.source-action-group button strong,
	.source-action-group button small {
		display: block;
	}

	.source-action-group button strong {
		font-size: 0.75rem;
	}

	.source-action-group button small {
		overflow: hidden;
		margin-top: 0.1rem;
		color: color-mix(in oklab, var(--color-base-content) 62%, transparent);
		font-size: 0.65rem;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.source-action-group button :global(svg) {
		width: 1rem;
		height: 1rem;
		flex: 0 0 auto;
	}

	.source-action-group button.danger {
		color: var(--color-error);
	}

	.rules-help {
		color: color-mix(in oklab, var(--color-base-content) 68%, transparent);
		font-size: 0.75rem;
		line-height: 1.45;
	}

	.rules-scope {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.25rem;
		margin-top: 0.75rem;
		border-radius: 0.75rem;
		padding: 0.2rem;
		background: var(--color-base-200);
	}

	.rules-scope button {
		min-height: 2.75rem;
		border-radius: 0.6rem;
		padding: 0 0.5rem;
		font-size: 0.68rem;
		font-weight: 750;
	}

	.rules-scope button.active {
		background: var(--color-base-100);
		color: var(--market-olive-ink, #304b3a);
		box-shadow: 0 2px 8px rgb(0 0 0 / 7%);
	}

	.rules-list {
		overflow: hidden;
		margin-top: 0.65rem;
		border: 1px solid var(--color-base-300);
		border-radius: 0.85rem;
	}

	.rules-list li {
		display: flex;
		min-height: 3.8rem;
		align-items: center;
		justify-content: space-between;
		gap: 0.6rem;
		border-bottom: 1px solid var(--color-base-200);
		padding: 0.5rem 0.55rem 0.5rem 0.75rem;
	}

	.rules-list li:last-child {
		border-bottom: 0;
	}

	.rules-list div {
		min-width: 0;
	}

	.rules-list strong,
	.rules-list span,
	.rules-list small {
		display: block;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.rules-list strong {
		font-size: 0.76rem;
	}

	.rules-list span,
	.rules-list small {
		margin-top: 0.1rem;
		color: color-mix(in oklab, var(--color-base-content) 64%, transparent);
		font-size: 0.64rem;
	}

	.rules-list li > button {
		min-height: 2.75rem;
		flex: 0 0 auto;
		border-radius: 0.6rem;
		padding: 0 0.6rem;
		color: var(--market-olive-ink, #304b3a);
		font-size: 0.68rem;
		font-weight: 750;
	}

	@media (max-width: 20rem) {
		.shopping-list-tools {
			display: grid;
			grid-template-columns: minmax(0, 1fr);
		}

		.shopping-list-tools label,
		.shopping-rules-trigger {
			width: 100%;
		}

		.rules-scope {
			grid-template-columns: minmax(0, 1fr);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.market-check-hit span {
			transition: none;
		}
	}
</style>
