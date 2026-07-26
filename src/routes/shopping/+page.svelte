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
	import Icon from '$lib/components/ui/icons/Icon.svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import type { PageData } from './$types';
	import type { ShoppingListSource } from '$lib/components/shopping/types';
	import { untrack } from 'svelte';

	type Item = PageData['items'][number];
	let { data }: { data: PageData } = $props();
	let items = $state<Item[]>(untrack(() => data.items.map((item) => ({ ...item }))));
	let bonusByName = $state<Record<string, boolean>>({});
	let ahSheet = $state<{ openAhModal: () => Promise<void> }>();
	let addItemForm = $state<{ openAddModal: () => Promise<void> }>();
	let showCovered = $state(false);

	let pending = $derived(items.filter((item) => !item.bought));
	let done = $derived(items.filter((item) => item.bought));
	let covered = $derived(pending.filter((item) => item.covered));
	let visibleToBuyCount = $derived(pending.filter((item) => !item.covered).length);
	let totalRunCount = $derived(visibleToBuyCount + done.length);
	let recurringCount = $derived(data.recurring.filter((item) => item.included).length);
	let mealCount = $derived(new Set(data.sources.flatMap((source) => source.mealNames)).size);
	let emptyState = $derived(data.emptyState === 'no_meals' ? ('no_meals' as const) : ('nothing_needed' as const));

	$effect(() => {
		items = data.items.map((item) => ({ ...item }));
	});

	async function mutate(body: Record<string, unknown>, success?: string): Promise<boolean> {
		try {
			const response = await fetch(`${base}/api/shopping`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});
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

	async function saveSource(
		source: ShoppingListSource,
		input: { need: 'required' | 'optional' | 'stocked'; term: string; useInRecipe: boolean }
	) {
		try {
			const response = await fetch(`${base}/api/shopping/recipe-choice`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					entryId: source.id,
					expectedEntryRevision: source.revision,
					expectedRecipeRevision: source.recipeRevision,
					...input
				})
			});
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			await invalidateAll();
			toast.success(m.shopping_choice_saved());
			return true;
		} catch {
			toast.error(m.shopping_mutation_failed());
			return false;
		}
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

	function markBought(refs: Set<string>) {
		items = items.map((item) => {
			const ref = `entries:${[...(item.entryIds ?? [])].sort((a, b) => a - b).join(',')}`;
			return refs.has(ref) ? { ...item, bought: true } : item;
		});
	}
</script>

<svelte:head><title>{m.shopping_title()}</title></svelte:head>

