<script lang="ts">
	import { tick } from 'svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import SegmentedTabs from '$lib/components/ui/SegmentedTabs.svelte';
	import Icon from '$lib/components/ui/icons/Icon.svelte';
	import { m } from '$lib/paraglide/messages';
	import { itemLabel } from './format';
	import type { ShoppingListItem, ShoppingListSource } from './types';
	import SourceDecisionSheet from './SourceDecisionSheet.svelte';
	import RecurringShoppingList from './RecurringShoppingList.svelte';
	import LegacyShoppingReview from './LegacyShoppingReview.svelte';

	type Recurring = {
		id: number; revision: number; name: string; amount: string | null; unit: string | null;
		entryId: number | null; entryRevision: number | null; included: boolean; bought: boolean;
	};
	type Legacy = { id: number; revision: number; name: string; term: string; amount: string | null; unit: string | null; candidates: Array<{ id: number; revision: number; label: string }> };
	type Props = {
		pending: ShoppingListItem[];
		done: ShoppingListItem[];
		sources: ShoppingListSource[];
		recurring: Recurring[];
		legacy: Legacy[];
		coveredCount: number;
		visibleToBuyCount: number;
		showCovered: boolean;
		bonusByName: Record<string, boolean>;
		onToggleBought: (item: ShoppingListItem) => Promise<boolean>;
		onDeleteManual: (source: ShoppingListSource) => void;
		onSaveSource: (source: ShoppingListSource, input: { need: 'required' | 'optional' | 'stocked'; term: string; useInRecipe: boolean }) => Promise<boolean>;
		onAddRecurring: (input: { name: string; amount: string | null; unit: string | null }) => Promise<boolean>;
		onEditRecurring: (item: Recurring, input: { name: string; amount: string | null; unit: string | null }) => Promise<boolean>;
		onSkipRecurring: (item: Recurring) => Promise<boolean>;
		onDisableRecurring: (item: Recurring) => Promise<boolean>;
		onResolveLegacy: (item: Legacy, resolution: 'attach' | 'manual' | 'dismiss', targetEntryId?: number) => void;
	};

	let {
		pending, done, sources, recurring, legacy, coveredCount, visibleToBuyCount,
		showCovered = $bindable(), bonusByName, onToggleBought, onDeleteManual, onSaveSource,
		onAddRecurring, onEditRecurring, onSkipRecurring, onDisableRecurring, onResolveLegacy
	}: Props = $props();
	let tab = $state<'buy' | 'meals' | 'weekly'>('buy');
	let sheetOpen = $state(false);
	let selectedSource = $state<ShoppingListSource | null>(null);
	let shoppingStatus = $state('');
	let mealCount = $derived(new Set(sources.flatMap((source) => source.mealNames)).size);
	let visiblePending = $derived(pending.filter((item) => showCovered || !item.covered));
	let recipeSources = $derived(sources.filter((source) => source.sourceKind === 'recipe'));
	let tabs = $derived([
		{ value: 'buy' as const, label: m.shopping_tab_to_buy(), badge: visibleToBuyCount },
		{ value: 'meals' as const, label: m.shopping_tab_meals({ count: mealCount }) },
		{ value: 'weekly' as const, label: m.shopping_tab_every_week() }
	]);

	function openSource(source: ShoppingListSource) {
		selectedSource = source;
		sheetOpen = true;
	}

	function shoppingKey(item: ShoppingListItem) {
		return item.entryIds?.length ? item.entryIds.join('-') : encodeURIComponent(item.name);
	}

	async function toggleBought(item: ShoppingListItem) {
		const wasBought = item.bought;
		const key = shoppingKey(item);
		const saved = await onToggleBought(item);
		await tick();
		document.querySelector<HTMLElement>(`[data-shopping-key="${key}"]`)?.focus();
		if (!saved) return;
		shoppingStatus = wasBought
			? m.shopping_not_bought_status({ name: item.name, count: visibleToBuyCount })
			: m.shopping_bought_status({ name: item.name, count: visibleToBuyCount });
	}
</script>

<div class="mb-3"><SegmentedTabs {tabs} bind:value={tab} cols={3} ariaLabel={m.shopping_heading()} idPrefix="shopping" /></div>
<p class="sr-only" aria-live="polite">{shoppingStatus}</p>

