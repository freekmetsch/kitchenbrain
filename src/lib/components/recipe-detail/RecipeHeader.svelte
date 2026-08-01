<!-- Recipe identity, joined actions, and responsive view controls. -->
<script lang="ts">
	import { base } from '$app/paths';
	import CombinedFilterMenu from '$lib/components/ui/CombinedFilterMenu.svelte';
	import HeaderActionMenu, {
		type HeaderActionMenuItem
	} from '$lib/components/ui/HeaderActionMenu.svelte';
	import Icon from '$lib/components/ui/icons/Icon.svelte';
	import KitchenPageHeader from '$lib/components/ui/KitchenPageHeader.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import { m } from '$lib/paraglide/messages';
	import type { Recipe } from './types';

	let {
		recipe,
		displayTitle,
		view,
		viewLang,
		languageSwitchable,
		translationLoading,
		translationMessage,
		onViewChange,
		onLanguageChange,
		onAddToPlan,
		addToPlanOpen,
		onEditRaw,
		hasCookProgress,
		onResetCookProgress,
		onRemovePhoto,
		onRetryTranslation,
		canPlan
	}: {
		recipe: Recipe;
		displayTitle: string;
		view: 'cook' | 'original';
		viewLang: 'en' | 'nl';
		languageSwitchable: boolean;
		translationLoading: boolean;
		translationMessage: string;
		onViewChange: (view: 'cook' | 'original') => void;
		onLanguageChange: (language: 'en' | 'nl') => void;
		onAddToPlan: () => void;
		addToPlanOpen: boolean;
		onEditRaw: () => void;
		hasCookProgress: boolean;
		onResetCookProgress: () => void;
		onRemovePhoto: () => void;
		onRetryTranslation: (force: boolean) => void;
		canPlan: boolean;
	} = $props();

	let viewMenuOpen = $state(false);
	let editButton = $state<HTMLButtonElement>();
	let hasOverflow = $derived(hasCookProgress || !!recipe.imageUrl);
	let viewSummary = $derived(
		`${view === 'cook' ? m.benchsheet_view_cooking() : m.benchsheet_view_original()} · ${viewLang.toUpperCase()}`
	);
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

