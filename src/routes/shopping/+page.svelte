<script lang="ts">
	import { base } from '$app/paths';
	import { m } from '$lib/paraglide/messages';
	import AddItemForm from '$lib/components/shopping/AddItemForm.svelte';
	import AhSheet from '$lib/components/shopping/AhSheet.svelte';
	import PushHistory from '$lib/components/shopping/PushHistory.svelte';
	import ShoppingLists from '$lib/components/shopping/ShoppingLists.svelte';
	import WeekNav from '$lib/components/shopping/WeekNav.svelte';
	import ShoppingNotices from '$lib/components/shopping/ShoppingNotices.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import Icon from '$lib/components/ui/icons/Icon.svelte';
	import { optimistic } from '$lib/optimistic';
	import { toast } from '$lib/stores/toast.svelte';
	import { untrack } from 'svelte';
	import type { PageData } from './$types';
	import { useChatAgent } from '$lib/chat/agent_context';
	import { invalidateAll } from '$app/navigation';

	type Item = PageData['items'][number];

	let { data }: { data: PageData } = $props();
	const chatAgent = useChatAgent();

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
	let activePending = $derived(items.filter((i) => i.included && !i.bought && (showCovered || !i.covered)));
	let choices = $derived(items.filter((i) => !i.bought && !i.manual && (i.optional || i.staple)));
	let pending = $derived(activePending.filter((i) => !i.optional && !i.staple));
	let covered = $derived(items.filter((i) => i.included && !i.bought && i.covered));
	let done = $derived(items.filter((i) => i.bought));
	let visibleToBuyCount = $derived(activePending.filter((i) => !i.covered).length);

	$effect(() =>
		chatAgent.publishScreen({
			v: 1,
			routeId: '/shopping',
			label: m.shopping_heading(),
			entity: { kind: 'shopping', id: data.weekStart, label: data.weekStart },
			facts: [
				{ key: 'weekStart', value: data.weekStart },
				{ key: 'toBuy', value: visibleToBuyCount },
				{ key: 'covered', value: covered.length },
				{ key: 'done', value: done.length }
			]
		})
	);

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

	// AddItemForm already persisted the override; reload so derived and manual
	// quantities are recomposed by the same server projection used on refresh.
	async function addItem(_item: Item) {
		await invalidateAll();
	}

	async function saveChoice(item: Item, action: 'set_included' | 'set_selected_name', value: boolean | string) {
		const before = { ...item };
		if (action === 'set_included') item.included = Boolean(value);
		else item.selectedName = String(value);
		items = [...items];
		await optimistic(
			() => fetch(`${base}/api/shopping`, {
				method: 'POST', headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action, weekStart: data.weekStart, name: item.name,
					...(action === 'set_included' ? { included: value } : { selectedName: value }) })
			}),
			() => { Object.assign(item, before); items = [...items]; },
			m.shopping_toast_choice_failed()
		);
	}

	async function setStaple(item: Item, isStaple: boolean) {
		const before = { ...item };
		item.staple = isStaple;
		item.included = !isStaple;
		items = [...items];
		const ok = await optimistic(
			() => fetch(`${base}/api/shopping`, {
				method: 'POST', headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'set_staple', weekStart: data.weekStart, name: item.name, isStaple })
			}),
			() => { Object.assign(item, before); items = [...items]; },
			m.shopping_toast_choice_failed()
		);
		if (ok) toast.success(isStaple
			? m.shopping_toast_staple_saved({ name: item.name })
			: m.shopping_toast_staple_removed({ name: item.name }));
	}

	async function restoreManual(item: Item, amount: string | null, unit: string | null) {
		try {
			const r = await fetch(`${base}/api/shopping`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'add_manual',
					weekStart: data.weekStart,
					name: item.name,
					amount,
					unit
				})
			});
			if (!r.ok) throw new Error(`HTTP ${r.status}`);
			await invalidateAll();
		} catch {
			toast.error(m.shopping_toast_restore_failed());
		}
	}

	async function deleteManual(item: Item) {
		const before = items.map((row) => ({ ...row }));
		const manualAmount = item.manualAmount ?? (item.manual ? item.amount : null);
		const manualUnit = item.manualUnit ?? (item.manual ? item.unit : null);
		items = item.manual
			? items.filter((row) => row !== item)
			: items.map((row) => row === item ? {
				...row,
				amount: row.derivedAmount ?? null,
				unit: row.derivedUnit ?? null,
				manualContribution: false,
				manualAmount: null,
				manualUnit: null
			} : row);
		const ok = await optimistic(
			() =>
				fetch(`${base}/api/shopping`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ action: 'remove_manual', weekStart: data.weekStart, name: item.name })
				}),
			() => {
				items = before;
			},
			m.shopping_toast_remove_failed()
		);
		if (ok) toast.undo(m.shopping_toast_removed({ name: item.name }), () => void restoreManual(item, manualAmount, manualUnit));
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
			class="btn btn-primary btn-sm h-10 min-h-0 shrink-0 gap-1.5 px-2.5 sm:px-3"
			onclick={() => ahSheet?.openAhModal()}
			disabled={visibleToBuyCount === 0}
			aria-label={m.shopping_review_ah_order()}
		>
			<Icon name="cart" />
			<span class="hidden sm:inline">{m.shopping_review_ah_order()}</span>
			{#if visibleToBuyCount > 0}
				<span class="badge badge-sm border-0 bg-base-100 px-1.5 font-bold text-primary">{visibleToBuyCount}</span>
			{/if}
		</button>
	</header>

	<WeekNav
		weekStart={data.weekStart}
		prevWeek={data.prevWeek}
		nextWeek={data.nextWeek}
		isCurrentWeek={data.isCurrentWeek}
		deliveryDate={data.deliveryDate}
	/>

	<ShoppingNotices
		showAhNotice={!data.ah.connected && items.length > 0}
		mealsWithoutRecipe={data.mealsWithoutRecipe}
		freezerMeals={data.freezerMeals}
		freezerMealsMissingFreshInfo={data.freezerMealsMissingFreshInfo}
	/>

	{#if !items.length}
		<EmptyState iconName="basket" title={emptyCopy.title} description={emptyCopy.description}>
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
			{choices}
			{done}
			coveredCount={covered.length}
			{visibleToBuyCount}
			bind:showCovered
			{bonusByName}
			onToggleBought={toggleBought}
			onDeleteManual={deleteManual}
			onToggleIncluded={(item) => void saveChoice(item, 'set_included', !item.included)}
			onSelectName={(item, selectedName) => void saveChoice(item, 'set_selected_name', selectedName)}
			onSetStaple={(item, isStaple) => void setStaple(item, isStaple)}
		/>
	{/if}

	<AddItemForm weekStart={data.weekStart} onAdded={addItem} />

	<PushHistory pushHistory={data.pushHistory} />
</div>

	<AhSheet bind:this={ahSheet} weekStart={data.weekStart} pending={activePending} bind:bonusByName onMarkedBought={markBought} />
