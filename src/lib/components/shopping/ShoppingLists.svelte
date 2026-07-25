<script lang="ts">
	import { base } from '$app/paths';
	import { tick, type Snippet } from 'svelte';
	import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import SegmentedTabs from '$lib/components/ui/SegmentedTabs.svelte';
	import Icon from '$lib/components/ui/icons/Icon.svelte';
	import { m } from '$lib/paraglide/messages';
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
		coveredCount: number;
		visibleToBuyCount: number;
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
		coveredCount,
		visibleToBuyCount,
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

	let tab = $state<'buy' | 'meals' | 'weekly'>('buy');
	let sourceSheetOpen = $state(false);
	let selectedSource = $state<ShoppingListSource | null>(null);
	let itemActionOpen = $state(false);
	let selectedManualItem = $state<ShoppingListItem | null>(null);
	let selectedManualSource = $state<ShoppingListSource | null>(null);
	let basketOpen = $state(false);
	let shoppingStatus = $state('');

	let mealCount = $derived(new Set(sources.flatMap((source) => source.mealNames)).size);
	let activePending = $derived(pending.filter((item) => !item.covered));
	let coveredPending = $derived(pending.filter((item) => item.covered));
	let recipeSources = $derived(sources.filter((source) => source.sourceKind === 'recipe'));
	let hasAnyContent = $derived(
		pending.length > 0 ||
			done.length > 0 ||
			sources.length > 0 ||
			recurring.length > 0 ||
			legacy.length > 0
	);
	let tabs = $derived([
		{ value: 'buy' as const, label: m.shopping_tab_run(), badge: visibleToBuyCount },
		{ value: 'meals' as const, label: m.shopping_tab_meals({ count: mealCount }) },
		{ value: 'weekly' as const, label: m.shopping_tab_every_week() }
	]);

	function openSource(source: ShoppingListSource) {
		selectedSource = source;
		sourceSheetOpen = true;
	}

	function openManualActions(item: ShoppingListItem, source: ShoppingListSource) {
		selectedManualItem = item;
		selectedManualSource = source;
		itemActionOpen = true;
	}

	function shoppingKey(item: ShoppingListItem) {
		return item.entryIds?.length ? item.entryIds.join('-') : encodeURIComponent(item.name);
	}

	async function focusShoppingKey(key: string | null) {
		await tick();
		if (key) {
			document.querySelector<HTMLElement>(`[data-shopping-key="${key}"]`)?.focus();
			return;
		}
		document.querySelector<HTMLElement>('#shopping-basket-toggle')?.focus();
	}

	async function undoBought(item: ShoppingListItem, key: string) {
		const restored = await onToggleBought(item);
		if (!restored) return;
		await focusShoppingKey(key);
		shoppingStatus = item.bought
			? m.shopping_bought_status({ name: item.name, count: visibleToBuyCount })
			: m.shopping_not_bought_status({ name: item.name, count: visibleToBuyCount });
	}

	async function toggleBought(item: ShoppingListItem) {
		const wasBought = item.bought;
		const key = shoppingKey(item);
		const before = [...activePending];
		const index = before.findIndex((candidate) => shoppingKey(candidate) === key);
		const nextKey = wasBought
			? key
			: shoppingKey(before[index + 1] ?? before[index - 1] ?? item);
		const saved = await onToggleBought(item);
		if (!saved) {
			await focusShoppingKey(key);
			return;
		}
		await focusShoppingKey(nextKey === key && !wasBought && before.length === 1 ? null : nextKey);
		shoppingStatus = wasBought
			? m.shopping_not_bought_status({ name: item.name, count: visibleToBuyCount })
			: m.shopping_bought_status({ name: item.name, count: visibleToBuyCount });
		toast.undo(shoppingStatus, () => void undoBought(item, key));
	}

	async function removeSelectedManual() {
		const source = selectedManualSource;
		const item = selectedManualItem;
		if (!source || !item) return;
		const removed = await onDeleteManual(source);
		if (!removed) return;
		itemActionOpen = false;
		toast.undo(m.shopping_toast_removed({ name: item.name }), () => {
			void onRestoreManual(source).then((restored) => {
				if (!restored) toast.error(m.shopping_toast_restore_failed());
			});
		});
	}
