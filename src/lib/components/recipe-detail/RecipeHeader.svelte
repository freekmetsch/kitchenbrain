<!-- Recipe identity and primary actions. Cooking controls live with portions. -->
<script lang="ts">
	import { base } from '$app/paths';
	import HeaderActionMenu, {
		type HeaderActionMenuItem
	} from '$lib/components/ui/HeaderActionMenu.svelte';
	import Icon from '$lib/components/ui/icons/Icon.svelte';
	import KitchenPageHeader from '$lib/components/ui/KitchenPageHeader.svelte';
	import { m } from '$lib/paraglide/messages';
	import RecipeArchiveControl from './RecipeArchiveControl.svelte';
	import type { Recipe } from './types';

	let {
		recipe,
		displayTitle,
		onAddToPlan,
		addToPlanOpen,
		onEditRaw,
		hasCookProgress,
		onResetCookProgress,
		onRemovePhoto,
		canPlan,
		onArchivedChange
	}: {
		recipe: Recipe;
		displayTitle: string;
		onAddToPlan: () => void;
		addToPlanOpen: boolean;
		onEditRaw: () => void;
		hasCookProgress: boolean;
		onResetCookProgress: () => void;
		onRemovePhoto: () => void;
		canPlan: boolean;
		onArchivedChange?: (archived: boolean) => void;
	} = $props();

	let editButton = $state<HTMLButtonElement>();
	let hasOverflow = $derived(hasCookProgress || !!recipe.imageUrl);
	let overflowItems = $derived.by(() => {
		const items: HeaderActionMenuItem[] = [];
		if (hasCookProgress) {
			items.push({
				id: 'reset-cook-progress',
				label: m.recipes_header_reset_cook_progress(),
				onselect: onResetCookProgress
			});
		}
		if (recipe.imageUrl) {
			items.push({
				id: 'remove-photo',
				label: m.recipes_header_remove_photo(),
				tone: 'danger',
				separated: hasCookProgress,
				onselect: onRemovePhoto
			});
		}
		return items;
	});
</script>

<div data-testid="recipe-detail-command-header">
<KitchenPageHeader
	eyebrow={m.recipes_header_context()}
	title={displayTitle}
	layout="contextual"
	variant="command"
>
	{#snippet leading()}
		<a href="{base}/recipes" class="ui-action ui-action-tertiary ui-action-icon ui-action-on-dark" aria-label={m.recipes_header_back_aria()}>
			<Icon name="chevronLeft" />
		</a>
	{/snippet}
	{#snippet actions()}
		<button bind:this={editButton} type="button" class="ui-action ui-action-tertiary ui-action-on-dark" onclick={onEditRaw}>
			{m.recipes_edit_heading()}
		</button>
		<RecipeArchiveControl
			slug={recipe.slug}
			title={displayTitle}
			archived={recipe.archivedAt != null}
			variant="action"
			{onArchivedChange}
		/>
		{#if hasOverflow}
			<HeaderActionMenu
				id="recipe-header-more"
				triggerLabel={m.recipes_header_more_actions_aria()}
				sheetTitle={m.recipes_header_more_actions_aria()}
				triggerText={m.recipes_header_more_actions_button()}
				wrapperClass="ui-action-segment"
				focusAfterSelect={() => editButton?.focus()}
				items={overflowItems}
			/>
		{/if}
		<button type="button" class="ui-action ui-action-primary" disabled={!canPlan} aria-haspopup="dialog" aria-expanded={addToPlanOpen} onclick={onAddToPlan}>
			<Icon name="plus" class="h-3.5 w-3.5" /> {m.recipes_header_plan_button()}
		</button>
	{/snippet}
</KitchenPageHeader>
</div>
