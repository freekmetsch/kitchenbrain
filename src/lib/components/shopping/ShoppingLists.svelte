<!--
	The two check-off lists: a dense shopping-first view, an optional meal-source
	view, and the completed items. Recipe provenance is deliberately progressive:
	the default list stays compact, while the meal view names each recipe once and
	hides its ingredients behind a disclosure.
-->
<script lang="ts">
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import Icon from '$lib/components/ui/icons/Icon.svelte';
	import { m } from '$lib/paraglide/messages';
	import { flip } from 'svelte/animate';
	import { crossfade, fade, slide } from 'svelte/transition';
	import { itemLabel } from './format';
	import type { ShoppingListItem } from './types';
	import { MOTION_CONTENT_MS, MOTION_MICRO_MS } from '$lib/motion';

	const [send, receive] = crossfade({
		duration: MOTION_CONTENT_MS,
		fallback: (node) => slide(node, { duration: MOTION_MICRO_MS })
	});

	type Props = {
		pending: ShoppingListItem[];
		choices: ShoppingListItem[];
		done: ShoppingListItem[];
		coveredCount: number;
		visibleToBuyCount: number;
		showCovered: boolean;
		bonusByName: Record<string, boolean>;
		readOnly?: boolean;
		onToggleBought: (item: ShoppingListItem) => void;
		onDeleteManual: (item: ShoppingListItem) => void;
		onToggleIncluded: (item: ShoppingListItem) => void;
		onSelectName: (item: ShoppingListItem, selectedName: string) => void;
		onSetStaple: (item: ShoppingListItem, isStaple: boolean) => void;
	};

	type ViewMode = 'items' | 'meals';
	type MealGroup = { key: string; meals: string[]; items: ShoppingListItem[] };

	let {
		pending,
		choices,
		done,
		coveredCount,
		visibleToBuyCount,
		showCovered = $bindable(),
		bonusByName,
		readOnly = false,
		onToggleBought,
		onDeleteManual,
		onToggleIncluded,
		onSelectName,
		onSetStaple
	}: Props = $props();
	let optionalChoices = $derived(choices.filter((item) => !item.staple));
	let stapleChoices = $derived(choices.filter((item) => item.staple));

	let viewMode = $state<ViewMode>('items');
	let sourceMealCount = $derived(new Set(pending.flatMap((item) => item.forMeals ?? [])).size);
	let mealGroups = $derived.by((): MealGroup[] => {
		const groups = new Map<string, MealGroup>();
		for (const item of pending) {
			const meals = [...new Set(item.forMeals ?? [])].sort((a, b) => a.localeCompare(b));
			// A recipe gets exactly one group. Ingredients shared by several meals
			// live in one separate disclosure instead of repeating either title.
			const key = meals.length === 0 ? '\u0000' : meals.length === 1 ? `meal:${meals[0]}` : '\u0001';
			const group = groups.get(key) ?? { key, meals: [], items: [] };
			group.meals = [...new Set([...group.meals, ...meals])].sort((a, b) => a.localeCompare(b));
			group.items.push(item);
			groups.set(key, group);
		}
		return [...groups.values()];
	});

	function itemDomId(section: string, index: number): string {
		return `${section}-${index}`;
	}

	function groupTitle(group: MealGroup): string {
		if (!group.meals.length) return m.shopping_to_buy_heading({ count: group.items.length });
		if (group.meals.length === 1) return group.meals[0];
		return m.shopping_recipe_references_count({ count: group.meals.length });
	}
</script>