</script>

<div class="market-tabs">
	<SegmentedTabs {tabs} bind:value={tab} cols={3} ariaLabel={m.shopping_heading()} idPrefix="shopping" />
</div>
{#if notices && tab === 'buy'}{@render notices()}{/if}
<p class="sr-only" aria-live="polite">{shoppingStatus}</p>

<div id="shopping-panel-buy" role="tabpanel" aria-labelledby="shopping-tab-buy" hidden={tab !== 'buy'}>
	{#if coveredCount}
		<div class="market-covered-toggle">
			<button
				type="button"
				class:active={showCovered}
				aria-pressed={showCovered}
				onclick={() => (showCovered = !showCovered)}
			>
				{m.shopping_in_stock_chip({ count: coveredCount })}
			</button>
		</div>
	{/if}

	{#if !hasAnyContent}
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
	{:else if activePending.length}
		<ul class="market-run-list">
			{#each activePending as item, index (shoppingKey(item))}
				{@const key = shoppingKey(item)}
				{@const manualSource =
					item.sources?.length === 1 && item.sources[0].sourceKind === 'manual'
						? item.sources[0]
						: null}
				<li class:warning={item.incompatibleQuantities} class="market-run-row">
					<label class="market-check-hit" aria-label={m.shopping_mark_bought_aria({ name: item.name })}>
						<input
							id={`buy-${index}`}
							data-shopping-key={key}
							type="checkbox"
							checked={item.bought}
							onchange={() => void toggleBought(item)}
						/>
						<span><Icon name="check" /></span>
					</label>
					<label for={`buy-${index}`} class="market-row-copy">
						<strong title={item.name}>{item.name}</strong>
						{#if itemLabel(item)}<span>{itemLabel(item)}</span>{/if}
						{#if item.incompatibleQuantities && item.sources?.length}
							<ul class="market-source-lines" aria-label={m.shopping_quantity_sources_label()}>
								{#each item.sources as source (source.id)}
									{@const contexts = sourceContextLabels(source)}
									<li>
										{#if itemLabel(source)}<b>{itemLabel(source)}</b>{/if}
										<span>
											{contexts.length
												? contexts.join(' · ')
												: source.sourceKind === 'weekly'
													? m.shopping_source_weekly()
													: m.shopping_source_manual()}
										</span>
									</li>
								{/each}
							</ul>
						{/if}
					</label>
					<div class="market-row-trailing">
						{#if bonusByName[item.name]}<span class="market-item-badge bonus">{m.shopping_bonus_chip()}</span>{/if}
						{#if manualSource}
							<button
								type="button"
								class="market-row-more"
								aria-label={m.shopping_item_actions_title()}
								onclick={() => openManualActions(item, manualSource)}
							>
								<span aria-hidden="true">•••</span>
							</button>
						{/if}
					</div>
				</li>
			{/each}
		</ul>
	{:else if done.length}
		<div class="market-complete">
			<div><Icon name="check" /></div>
			<h2>{m.shopping_run_complete_title()}</h2>
			<p>{m.shopping_run_complete_desc()}</p>
			<button id="shopping-basket-toggle" type="button" onclick={() => (basketOpen = !basketOpen)}>
				{basketOpen ? m.shopping_hide_basket() : `${m.shopping_review_basket()} · ${done.length}`}
			</button>
		</div>
	{:else}
		<EmptyState mini title={m.shopping_empty_stock_covers()} />
	{/if}

	{#if showCovered && coveredPending.length}
		<ul class="market-run-list market-covered-list" aria-label={m.shopping_in_stock_chip({ count: coveredCount })}>
			{#each coveredPending as item (shoppingKey(item))}
				<li class="market-run-row covered">
					<div class="market-covered-marker" aria-hidden="true"><Icon name="check" /></div>
					<div class="market-row-copy">
						<strong title={item.name}>{item.name}</strong>
						{#if itemLabel(item)}<span>{itemLabel(item)}</span>{/if}
					</div>
					<div class="market-row-trailing">
						<span class="market-item-badge stock">{m.shopping_covered_badge()}</span>
					</div>
				</li>
			{/each}
		</ul>
	{/if}

	{#if done.length && activePending.length}
		<button
			id="shopping-basket-toggle"
			type="button"
			class="market-basket-summary"
			aria-expanded={basketOpen}
			onclick={() => (basketOpen = !basketOpen)}
		>
			<span><strong>{m.shopping_in_basket_heading({ count: done.length })}</strong></span>
			<span>{basketOpen ? m.shopping_hide_basket() : m.shopping_review_basket()}</span>
		</button>
	{/if}

	{#if done.length && basketOpen}
		<ul class="market-run-list market-done-list">
			{#each done as item, index (shoppingKey(item))}
				<li class="market-run-row">
					<label class="market-check-hit" aria-label={m.shopping_mark_not_bought_aria({ name: item.name })}>
						<input
							id={`done-${index}`}
							data-shopping-key={shoppingKey(item)}
							type="checkbox"
							checked
							onchange={() => void toggleBought(item)}
						/>
						<span><Icon name="check" /></span>
					</label>
					<label for={`done-${index}`} class="market-row-copy"><strong>{item.name}</strong></label>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<div id="shopping-panel-meals" role="tabpanel" aria-labelledby="shopping-tab-meals" hidden={tab !== 'meals'}>
	<LegacyShoppingReview items={legacy} onResolve={onResolveLegacy} />
	{#if recipeSources.length}
		<div class="market-meal-list">
			{#each recipeSources as source (source.id)}
				<article>
					<div class="min-w-0 flex-1">
						<p class="truncate text-sm font-semibold">{source.name}</p>
						<p class="truncate text-xs text-base-content/70">
							{[source.recipeTitle, source.component].filter(Boolean).join(' · ')}
						</p>
						<div class="mt-1 flex flex-wrap gap-1">
							<span class="market-policy-chip">
								{source.staple
									? m.shopping_need_usually_stocked()
									: source.optional
										? m.shopping_need_nice_to_have()
										: m.shopping_need_every_time()}
							</span>
							{#if source.term !== source.name}<span class="market-policy-chip">{source.term}</span>{/if}
						</div>
					</div>
					<button
						type="button"
						aria-label={m.shopping_source_change_aria({ name: source.name })}
						onclick={() => openSource(source)}
					>
						{m.shopping_source_change()}
					</button>
				</article>
			{/each}
		</div>
	{:else}
		<EmptyState mini title={m.shopping_empty_no_meals_title()} />
	{/if}
</div>

<div id="shopping-panel-weekly" role="tabpanel" aria-labelledby="shopping-tab-weekly" hidden={tab !== 'weekly'}>
	<RecurringShoppingList
		items={recurring}
		onAdd={onAddRecurring}
		onEdit={onEditRecurring}
		onSkip={onSkipRecurring}
		onDisable={onDisableRecurring}
	/>
</div>

<SourceDecisionSheet bind:open={sourceSheetOpen} source={selectedSource} onSave={onSaveSource} />

<BottomSheet bind:open={itemActionOpen} title={selectedManualItem?.name ?? m.shopping_item_actions_title()} desktopSide>
	{#if selectedManualItem && selectedManualSource}
		<p class="text-sm text-base-content/70">
			{[itemLabel(selectedManualSource), m.shopping_source_manual()].filter(Boolean).join(' · ')}
		</p>
		<button
			type="button"
			class="btn btn-ghost mt-4 min-h-11 w-full justify-start text-error"
			onclick={() => void removeSelectedManual()}
		>
			<Icon name="trash" />
			{m.shopping_remove_this_week()}
		</button>
	{/if}
</BottomSheet>

<style>
	.market-tabs {
		position: sticky;
		top: 0;
		z-index: 20;
		margin-bottom: 0.55rem;
	}

	.market-tabs :global([role='tablist']) {
		width: 100%;
		border: 1px solid color-mix(in oklab, var(--market-olive, #304b3a) 18%, var(--color-base-300));
		border-radius: 0.75rem;
		padding: 0.2rem;
		background: color-mix(in oklab, var(--color-base-100) 96%, transparent);
		box-shadow: 0 3px 10px rgb(48 75 58 / 5%);
		backdrop-filter: blur(10px);
	}

	.market-tabs :global([role='tab']) {
		min-height: 2.75rem;
		border-radius: 0.55rem;
		font-size: 0.72rem;
		font-weight: 750;
	}

	.market-tabs :global([role='tab'][aria-selected='true']) {
		background: var(--market-olive, #304b3a);
		color: white;
		box-shadow: 0 4px 12px rgb(48 75 58 / 16%);
	}

	.market-tabs :global(.badge) {
		border: 0;
		background: rgb(255 255 255 / 17%);
		color: inherit;
	}

	.market-covered-toggle {
		display: flex;
		justify-content: flex-end;
		margin-bottom: 0.45rem;
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

	.market-run-list,
	.market-meal-list {
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
		grid-template-columns: 3rem minmax(0, 1fr) auto;
		align-items: center;
		min-height: 3.6rem;
		border-bottom: 1px solid var(--color-base-200);
	}

	.market-run-row:last-child {
		border-bottom: 0;
	}

	.market-run-row.warning {
		background: color-mix(in oklab, var(--color-warning) 8%, var(--color-base-100));
	}

	.market-run-row.covered {
		opacity: 0.58;
	}

	.market-check-hit,
	.market-covered-marker {
		display: grid;
		width: 3rem;
		height: 3rem;
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
		padding: 0.5rem 0.35rem 0.5rem 0;
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
		margin-top: 0.15rem;
		color: color-mix(in oklab, var(--color-base-content) 72%, transparent);
		font-size: 0.64rem;
	}

	.market-source-lines {
		margin-top: 0.4rem;
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

	.market-source-lines b {
		font-variant-numeric: tabular-nums;
	}

	.market-row-trailing {
		display: flex;
		align-items: center;
		gap: 0.2rem;
		padding-right: 0.3rem;
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

	.market-done-list {
		margin-top: 0.45rem;
		opacity: 0.58;
	}

	.market-covered-list {
		margin-top: 0.45rem;
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
		font-family: Georgia, 'Times New Roman', serif;
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

	.market-meal-list {
		display: grid;
	}

	.market-meal-list article {
		display: flex;
		min-height: 4rem;
		align-items: center;
		gap: 0.75rem;
		border-bottom: 1px solid var(--color-base-200);
		padding: 0.65rem 0.75rem;
	}

	.market-meal-list article:last-child {
		border-bottom: 0;
	}

	.market-meal-list article > button {
		min-height: 2.75rem;
		border: 1px solid var(--color-base-300);
		border-radius: 0.6rem;
		padding: 0 0.65rem;
		background: var(--color-base-100);
		color: var(--market-olive-ink, #304b3a);
		font-size: 0.68rem;
		font-weight: 750;
	}

	.market-policy-chip {
		display: inline-flex;
		min-height: 1.6rem;
		align-items: center;
		border-radius: 999px;
		padding: 0 0.45rem;
		background: var(--color-base-200);
		color: color-mix(in oklab, var(--color-base-content) 72%, transparent);
		font-size: 0.58rem;
		font-weight: 700;
	}

	@media (prefers-reduced-motion: reduce) {
		.market-check-hit span {
			transition: none;
		}
	}
</style>