<div id="shopping-panel-buy" role="tabpanel" aria-labelledby="shopping-tab-buy" hidden={tab !== 'buy'}>
	{#if coveredCount}
		<div class="mb-2 flex justify-end"><button type="button" class={showCovered ? 'ui-chip-active' : 'ui-chip'} aria-pressed={showCovered} onclick={() => (showCovered = !showCovered)}>{m.shopping_in_stock_chip({ count: coveredCount })}</button></div>
	{/if}
	{#if visiblePending.length}
		<ul class="ui-list-card divide-y divide-base-200">
			{#each visiblePending as item, index (item.name + ':' + index)}
				<li class="flex min-h-12 items-center gap-3 px-3 py-2 {item.covered ? 'text-base-content/55' : ''}">
					<input id={`buy-${index}`} data-shopping-key={shoppingKey(item)} type="checkbox" class="checkbox checkbox-md" checked={item.bought} aria-label={m.shopping_mark_bought_aria({ name: item.name })} onchange={() => void toggleBought(item)} />
					<label for={`buy-${index}`} class="min-w-0 flex-1 cursor-pointer"><span class="block truncate text-sm font-medium">{item.name}</span>{#if itemLabel(item)}<span class="text-xs text-base-content/55">{itemLabel(item)}</span>{/if}</label>
					{#if bonusByName[item.name]}<span class="badge badge-error badge-outline badge-sm">{m.shopping_bonus_chip()}</span>{/if}
					{#if item.sources?.length === 1 && item.sources[0].sourceKind === 'manual'}<button type="button" class="btn btn-ghost btn-sm h-10 w-10 px-0" aria-label={m.shopping_remove_item_aria({ name: item.name })} onclick={() => onDeleteManual(item.sources![0])}><Icon name="x" /></button>{/if}
				</li>
			{/each}
		</ul>
	{:else}
		<EmptyState mini title={done.length ? m.shopping_empty_all_bought() : m.shopping_empty_stock_covers()} />
	{/if}
	{#if done.length}
		<section class="mt-4"><h2 class="ui-section-label mb-2">{m.shopping_in_basket_heading({ count: done.length })}</h2><ul class="ui-list-card divide-y divide-base-200">
			{#each done as item, index (item.name + ':' + index)}<li class="flex min-h-12 items-center gap-3 px-3 py-2 text-base-content/45"><input id={`done-${index}`} data-shopping-key={shoppingKey(item)} type="checkbox" class="checkbox checkbox-md" checked aria-label={m.shopping_mark_not_bought_aria({ name: item.name })} onchange={() => void toggleBought(item)} /><label for={`done-${index}`} class="min-w-0 flex-1 cursor-pointer truncate text-sm font-medium line-through">{item.name}</label></li>{/each}
		</ul></section>
	{/if}
	</div>
<div id="shopping-panel-meals" role="tabpanel" aria-labelledby="shopping-tab-meals" hidden={tab !== 'meals'}>
	<LegacyShoppingReview items={legacy} onResolve={onResolveLegacy} />
	{#if recipeSources.length}
		<div class="space-y-2">
			{#each recipeSources as source (source.id)}
				<article class="ui-list-card flex items-center gap-3 p-3">
					<div class="min-w-0 flex-1"><p class="truncate text-sm font-semibold">{source.name}</p><p class="truncate text-xs text-base-content/60">{[source.recipeTitle, source.component].filter(Boolean).join(' · ')}</p><div class="mt-1 flex flex-wrap gap-1"><span class="badge badge-ghost badge-sm">{source.staple ? m.shopping_need_usually_stocked() : source.optional ? m.shopping_need_nice_to_have() : m.shopping_need_every_time()}</span>{#if source.term !== source.name}<span class="badge badge-outline badge-sm">{source.term}</span>{/if}</div></div>
					<button type="button" class="btn btn-ghost btn-sm" aria-label={m.shopping_source_change_aria({ name: source.name })} onclick={() => openSource(source)}>{m.shopping_source_change()}</button>
				</article>
			{/each}
		</div>
	{:else}<EmptyState mini title={m.shopping_empty_no_meals_title()} />{/if}
	</div>
<div id="shopping-panel-weekly" role="tabpanel" aria-labelledby="shopping-tab-weekly" hidden={tab !== 'weekly'}>
		<RecurringShoppingList items={recurring} onAdd={onAddRecurring} onEdit={onEditRecurring} onSkip={onSkipRecurring} onDisable={onDisableRecurring} />
	</div>

<SourceDecisionSheet bind:open={sheetOpen} source={selectedSource} onSave={onSaveSource} />