{#snippet pendingRow(item: ShoppingListItem, index: number, section: string)}
	{@const rowId = itemDomId(section, index)}
	<li
		class="flex min-h-12 items-center gap-3 px-3 py-2 transition-colors hover:bg-base-200/60 {item.covered ? 'bg-base-200/30 text-base-content/55' : ''}"
		in:receive={{ key: item.name }}
		out:send={{ key: item.name }}
	>
		<input
			id={rowId}
			type="checkbox"
			class="checkbox checkbox-md shrink-0"
			checked={item.bought}
			disabled={readOnly}
			aria-label={m.shopping_mark_bought_aria({ name: item.name })}
			onchange={() => onToggleBought(item)}
		/>
		<div class="min-w-0 flex-1">
			<label for={rowId} class="flex min-w-0 cursor-pointer items-baseline gap-2">
				<span class="min-w-0 flex-1 text-sm font-medium leading-5">{item.name}</span>
				{#if itemLabel(item)}
					<span class="shrink-0 text-xs tabular-nums text-base-content/55">{itemLabel(item)}</span>
				{/if}
			</label>
			{#if bonusByName[item.name] || item.covered || item.staple || item.freshSide}
				<div class="mt-1 flex flex-wrap items-center gap-1">
					{#if bonusByName[item.name]}
						<span class="badge badge-error badge-outline badge-sm text-[10px]">{m.shopping_bonus_chip()}</span>
					{/if}
					{#if item.covered}
						<span class="badge badge-ghost badge-sm text-[10px]">{m.shopping_covered_badge()}</span>
					{/if}
					{#if item.staple}
						<span class="badge badge-ghost badge-sm text-[10px] text-warning">{m.shopping_staple_badge()}</span>
					{/if}
					{#if item.freshSide}
						<span class="badge badge-ghost badge-sm text-[10px]">❄️ {m.shopping_fresh_side_badge()}</span>
					{/if}
				</div>
			{/if}
		</div>
		{#if !readOnly && !item.manual && !item.staple}
			<button type="button" class="btn btn-ghost btn-xs shrink-0" onclick={() => onSetStaple(item, true)}>
				{m.shopping_keep_stocked_button()}
			</button>
		{/if}
		{#if !readOnly && item.manualContribution}
			<button
				type="button"
				class="btn btn-ghost btn-sm h-10 min-h-0 w-10 shrink-0 px-0"
				onclick={() => onDeleteManual(item)}
				aria-label={m.shopping_remove_item_aria({ name: item.name })}
			>
				<Icon name="x" />
			</button>
		{/if}
	</li>
{/snippet}

{#snippet choiceRow(item: ShoppingListItem, index: number, section: string)}
	{@const rowId = itemDomId(section, index)}
	<li class="flex min-h-12 items-start gap-3 px-3 py-2.5">
		<input
			id={rowId}
			type="checkbox"
			class="checkbox checkbox-md mt-1 shrink-0"
			checked={item.included}
			disabled={readOnly}
			aria-label={m.shopping_include_item_aria({ name: item.name })}
			onchange={() => onToggleIncluded(item)}
		/>
		<div class="min-w-0 flex-1">
			<label for={rowId} class="text-sm font-medium">{item.name}</label>
			{#if itemLabel(item)}<span class="ml-2 text-xs tabular-nums text-base-content/55">{itemLabel(item)}</span>{/if}
			<div class="mt-1 flex flex-wrap items-center gap-1">
				{#if item.suggested}<span class="badge badge-ghost badge-sm text-[10px]">{m.shopping_suggested_badge()}</span>{/if}
				{#if item.incompatibleQuantities}<span class="text-xs text-warning">{m.shopping_incompatible_amounts()}</span>{/if}
			</div>
			{#if item.substitutes?.length}
				<label class="mt-2 block text-xs text-base-content/60">
					{m.shopping_substitute_label()}
					<select
						class="select select-sm mt-1 w-full"
						value={item.selectedName}
						disabled={readOnly}
						onchange={(event) => onSelectName(item, event.currentTarget.value)}
					>
						<option value={item.name}>{item.name}</option>
						{#each item.substitutes as substitute}<option value={substitute}>{substitute}</option>{/each}
					</select>
				</label>
			{/if}
		</div>
		{#if !readOnly && item.staple}
			<button type="button" class="btn btn-ghost btn-xs shrink-0" onclick={() => onSetStaple(item, false)}>
				{m.shopping_stop_stocking_button()}
			</button>
		{/if}
		{#if !readOnly && item.manualContribution}
			<button
				type="button"
				class="btn btn-ghost btn-sm h-10 min-h-0 w-10 shrink-0 px-0"
				onclick={() => onDeleteManual(item)}
				aria-label={m.shopping_remove_item_aria({ name: item.name })}
			>
				<Icon name="x" />
			</button>
		{/if}
	</li>
{/snippet}

{#if optionalChoices.length}
	<section class="mb-4">
		<h2 class="ui-section-label mb-2">{m.shopping_optional_heading({ count: optionalChoices.length })}</h2>
		<ul class="ui-list-card divide-y divide-base-200">
			{#each optionalChoices as item, index (item.name)}{@render choiceRow(item, index, 'optional')}{/each}
		</ul>
	</section>
{/if}

{#if stapleChoices.length}
	<section class="mb-4">
		<h2 class="ui-section-label mb-2">{m.shopping_staples_heading({ count: stapleChoices.length })}</h2>
		<ul class="ui-list-card divide-y divide-base-200">
			{#each stapleChoices as item, index (item.name)}{@render choiceRow(item, index, 'staple')}{/each}
		</ul>
	</section>
{/if}

<section class="mb-4">
	<h2 class="sr-only">{m.shopping_to_buy_heading({ count: visibleToBuyCount })}</h2>
	<div class="mb-2 flex items-center justify-between gap-2">
		<div class="inline-flex min-w-0 items-center rounded-xl bg-base-200 p-1" role="group" aria-label={m.shopping_heading()}>
			<button
				type="button"
				class="btn btn-sm h-9 min-h-0 gap-1.5 border-0 px-2.5 {viewMode === 'items' ? 'btn-primary shadow-sm' : 'btn-ghost'}"
				aria-pressed={viewMode === 'items'}
				onclick={() => (viewMode = 'items')}
			>
				<Icon name="basket" class="h-3.5 w-3.5" />
				{m.shopping_to_buy_heading({ count: visibleToBuyCount })}
			</button>
			{#if sourceMealCount > 0}
				<button
					type="button"
					class="btn btn-sm h-9 min-h-0 gap-1.5 border-0 px-2.5 {viewMode === 'meals' ? 'btn-primary shadow-sm' : 'btn-ghost'}"
					aria-pressed={viewMode === 'meals'}
					onclick={() => (viewMode = 'meals')}
				>
					<Icon name="chefHat" class="h-3.5 w-3.5" />
					{m.shopping_recipe_references_count({ count: sourceMealCount })}
				</button>
			{/if}
		</div>
		{#if coveredCount}
			<button
				type="button"
				class={showCovered ? 'ui-chip-active shrink-0' : 'ui-chip shrink-0'}
				aria-pressed={showCovered}
				onclick={() => (showCovered = !showCovered)}
			>
				{m.shopping_in_stock_chip({ count: coveredCount })}
			</button>
		{/if}
	</div>

	{#if pending.length}
		{#if viewMode === 'meals' && sourceMealCount > 0}
			<div class="space-y-2" in:fade={{ duration: MOTION_MICRO_MS }}>
				{#each mealGroups as group, groupIndex (group.key)}
					<details class="group ui-list-card">
						<summary class="flex min-h-12 cursor-pointer list-none items-center gap-2.5 px-3 py-2">
							<Icon name={group.meals.length ? 'chefHat' : 'basket'} class="h-4 w-4 shrink-0 text-primary" />
							<span class="min-w-0 flex-1 truncate text-sm font-semibold">{groupTitle(group)}</span>
							<span class="badge badge-ghost badge-sm shrink-0 tabular-nums">{group.items.length}</span>
							<span aria-hidden="true" class="text-base-content/50 transition-transform duration-(--motion-micro) group-open:rotate-180">⌄</span>
						</summary>
						{#if group.meals.length > 1}
							<div class="flex flex-wrap gap-1 border-t border-base-200 px-3 py-2">
								{#each group.meals as meal}
									<span class="badge badge-ghost badge-sm">{meal}</span>
								{/each}
							</div>
						{/if}
						<ul class="divide-y divide-base-200 border-t border-base-200">
							{#each group.items as item, index (item.name)}
								{@render pendingRow(item, index, `pending-${groupIndex}`)}
							{/each}
						</ul>
					</details>
				{/each}
			</div>
		{:else}
			<ul class="ui-list-card divide-y divide-base-200" in:fade={{ duration: MOTION_MICRO_MS }}>
				{#each pending as item, index (item.name)}
					{@render pendingRow(item, index, 'pending')}
				{/each}
			</ul>
		{/if}
	{:else}
		<div in:fade={{ duration: MOTION_MICRO_MS }}>
			<EmptyState mini title={done.length ? m.shopping_empty_all_bought() : m.shopping_empty_stock_covers()} />
		</div>
	{/if}
</section>

{#if done.length}
	<section class="mb-4">
		<h2 class="ui-section-label mb-2">{m.shopping_in_basket_heading({ count: done.length })}</h2>
		<ul class="ui-list-card divide-y divide-base-200">
			{#each done as item, index (item.name)}
				{@const rowId = itemDomId('done', index)}
				<li
					class="flex min-h-12 items-center gap-3 px-3 py-2 text-base-content/45"
					in:receive={{ key: item.name }}
					out:send={{ key: item.name }}
					animate:flip={{ duration: MOTION_CONTENT_MS }}
				>
					<input
						id={rowId}
						type="checkbox"
						class="checkbox checkbox-md shrink-0"
						checked={item.bought}
						disabled={readOnly}
						aria-label={m.shopping_mark_not_bought_aria({ name: item.name })}
						onchange={() => onToggleBought(item)}
					/>
					<label for={rowId} class="min-w-0 flex-1 cursor-pointer py-1">
						<span class="block truncate text-sm font-medium line-through">{item.name}</span>
					</label>
				</li>
			{/each}
		</ul>
	</section>
{/if}
