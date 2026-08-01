
<!--
	Inventory — a meals-first Stock Radar. The full-width olive outcome band and
	responsive Use next / Still plenty ledger are shared across breakpoints;
	quantity writes, recipe relationships, editing, review, history, undo, and
	ghost-row recovery are coordinated by one page-local controller.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { m } from '$lib/paraglide/messages';
	import ActivitySheet from '$lib/components/inventory/ActivitySheet.svelte';
	import AddItemForm from '$lib/components/inventory/AddItemForm.svelte';
	import GhostRows from '$lib/components/inventory/GhostRows.svelte';
	import ItemEditor from '$lib/components/inventory/ItemEditor.svelte';
	import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
	import Icon from '$lib/components/ui/icons/Icon.svelte';
	import ItemRow from '$lib/components/inventory/ItemRow.svelte';
	import LinkRecipeSheet from '$lib/components/inventory/LinkRecipeSheet.svelte';
	import RecipeRelationshipStatus from '$lib/components/inventory/RecipeRelationshipStatus.svelte';
	import { InventoryController } from '$lib/components/inventory/controller.svelte';
	import {
		foodClassText,
		type InventoryScope,
		type Item
	} from '$lib/components/inventory/shared';
	import { FOOD_CLASS_ROOTS } from '$lib/food_class';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import CombinedFilterMenu from '$lib/components/ui/CombinedFilterMenu.svelte';
	import KitchenPageHeader from '$lib/components/ui/KitchenPageHeader.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const controller = new InventoryController(() => data);
	const SCOPES: InventoryScope[] = ['meals', 'ingredients', 'all'];
	let stockFilterMenuOpen = $state(false);
	let stockFilterCount = $derived(
		Number(controller.scope !== 'meals') +
			Number(controller.quickView !== null) +
			Number(controller.sectionFilter !== 'all') +
			Number(controller.classFilter !== null) +
			Number(controller.reviewOnly)
	);
	let stockFilterSummary = $derived(
		[
			controller.scopeLabel(controller.scope),
			controller.quickView === 'ready'
				? m.inventory_radar_meals_label()
				: controller.quickView === 'below_target'
					? m.inventory_radar_below_target_label()
					: null,
			controller.sectionFilter === 'freezer'
				? m.inventory_section_freezer()
				: controller.sectionFilter === 'pantry'
					? m.inventory_section_pantry()
					: null,
			controller.classFilter ? foodClassText(controller.classFilter) : null,
			controller.reviewOnly ? m.inventory_filters_review_label() : null
		]
			.filter(Boolean)
			.join(' · ')
	);

	onMount(() => controller.mount());

	function setSectionFilter(value: string) {
		controller.sectionFilter =
			value === 'freezer' || value === 'pantry' ? value : 'all';
	}

	function setClassFilter(value: string) {
		controller.classFilter = value || null;
	}

	function setReviewFilter(value: string) {
		controller.reviewOnly = value === 'review';
	}
</script>

<svelte:head><title>{m.inventory_title()}</title></svelte:head>

