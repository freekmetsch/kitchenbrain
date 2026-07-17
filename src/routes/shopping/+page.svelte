<script lang="ts">
	import { base } from '$app/paths';
	import { m } from '$lib/paraglide/messages';
	import AddItemForm from '$lib/components/shopping/AddItemForm.svelte';
	import AhSheet from '$lib/components/shopping/AhSheet.svelte';
	import PushHistory from '$lib/components/shopping/PushHistory.svelte';
	import ShoppingLists from '$lib/components/shopping/ShoppingLists.svelte';
	import WeekNav from '$lib/components/shopping/WeekNav.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import Icon from '$lib/components/ui/icons/Icon.svelte';
	import { optimistic } from '$lib/optimistic';
	import { toast } from '$lib/stores/toast.svelte';
	import { untrack } from 'svelte';
	import type { PageData } from './$types';

	type Item = PageData['items'][number];

	let { data }: { data: PageData } = $props();

	let items = $state<Item[]>(untrack(() => data.items.map((i) => ({ ...i }))));

	// Week-switch links (?week=...) and "Back to this week" are same-route
	// navigations -- `load` reruns and `data.items` gets a fresh identity, but
	// local `items` (which carries optimistic bought/add/delete edits between
	// loads) does not resync on its own. Resync whenever a new load result
	// arrives; server truth wins over any in-flight local edit.
	$effect(() => {
		const next = data.items;
		items = next.map((i) => ({ ...i }));
	});

	// Bonus status per item name, reflected onto the list rows once a preview
	// has run (no page-load AH cost -- it rides the preview the user requested).
	// Written by the AH sheet (bindable); rendered by the list rows.
	let bonusByName = $state<Record<string, boolean>>({});

	// AH sheet instance — the header button triggers its exported openAhModal().
	let ahSheet: { openAhModal: () => Promise<void> } | undefined = $state();

	let showCovered = $state(false);
	let pending = $derived(items.filter((i) => !i.bought && (showCovered || !i.covered)));
	let covered = $derived(items.filter((i) => !i.bought && i.covered));
	let done = $derived(items.filter((i) => i.bought));
	let visibleToBuyCount = $derived(pending.filter((i) => !i.covered).length);

	let emptyCopy = $derived(
		data.emptyState === 'no_meals'
			? {
					title: m.shopping_empty_no_meals_title(),
					description: m.shopping_empty_no_meals_desc()
				}
			: {
					title: m.shopping_empty_nothing_title(),
					description: m.shopping_empty_nothing_desc()
				}
	);

	async function toggleBought(item: Item) {
		const newBought = !item.bought;
		item.bought = newBought;
		items = [...items];
		await optimistic(
			() =>
				fetch(`${base}/api/shopping`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						action: 'toggle_bought',
						weekStart: data.weekStart,
						name: item.name,
						bought: newBought
					})
				}),
			() => {
				item.bought = !newBought;
				items = [...items];
			},
			m.shopping_toast_toggle_failed()
		);
	}

	// AddItemForm did the add_manual POST; merge the created row into local state.
	function addItem(item: Item) {
		items = [...items.filter((i) => !(i.manual && i.name.toLowerCase() === item.name.toLowerCase())), item];
	}

	async function restoreManual(item: Item) {
		try {
			const r = await fetch(`${base}/api/shopping`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'add_manual',
					weekStart: data.weekStart,
					name: item.name,
					amount: item.amount,
					unit: item.unit
				})
			});
			if (!r.ok) throw new Error(`HTTP ${r.status}`);
			items = [
				...items.filter((i) => !(i.manual && i.name.toLowerCase() === item.name.toLowerCase())),
				{ ...item, bought: false, manual: true, covered: false }
			];
		} catch {
			toast.error(m.shopping_toast_restore_failed());
		}
	}

	async function deleteManual(item: Item) {
		const before = items;
		items = items.filter((i) => i !== item);
		const ok = await optimistic(
			() =>
				fetch(`${base}/api/shopping?week=${encodeURIComponent(data.weekStart)}&name=${encodeURIComponent(item.name)}`, {
					method: 'DELETE'
				}),
			() => {
				items = before;
			},
			m.shopping_toast_remove_failed()
		);
		if (ok) toast.undo(m.shopping_toast_removed({ name: item.name }), () => void restoreManual(item));
	}

	// The AH push marked these items bought server-side; mirror it locally.
	function markBought(names: Set<string>) {
		items = items.map((item) => (names.has(item.name.toLowerCase()) ? { ...item, bought: true } : item));
	}
