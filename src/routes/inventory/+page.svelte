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
	import KitchenPageHeader from '$lib/components/ui/KitchenPageHeader.svelte';
	import SegmentedControl from '$lib/components/ui/SegmentedControl.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const controller = new InventoryController(() => data);
	const SCOPES: InventoryScope[] = ['meals', 'ingredients', 'all'];

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

<!-- ── Responsive Radar Band ───────────────────────────────────────────────── -->
<div class="stock-radar ui-grove-page">
	<KitchenPageHeader eyebrow={m.inventory_header_context()} title={m.inventory_heading()}>
		{#snippet action()}
			<button
				type="button"
				class="ui-action ui-action-primary"
				aria-expanded={controller.showAddForm}
				onclick={() => (controller.showAddForm = true)}
			>
				<Icon name="plus" class="h-3.5 w-3.5" />
				{m.inventory_add_button()}
			</button>
		{/snippet}
	</KitchenPageHeader>

	<div class="ui-page-utility">
		<div class="stock-console ui-page-utility-inner">
			<div class="stock-overview">
				<div class="stock-stats" aria-label={m.inventory_heading()}>
					{#if controller.readyMealCount > 0}
						<button
							type="button"
							class="stock-stat stock-stat-action"
							class:active={controller.quickView === 'ready'}
							aria-pressed={controller.quickView === 'ready'}
							aria-label={m.inventory_radar_ready_aria({ count: controller.readyMealCount })}
							onclick={() => controller.toggleQuickView('ready')}
						>
							<strong>{controller.readyMealCount}</strong>
							<span>{m.inventory_radar_meals_label()}</span>
						</button>
					{:else}
						<div class="stock-stat stock-stat-zero">
							<strong>0</strong>
							<span>{m.inventory_radar_ready_zero()}</span>
						</div>
					{/if}
					{#if controller.belowTargetCount > 0}
						<button
							type="button"
							class="stock-stat stock-stat-action attention"
							class:active={controller.quickView === 'below_target'}
							aria-pressed={controller.quickView === 'below_target'}
							aria-label={m.inventory_radar_below_target_aria({ count: controller.belowTargetCount })}
							onclick={() => controller.toggleQuickView('below_target')}
						>
							<strong>{controller.belowTargetCount}</strong>
							<span>{m.inventory_radar_below_target_label()}</span>
						</button>
					{:else}
						<div class="stock-stat stock-stat-zero">
							<strong>0</strong>
							<span>{m.inventory_radar_below_target_zero()}</span>
						</div>
					{/if}
				</div>
				<button
					type="button"
					class="stock-activity ui-action ui-action-tertiary ui-action-on-dark ui-action-icon"
					aria-label={m.inventory_activity_aria()}
					onclick={() => controller.openActivity()}
				>
					<Icon name="clock" class="h-4 w-4" />
				</button>
			</div>

			<div class="stock-tools">
				<label class="ui-field-shell">
					<span class="sr-only">{m.inventory_search_label()}</span>
					<svg
						viewBox="0 0 16 16"
						class="pointer-events-none h-4 w-4 opacity-55"
						fill="none"
						stroke="currentColor"
						stroke-width="1.5"
						aria-hidden="true"
					>
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
						<button
							type="button"
							aria-label={m.inventory_search_clear()}
							onclick={() => controller.clearSearch()}
						>
							<Icon name="x" class="h-3.5 w-3.5" />
						</button>
					{:else}
						<kbd>/</kbd>
					{/if}
				</label>

				<div class="stock-controls">
					<div class="stock-scope-tabs">
						<SegmentedControl
							options={SCOPES.map((value) => ({ value, label: controller.scopeLabel(value) }))}
							bind:value={controller.scope}
							onchange={(value) => controller.setScope(value)}
							cols={3}
							ariaLabel={m.inventory_heading()}
						/>
					</div>
					<div class="stock-filter-grid">
						<label>
							<span>{m.inventory_filters_section_label()}</span>
							<select
								class="ui-field"
								value={controller.sectionFilter}
								onchange={(event) => setSectionFilter(event.currentTarget.value)}
							>
								<option value="all">{m.inventory_facet_all()}</option>
								<option value="freezer">{m.inventory_section_freezer()}</option>
								<option value="pantry">{m.inventory_section_pantry()}</option>
							</select>
						</label>
						<label>
							<span>{m.inventory_filters_class_label()}</span>
							<select
								class="ui-field"
								value={controller.classFilter ?? ''}
								onchange={(event) => setClassFilter(event.currentTarget.value)}
							>
								<option value="">{m.inventory_facet_all()}</option>
								{#each FOOD_CLASS_ROOTS as foodClass (foodClass)}
									<option value={foodClass}>{foodClassText(foodClass)}</option>
								{/each}
							</select>
						</label>
						<label>
							<span>{m.inventory_filters_review_label()}</span>
							<select
								class="ui-field"
								value={controller.reviewOnly ? 'review' : 'all'}
								onchange={(event) => setReviewFilter(event.currentTarget.value)}
							>
								<option value="all">{m.inventory_facet_all()}</option>
								<option value="review" disabled={controller.needsReviewCount === 0}>
									{m.inventory_filters_review_count({ count: controller.needsReviewCount })}
								</option>
							</select>
						</label>
						{#if controller.hasActiveFilters}
							<button
								type="button"
								class="ui-action ui-action-tertiary ui-action-on-dark stock-clear-filters"
								onclick={() => controller.clearFilters()}
							>
								{m.inventory_clear_filters_button()}
							</button>
						{/if}
					</div>
				</div>
			</div>
		</div>
	</div>

	<main class="stock-ledger ui-grove-surface ui-kitchen-content">
		{#if controller.quickView}
			<div class="stock-quick-view" aria-live="polite">
				<span>{controller.quickViewStatus()}</span>
				<button type="button" class="ui-action ui-action-tertiary" onclick={() => (controller.quickView = null)}>
					{m.inventory_quick_view_clear()}
					<Icon name="x" class="h-3.5 w-3.5" />
				</button>
			</div>
		{/if}

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

	.stock-stats {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.5rem;
	}

	.stock-overview {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 2.75rem;
		align-items: center;
		gap: 0.5rem;
	}

	.stock-stat {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		align-items: center;
		gap: 0.45rem;
		min-height: 2.75rem;
		padding: 0.4rem 0.65rem;
		border: 1px solid color-mix(in oklab, var(--stock-olive) 12%, var(--kitchen-line));
		border-radius: 0.625rem;
		background: color-mix(in oklab, var(--stock-olive) 5%, var(--stock-card));
		color: var(--kitchen-ink);
	}

	.stock-stat-action {
		grid-template-columns: auto minmax(0, 1fr);
		width: 100%;
		text-align: left;
		cursor: pointer;
		transition:
			transform 140ms ease,
			border-color 140ms ease,
			background 140ms ease;
	}

	.stock-stat-action:hover {
		border-color: color-mix(in oklab, var(--stock-olive) 35%, var(--kitchen-line));
		background: color-mix(in oklab, var(--stock-olive) 9%, var(--stock-card));
	}

	.stock-stat-action:focus-visible {
		outline: 2px solid var(--stock-olive);
		outline-offset: 2px;
	}

	.stock-stat-action.active {
		border-color: var(--stock-olive);
		background: color-mix(in oklab, var(--stock-olive) 12%, var(--stock-card));
		color: var(--stock-olive);
	}

	.stock-stat.attention {
		border-color: color-mix(in oklab, var(--stock-honey) 42%, var(--kitchen-line));
		background: color-mix(in oklab, var(--stock-honey) 16%, var(--stock-card));
		color: var(--stock-honey-ink);
	}

	.stock-stat.attention:hover {
		border-color: color-mix(in oklab, var(--stock-honey) 70%, var(--kitchen-line));
		background: color-mix(in oklab, var(--stock-honey) 22%, var(--stock-card));
	}

	.stock-stat.attention.active {
		border-color: var(--stock-honey);
		background: color-mix(in oklab, var(--stock-honey) 26%, var(--stock-card));
		color: var(--stock-honey-ink);
	}

	.stock-stat-zero {
		color: var(--kitchen-muted);
	}

	.stock-stat strong {
		font-size: 1.15rem;
		line-height: 1;
		font-variant-numeric: tabular-nums;
	}

	.stock-stat span {
		font-size: 0.675rem;
		font-weight: 650;
		line-height: 1.2;
	}

	.stock-activity {
		color: var(--stock-olive);
	}

	.stock-ledger {
		padding-block: 0.9rem max(6.5rem, var(--ui-overlay-bottom));
	}

	.stock-console {
		display: grid;
		gap: 0.65rem;
	}

	.stock-tools {
		display: grid;
		gap: 0.55rem;
	}

	.stock-tools :global(.ui-field-shell button),
	.stock-tools :global(.ui-field-shell kbd) {
		display: inline-flex;
		min-width: 2.25rem;
		min-height: 2.25rem;
		align-items: center;
		justify-content: center;
		border-radius: 0.6rem;
		color: color-mix(in oklab, var(--color-base-content) 62%, transparent);
	}

	.stock-tools :global(.ui-field-shell kbd) {
		width: auto;
		min-width: 0;
		font-size: 0.68rem;
	}

	.stock-controls {
		display: grid;
		gap: 0.45rem;
	}

	.stock-scope-tabs {
		min-width: 0;
	}

	.stock-scope-tabs :global([data-house-style='segmented-control']) {
		height: 100%;
	}

	.stock-scope-tabs :global([role='radio']) {
		min-height: 2.75rem;
	}

	.stock-filter-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		align-items: end;
		gap: 0.4rem;
	}

	.stock-filter-grid label {
		display: grid;
		min-width: 0;
		gap: 0.18rem;
	}

	.stock-filter-grid label > span {
		padding-inline: 0.1rem;
		color: color-mix(in oklab, white 76%, transparent);
		font-size: 0.65rem;
		font-weight: 700;
		letter-spacing: 0.02em;
	}

	.stock-filter-grid .ui-field {
		width: 100%;
		min-width: 0;
		min-height: 2.75rem;
		border-color: color-mix(in oklab, white 24%, transparent);
		background: color-mix(in oklab, white 9%, transparent);
		color: white;
	}

	.stock-filter-grid .ui-field option {
		background: var(--stock-card);
		color: var(--kitchen-ink);
	}

	.stock-clear-filters {
		grid-column: 1 / -1;
		justify-self: end;
	}

	.stock-quick-view {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		margin-top: 0.65rem;
		padding: 0.45rem 0.5rem 0.45rem 0.8rem;
		border: 1px solid color-mix(in oklab, var(--stock-olive) 22%, var(--color-base-300));
		border-radius: 0.8rem;
		background: color-mix(in oklab, var(--stock-olive-soft) 60%, var(--stock-card));
		color: var(--stock-olive);
		font-size: 0.76rem;
		font-weight: 700;
	}

	.stock-quick-view button {
		padding-inline: 0.7rem;
		font-size: 0.72rem;
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

	@media (min-width: 48rem) {
		.stock-stats {
			max-width: 34rem;
		}

		.stock-tools {
			grid-template-columns: minmax(14rem, 0.75fr) minmax(0, 1.65fr);
			align-items: center;
		}

		.stock-controls {
			grid-template-columns: minmax(16rem, 0.8fr) minmax(0, 1.2fr);
			align-items: end;
		}

		.stock-filter-grid {
			grid-template-columns: repeat(3, minmax(0, 1fr)) auto;
		}

		.stock-clear-filters {
			grid-column: auto;
			align-self: end;
			justify-self: stretch;
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