<div class="shopping-market">
	<WeekNav
		weekStart={data.weekStart}
		prevWeek={data.prevWeek}
		nextWeek={data.nextWeek}
		isCurrentWeek={data.isCurrentWeek}
		deliveryDate={data.deliveryDate}
		remainingCount={visibleToBuyCount}
		doneCount={done.length}
		totalCount={totalRunCount}
		ahConnected={data.ah.connected}
	/>

	<div class="shopping-market-layout">
		<main class="min-w-0">
			<ShoppingLists
				{pending}
				{done}
				sources={data.sources}
				recurring={data.recurring}
				legacy={data.legacy}
				{emptyState}
				coveredCount={covered.length}
				{visibleToBuyCount}
				bind:showCovered
				{bonusByName}
				onToggleBought={toggleBought}
				onDeleteManual={removeManual}
				onRestoreManual={restoreManual}
				onSaveSource={saveSource}
				onAddRecurring={(input) =>
					mutate({ action: 'add_recurring', startWeek: data.weekStart, ...input })}
				onEditRecurring={(item, input) =>
					mutate({
						action: 'edit_recurring',
						itemId: item.id,
						expectedRevision: item.revision,
						effectiveWeek: data.weekStart,
						...input
					})}
				onSkipRecurring={(item) =>
					item.entryId && item.entryRevision
						? mutate({
								action: 'skip_recurring',
								entryId: item.entryId,
								expectedRevision: item.entryRevision
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
						showAhNotice={!data.ah.connected && items.length > 0}
						mealsWithoutRecipe={data.mealsWithoutRecipe}
						freezerMeals={data.freezerMeals}
						freezerMealsMissingFreshInfo={data.freezerMealsMissingFreshInfo}
					/>
				{/snippet}
			</ShoppingLists>
		</main>

		<aside class="shopping-market-aside">
			<div class="shopping-market-desktop">
				<section class="market-side-card">
					<header><strong>Albert Heijn</strong><span>{data.ah.connected ? m.shopping_ah_connected_short() : m.shopping_ah_offline_short()}</span></header>
					<div>
						<p>{data.ah.connected ? m.shopping_uncovered_ready({ count: visibleToBuyCount }) : m.shopping_ah_connect_first()}</p>
						{#if data.ah.connected}
							<button
								type="button"
								class="market-side-action"
								disabled={visibleToBuyCount === 0}
								onclick={() => ahSheet?.openAhModal()}
							>
								<Icon name="cart" class="h-4 w-4" />
								{m.shopping_review_ah_short()} · {visibleToBuyCount}
							</button>
						{:else}
							<a href="{base}/settings/connections" class="market-side-action">{m.shopping_open_settings_button()}</a>
						{/if}
					</div>
				</section>

				<section class="market-side-card">
					<header><strong>{m.shopping_run_context()}</strong><span>{m.shopping_recipe_references_count({ count: mealCount })}</span></header>
					<div>
						<div class="market-side-stats">
							<span><strong>{visibleToBuyCount}</strong>{m.shopping_left_to_buy_label()}</span>
							<span><strong>{done.length}</strong>{m.shopping_basket_label()}</span>
						</div>
						<ul>
							<li><Icon name="check" /> {m.shopping_covered_by_stock({ count: covered.length })}</li>
							<li><Icon name="clock" /> {m.shopping_recurring_basics({ count: recurringCount })}</li>
						</ul>
					</div>
				</section>
			</div>

			<PushHistory pushHistory={data.pushHistory} compact />
		</aside>
	</div>

	<div class="shopping-market-dock" aria-label={m.shopping_heading()}>
		<button type="button" class="market-add-action" onclick={() => addItemForm?.openAddModal()}>
			<Icon name="plus" />
			{m.shopping_additem_submit_aria()}
		</button>
		<button
			type="button"
			class="market-ah-action"
			disabled={visibleToBuyCount === 0}
			onclick={() => ahSheet?.openAhModal()}
			aria-label={m.shopping_review_ah_order()}
		>
			<Icon name="cart" />
			{m.shopping_review_ah_short()}
			{#if visibleToBuyCount > 0}<span>{visibleToBuyCount}</span>{/if}
		</button>
	</div>
</div>

<AddItemForm bind:this={addItemForm} weekStart={data.weekStart} onAdded={addItem} />
<AhSheet
	bind:this={ahSheet}
	weekStart={data.weekStart}
	pending={pending}
	bind:bonusByName
	onMarkedBought={markBought}
/>

<style>
	:global(.app-shell:has(.shopping-market)) {
		--ui-fixed-bar-height: 5rem;
		--ui-overlay-bottom: calc(var(--ui-nav-offset) + 5rem + var(--ui-overlay-gap));
	}

	.shopping-market {
		--market-olive: var(--kitchen-olive);
		--market-olive-ink: var(--kitchen-olive);
		--market-honey: var(--kitchen-honey);
		--market-terra: var(--kitchen-terra);
		--market-paper: var(--kitchen-paper);
		--market-card: var(--kitchen-card);
		min-height: 100%;
		background: var(--market-paper);
		color: var(--color-base-content);
	}

	.shopping-market-layout {
		display: grid;
		max-width: 74rem;
		margin: 0 auto;
		padding: 0.65rem 0.75rem max(7rem, var(--ui-overlay-bottom));
		gap: 0.75rem;
	}

	.shopping-market-aside {
		min-width: 0;
	}

	.shopping-market-desktop {
		display: none;
	}

	.market-side-card {
		overflow: hidden;
		border: 1px solid color-mix(in oklab, var(--market-olive) 18%, var(--color-base-300));
		border-radius: 0.85rem;
		background: var(--market-card);
		box-shadow: 0 6px 18px rgb(48 75 58 / 5%);
	}

	.market-side-card + .market-side-card {
		margin-top: 0.65rem;
	}

	.market-side-card > header {
		display: flex;
		min-height: 2.75rem;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		border-bottom: 1px solid var(--color-base-200);
		padding: 0 0.8rem;
	}

	.market-side-card > header strong {
		font-size: 0.66rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.market-side-card > header span {
		color: color-mix(in oklab, var(--color-base-content) 70%, transparent);
		font-size: 0.64rem;
	}

	.market-side-card > div {
		padding: 0.8rem;
	}

	.market-side-card p {
		color: color-mix(in oklab, var(--color-base-content) 74%, transparent);
		font-size: 0.72rem;
		line-height: 1.45;
	}

	.market-side-action {
		display: inline-flex;
		width: 100%;
		min-height: 2.75rem;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		margin-top: 0.7rem;
		border-radius: 0.65rem;
		background: var(--market-terra);
		color: white;
		font-size: 0.72rem;
		font-weight: 750;
	}

	.market-side-action:disabled {
		background: var(--color-base-200);
		color: color-mix(in oklab, var(--color-base-content) 50%, transparent);
	}

	.market-side-stats {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.5rem;
	}

	.market-side-stats span {
		display: grid;
		min-height: 3.25rem;
		align-content: center;
		border-radius: 0.65rem;
		padding: 0.55rem 0.65rem;
		background: var(--market-paper);
		color: color-mix(in oklab, var(--color-base-content) 65%, transparent);
		font-size: 0.58rem;
	}

	.market-side-stats strong {
		color: var(--color-base-content);
		font-family: Georgia, 'Times New Roman', serif;
		font-size: 1.25rem;
		font-weight: 500;
		line-height: 1;
	}

	.market-side-card ul {
		margin-top: 0.55rem;
	}

	.market-side-card li {
		display: flex;
		min-height: 2rem;
		align-items: center;
		gap: 0.4rem;
		border-bottom: 1px solid var(--color-base-200);
		color: color-mix(in oklab, var(--color-base-content) 74%, transparent);
		font-size: 0.65rem;
	}

	.market-side-card li:last-child {
		border-bottom: 0;
	}

	.market-side-card li :global(svg) {
		width: 0.85rem;
		height: 0.85rem;
		color: var(--market-olive);
	}

	.shopping-market-dock {
		position: fixed;
		right: 0.75rem;
		bottom: calc(var(--ui-nav-offset) + 0.5rem);
		left: 0.75rem;
		z-index: 60;
		display: grid;
		grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.35fr);
		gap: 0.5rem;
		max-width: 30rem;
		margin: 0 auto;
		border: 1px solid color-mix(in oklab, var(--market-olive) 18%, var(--color-base-300));
		border-radius: 0.9rem;
		padding: 0.45rem;
		background: color-mix(in oklab, var(--market-card) 95%, transparent);
		box-shadow: 0 12px 32px rgb(48 60 49 / 22%);
		backdrop-filter: blur(12px);
	}

	.shopping-market-dock button {
		display: inline-flex;
		min-width: 0;
		min-height: 2.75rem;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		border-radius: 0.65rem;
		padding: 0 0.7rem;
		font-size: 0.75rem;
		font-weight: 800;
	}

	.market-add-action {
		background: color-mix(in oklab, var(--market-paper) 80%, var(--color-base-200));
		color: var(--color-base-content);
	}

	.market-ah-action {
		background: var(--market-terra);
		color: white;
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

	.market-ah-action:disabled {
		background: var(--color-base-200);
		color: color-mix(in oklab, var(--color-base-content) 48%, transparent);
	}

	:global(html[data-theme='dark']) .shopping-market {
		--market-olive-ink: #a4c8ac;
		--market-paper: #1c221e;
		--market-card: #252c27;
	}

	@media (min-width: 48rem) {
		.shopping-market-layout {
			grid-template-columns: minmax(0, 1fr) 17rem;
			align-items: start;
			gap: 0.9rem;
			padding: 0.85rem 1.5rem max(7rem, var(--ui-overlay-bottom));
		}

		.shopping-market-desktop {
			display: block;
		}
	}

	@media (min-width: 64rem) {
		.shopping-market-layout {
			grid-template-columns: minmax(0, 1fr) 18.75rem;
			gap: 1rem;
			padding: 0.85rem 2rem max(7rem, var(--ui-overlay-bottom));
		}

		.shopping-market-dock {
			left: 50%;
			right: auto;
			width: 30rem;
			/* Center the dock beneath the primary column, not the context rail. */
			transform: translateX(-50%) translateX(-9.875rem);
		}
	}
</style>