</script>

<svelte:head>
	<title>{m.shopping_title()}</title>
</svelte:head>

<div class="ui-page-shell px-4 py-4">
	<header class="mb-3 flex items-center justify-between gap-3">
		<h1 class="min-w-0 text-2xl font-semibold leading-tight">{m.shopping_heading()}</h1>
		<button
			type="button"
			class="btn btn-primary btn-sm shrink-0 gap-1.5"
			onclick={() => ahSheet?.openAhModal()}
			disabled={visibleToBuyCount === 0}
		>
			<Icon name="cart" />
			{m.shopping_review_ah_order()}
		</button>
	</header>

	<WeekNav
		weekStart={data.weekStart}
		prevWeek={data.prevWeek}
		nextWeek={data.nextWeek}
		isCurrentWeek={data.isCurrentWeek}
		deliveryDate={data.deliveryDate}
	/>

	{#if !data.ah.connected && items.length}
		<div class="mb-3 rounded-2xl border border-warning/25 bg-warning/10 px-3 py-2 text-sm" role="status">
			<div class="flex items-start gap-2">
				<Icon name="warn" class="mt-0.5 h-4 w-4 shrink-0 text-warning" />
				<span class="text-base-content/70">
					{m.shopping_ah_not_connected_banner()}
					<a href="{base}/settings" class="font-medium text-primary underline-offset-2 hover:underline">{m.shopping_connect_settings_link()}</a>.
				</span>
			</div>
		</div>
	{/if}

	{#if data.mealsWithoutRecipe.length}
		<div class="mb-3 rounded-2xl border border-info/20 bg-info/10 px-3 py-2 text-sm text-base-content/70" role="status">
			<div class="flex gap-2">
				<Icon name="warn" class="mt-0.5 h-4 w-4 shrink-0 text-info" />
				<span>{m.shopping_without_recipe({ names: data.mealsWithoutRecipe.join(', ') })}</span>
			</div>
		</div>
	{/if}

	{#if data.freezerMeals.length}
		<div class="mb-3 rounded-2xl border border-info/20 bg-info/10 px-3 py-2 text-sm text-base-content/70" role="status">
			<div class="flex gap-2">
				<span class="mt-0.5 shrink-0">❄️</span>
				<span>
					{m.shopping_freezer_meals_banner({
						names: data.freezerMeals.map((f) => f.dinner).join(', ')
					})}
				</span>
			</div>
		</div>
	{/if}

	{#if data.freezerMealsMissingFreshInfo.length}
		<!-- Blind-spot surfacing: a freezer meal whose recipe has no
		     cook_in/serve_fresh roles contributes nothing to this list, so say so
		     and point at the recipe instead of silently under-shopping. -->
		<div class="mb-3 rounded-2xl border border-warning/25 bg-warning/10 px-3 py-2 text-sm" role="status">
			<div class="flex items-start gap-2">
				<Icon name="warn" class="mt-0.5 h-4 w-4 shrink-0 text-warning" />
				<span class="text-base-content/70">
					{m.shopping_freezer_missing_roles_banner()}
					{#each data.freezerMealsMissingFreshInfo as f, i}
						{#if i > 0}<span>, </span>{/if}
						<a href="{base}/recipes/{f.recipeSlug}" class="font-medium text-primary underline-offset-2 hover:underline">{f.dinner}</a>
					{/each}
				</span>
			</div>
		</div>
	{/if}

	{#if !items.length}
		<EmptyState icon="🛒" title={emptyCopy.title} description={emptyCopy.description}>
			{#snippet action()}
				{#if data.emptyState === 'no_meals'}
					<a href="{base}/meal-plan?week={data.weekStart}" class="btn btn-primary btn-sm">{m.shopping_plan_meals_button()}</a>
				{:else}
					<a href="{base}/inventory" class="btn btn-outline btn-sm">{m.shopping_view_stock_button()}</a>
				{/if}
			{/snippet}
		</EmptyState>
	{:else}
		<ShoppingLists
			{pending}
			{done}
			coveredCount={covered.length}
			{visibleToBuyCount}
			bind:showCovered
			{bonusByName}
			onToggleBought={toggleBought}
			onDeleteManual={deleteManual}
		/>
	{/if}

	<AddItemForm weekStart={data.weekStart} onAdded={addItem} />

	<PushHistory pushHistory={data.pushHistory} />
</div>

<AhSheet bind:this={ahSheet} weekStart={data.weekStart} {pending} bind:bonusByName onMarkedBought={markBought} />
