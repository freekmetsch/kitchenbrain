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
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import Icon from '$lib/components/ui/icons/Icon.svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import type { PageData } from './$types';
	import { useChatAgent } from '$lib/chat/agent_context';
	import type { ShoppingListSource } from '$lib/components/shopping/types';
	import { untrack } from 'svelte';

	type Item = PageData['items'][number];
	let { data }: { data: PageData } = $props();
	const chatAgent = useChatAgent();
	let items = $state<Item[]>(untrack(() => data.items.map((item) => ({ ...item }))));
	let bonusByName = $state<Record<string, boolean>>({});
	let ahSheet: { openAhModal: () => Promise<void> } | undefined = $state();
	let showCovered = $state(false);
	let pending = $derived(items.filter((item) => !item.bought));
	let done = $derived(items.filter((item) => item.bought));
	let covered = $derived(pending.filter((item) => item.covered));
	let visibleToBuyCount = $derived(pending.filter((item) => !item.covered).length);

	$effect(() => { items = data.items.map((item) => ({ ...item })); });
	$effect(() => chatAgent.publishScreen({
		v: 1, routeId: '/shopping', label: m.shopping_heading(),
		entity: { kind: 'shopping', id: data.weekStart, label: data.weekStart },
		facts: [{ key: 'weekStart', value: data.weekStart }, { key: 'toBuy', value: visibleToBuyCount }, { key: 'done', value: done.length }]
	}));

	async function mutate(body: Record<string, unknown>, success?: string): Promise<boolean> {
		try {
			const response = await fetch(`${base}/api/shopping`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			await invalidateAll();
			if (success) toast.success(success);
			return true;
		} catch {
			toast.error(m.shopping_mutation_failed());
			return false;
		}
	}

	async function toggleBought(item: Item) {
		const before = item.bought;
		item.bought = !before;
		items = [...items];
		if (!(await mutate({ action: 'set_bought_entries', entryIds: item.entryIds, weekStart: data.weekStart, bought: !before }))) {
			item.bought = before;
			items = [...items];
			return false;
		}
		return true;
	}

	async function saveSource(source: ShoppingListSource, input: { need: 'required' | 'optional' | 'stocked'; term: string; useInRecipe: boolean }) {
		try {
			const response = await fetch(`${base}/api/shopping/recipe-choice`, {
				method: 'POST', headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ entryId: source.id, expectedEntryRevision: source.revision, expectedRecipeRevision: source.recipeRevision, ...input })
			});
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			await invalidateAll();
			toast.success(m.shopping_choice_saved());
			return true;
		} catch { toast.error(m.shopping_mutation_failed()); return false; }
	}

	function addItem(_item: Item) { return invalidateAll(); }
	function markBought(refs: Set<string>) {
		items = items.map((item) => {
			const ref = `entries:${[...(item.entryIds ?? [])].sort((a, b) => a - b).join(',')}`;
			return refs.has(ref) ? { ...item, bought: true } : item;
		});
	}
	let emptyCopy = $derived(data.emptyState === 'no_meals'
		? { title: m.shopping_empty_no_meals_title(), description: m.shopping_empty_no_meals_desc() }
		: { title: m.shopping_empty_nothing_title(), description: m.shopping_empty_nothing_desc() });
</script>

<svelte:head><title>{m.shopping_title()}</title></svelte:head>

<div class="ui-page-shell px-4 py-4">
	<header class="mb-3 flex items-center justify-between gap-3">
		<h1 class="min-w-0 text-2xl font-semibold leading-tight">{m.shopping_heading()}</h1>
		<button type="button" class="btn btn-primary btn-sm h-10 min-h-0 shrink-0 gap-1.5 px-2.5 sm:px-3" onclick={() => ahSheet?.openAhModal()} disabled={visibleToBuyCount === 0} aria-label={m.shopping_review_ah_order()}><Icon name="cart" /><span class="hidden sm:inline">{m.shopping_review_ah_order()}</span>{#if visibleToBuyCount > 0}<span class="badge badge-sm border-0 bg-base-100 px-1.5 font-bold text-primary">{visibleToBuyCount}</span>{/if}</button>
	</header>
	<WeekNav weekStart={data.weekStart} prevWeek={data.prevWeek} nextWeek={data.nextWeek} isCurrentWeek={data.isCurrentWeek} deliveryDate={data.deliveryDate} />
	<ShoppingNotices showAhNotice={!data.ah.connected && items.length > 0} mealsWithoutRecipe={data.mealsWithoutRecipe} freezerMeals={data.freezerMeals} freezerMealsMissingFreshInfo={data.freezerMealsMissingFreshInfo} />

	{#if !items.length && !data.sources.length && !data.recurring.length && !data.legacy.length}
		<EmptyState iconName="basket" title={emptyCopy.title} description={emptyCopy.description} />
	{:else}
		<ShoppingLists
			{pending} {done} sources={data.sources} recurring={data.recurring} legacy={data.legacy}
			coveredCount={covered.length} {visibleToBuyCount} bind:showCovered {bonusByName}
			onToggleBought={toggleBought}
			onDeleteManual={(source) => void mutate({ action: 'remove_source_manual', entryId: source.id, expectedRevision: source.revision })}
			onSaveSource={saveSource}
			onAddRecurring={(input) => mutate({ action: 'add_recurring', startWeek: data.weekStart, ...input })}
			onEditRecurring={(item, input) => mutate({ action: 'edit_recurring', itemId: item.id, expectedRevision: item.revision, effectiveWeek: data.weekStart, ...input })}
			onSkipRecurring={(item) => item.entryId && item.entryRevision ? mutate({ action: 'skip_recurring', entryId: item.entryId, expectedRevision: item.entryRevision }) : Promise.resolve(false)}
			onDisableRecurring={(item) => mutate({ action: 'disable_recurring', itemId: item.id, expectedRevision: item.revision, effectiveWeek: data.weekStart })}
			onResolveLegacy={(item, resolution, targetEntryId) => {
				const target = item.candidates.find((candidate) => candidate.id === targetEntryId);
				void mutate({
					action: 'resolve_legacy', legacyEntryId: item.id, expectedLegacyRevision: item.revision,
					resolution, targetEntryId, expectedTargetRevision: target?.revision
				});
			}}
		/>
	{/if}
	<AddItemForm weekStart={data.weekStart} onAdded={addItem} />
	<PushHistory pushHistory={data.pushHistory} />
</div>

<AhSheet bind:this={ahSheet} weekStart={data.weekStart} pending={pending} bind:bonusByName onMarkedBought={markBought} />
