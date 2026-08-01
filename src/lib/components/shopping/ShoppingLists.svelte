<script lang="ts">
	import { base } from '$app/paths';
	import { tick, type Snippet } from 'svelte';
	import { flip } from 'svelte/animate';
	import { slide } from 'svelte/transition';
	import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import FilterChip from '$lib/components/ui/FilterChip.svelte';
	import SegmentedControl from '$lib/components/ui/SegmentedControl.svelte';
	import Icon from '$lib/components/ui/icons/Icon.svelte';
	import StatusBadge from '$lib/components/ui/StatusBadge.svelte';
	import { MOTION_CONTENT_MS, MOTION_MICRO_MS } from '$lib/motion';
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
		type RecurringShoppingItem,
		type ShoppingFocusIntent,
		type ShoppingNeed,
		type SourceMutationStatus
	} from './list-controller.svelte';
	import type { ShoppingListItem, ShoppingListSource } from './types';
	import ShoppingSourceQuickControls from './ShoppingSourceQuickControls.svelte';
	import InlineWeeklyItemsEditor from './InlineWeeklyItemsEditor.svelte';
	import LegacyShoppingReview from './LegacyShoppingReview.svelte';

	type RecurringInput = { name: string; amount: string | null; unit: string | null };
	type ExcludedWeekItem = { weekStart: string; nameKey: string; name: string };

	type Props = {
		pending: ShoppingListItem[];
		done: ShoppingListItem[];
		sources: ShoppingListSource[];
		recurring: RecurringShoppingItem[];
		legacy: LegacyShoppingItem[];
		excludedWeekItems: ExcludedWeekItem[];
		notices?: Snippet;
		emptyState: 'no_meals' | 'nothing_needed';
		editable: boolean;
		showCovered: boolean;
		bonusByName: Record<string, boolean>;
		onToggleBought: (item: ShoppingListItem) => Promise<boolean>;
		onDeleteManual: (source: ShoppingListSource) => Promise<boolean>;
		onRestoreManual: (source: ShoppingListSource) => Promise<boolean>;
		onRemoveThisWeek: (item: ShoppingListItem) => Promise<boolean>;
		onRestoreThisWeek: (item: ExcludedWeekItem) => Promise<boolean>;
		onChangeSourceTerm: (
			source: ShoppingListSource,
			term: string
		) => Promise<SourceMutationStatus>;
		onChangeSourceNeed: (
			source: ShoppingListSource,
			need: ShoppingNeed
		) => Promise<SourceMutationStatus>;
		onAddRecurring: (input: RecurringInput) => Promise<{ id: number } | null>;
		onEditRecurring: (
			item: RecurringShoppingItem,
			input: RecurringInput
		) => Promise<{ id: number } | null>;
		onSetRecurringIncluded: (
			item: RecurringShoppingItem,
			included: boolean
		) => Promise<boolean>;
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
		excludedWeekItems,
		notices,
		emptyState,
		editable,
		showCovered = $bindable(),
		bonusByName,
		onToggleBought,
		onDeleteManual,
		onRestoreManual,
		onRemoveThisWeek,
		onRestoreThisWeek,
		onChangeSourceTerm,
		onChangeSourceNeed,
		onAddRecurring,
		onEditRecurring,
		onSetRecurringIncluded,
		onDisableRecurring,
		onResolveLegacy
	}: Props = $props();

	let weeklyEditMode = $state(false);
	let sourceFocusAfterActionClose = $state<string | null>(null);
	const reducedMotion =
		typeof window !== 'undefined' &&
		window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	const rowMotionMs = reducedMotion ? 0 : MOTION_MICRO_MS;
	const groupMotionMs = reducedMotion ? 0 : MOTION_CONTENT_MS;

	function sectionLabel(section: ShoppingBoardSection): string {
		switch (section.kind) {
			case 'weekly': return m.shopping_filter_weekly();
			case 'shared': return m.shopping_section_shared();
			case 'meal': return section.mealName ?? m.shopping_section_other();
			case 'other': return m.shopping_section_other();
		}
	}

	function revealInsideAppMain(target: HTMLElement, appMain: HTMLElement) {
		const row = target.closest<HTMLElement>('.market-run-row') ?? target;
		const rowRect = row.getBoundingClientRect();
		const mainRect = appMain.getBoundingClientRect();
		const dock = document.querySelector<HTMLElement>('.shopping-market-dock');
		const dockRect = dock?.getBoundingClientRect();
		const dockTop =
			dock && getComputedStyle(dock).position === 'fixed' && (dockRect?.top ?? 0) > mainRect.top
				? dockRect!.top
				: mainRect.bottom;
		const visibleTop = mainRect.top + 8;
		const visibleBottom = Math.min(mainRect.bottom, dockTop) - 8;
		if (rowRect.top < visibleTop) {
			appMain.scrollTop += rowRect.top - visibleTop;
		} else if (rowRect.bottom > visibleBottom) {
			appMain.scrollTop += rowRect.bottom - visibleBottom;
		}
	}

	async function focusShoppingKey(intent: ShoppingFocusIntent) {
		await tick();
		const appMain = document.querySelector<HTMLElement>('main.app-main');
		let target: HTMLElement | null = null;
		if (intent.key) {
			target = [...document.querySelectorAll<HTMLElement>('[data-shopping-key]')]
				.find((element) => element.dataset.shoppingKey === intent.key) ?? null;
			if (target) target.focus({ preventScroll: true });
		}
		if (!target) {
			target = document.querySelector<HTMLElement>('#shopping-basket-toggle');
			target?.focus({ preventScroll: true });
		}
		if (intent.mode === 'reveal' && target && appMain) {
			revealInsideAppMain(target, appMain);
		}
	}

	async function focusSourceKey(sourceKey: string) {
		await tick();
		const inOpenDialog = [...document.querySelectorAll<HTMLElement>('dialog[open] [data-source-key]')];
		const candidates = inOpenDialog.length
			? inOpenDialog
			: [...document.querySelectorAll<HTMLElement>('[data-source-key]')];
		const target = candidates.find((element) => element.dataset.sourceKey === sourceKey);
		target?.focus();
	}

	async function waitForListMotion(): Promise<void> {
		await tick();
		if (groupMotionMs === 0) return;
		await new Promise<void>((resolve) => setTimeout(resolve, groupMotionMs));
		await tick();
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
		onChangeSourceTerm: (source, term) => onChangeSourceTerm(source, term),
		onChangeSourceNeed: (source, need) => onChangeSourceNeed(source, need),
		focus: focusShoppingKey,
		focusSource: focusSourceKey,
		waitForMotion: waitForListMotion,
		notifyUndo: (message, action) => toast.undo(message, () => void action()),
		notifyError: (message) => toast.error(message),
		notifySuccess: (message) => toast.success(message),
		messages: {
			bought: (name, count) => m.shopping_bought_status({ name, count }),
			notBought: (name, count) => m.shopping_not_bought_status({ name, count }),
			removed: (name) => m.shopping_toast_removed({ name }),
			restoreFailed: () => m.shopping_toast_restore_failed(),
			choiceSaved: () => m.shopping_choice_saved(),
			choiceStale: () => m.shopping_choice_stale(),
			choiceFailed: () => m.shopping_mutation_failed(),
			choiceMoved: (name, destination) =>
				m.shopping_choice_moved({ name, destination }),
			filterAll: () => m.shopping_filter_all(),
			notThisRun: () => m.shopping_not_this_run()
		}
	});

	$effect(() => {
		controller.reconcileFilter();
		const selected = controller.selectedItem;
		if (!selected) return;
		const selectedKey = shoppingItemKey(selected);
		const selectedSourceKeys = new Set(selected.sources?.map((source) => source.sourceKey) ?? []);
		const currentItems = [...pending, ...done];
		const current =
			currentItems.find((item) => shoppingItemKey(item) === selectedKey) ??
			currentItems.find((item) =>
				item.sources?.some((source) => selectedSourceKeys.has(source.sourceKey))
			);
		if (current && current !== selected) {
			controller.selectedItem = current;
		} else if (!current && controller.itemActionOpen) {
			sourceFocusAfterActionClose = selected.sources?.find((selectedSource) =>
				sources.some(
					(currentSource) =>
						currentSource.sourceKey === selectedSource.sourceKey && !currentSource.included
				)
		)?.sourceKey ?? null;
			controller.itemActionOpen = false;
		}
	});

	export async function openWeeklyEditor() {
		controller.setFilter({ kind: 'weekly' });
		weeklyEditMode = true;
		await tick();
		const target =
			document.querySelector<HTMLElement>('[data-weekly-add-button]') ??
			document.querySelector<HTMLElement>('[data-weekly-edit-button]');
		target?.scrollIntoView({ block: 'center', behavior: reducedMotion ? 'auto' : 'smooth' });
		target?.focus({ preventScroll: true });
	}

	let visibleExcludedSources = $derived(
		controller.excludedRecipeSources.filter((source) => {
			if (controller.filter.kind === 'weekly') return false;
			if (controller.filter.kind === 'all') return true;
			return source.mealNames.includes(controller.filter.mealName);
		})
	);
	let shoppingFilterValue = $derived(
		controller.filter.kind === 'meal'
			? `meal:${controller.filter.mealName}`
			: controller.filter.kind
	);
	let shoppingFilterOptions = $derived([
		{ value: 'all', label: m.shopping_filter_all() },
		{ value: 'weekly', label: m.shopping_filter_weekly() },
		...controller.filterOptions.meals.map((meal) => ({
			value: `meal:${meal}`,
			label: meal
		}))
	]);

	function selectShoppingFilter(value: string) {
		if (value === 'all' || value === 'weekly') {
			controller.setFilter({ kind: value });
			return;
		}
		controller.setFilter({ kind: 'meal', mealName: value.slice('meal:'.length) });
	}

	async function closeWeeklyEditor() {
		weeklyEditMode = false;
		await tick();
		document.querySelector<HTMLElement>('[data-weekly-edit-button]')?.focus();
	}

	function recipeSources(item: ShoppingListItem): ShoppingListSource[] {
		return item.sources?.filter((source) => source.sourceKind === 'recipe') ?? [];
	}

	function manualSources(item: ShoppingListItem): ShoppingListSource[] {
		return item.sources?.filter((source) => source.sourceKind === 'manual') ?? [];
	}

	function hasItemMenu(item: ShoppingListItem): boolean {
		const allSources = item.sources ?? [];
		const manuals = manualSources(item);
		return recipeSources(item).length > 0 || manuals.length > 1 || (manuals.length === 1 && allSources.length > 1);
	}

	function sourceCue(item: ShoppingListItem): string {
		if (item.forMeals?.length) return m.shopping_for_meals({ meals: item.forMeals.join(', ') });
		if ((item.sources ?? []).some((source) => source.sourceKind === 'weekly')) {
			return m.shopping_filter_weekly();
		}
		if ((item.sources ?? []).some((source) => source.sourceKind === 'manual')) {
			return m.shopping_source_manual();
		}
		return '';
	}

	function handleItemActionClose() {
		controller.handleActionClose();
		const sourceKey = sourceFocusAfterActionClose;
		if (!sourceKey) return;
		sourceFocusAfterActionClose = null;
		queueMicrotask(() => void focusSourceKey(sourceKey));
	}