{#snippet stockRow(item: Item, signalLabel: string | null)}
	<li
		id="inventory-item-{item.id}"
		class="stock-card relative min-w-0 overflow-hidden"
		class:stock-card-attention={Boolean(signalLabel || item.needsReview)}
	>
		<ItemRow
			{item}
			link={controller.linkFor(item)}
			matches={controller.data.recipeMatches[item.id] ?? []}
			{signalLabel}
			relationshipInteractive={controller.relationshipReviewOnly}
			qtyEditing={controller.qtyEditId === item.id}
			bind:qtyEditVal={controller.qtyEditVal}
			portionEditing={controller.portionEditId === item.id}
			bind:portionEditVal={controller.portionEditVal}
			onOpenEdit={() => controller.openEdit(item)}
			onDelete={() => controller.deleteItem(item)}
			onStepQty={(delta) => controller.stepQty(item, delta)}
			onOpenQtyEdit={() => controller.openQtyEdit(item)}
			onCommitQtyEdit={() => controller.commitQtyEdit(item)}
			onCancelQtyEdit={() => (controller.qtyEditId = null)}
			onResolveReview={() => controller.resolveReview(item)}
			stapleAdded={controller.stapleAdded.includes(item.id)}
			stapleBusy={controller.stapleOutBusy === item.id}
			onAddStaple={() => controller.stapleOut(item)}
			onOpenLinkPicker={() => controller.openLinkPicker(item)}
			onOpenPortionEdit={() => controller.openPortionEdit(item)}
			onCommitPortionEdit={() => controller.commitPortionEdit(item)}
			onCancelPortionEdit={() => (controller.portionEditId = null)}
		/>
	</li>
{/snippet}

{#snippet stockSearch()}
	<label class="ui-field-shell stock-command-search">
		<span class="sr-only">{m.inventory_search_label()}</span>
		<svg viewBox="0 0 16 16" class="pointer-events-none h-4 w-4 opacity-70" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
			<path d="M11.25 11.25 14 14" />
			<circle cx="7.25" cy="7.25" r="5" />
		</svg>
		<input
			bind:this={controller.searchInput}
			type="search"
			placeholder={m.inventory_search_placeholder()}
			bind:value={controller.searchQuery}
			onkeydown={(event) => {
				if (event.key === 'Escape' && controller.searchQuery) {
					event.preventDefault();
					controller.clearSearch();
				}
			}}
		/>
		{#if controller.searchQuery}
			<button type="button" aria-label={m.inventory_search_clear()} onclick={() => controller.clearSearch()}>
				<Icon name="x" class="h-3.5 w-3.5" />
			</button>
		{:else}
			<kbd>/</kbd>
		{/if}
	</label>
{/snippet}

{#snippet stockQuickViews(menuSurface = false)}
	<div class="stock-command-group stock-quick-group" class:menu-surface={menuSurface} role="group" aria-label={m.inventory_quick_filters_label()}>
		{#if controller.readyMealCount > 0}
			<button type="button" class:active={controller.quickView === 'ready'} aria-pressed={controller.quickView === 'ready'} aria-label={m.inventory_radar_ready_aria({ count: controller.readyMealCount })} onclick={() => controller.toggleQuickView('ready')}>
				<strong>{controller.readyMealCount}</strong><span>{m.inventory_radar_meals_label()}</span>
			</button>
		{:else}
			<span class="stock-command-zero"><Icon name="check" class="h-3.5 w-3.5" />{m.inventory_radar_ready_zero()}</span>
		{/if}
		{#if controller.belowTargetCount > 0}
			<button type="button" class="attention" class:active={controller.quickView === 'below_target'} aria-pressed={controller.quickView === 'below_target'} aria-label={m.inventory_radar_below_target_aria({ count: controller.belowTargetCount })} onclick={() => controller.toggleQuickView('below_target')}>
				<strong>{controller.belowTargetCount}</strong><span>{m.inventory_radar_below_target_label()}</span>
			</button>
		{:else}
			<span class="stock-command-zero"><Icon name="check" class="h-3.5 w-3.5" />{m.inventory_radar_below_target_zero()}</span>
		{/if}
	</div>
{/snippet}

{#snippet stockScopes(menuSurface = false)}
	<div class="stock-command-group stock-scope-group" class:menu-surface={menuSurface} role="group" aria-label={m.inventory_scope_label()}>
		{#each SCOPES as scope}
			<button type="button" class:active={controller.scope === scope} aria-pressed={controller.scope === scope} onclick={() => controller.setScope(scope)}>
				{controller.scopeLabel(scope)}
			</button>
		{/each}
	</div>
{/snippet}

{#snippet stockFilterSelects(menuSurface = false)}
	<div class="stock-filter-selects" class:menu-surface={menuSurface}>
		<label>
			<span class:sr-only={!menuSurface}>{m.inventory_filters_section_label()}</span>
			<select class="ui-field" value={controller.sectionFilter} onchange={(event) => setSectionFilter(event.currentTarget.value)} aria-label={m.inventory_filters_section_label()}>
				<option value="all">{m.inventory_facet_all()}</option>
				<option value="freezer">{m.inventory_section_freezer()}</option>
				<option value="pantry">{m.inventory_section_pantry()}</option>
			</select>
		</label>
		<label>
			<span class:sr-only={!menuSurface}>{m.inventory_filters_class_label()}</span>
			<select class="ui-field" value={controller.classFilter ?? ''} onchange={(event) => setClassFilter(event.currentTarget.value)} aria-label={m.inventory_filters_class_label()}>
				<option value="">{m.inventory_facet_all()}</option>
				{#each FOOD_CLASS_ROOTS as foodClass (foodClass)}
					<option value={foodClass}>{foodClassText(foodClass)}</option>
				{/each}
			</select>
		</label>
		<label>
			<span class:sr-only={!menuSurface}>{m.inventory_filters_review_label()}</span>
			<select class="ui-field" value={controller.reviewOnly ? 'review' : 'all'} onchange={(event) => setReviewFilter(event.currentTarget.value)} aria-label={m.inventory_filters_review_label()}>
				<option value="all">{m.inventory_facet_all()}</option>
				<option value="review" disabled={controller.needsReviewCount === 0}>{m.inventory_filters_review_count({ count: controller.needsReviewCount })}</option>
			</select>
		</label>
		{#if controller.hasActiveFilters}
			<button type="button" class="stock-clear-filters" onclick={() => controller.clearFilters()}>{m.inventory_clear_filters_button()}</button>
		{/if}
	</div>
{/snippet}

<!-- ── Responsive Radar Band ───────────────────────────────────────────────── -->
<div class="stock-radar ui-grove-page">
	<KitchenPageHeader eyebrow={m.inventory_header_context()} title={m.inventory_heading()} variant="command">
		{#snippet actions()}
			<button type="button" class="ui-action ui-action-tertiary ui-action-on-dark" aria-label={m.inventory_activity_aria()} onclick={() => controller.openActivity()}>
				<Icon name="clock" class="h-4 w-4" />{m.inventory_activity_aria()}
			</button>
			<button type="button" class="ui-action ui-action-primary" aria-expanded={controller.showAddForm} onclick={() => (controller.showAddForm = true)}>
				<Icon name="plus" class="h-3.5 w-3.5" />{m.inventory_add_button()}
			</button>
		{/snippet}

		<div class="stock-command-toolbar" data-testid="inventory-command-header">
			{@render stockSearch()}
			<div class="stock-command-desktop">
				{@render stockQuickViews()}
				{@render stockScopes()}
				{@render stockFilterSelects()}
			</div>
			<div class="stock-command-mobile">
				<CombinedFilterMenu
					id="inventory-combined-filters"
					bind:open={stockFilterMenuOpen}
					label={m.inventory_scope_filters()}
					summary={stockFilterSummary}
					activeCount={stockFilterCount}
					panelLabel={m.inventory_filters_title()}
					doneLabel={m.inventory_filters_done()}
				>
					<section class="stock-menu-section"><h2>{m.inventory_quick_filters_label()}</h2>{@render stockQuickViews(true)}</section>
					<section class="stock-menu-section"><h2>{m.inventory_scope_label()}</h2>{@render stockScopes(true)}</section>
					{@render stockFilterSelects(true)}
				</CombinedFilterMenu>
			</div>
		</div>
	</KitchenPageHeader>

	<main class="stock-ledger ui-grove-surface ui-kitchen-content">
		{#if controller.scope === 'meals' && (controller.visibleMealItems.length > 0 || controller.relationshipReviewOnly)}
			<div class="stock-coverage" aria-label={m.inventory_recipe_coverage_label()}>
				<strong>{m.inventory_recipe_coverage_label()}</strong>
				{#if !controller.relationshipReviewOnly}
					<RecipeRelationshipStatus
						relationship="linked"
						label={m.inventory_recipe_coverage_linked({ count: controller.visibleRecipeCoverage.linked })}
					/>
					<RecipeRelationshipStatus
						relationship="planned"
						label={m.inventory_recipe_coverage_planned({ count: controller.visibleRecipeCoverage.planned })}
					/>
					<RecipeRelationshipStatus
						relationship="not_needed"
						label={m.inventory_recipe_coverage_not_needed({ count: controller.visibleRecipeCoverage.not_needed })}
					/>
				{/if}
				{#if controller.unresolvedRelationshipCount > 0 || controller.relationshipReviewOnly}
					<button
						type="button"
						class="ui-action ui-action-tertiary stock-recipe-review"
						aria-expanded={controller.relationshipReviewOnly}
						onclick={() =>
							controller.relationshipReviewOnly
								? controller.closeRelationshipReview()
								: controller.openRelationshipReview()}
					>
						<Icon name={controller.relationshipReviewOnly ? 'x' : 'chevronRight'} class="h-3.5 w-3.5" />
						{controller.relationshipReviewOnly
							? m.inventory_recipe_review_close()
							: m.inventory_recipe_coverage_unresolved({
									count: controller.unresolvedRelationshipCount
								})}
					</button>
				{/if}
			</div>
		{/if}

		{#if controller.scope === 'meals' && controller.visibleMealResultCount > 0}
			<div class="stock-columns">
				<section class="stock-group stock-attention">
					<div class="stock-group-head">
						<h2 class="ui-section-title">{m.inventory_group_use_next()}</h2>
						<span>{m.inventory_group_use_next_hint()}</span>
					</div>
					{#if controller.mealGroups.useNext.length > 0}
						<ul class="stock-list stock-card-list stock-priority">
							{#each controller.mealGroups.useNext as entry (entry.item.id)}
								{@render stockRow(entry.item, controller.attentionText(entry.attention))}
							{/each}
						</ul>
					{:else}
						<div class="stock-quiet">{m.inventory_group_caught_up()}</div>
					{/if}
				</section>

				<div class="stock-secondary-groups">
					{#if controller.mealGroups.stillPlenty.length > 0}
						<section class="stock-group">
							<div class="stock-group-head">
								<h2 class="ui-section-title">{m.inventory_group_still_plenty()}</h2>
								<span>{m.inventory_group_visible_count({ count: controller.mealGroups.stillPlenty.length })}</span>
							</div>
							<ul class="stock-list stock-card-list">
								{#each controller.mealGroups.stillPlenty as item (item.id)}
									{@render stockRow(item, null)}
								{/each}
							</ul>
						</section>
					{/if}

					{#if controller.mealGroups.cookAgain.length > 0 || controller.ghostsVisible.length > 0}
						<section class="stock-group">
							<div class="stock-group-head">
								<h2 class="ui-section-title">{m.inventory_group_cook_again()}</h2>
								<span>{m.inventory_group_visible_count({
									count: controller.mealGroups.cookAgain.length + controller.ghostsVisible.length
								})}</span>
							</div>
							<ul class="stock-list stock-card-list stock-cook-again">
								{#each controller.mealGroups.cookAgain as item (item.id)}
									{@render stockRow(item, m.inventory_group_cook_again())}
								{/each}
								<GhostRows
									ghosts={controller.ghostsVisible}
									flashToast={(message) => controller.flashToast(message)}
								/>
							</ul>
						</section>
					{/if}
				</div>
			</div>
		{:else if controller.scope !== 'meals' && controller.filtered.length > 0}
			<section class="stock-group stock-all">
				<div class="stock-group-head">
					<h2 class="ui-section-title">{controller.scopeLabel(controller.scope)}</h2>
					<span>{m.inventory_group_visible_count({ count: controller.stockRows.length })}</span>
				</div>
				<ul class="stock-list stock-card-list">
					{#each controller.stockRows as item (item.id)}
						{@render stockRow(item, null)}
					{/each}
				</ul>
			</section>
		{:else}
			<div class="stock-empty">
				{#if controller.relationshipReviewOnly}
					<EmptyState title={m.inventory_recipe_review_complete()}>
						{#snippet action()}
							<button type="button" class="ui-action ui-action-primary" onclick={() => controller.closeRelationshipReview()}>
								{m.inventory_recipe_review_close()}
							</button>
						{/snippet}
					</EmptyState>
				{:else if controller.items.length === 0}
					<EmptyState iconName="jar" title={m.inventory_empty_title()}>
						{#snippet action()}
							<button type="button" class="ui-action ui-action-primary" onclick={() => (controller.showAddForm = true)}>
								{m.inventory_empty_add_first_button()}
							</button>
						{/snippet}
					</EmptyState>
				{:else}
					<EmptyState title={m.inventory_empty_filtered_title()}>
						{#snippet action()}
							<div class="flex flex-wrap justify-center gap-2">
								{#if controller.searchQuery}
									<button type="button" class="ui-action ui-action-tertiary" onclick={() => controller.clearSearch()}>
										{m.inventory_empty_clear_search()}
									</button>
								{/if}
								{#if controller.alternateScopeMatch || controller.hasUngroupedMealStock}
									<button type="button" class="ui-action ui-action-primary" onclick={() => controller.setScope('all')}>
										{m.inventory_empty_show_all()}
									</button>
								{:else}
									<button type="button" class="ui-action ui-action-primary" onclick={() => controller.clearFilters()}>
										{m.inventory_clear_filters_button()}
									</button>
								{/if}
							</div>
						{/snippet}
					</EmptyState>
				{/if}
			</div>
		{/if}
	</main>
</div>

<BottomSheet bind:open={controller.showAddForm} title={m.inventory_add_button()} desktopCentered>
	<AddItemForm
		open={controller.showAddForm}
		onCancel={() => (controller.showAddForm = false)}
		onAdded={(item, section, name) => controller.onItemAdded(item, section, name)}
		flashToast={(message) => controller.flashToast(message)}
	/>
</BottomSheet>

<BottomSheet
	bind:open={controller.editSheetOpen}
	title={controller.editingItem?.name ?? m.inventory_heading()}
	desktopCentered
	onclose={() => (controller.editingId = null)}
>
	<ItemEditor
		editing={controller.editSheetOpen && controller.editingItem !== null}
		link={controller.editingItem ? controller.linkFor(controller.editingItem) : null}
		matches={controller.editingItem ? (controller.data.recipeMatches[controller.editingItem.id] ?? []) : []}
		history={controller.editingItem ? controller.historyByItem[controller.editingItem.id] : undefined}
		bind:draft={controller.editDraft}
		saving={controller.editSaving}
		onDelete={() => {
			if (controller.editingItem) void controller.deleteItem(controller.editingItem);
		}}
		onCancel={() => (controller.editSheetOpen = false)}
		onSave={() => {
			if (controller.editingItem) void controller.saveEdit(controller.editingItem);
		}}
		onUndoEvent={(event) => controller.undoEvent(event)}
	/>
</BottomSheet>

<!-- ── link picker (UX-STOCK-2) ─────────────────────────────────────────────────── -->
<LinkRecipeSheet
	bind:open={controller.linkPickerOpen}
	item={controller.linkPickerItem}
	link={controller.linkPickerLink}
	relationship={controller.linkPickerRelationship}
	bind:search={controller.linkSearch}
	options={controller.data.recipeOptions}
	onPick={(option) => controller.pickLinkRecipe(option)}
	onSetStatus={(status) => controller.setPickerRecipeStatus(status)}
	onClear={() => controller.clearPickerRecipeChoice()}
/>

<!-- ── activity drawer (P2.3) ──────────────────────────────────────────────────────── -->
<ActivitySheet bind:open={controller.activityOpen} loading={controller.activityLoading} events={controller.activityEvents} onUndo={(event) => controller.undoEvent(event)} />

<style>
	.stock-radar {
		--stock-olive: var(--kitchen-olive);
		--stock-olive-soft: var(--kitchen-olive-soft);
		--stock-honey: var(--kitchen-honey);
		--stock-honey-ink: var(--kitchen-honey-ink);
		--stock-terra: var(--kitchen-terra);
		--stock-paper: var(--kitchen-paper);
		--stock-card: var(--kitchen-card);
		min-height: 100%;
		background: var(--kitchen-grove);
		color: var(--color-base-content);
	}


	.stock-command-toolbar {
		display: grid;
		gap: 0.45rem;
	}

	.stock-command-search {
		min-height: 2.75rem;
		border-color: rgb(255 255 255 / 24%);
		background: rgb(255 255 255 / 9%);
		color: var(--kitchen-ribbon-ink);
	}

	.stock-command-search button,
	.stock-command-search kbd {
		display: inline-flex;
		min-width: 2rem;
		min-height: 2rem;
		align-items: center;
		justify-content: center;
		border-radius: 0.55rem;
		color: var(--kitchen-ribbon-muted);
	}

	.stock-command-search kbd {
		width: auto;
		min-width: 0;
		font-size: 0.68rem;
	}

	.stock-command-desktop {
		display: none;
	}

	.stock-command-mobile {
		min-width: 0;
	}

	.stock-command-group {
		display: grid;
		min-width: 0;
		grid-auto-flow: column;
		grid-auto-columns: minmax(0, 1fr);
		gap: 0;
	}

	.stock-command-group > button,
	.stock-command-zero {
		display: inline-flex;
		min-width: 0;
		min-height: 2.75rem;
		align-items: center;
		justify-content: center;
		gap: 0.35rem;
		border: 1px solid rgb(255 255 255 / 22%);
		border-radius: 0;
		padding: 0.35rem 0.55rem;
		background: rgb(255 255 255 / 8%);
		color: var(--kitchen-ribbon-ink);
		font-size: 0.66rem;
		font-weight: 750;
		line-height: 1.05;
		text-align: center;
		white-space: nowrap;
	}

	.stock-command-group > :first-child {
		border-radius: 0.625rem 0 0 0.625rem;
	}

	.stock-command-group > :last-child {
		border-radius: 0 0.625rem 0.625rem 0;
	}

	.stock-command-group > :not(:first-child) {
		margin-left: -1px;
	}

	.stock-command-group > button.active {
		position: relative;
		z-index: 1;
		border-color: var(--kitchen-ribbon-ink);
		background: var(--kitchen-paper);
		color: var(--stock-olive);
	}

	.stock-command-group > button:focus-visible {
		position: relative;
		z-index: 2;
		outline: 2px solid white;
		outline-offset: -3px;
	}

	.stock-quick-group strong {
		font-size: 0.84rem;
		font-variant-numeric: tabular-nums;
	}

	.stock-quick-group .attention:not(.active) {
		border-color: transparent;
		background: var(--stock-honey);
		color: #332613;
	}

	.stock-command-zero {
		color: var(--kitchen-ribbon-muted);
	}

	.stock-menu-section {
		display: grid;
		gap: 0.4rem;
	}

	.stock-menu-section h2,
	.stock-filter-selects label > span {
		font-size: 0.625rem;
		font-weight: 800;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: color-mix(in oklab, var(--color-base-content) 66%, transparent);
	}

	.stock-command-group.menu-surface > button,
	.stock-command-group.menu-surface .stock-command-zero {
		border-color: var(--kitchen-line);
		background: var(--kitchen-paper);
		color: color-mix(in oklab, var(--color-base-content) 78%, transparent);
		white-space: normal;
	}

	.stock-command-group.menu-surface > button.active {
		border-color: var(--stock-olive);
		background: var(--stock-olive);
		color: white;
	}

	.stock-command-group.menu-surface > button:focus-visible {
		outline-color: var(--stock-olive);
		outline-offset: 2px;
	}

	.stock-command-group.menu-surface .attention:not(.active) {
		border-color: color-mix(in oklab, var(--stock-honey) 64%, var(--kitchen-line));
		background: color-mix(in oklab, var(--stock-honey) 22%, var(--kitchen-card));
		color: var(--stock-honey-ink);
	}

	.stock-filter-selects {
		display: grid;
		min-width: 0;
		grid-template-columns: repeat(3, minmax(0, 1fr)) auto;
		gap: 0.35rem;
	}

	.stock-filter-selects label {
		display: grid;
		min-width: 0;
		gap: 0.25rem;
	}

	.stock-filter-selects .ui-field {
		width: 100%;
		min-width: 0;
		min-height: 2.75rem;
		border-color: rgb(255 255 255 / 24%);
		background: rgb(255 255 255 / 9%);
		color: var(--kitchen-ribbon-ink);
	}

	.stock-filter-selects .ui-field option {
		background: var(--stock-card);
		color: var(--kitchen-ink);
	}

	.stock-filter-selects.menu-surface {
		grid-template-columns: minmax(0, 1fr);
	}

	.stock-filter-selects.menu-surface .ui-field {
		border-color: var(--kitchen-line);
		background: var(--kitchen-paper);
		color: var(--color-base-content);
	}

	.stock-clear-filters {
		min-height: 2.75rem;
		border: 1px solid currentColor;
		border-radius: 0.625rem;
		padding-inline: 0.6rem;
		color: var(--kitchen-ribbon-ink);
		font-size: 0.68rem;
		font-weight: 750;
	}

	.stock-filter-selects.menu-surface .stock-clear-filters {
		color: var(--kitchen-terra);
	}

	.stock-ledger {
		padding-block: 0.9rem max(6.5rem, var(--ui-overlay-bottom));
	}

	.stock-coverage {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.45rem 0.8rem;
		margin-top: 0.55rem;
		padding: 0.6rem 0.75rem;
		border-block: 1px solid color-mix(in oklab, var(--stock-olive) 14%, var(--color-base-300));
		font-size: 0.69rem;
		color: color-mix(in oklab, var(--color-base-content) 72%, transparent);
	}

	.stock-coverage strong {
		color: var(--color-base-content);
		font-size: 0.65rem;
		letter-spacing: 0.075em;
		text-transform: uppercase;
	}

	.stock-columns {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 1rem;
		margin-top: 0.85rem;
	}

	.stock-group {
		min-width: 0;
	}

	.stock-secondary-groups {
		display: grid;
		align-content: start;
		gap: 1rem;
	}

	.stock-group-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 0.45rem;
		padding: 0 0.2rem;
	}

	.stock-group-head span {
		color: color-mix(in oklab, var(--stock-terra) 72%, var(--color-base-content));
		font-size: 0.67rem;
		font-weight: 650;
	}

	.stock-list {
		--stock-row-bg: var(--stock-card);
	}

	.stock-card-list {
		display: grid;
		gap: 0.5rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.stock-card {
		position: relative;
		border: 1px solid color-mix(in oklab, var(--stock-olive) 15%, var(--kitchen-line));
		border-radius: 0.75rem;
		background: var(--stock-card);
		box-shadow: 0 4px 12px rgb(35 58 46 / 7%);
	}

	.stock-card-attention::before {
		position: absolute;
		z-index: 1;
		inset-block: 0.55rem;
		inset-inline-start: 0.22rem;
		width: 0.2rem;
		border-radius: 99px;
		background: var(--stock-honey);
		content: '';
		pointer-events: none;
	}

	.stock-card-attention :global(.stock-item-row) {
		padding-inline-start: 1rem;
	}

	.stock-quiet {
		border-block: 1px solid color-mix(in oklab, var(--stock-olive) 13%, var(--color-base-300));
		background: color-mix(in oklab, var(--stock-card) 72%, transparent);
	}

	.stock-priority {
		--stock-row-bg: var(--stock-card);
	}

	.stock-cook-again {
		border-color: color-mix(in oklab, var(--stock-terra) 18%, var(--color-base-300));
	}

	.stock-quiet {
		padding: 1rem;
		color: color-mix(in oklab, var(--color-base-content) 68%, transparent);
		font-size: 0.78rem;
	}

	.stock-all,
	.stock-empty {
		margin-top: 0.9rem;
	}

	:global(html[data-theme='dark']) .stock-radar {
		--stock-paper: #1c221e;
		--stock-card: #252c27;
		--stock-honey-ink: #f0c569;
	}


	@media (min-width: 64rem) {
		.stock-command-toolbar {
			grid-template-columns: minmax(12rem, 0.62fr) minmax(0, 2.75fr);
			align-items: center;
		}

		.stock-command-mobile {
			display: none;
		}

		.stock-command-desktop {
			display: grid;
			min-width: 0;
			grid-template-columns: minmax(13rem, 0.95fr) minmax(13rem, 0.9fr) minmax(17rem, 1.15fr);
			align-items: stretch;
			gap: 0.4rem;
		}
	}

	@media (min-width: 64rem) {
		.stock-ledger {
			padding-block: 1.15rem max(6.5rem, var(--ui-overlay-bottom));
		}

		.stock-columns {
			grid-template-columns: minmax(0, 2fr) minmax(19rem, 0.9fr);
			gap: 1.5rem;
		}

		.stock-columns:not(:has(.stock-secondary-groups > *)) {
			width: min(100%, 50rem);
			grid-template-columns: minmax(0, 1fr);
		}

		.stock-attention .stock-list :global(.btn) {
			padding-inline: 0.45rem;
		}
	}
</style>