{#snippet viewControls(menuSurface = false)}
	<div class="recipe-view-controls" class:menu-surface={menuSurface}>
		<section>
			{#if menuSurface}<h2>{m.benchsheet_view_label()}</h2>{/if}
			<div class="recipe-view-group" aria-label={m.benchsheet_view_label()}>
				<button type="button" class:active={view === 'cook'} aria-pressed={view === 'cook'} onclick={() => onViewChange('cook')}>
					{m.benchsheet_view_cooking()}
				</button>
				<button type="button" class:active={view === 'original'} aria-pressed={view === 'original'} onclick={() => onViewChange('original')}>
					{m.benchsheet_view_original()}
				</button>
			</div>
		</section>
		<section>
			{#if menuSurface}<h2>{m.recipes_language_label()}</h2>{/if}
			{#if languageSwitchable}
				<div class="recipe-language-group" aria-label={m.recipes_language_label()}>
					<button type="button" class:active={viewLang === 'nl'} aria-pressed={viewLang === 'nl'} onclick={() => onLanguageChange('nl')}>NL</button>
					<button type="button" class:active={viewLang === 'en'} aria-pressed={viewLang === 'en'} onclick={() => onLanguageChange('en')}>EN</button>
				</div>
			{:else}
				<span class="recipe-language-static">EN</span>
			{/if}
		</section>
	</div>
{/snippet}

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

	<div class="recipe-header-toolbar" data-testid="recipe-detail-command-header">
		<div class="recipe-view-desktop">{@render viewControls()}</div>
		<div class="recipe-view-mobile">
			<CombinedFilterMenu
				id="recipe-view-filters"
				bind:open={viewMenuOpen}
				label={m.recipes_header_view_button()}
				summary={viewSummary}
				panelLabel={m.recipes_header_view_panel()}
				doneLabel={m.recipes_header_view_done()}
				closeAt="48rem"
			>
				{@render viewControls(true)}
			</CombinedFilterMenu>
		</div>
	</div>

	{#if viewLang === 'en' && translationLoading}
		<div class="recipe-translation-status"><Spinner size="xs" /><span>{m.recipes_header_translating()}</span></div>
	{:else if viewLang === 'en' && translationMessage}
		<div class="recipe-translation-status warning" role="status">
			<span>{translationMessage}</span>
			<button type="button" onclick={() => onRetryTranslation(false)}>{m.recipes_translation_retry_button()}</button>
		</div>
	{:else if viewLang === 'en' && recipe.translationStatus === 'error'}
		<div class="recipe-translation-status warning" role="status">
			<span>{m.recipes_translation_failed_retry()}</span>
			<button type="button" onclick={() => onRetryTranslation(true)}>{m.recipes_translation_retry_button()}</button>
		</div>
	{/if}
</KitchenPageHeader>

<style>
	.recipe-header-toolbar {
		min-width: 0;
	}

	.recipe-view-desktop {
		display: none;
	}

	.recipe-view-controls {
		display: grid;
		min-width: 0;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 0.45rem;
	}

	.recipe-view-controls section {
		display: grid;
		min-width: 0;
		gap: 0.4rem;
	}

	.recipe-view-controls h2 {
		font-size: 0.625rem;
		font-weight: 800;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: color-mix(in oklab, var(--color-base-content) 66%, transparent);
	}

	.recipe-view-group,
	.recipe-language-group {
		display: grid;
		min-width: 0;
		grid-auto-flow: column;
		grid-auto-columns: minmax(0, 1fr);
		gap: 0;
	}

	.recipe-view-group button,
	.recipe-language-group button,
	.recipe-language-static {
		display: inline-flex;
		min-width: 0;
		min-height: 2.75rem;
		align-items: center;
		justify-content: center;
		border: 1px solid rgb(255 255 255 / 22%);
		border-radius: 0;
		padding: 0.35rem 0.7rem;
		background: rgb(255 255 255 / 8%);
		color: var(--kitchen-ribbon-ink);
		font-size: 0.68rem;
		font-weight: 750;
		line-height: 1.05;
		white-space: nowrap;
	}

	.recipe-view-group > :first-child,
	.recipe-language-group > :first-child {
		border-radius: 0.625rem 0 0 0.625rem;
	}

	.recipe-view-group > :last-child,
	.recipe-language-group > :last-child {
		border-radius: 0 0.625rem 0.625rem 0;
	}

	.recipe-view-group > :not(:first-child),
	.recipe-language-group > :not(:first-child) {
		margin-left: -1px;
	}

	.recipe-view-group button.active,
	.recipe-language-group button.active {
		position: relative;
		z-index: 1;
		border-color: var(--kitchen-ribbon-ink);
		background: var(--kitchen-paper);
		color: var(--kitchen-olive);
	}

	.recipe-language-static {
		border-radius: 0.625rem;
	}

	.menu-surface {
		grid-template-columns: minmax(0, 1fr);
		gap: 0.8rem;
	}

	.menu-surface .recipe-view-group button,
	.menu-surface .recipe-language-group button,
	.menu-surface .recipe-language-static {
		border-color: var(--kitchen-line);
		background: var(--kitchen-paper);
		color: color-mix(in oklab, var(--color-base-content) 78%, transparent);
		white-space: normal;
	}

	.menu-surface .recipe-view-group button.active,
	.menu-surface .recipe-language-group button.active {
		border-color: var(--kitchen-olive);
		background: var(--kitchen-olive);
		color: white;
	}

	.recipe-translation-status {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		margin-top: 0.45rem;
		color: var(--kitchen-ribbon-muted);
		font-size: 0.68rem;
	}

	.recipe-translation-status span {
		min-width: 0;
		flex: 1;
	}

	.recipe-translation-status.warning {
		color: var(--kitchen-honey);
	}

	.recipe-translation-status button {
		min-height: 2.25rem;
		border: 1px solid rgb(255 255 255 / 24%);
		border-radius: 0.55rem;
		padding-inline: 0.6rem;
		font-weight: 750;
	}

	@media (min-width: 48rem) {
		.recipe-view-mobile {
			display: none;
		}

		.recipe-view-desktop {
			display: flex;
			justify-content: flex-end;
		}

		.recipe-view-controls {
			width: min(100%, 31rem);
			grid-template-columns: minmax(17rem, 1fr) auto;
		}
	}
</style>