</script>

{#snippet sourceQuickControls(source: ShoppingListSource)}
	<ShoppingSourceQuickControls
		{source}
		disabled={!editable}
		pending={controller.sourcePending(source.sourceKey)}
		needBlocked={controller.recipePending(source.recipeId)}
		onNeed={(source, need) => controller.changeNeed(source, need)}
		onTerm={(source, term) => controller.changeTerm(source, term)}
	/>
{/snippet}

{#snippet weeklyEditor()}
	<InlineWeeklyItemsEditor
		items={controller.recurring}
		{editable}
		onAdd={onAddRecurring}
		onEdit={onEditRecurring}
		onIncluded={onSetRecurringIncluded}
		onDisable={onDisableRecurring}
	/>
{/snippet}

{#snippet itemIdentity(item: ShoppingListItem)}
	<strong title={item.name}>{item.name}</strong>
	{#if itemLabel(item) || sourceCue(item)}
		<span>{[itemLabel(item), sourceCue(item)].filter(Boolean).join(' · ')}</span>
	{/if}
	{#if item.manualContribution}<span>{m.shopping_manual_amount_not_following()}</span>{/if}
{/snippet}

{#snippet itemAction(item: ShoppingListItem)}
	{#if editable && item.sources?.length}
		{#if hasItemMenu(item)}
			<button
				type="button"
				class="market-row-more ui-action ui-action-tertiary ui-action-icon"
				aria-label={m.shopping_item_actions_aria({ name: item.name })}
				onclick={() => controller.openActions(item)}
			>
				<span aria-hidden="true">•••</span>
			</button>
		{:else}
			<button
				type="button"
				class="market-row-remove ui-action ui-action-danger ui-action-icon"
				disabled={!editable}
				aria-label={m.shopping_remove_item_this_week_aria({ name: item.name })}
				onclick={() => void onRemoveThisWeek(item)}
			>
				<Icon name="trash" />
			</button>
		{/if}
	{/if}
{/snippet}

<div class="shopping-controls" role="region" aria-label={m.shopping_list_controls()}>
	<div class="shopping-filter-row">
		<div class="shopping-filter-rail">
			<SegmentedControl
				options={shoppingFilterOptions}
				value={shoppingFilterValue}
				onchange={selectShoppingFilter}
				ariaLabel={m.shopping_filter_label()}
			/>
		</div>
	</div>
</div>

{#if visibleExcludedSources.length}
	<details class="not-this-run ui-list-group" bind:open={controller.offListOpen}>
		<summary>{m.shopping_not_this_run_count({ count: visibleExcludedSources.length })}</summary>
		<ul>
			{#each visibleExcludedSources as source (source.sourceKey)}
				<li>
					{@render sourceQuickControls(source)}
				</li>
			{/each}
		</ul>
	</details>
{/if}

{#if excludedWeekItems.length}
	<details class="not-this-run ui-list-group">
		<summary>{m.shopping_not_this_run_count({ count: excludedWeekItems.length })}</summary>
		<ul>
			{#each excludedWeekItems as item (item.nameKey)}
				<li class="flex min-h-11 items-center justify-between gap-2 px-3 py-1.5">
					<strong>{item.name}</strong>
					<button
						type="button"
						class="ui-action ui-action-secondary"
						onclick={() => void onRestoreThisWeek(item)}
					>{m.shopping_restore_button()}</button>
				</li>
			{/each}
		</ul>
	</details>
{/if}

{#if notices}{@render notices()}{/if}
<LegacyShoppingReview items={controller.legacy} onResolve={onResolveLegacy} />
<p class="sr-only" aria-live="polite">{controller.shoppingStatus}</p>

{#if controller.coveredPending.length}
	<div class="market-covered-toggle">
		<FilterChip
			selected={showCovered}
			tone="success"
			onclick={() => (showCovered = !showCovered)}
		>
			{m.shopping_in_stock_chip({ count: controller.coveredPending.length })}
		</FilterChip>
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
				class="ui-action ui-action-primary"
				href={controller.emptyState === 'no_meals' ? `${base}/meal-plan` : `${base}/inventory`}
			>
				{controller.emptyState === 'no_meals' ? m.shopping_plan_meals_button() : m.shopping_view_stock_button()}
			</a>
		{/snippet}
	</EmptyState>
{:else if controller.viewMode === 'filter-empty'}
	{#if controller.filter.kind === 'weekly'}
		<section class="shopping-ledger-section weekly ui-list-group">
			<header class="shopping-section-header">
				<h2 class="ui-section-title">{m.shopping_filter_weekly()} <span>· 0</span></h2>
				<FilterChip
					data-weekly-edit-button
					selected={weeklyEditMode}
					onclick={() =>
						weeklyEditMode ? void closeWeeklyEditor() : (weeklyEditMode = true)}
				>
					{weeklyEditMode ? m.shopping_done_editing_weekly() : m.shopping_edit_weekly()}
				</FilterChip>
			</header>
			{#if weeklyEditMode}
				{@render weeklyEditor()}
			{:else}
				<p class="shopping-section-empty">{m.shopping_weekly_empty()}</p>
			{/if}
		</section>
	{:else}
		<div class="shopping-filter-empty">
			<h2>{m.shopping_filter_empty()}</h2>
			<button type="button" class="ui-action ui-action-primary" onclick={() => controller.setFilter({ kind: 'all' })}>{m.shopping_clear_filter()}</button>
		</div>
	{/if}
{:else if controller.viewMode === 'active'}
	<div class="shopping-active-groups">
		{#each controller.activeGroups as group (group.key)}
			<section
				class:weekly={group.kind === 'weekly'}
				class:shared={group.kind === 'shared'}
				class="shopping-ledger-section ui-list-group"
				out:slide={{ duration: groupMotionMs }}
				animate:flip={{ duration: groupMotionMs }}
			>
				<header class="shopping-section-header">
					<h2 class="ui-section-title">{sectionLabel(group)} <span>· {group.items.length}</span></h2>
					{#if group.kind === 'weekly'}
						<FilterChip
							data-weekly-edit-button
							selected={weeklyEditMode}
							onclick={() =>
								weeklyEditMode ? void closeWeeklyEditor() : (weeklyEditMode = true)}
						>
							{weeklyEditMode ? m.shopping_done_editing_weekly() : m.shopping_edit_weekly()}
						</FilterChip>
					{/if}
				</header>
				{#if group.kind === 'weekly' && weeklyEditMode}
					{@render weeklyEditor()}
				{:else if group.items.length}
				<ul class="market-run-list">
				{#each group.items as item, index (shoppingItemKey(item))}
					{@const key = shoppingItemKey(item)}
					{@const actionOwned = item.sources?.filter((source) => source.sourceKind === 'manual') ?? []}
					<li
						class:warning={item.incompatibleQuantities}
						class:locked={controller.itemLocked(key)}
						class="market-run-row"
						inert={controller.itemLocked(key)}
						aria-busy={controller.itemLocked(key)}
						out:slide={{ duration: rowMotionMs }}
						animate:flip={{ duration: groupMotionMs }}
					>
						<label class="market-check-hit" aria-label={m.shopping_mark_bought_aria({ name: item.name })}>
							<input
								id={`buy-${key}`}
								data-shopping-key={key}
								type="checkbox"
								checked={item.bought}
								disabled={controller.itemLocked(key)}
								onchange={() => void controller.toggleBought(item)}
							/>
							<span><Icon name="check" /></span>
						</label>
						<div class="market-row-copy">
							{@render itemIdentity(item)}
							{#if item.incompatibleQuantities && actionOwned.length}
								<ul class="market-source-lines" aria-label={m.shopping_quantity_sources_label()}>
									{#each actionOwned as source (source.sourceKey)}
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
						</div>
						<div class="market-row-trailing">
							{#if bonusByName[item.name]}<StatusBadge tone="warning">{m.shopping_bonus_chip()}</StatusBadge>{/if}
							{@render itemAction(item)}
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
					{@render itemIdentity(item)}
				</div>
				<div class="market-row-trailing">
					<StatusBadge tone="success">{m.shopping_covered_badge()}</StatusBadge>
				</div>
			</li>
		{/each}
	</ul>
{/if}

{#if controller.completed.length && controller.activePending.length}
	<button
		id="shopping-basket-toggle"
		type="button"
		class="market-basket-summary ui-action ui-action-secondary w-full justify-between text-left"
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
			<li
				class:locked={controller.itemLocked(key)}
				class="market-run-row"
				inert={controller.itemLocked(key)}
				aria-busy={controller.itemLocked(key)}
				out:slide={{ duration: rowMotionMs }}
				animate:flip={{ duration: groupMotionMs }}
			>
				<label class="market-check-hit" aria-label={m.shopping_mark_not_bought_aria({ name: item.name })}>
					<input
						id={`done-${key}`}
						data-shopping-key={key}
						type="checkbox"
						checked
						disabled={controller.itemLocked(key)}
						onchange={() => void controller.toggleBought(item)}
					/>
					<span><Icon name="check" /></span>
				</label>
				<div class="market-row-copy">
					{@render itemIdentity(item)}
				</div>
			</li>
		{/each}
	</ul>
{/if}

<BottomSheet
	bind:open={controller.itemActionOpen}
	title={controller.selectedItem?.name ?? m.shopping_item_actions_title_generic()}
	desktopSide
	dismissible={!controller.actionPending}
		onclose={handleItemActionClose}
>
	{#if controller.selectedItem}
		{@const itemRecipeSources = recipeSources(controller.selectedItem)}
		{#if itemRecipeSources.length}
			<div class="source-action-group source-choice-group">
				<h3 class="ui-section-title">{m.shopping_item_recipe_choices()}</h3>
				<p>{m.shopping_item_recipe_choices_help()}</p>
				{#each itemRecipeSources as source (source.sourceKey)}
					{@render sourceQuickControls(source)}
				{/each}
			</div>
		{/if}
		<button
			type="button"
			class="ui-action ui-action-danger w-full justify-between text-left"
			disabled={!editable || controller.actionPending}
			onclick={() => {
				const selected = controller.selectedItem!;
				controller.itemActionOpen = false;
				void onRemoveThisWeek(selected);
			}}
		>
			<span>
				<strong>{m.shopping_remove_this_week()}</strong>
				<small>{controller.selectedItem.name}</small>
			</span>
			<Icon name="trash" />
		</button>
		{@const itemManualSources = controller.selectedItem.sources?.filter((source) => source.sourceKind === 'manual') ?? []}
		{#if itemManualSources.length && (controller.selectedItem.sources?.length ?? 0) > 1}
			<div class="source-action-group">
				<h3 class="ui-section-title">{m.shopping_source_manual()}</h3>
				{#each itemManualSources as source (source.id)}
					<button
						type="button"
						class="ui-action ui-action-danger w-full justify-between text-left"
						disabled={!editable || controller.actionPending}
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

	.not-this-run {
		margin: 0 0 0.55rem;
	}

	.not-this-run summary {
		min-height: 2.75rem;
		padding: 0.75rem;
		color: color-mix(in oklab, var(--color-base-content) 70%, transparent);
		cursor: pointer;
		font-size: 0.66rem;
		font-weight: 800;
	}

	.not-this-run ul {
		margin: 0;
		padding: 0;
		border-top: 1px solid var(--color-base-200);
		list-style: none;
	}

	.not-this-run li {
		padding: 0.4rem 0.55rem;
		border-bottom: 1px solid var(--color-base-200);
	}

	.not-this-run li:last-child {
		border-bottom: 0;
	}

	.shopping-filter-rail :global(.ui-segmented-control) {
		flex: 0 0 auto;
		scroll-snap-align: start;
	}

	.market-covered-toggle {
		display: flex;
		justify-content: flex-end;
		margin: 0.5rem 0 0.45rem;
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

	.shopping-active-groups {
		display: grid;
		gap: 0;
		overflow: hidden;
		border: 1px solid color-mix(in oklab, var(--kitchen-grove) 18%, var(--kitchen-line));
		border-radius: var(--kitchen-surface-radius);
		background: var(--kitchen-card);
		box-shadow: 0 8px 20px rgb(35 58 46 / 9%);
	}

	.shopping-active-groups > .shopping-ledger-section {
		border: 0;
		border-radius: 0;
		box-shadow: none;
	}

	.shopping-active-groups > .shopping-ledger-section + .shopping-ledger-section {
		border-top: 1px solid color-mix(in oklab, var(--kitchen-grove) 14%, var(--kitchen-line));
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
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.shopping-section-header h2 span {
		color: color-mix(in oklab, currentColor 62%, transparent);
		font-weight: 700;
		letter-spacing: 0;
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
		overflow: clip;
		margin: 0;
		padding: 0;
		border-block: 1px solid color-mix(in oklab, var(--market-olive, #304b3a) 13%, var(--color-base-300));
		background: color-mix(in oklab, var(--color-base-100) 76%, transparent);
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

	.market-run-row.locked {
		pointer-events: none;
	}

	.market-run-row.covered .market-covered-marker,
	.market-run-row.covered > .market-row-copy > strong,
	.market-run-row.covered > .market-row-copy > span {
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
		position: relative;
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
		top: 50%;
		left: 50%;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		clip-path: inset(50%);
		transform: translate(-50%, -50%);
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

	.market-source-lines {
		margin-top: 0.35rem;
		border-top: 1px solid color-mix(in oklab, var(--color-warning) 45%, transparent);
		padding-top: 0.35rem;
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

	.market-row-more {
		font-size: 0.72rem;
		letter-spacing: 0.06em;
	}

	.market-row-remove :global(svg) {
		width: 0.95rem;
		height: 0.95rem;
	}

	.market-basket-summary {
		margin-top: 0.5rem;
		padding-inline: 0.75rem;
		font-size: 0.68rem;
	}

	.market-basket-summary > span:last-child {
		color: var(--market-olive-ink, #304b3a);
		font-weight: 750;
	}

	.market-done-list,
	.market-covered-list {
		margin-top: 0.45rem;
	}

	.market-done-list .market-row-copy strong {
		opacity: 0.62;
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
		font-size: 1.35rem;
		font-weight: 750;
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

	.source-action-group h3 {
		margin-bottom: 0.35rem;
	}

	.source-choice-group {
		display: grid;
		gap: 0.55rem;
		margin-bottom: 0.85rem;
		padding-bottom: 0.85rem;
		border-bottom: 1px solid var(--kitchen-line);
	}

	.source-choice-group > p {
		margin: -0.2rem 0 0;
		color: var(--kitchen-muted);
		font-size: 0.68rem;
		line-height: 1.4;
	}

	.source-action-group :global(.ui-action) {
		padding: 0.45rem 0.6rem;
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

	@media (prefers-reduced-motion: reduce) {
		.market-check-hit span {
			transition: none;
		}
	}
</style>
