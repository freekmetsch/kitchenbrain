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
	import type { ShoppingNeed } from '$lib/components/shopping/ShoppingSourceQuickControls.svelte';

	type Item = PageData['items'][number];
	type SourceMutationStatus = 'saved' | 'stale' | 'failed';
	type MutationResult<T> =
		| { status: 'saved'; data: T }
		| { status: 'stale' | 'failed'; data: null };
	let { data }: { data: PageData } = $props();
	let items = $state<Item[]>(untrack(() => data.items.map((item) => ({ ...item }))));
	let bonusByName = $state<Record<string, boolean>>({});
	let ahSheet = $state<{ openAhModal: () => Promise<void> }>();
	let addItemForm = $state<{ openAddModal: () => Promise<void> }>();
	let showCovered = $state(false);

	let pending = $derived(items.filter((item) => !item.bought));
	let done = $derived(items.filter((item) => item.bought));
	let visibleToBuyCount = $derived(pending.filter((item) => !item.covered).length);
	let emptyState = $derived(data.emptyState === 'no_meals' ? ('no_meals' as const) : ('nothing_needed' as const));

	$effect(() => {
		items = data.items.map((item) => ({ ...item }));
	});

	async function postMutation<T>(
		path: string,
		body: Record<string, unknown>
	): Promise<MutationResult<T>> {
		try {
			const response = await fetch(`${base}${path}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});
			if (!response.ok) {
				if (response.status === 409) {
					await invalidateAll();
					return { status: 'stale', data: null };
				}
				throw new Error(`HTTP ${response.status}`);
			}
			const result = (await response.json()) as T;
			await invalidateAll();
			return { status: 'saved', data: result };
		} catch {
			return { status: 'failed', data: null };
		}
	}

	function showMutationFailure(status: 'stale' | 'failed') {
		toast.error(
			status === 'stale' ? m.shopping_choice_stale() : m.shopping_mutation_failed()
		);
	}

	async function mutate(body: Record<string, unknown>, success?: string): Promise<boolean> {
		const result = await postMutation<unknown>('/api/shopping', body);
		if (result.status !== 'saved') {
			showMutationFailure(result.status);
			return false;
		}
		if (success) toast.success(success);
		return true;
	}

	async function mutateReturning<T>(
		body: Record<string, unknown>,
		success?: string
	): Promise<T | null> {
		const result = await postMutation<T>('/api/shopping', body);
		if (result.status !== 'saved') {
			showMutationFailure(result.status);
			return null;
		}
		if (success) toast.success(success);
		return result.data;
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

	async function mutateSource(
		source: ShoppingListSource,
		input: { action: 'term'; term: string } | { action: 'need'; need: ShoppingNeed }
	): Promise<SourceMutationStatus> {
		const result = await postMutation<unknown>('/api/shopping/recipe-choice', {
			entryId: source.id,
			expectedEntryRevision: source.revision,
			...(input.action === 'need'
				? { expectedRecipeRevision: source.recipeRevision }
				: {}),
			...input
		});
		return result.status;
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
		isDefaultWeek={data.isDefaultWeek}
		deliveryDate={data.deliveryDate}
		ahConnected={data.ah.connected}
	/>

	<div class="shopping-market-layout ui-kitchen-content">
		<main class="min-w-0">
			<ShoppingLists
				{pending}
				{done}
				sources={data.sources}
				recurring={data.recurring}
				legacy={data.legacy}
				{emptyState}
				bind:showCovered
				{bonusByName}
				onToggleBought={toggleBought}
				onDeleteManual={removeManual}
				onRestoreManual={restoreManual}
				editable={data.isEditable}
				onChangeSourceTerm={(source, term) =>
					mutateSource(source, { action: 'term', term })}
				onChangeSourceNeed={(source, need) =>
					mutateSource(source, { action: 'need', need })}
				onAddRecurring={(input) =>
					mutateReturning<{ id: number }>(
						{ action: 'add_recurring', startWeek: data.weekStart, ...input },
						m.shopping_choice_saved()
					)}
				onEditRecurring={(item, input) =>
					mutateReturning<{ id: number }>(
						{
							action: 'edit_recurring',
							itemId: item.id,
							expectedRevision: item.revision,
							effectiveWeek: data.weekStart,
							...input
						},
						m.shopping_choice_saved()
					)}
				onSetRecurringIncluded={(item, included) =>
					item.entryId && item.entryRevision
						? mutate({
								action: 'set_recurring_included',
								entryId: item.entryId,
								expectedRevision: item.entryRevision,
								included
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
				{#snippet history()}
					<div class="shopping-market-mobile-history">
						<PushHistory pushHistory={data.pushHistory} headingId="shopping-mobile-push-history" />
					</div>
				{/snippet}
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

			</div>

			<div class="shopping-market-desktop-history">
				<PushHistory
					pushHistory={data.pushHistory}
					compact
					headingId="shopping-desktop-push-history"
				/>
			</div>
		</aside>
	</div>

	<div
		class:single-action={visibleToBuyCount === 0}
		class="shopping-market-dock"
		aria-label={m.shopping_heading()}
	>
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
		padding-block: 0.65rem max(7rem, var(--ui-overlay-bottom));
		gap: 0.75rem;
	}

	.shopping-market-aside {
		min-width: 0;
	}

	.shopping-market-desktop {
		display: none;
	}

	.shopping-market-mobile-history {
		display: block;
	}

	.shopping-market-desktop-history {
		display: none;
	}

	.market-side-card {
		overflow: hidden;
		border: 1px solid color-mix(in oklab, var(--market-olive) 18%, var(--color-base-300));
		border-radius: 0.85rem;
		background: var(--market-card);
		box-shadow: 0 6px 18px rgb(48 75 58 / 5%);
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

	@media (max-width: 47.999rem) {
		.shopping-market-dock.single-action {
			grid-template-columns: minmax(0, 1fr);
		}

		.shopping-market-dock.single-action .market-ah-action {
			display: none;
		}
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
			padding-block: 0.85rem max(7rem, var(--ui-overlay-bottom));
		}

		.shopping-market-desktop {
			display: block;
		}

		.shopping-market-mobile-history {
			display: none;
		}

		.shopping-market-desktop-history {
			display: block;
		}
	}

	@media (min-width: 64rem) {
		.shopping-market-layout {
			grid-template-columns: minmax(0, 1fr) 18.75rem;
			gap: 1rem;
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
