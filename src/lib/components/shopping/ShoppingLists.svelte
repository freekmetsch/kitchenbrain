<script lang="ts">
	import { base } from '$app/paths';
	import { tick, type Snippet } from 'svelte';
	import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import Icon from '$lib/components/ui/icons/Icon.svelte';
	import { m } from '$lib/paraglide/messages';
	import {
		shoppingItemKey,
		type ShoppingBoardSection
	} from '$lib/shopping_list_view';
	import { toast } from '$lib/stores/toast.svelte';
	import { itemLabel, sourceContextLabels } from './format';
	import {
		createShoppingListController,
		type LegacyShoppingItem,
		type RecurringShoppingItem
	} from './list-controller.svelte';
	import type { ShoppingListItem, ShoppingListSource } from './types';
	import SourceDecisionSheet from './SourceDecisionSheet.svelte';
	import ShoppingRuleEditor from './ShoppingRuleEditor.svelte';
	import RecurringShoppingList from './RecurringShoppingList.svelte';
	import LegacyShoppingReview from './LegacyShoppingReview.svelte';

	type Props = {
		pending: ShoppingListItem[];
		done: ShoppingListItem[];
		sources: ShoppingListSource[];
		recurring: RecurringShoppingItem[];
		legacy: LegacyShoppingItem[];
		notices?: Snippet;
		history?: Snippet;
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
			item: RecurringShoppingItem,
			input: { name: string; amount: string | null; unit: string | null }
		) => Promise<boolean>;
		onSkipRecurring: (item: RecurringShoppingItem) => Promise<boolean>;
		onDisableRecurring: (item: RecurringShoppingItem) => Promise<boolean>;
		onResolveLegacy: (
			item: LegacyShoppingItem,
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
		history,
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

	let weeklyManager = $state<{ openManager: () => Promise<void> }>();
	let expandedRuleSourceId = $state<number | null>(null);

	function sectionLabel(section: ShoppingBoardSection): string {
		switch (section.kind) {
			case 'weekly': return m.shopping_filter_weekly();
			case 'shared': return m.shopping_section_shared();
			case 'meal': return section.mealName ?? m.shopping_section_other();
			case 'other': return m.shopping_section_other();
		}
	}

	function needLabel(source: ShoppingListSource): string {
		if (source.staple) return m.shopping_need_usually_stocked();
		if (source.optional) return m.shopping_need_nice_to_have();
		return m.shopping_need_every_time();
	}

	function ruleSummary(sources: ShoppingListSource[]): string {
		if (sources.length > 1) return m.shopping_rule_count({ count: sources.length });
		const source = sources[0];
		return source ? `${needLabel(source)} · ${source.term}` : '';
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

	const controller = createShoppingListController({
		pending: () => pending,
		done: () => done,
		sources: () => sources,
		recurring: () => recurring,
		legacy: () => legacy,
		emptyState: () => emptyState,
		onToggleBought: (item) => onToggleBought(item),
		onDeleteManual: (source) => onDeleteManual(source),
		onRestoreManual: (source) => onRestoreManual(source),
		focus: focusShoppingKey,
		settle: tick,
		openWeeklyManager: async () => {
			await weeklyManager?.openManager();
		},
		notifyUndo: (message, action) => toast.undo(message, () => void action()),
		notifyError: (message) => toast.error(message),
		messages: {
			bought: (name, count) => m.shopping_bought_status({ name, count }),
			notBought: (name, count) => m.shopping_not_bought_status({ name, count }),
			removed: (name) => m.shopping_toast_removed({ name }),
			restoreFailed: () => m.shopping_toast_restore_failed()
		}
	});

	$effect(() => {
		controller.reconcileFilter();
	});

	export function openRules(scope: 'excluded' | 'all' = 'all') {
		expandedRuleSourceId = null;
		controller.openRules(scope);
	}
</script>

<div class="shopping-controls" role="region" aria-label={m.shopping_list_controls()}>
	<div class="shopping-filter-row">
		<div
			class="shopping-filter-rail"
			role="toolbar"
			aria-label={m.shopping_filter_label()}
		>
			<button
				type="button"
				class:active={controller.filterIs({ kind: 'all' })}
				aria-pressed={controller.filterIs({ kind: 'all' })}
				onclick={() => controller.setFilter({ kind: 'all' })}
			>
				{m.shopping_filter_all()}
			</button>
			<button
				type="button"
				class:active={controller.filterIs({ kind: 'weekly' })}
				aria-pressed={controller.filterIs({ kind: 'weekly' })}
				onclick={() => controller.setFilter({ kind: 'weekly' })}
			>
				{m.shopping_filter_weekly()}
			</button>
			{#each controller.filterOptions.meals as meal}
				<button
					type="button"
					class:active={controller.filterIs({ kind: 'meal', mealName: meal })}
					aria-pressed={controller.filterIs({ kind: 'meal', mealName: meal })}
					title={meal}
					onclick={() => controller.setFilter({ kind: 'meal', mealName: meal })}
				>
					{meal}
				</button>
			{/each}
		</div>
	</div>
</div>

{#if history}{@render history()}{/if}

<RecurringShoppingList
	bind:this={weeklyManager}
	items={controller.recurring}
	onAdd={onAddRecurring}
	onEdit={onEditRecurring}
	onSkip={onSkipRecurring}
	onDisable={onDisableRecurring}
/>

{#if notices}{@render notices()}{/if}
<LegacyShoppingReview items={controller.legacy} onResolve={onResolveLegacy} />
<p class="sr-only" aria-live="polite">{controller.shoppingStatus}</p>

{#if controller.coveredPending.length}
	<div class="market-covered-toggle">
		<button
			type="button"
			class:active={showCovered}
			aria-pressed={showCovered}
			onclick={() => (showCovered = !showCovered)}
		>
			{m.shopping_in_stock_chip({ count: controller.coveredPending.length })}
		</button>
	</div>
{/if}

{#if controller.viewMode === 'empty'}
	<EmptyState
		iconName={controller.emptyState === 'no_meals' ? 'calendar' : 'jar'}
		title={controller.emptyState === 'no_meals' ? m.shopping_empty_no_meals_title() : m.shopping_empty_nothing_title()}
		description={controller.emptyState === 'no_meals' ? m.shopping_empty_no_meals_desc() : m.shopping_empty_nothing_desc()}
	>
		{#snippet action()}
			<a
				class="btn btn-primary min-h-11"
				href={controller.emptyState === 'no_meals' ? `${base}/meal-plan` : `${base}/inventory`}
			>
				{controller.emptyState === 'no_meals' ? m.shopping_plan_meals_button() : m.shopping_view_stock_button()}
			</a>
		{/snippet}
	</EmptyState>
{:else if controller.viewMode === 'filter-empty'}
	{#if controller.filter.kind === 'weekly'}
		<section class="shopping-ledger-section weekly">
			<header class="shopping-section-header">
				<h2>{m.shopping_filter_weekly()} <span>· 0</span></h2>
				<button type="button" onclick={() => weeklyManager?.openManager()}>
					{m.shopping_recurring_manage()}
				</button>
			</header>
			<p class="shopping-section-empty">{m.shopping_weekly_empty()}</p>
		</section>
	{:else}
		<div class="shopping-filter-empty">
			<h2>{m.shopping_filter_empty()}</h2>
			<button type="button" onclick={() => controller.setFilter({ kind: 'all' })}>{m.shopping_clear_filter()}</button>
		</div>
	{/if}
{:else if controller.viewMode === 'active'}
	<div class="shopping-active-groups">
		{#each controller.activeGroups as group (group.key)}
			<section
				class:weekly={group.kind === 'weekly'}
				class:shared={group.kind === 'shared'}
				class="shopping-ledger-section"
			>
				<header class="shopping-section-header">
					<h2>{sectionLabel(group)} <span>· {group.items.length}</span></h2>
					{#if group.kind === 'weekly'}
						<button type="button" onclick={() => weeklyManager?.openManager()}>
							{m.shopping_recurring_manage()}
						</button>
					{/if}
				</header>
				{#if group.items.length}
				<ul class="market-run-list">
				{#each group.items as item, index (shoppingItemKey(item))}
					{@const key = shoppingItemKey(item)}
					{@const recipeOwned = item.sources?.filter((source) => source.sourceKind === 'recipe') ?? []}
					{@const actionOwned = item.sources?.filter((source) => source.sourceKind !== 'recipe') ?? []}
					<li class:warning={item.incompatibleQuantities} class="market-run-row">
						<label class="market-check-hit" aria-label={m.shopping_mark_bought_aria({ name: item.name })}>
							<input
								id={`buy-${key}`}
								data-shopping-key={key}
								type="checkbox"
								checked={item.bought}
								onchange={() => void controller.toggleBought(item)}
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
							{#if recipeOwned.length}
								<button
									type="button"
									class="market-rule-summary"
									title={ruleSummary(recipeOwned)}
									aria-label={m.shopping_edit_rule_aria({ name: item.name })}
									onclick={() => controller.openRuleSources(recipeOwned)}
								>
									{ruleSummary(recipeOwned)}
								</button>
							{/if}
							{#if actionOwned.length}
								<button
									type="button"
									class="market-row-more"
									aria-label={m.shopping_item_actions_aria({ name: item.name })}
									onclick={() => controller.openActions(item)}
								>
									<span aria-hidden="true">•••</span>
								</button>
							{/if}
						</div>
					</li>
				{/each}
				</ul>
				{:else}
					<p class="shopping-section-empty">{m.shopping_weekly_empty()}</p>
				{/if}
			</section>
		{/each}
	</div>
{:else if controller.viewMode === 'complete'}
	<div class="market-complete">
		<div><Icon name="check" /></div>
		<h2>{m.shopping_list_complete_title()}</h2>
		<p>{m.shopping_list_complete_desc()}</p>
		<button id="shopping-basket-toggle" type="button" onclick={() => (controller.basketOpen = !controller.basketOpen)}>
			{controller.basketOpen ? m.shopping_hide_basket() : `${m.shopping_review_basket()} · ${controller.completed.length}`}
		</button>
	</div>
{:else}
	<EmptyState mini title={m.shopping_empty_stock_covers()} />
{/if}

{#if showCovered && controller.coveredPending.length}
	<ul class="market-run-list market-covered-list" aria-label={m.shopping_in_stock_chip({ count: controller.coveredPending.length })}>
		{#each controller.coveredPending as item (shoppingItemKey(item))}
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
							onclick={() => controller.openActions(item)}
						><span aria-hidden="true">•••</span></button>
					{/if}
				</div>
			</li>
		{/each}
	</ul>
{/if}

{#if controller.completed.length && controller.activePending.length}
	<button
		id="shopping-basket-toggle"
		type="button"
		class="market-basket-summary"
		aria-expanded={controller.basketOpen}
		onclick={() => (controller.basketOpen = !controller.basketOpen)}
	>
		<span><strong>{m.shopping_in_basket_heading({ count: controller.completed.length })}</strong></span>
		<span>{controller.basketOpen ? m.shopping_hide_basket() : m.shopping_review_basket()}</span>
	</button>
{/if}

{#if controller.completed.length && controller.basketOpen}
	<ul class="market-run-list market-done-list">
		{#each controller.completed as item (shoppingItemKey(item))}
			{@const key = shoppingItemKey(item)}
			<li class="market-run-row">
				<label class="market-check-hit" aria-label={m.shopping_mark_not_bought_aria({ name: item.name })}>
					<input
						id={`done-${key}`}
						data-shopping-key={key}
						type="checkbox"
						checked
						onchange={() => void controller.toggleBought(item)}
					/>
					<span><Icon name="check" /></span>
				</label>
				<label for={`done-${key}`} class="market-row-copy"><strong>{item.name}</strong></label>
				{#if item.sources?.length}
					<button
						type="button"
						class="market-row-more"
						aria-label={m.shopping_item_actions_aria({ name: item.name })}
						onclick={() => controller.openActions(item)}
					><span aria-hidden="true">•••</span></button>
				{/if}
			</li>
		{/each}
	</ul>
{/if}

<SourceDecisionSheet
	bind:open={controller.sourceSheetOpen}
	sources={controller.selectedSources}
	onSave={onSaveSource}
/>

<BottomSheet
	bind:open={controller.itemActionOpen}
	title={controller.selectedItem?.name ?? m.shopping_item_actions_title_generic()}
	desktopSide
	dismissible={!controller.actionPending}
	onclose={controller.handleActionClose.bind(controller)}
>
	{#if controller.selectedItem}
		{@const itemManualSources = controller.selectedItem.sources?.filter((source) => source.sourceKind === 'manual') ?? []}
		{@const hasWeeklySource = controller.selectedItem.sources?.some((source) => source.sourceKind === 'weekly')}
		{#if itemManualSources.length}
			<div class="source-action-group">
				<h3>{m.shopping_source_manual()}</h3>
				{#each itemManualSources as source (source.id)}
					<button
						type="button"
						class="danger"
						disabled={controller.actionPending}
						onclick={() => void controller.removeManual(controller.selectedItem!, source)}
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
					disabled={controller.actionPending}
					onclick={() => controller.openWeeklyAfterActions()}
				>
					<span><strong>{m.shopping_manage_weekly_items()}</strong></span>
					<Icon name="chevronRight" />
				</button>
			</div>
		{/if}
	{/if}
</BottomSheet>

<BottomSheet
	bind:open={controller.rulesOpen}
	title={m.shopping_manage_rules()}
	desktopSide
	onclose={() => {
		if (!controller.rulesOpen) expandedRuleSourceId = null;
	}}
>
	<p class="rules-help">{m.shopping_manage_rules_help()}</p>
	{#if controller.excludedRecipeSources.length}
		<div class="rules-scope" role="group" aria-label={m.shopping_manage_rules()}>
			<button
				type="button"
				class:active={controller.rulesScope === 'excluded'}
				aria-pressed={controller.rulesScope === 'excluded'}
				onclick={() => (controller.rulesScope = 'excluded')}
			>{m.shopping_rules_not_on_list({ count: controller.excludedRecipeSources.length })}</button>
			<button
				type="button"
				class:active={controller.rulesScope === 'all'}
				aria-pressed={controller.rulesScope === 'all'}
				onclick={() => (controller.rulesScope = 'all')}
			>{m.shopping_rules_all({ count: controller.recipeSources.length })}</button>
		</div>
	{/if}
	{#if controller.visibleRuleSources.length}
		<ul class="rules-list">
			{#each controller.visibleRuleSources as source (source.id)}
				<li class:expanded={expandedRuleSourceId === source.id}>
					<button
						type="button"
						class="rules-row-summary"
						aria-expanded={expandedRuleSourceId === source.id}
						onclick={() => (expandedRuleSourceId = expandedRuleSourceId === source.id ? null : source.id)}
					>
						<span>
							<strong>{source.name}</strong>
							<small>{[source.recipeTitle, source.component].filter(Boolean).join(' · ')}</small>
							<small>{needLabel(source)} · {source.term}</small>
						</span>
						<Icon name="chevronRight" />
					</button>
					{#if expandedRuleSourceId === source.id}
						<div class="rules-inline-editor">
							<ShoppingRuleEditor
								{source}
								onSave={onSaveSource}
								onCancel={() => (expandedRuleSourceId = null)}
								onSaved={() => (expandedRuleSourceId = null)}
							/>
						</div>
					{/if}
				</li>
			{/each}
		</ul>
	{:else}
		<EmptyState mini title={m.shopping_rules_none_excluded()} />
	{/if}
</BottomSheet>

<style>
	.shopping-controls {
		margin-bottom: 0.55rem;
	}

	.shopping-filter-row {
		min-width: 0;
	}

	.shopping-filter-rail {
		display: flex;
		gap: 0.35rem;
		overflow-x: auto;
		padding: 0.05rem 0;
		scroll-padding-inline: 0.35rem;
		scroll-snap-type: x proximity;
		scrollbar-width: none;
		mask-image: none;
	}

	.shopping-filter-rail::-webkit-scrollbar {
		display: none;
	}

	.shopping-filter-rail button {
		min-height: 2.75rem;
		flex: 0 0 auto;
		border: 1px solid color-mix(in oklab, var(--market-olive, #304b3a) 20%, var(--color-base-300));
		border-radius: 999px;
		padding: 0 0.8rem;
		background: var(--color-base-100);
		color: color-mix(in oklab, var(--color-base-content) 76%, transparent);
		font-size: 0.7rem;
		font-weight: 750;
		scroll-snap-align: start;
	}

	.shopping-filter-rail button.active {
		border-color: var(--market-olive, #304b3a);
		background: var(--market-olive, #304b3a);
		color: white;
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
		gap: 0.55rem;
	}

	.shopping-ledger-section {
		overflow: hidden;
		border: 1px solid color-mix(in oklab, var(--market-olive, #304b3a) 16%, var(--color-base-300));
		border-radius: 0.8rem;
		background: var(--color-base-100);
		box-shadow: 0 5px 16px rgb(48 75 58 / 4%);
	}

	.shopping-section-header {
		display: flex;
		min-height: 2.75rem;
		align-items: center;
		justify-content: space-between;
		gap: 0.65rem;
		padding: 0 0.55rem 0 0.7rem;
		background: color-mix(in oklab, var(--market-olive, #304b3a) 7%, var(--color-base-100));
	}

	.shopping-ledger-section.weekly .shopping-section-header {
		background: color-mix(in oklab, var(--market-olive, #304b3a) 15%, var(--color-base-100));
		color: var(--market-olive-ink, #304b3a);
	}

	.shopping-ledger-section.shared .shopping-section-header {
		background: color-mix(in oklab, var(--market-terra, #a55f43) 12%, var(--color-base-100));
	}

	.shopping-section-header h2 {
		min-width: 0;
		overflow: hidden;
		font-size: 0.64rem;
		font-weight: 850;
		letter-spacing: 0.09em;
		text-overflow: ellipsis;
		text-transform: uppercase;
		white-space: nowrap;
	}

	.shopping-section-header h2 span {
		color: color-mix(in oklab, currentColor 62%, transparent);
		font-weight: 700;
		letter-spacing: 0;
	}

	.shopping-section-header button {
		min-height: 2.75rem;
		flex: 0 0 auto;
		border-radius: 0.55rem;
		padding: 0 0.55rem;
		color: var(--market-olive-ink, #304b3a);
		font-size: 0.65rem;
		font-weight: 800;
	}

	.shopping-section-header button:hover,
	.shopping-section-header button:focus-visible {
		background: rgb(255 255 255 / 55%);
	}

	.shopping-section-empty {
		margin: 0;
		border-top: 1px solid var(--color-base-200);
		padding: 0.8rem;
		color: color-mix(in oklab, var(--color-base-content) 62%, transparent);
		font-size: 0.69rem;
		text-align: center;
	}

	.shopping-ledger-section .market-run-list {
		border: 0;
		border-top: 1px solid var(--color-base-200);
		border-radius: 0;
		box-shadow: none;
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

	.market-rule-summary {
		max-width: min(9rem, 34vw);
		min-height: 2.75rem;
		overflow: hidden;
		border-radius: 999px;
		padding: 0 0.55rem;
		background: color-mix(in oklab, var(--market-olive, #304b3a) 10%, var(--color-base-100));
		color: var(--market-olive-ink, #304b3a);
		font-size: 0.6rem;
		font-weight: 800;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.market-rule-summary:hover,
	.market-rule-summary:focus-visible {
		background: color-mix(in oklab, var(--market-olive, #304b3a) 17%, var(--color-base-100));
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
		border-bottom: 1px solid var(--color-base-200);
	}

	.rules-list li:last-child {
		border-bottom: 0;
	}

	.rules-row-summary {
		display: flex;
		width: 100%;
		min-height: 3.8rem;
		align-items: center;
		justify-content: space-between;
		gap: 0.6rem;
		padding: 0.5rem 0.6rem 0.5rem 0.75rem;
		text-align: left;
	}

	.rules-row-summary > span {
		min-width: 0;
	}

	.rules-row-summary strong,
	.rules-row-summary small {
		display: block;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.rules-row-summary strong {
		font-size: 0.76rem;
	}

	.rules-row-summary small {
		margin-top: 0.1rem;
		color: color-mix(in oklab, var(--color-base-content) 64%, transparent);
		font-size: 0.64rem;
	}

	.rules-row-summary :global(svg) {
		width: 1rem;
		height: 1rem;
		flex: 0 0 auto;
		transition: transform var(--motion-micro) var(--ease-standard);
	}

	.rules-list li.expanded .rules-row-summary :global(svg) {
		transform: rotate(90deg);
	}

	.rules-inline-editor {
		padding: 0 0.75rem 0.75rem;
	}

	@media (max-width: 20rem) {
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
