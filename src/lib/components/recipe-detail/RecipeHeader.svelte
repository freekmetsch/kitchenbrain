<!-- Sticky recipe task header. Primary actions stay visible; the overflow only
     exists when a cooking session or stored photo makes a secondary action relevant. -->
<script lang="ts">
	import { base } from '$app/paths';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import { tick } from 'svelte';
	import { fly } from 'svelte/transition';
	import Icon from '$lib/components/ui/icons/Icon.svelte';
	import { MOTION_MICRO_MS } from '$lib/motion';
	import { m } from '$lib/paraglide/messages';
	import type { Recipe } from './types';

	let {
		recipe,
		displayTitle,
		viewLang,
		translationLoading,
		translationMessage,
		onAddToPlan,
		onEditRaw,
		hasCookProgress,
		onResetCookProgress,
		onRemovePhoto,
		onRetryTranslation,
		stickyHeight = $bindable(52)
	}: {
		recipe: Recipe;
		displayTitle: string;
		viewLang: 'en' | 'nl';
		translationLoading: boolean;
		translationMessage: string;
		onAddToPlan: () => void;
		onEditRaw: () => void;
		hasCookProgress: boolean;
		onResetCookProgress: () => void;
		onRemovePhoto: () => void;
		onRetryTranslation: (force: boolean) => void;
		stickyHeight?: number;
	} = $props();

	let headerElement: HTMLElement | null = $state(null);
	let menuOpen = $state(false);
	let menuButton: HTMLButtonElement | null = $state(null);
	let editButton: HTMLButtonElement | null = $state(null);
	let hasOverflow = $derived(hasCookProgress || !!recipe.imageUrl);

	function menuAction(fn: () => void) {
		return () => {
			menuOpen = false;
			editButton?.focus();
			fn();
		};
	}

	async function toggleMenu() {
		menuOpen = !menuOpen;
		if (menuOpen) {
			await tick();
			document.querySelector<HTMLElement>('[data-recipe-menu-item]')?.focus();
		}
	}

	function handleMenuKeydown(e: KeyboardEvent) {
		const items = Array.from(document.querySelectorAll<HTMLElement>('[data-recipe-menu-item]'));
		const idx = items.indexOf(document.activeElement as HTMLElement);
		if (e.key === 'Escape') {
			e.preventDefault();
			menuOpen = false;
			menuButton?.focus();
		} else if (e.key === 'ArrowDown') {
			e.preventDefault();
			items[(idx + 1 + items.length) % items.length]?.focus();
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			items[(idx - 1 + items.length) % items.length]?.focus();
		} else if (e.key === 'Home') {
			e.preventDefault();
			items[0]?.focus();
		} else if (e.key === 'End') {
			e.preventDefault();
			items[items.length - 1]?.focus();
		}
	}

	function handleMenuButtonKeydown(e: KeyboardEvent) {
		if (e.key !== 'ArrowDown' && e.key !== 'Enter' && e.key !== ' ') return;
		e.preventDefault();
		if (!menuOpen) void toggleMenu();
	}

	$effect(() => {
		if (!headerElement) return;
		const updateHeight = () => {
			const next = Math.ceil(headerElement?.getBoundingClientRect().height ?? 52);
			if (next > 0 && next !== stickyHeight) stickyHeight = next;
		};
		updateHeight();
		const observer = new ResizeObserver(updateHeight);
		observer.observe(headerElement);
		return () => observer.disconnect();
	});
</script>

<svelte:window
	onclick={(e) => {
		if (!menuOpen) return;
		const target = e.target as HTMLElement;
		if (!target.closest('[data-recipe-menu]')) menuOpen = false;
	}}
/>

<header bind:this={headerElement} class="sticky top-0 z-30 border-b border-base-200 bg-base-100/95 backdrop-blur">
	<div class="flex items-center gap-1.5 px-3 py-2">
		<a
			href="{base}/recipes"
			class="btn btn-ghost btn-sm h-9 min-h-0 w-9 shrink-0 p-0"
			aria-label={m.recipes_header_back_aria()}><Icon name="chevronLeft" /></a
		>
		<h1 class="min-w-0 flex-1 truncate text-[15px] font-semibold leading-tight">{displayTitle}</h1>
		<button
			type="button"
			class="btn btn-sm btn-primary shrink-0 gap-1"
			onclick={onAddToPlan}><Icon name="plus" class="h-3.5 w-3.5" /> {m.recipes_header_plan_button()}</button
		>
		<button bind:this={editButton} type="button" class="btn btn-sm btn-ghost shrink-0" onclick={onEditRaw}>
			{m.recipes_edit_heading()}
		</button>
		{#if hasOverflow}
			<div class="relative shrink-0" data-recipe-menu>
				<button
					bind:this={menuButton}
					type="button"
					class="btn btn-sm btn-ghost border border-base-300"
					aria-haspopup="menu"
					aria-expanded={menuOpen}
					aria-label={m.recipes_header_more_actions_aria()}
					onkeydown={handleMenuButtonKeydown}
					onclick={(e) => {
						e.stopPropagation();
						void toggleMenu();
					}}>⋯</button
				>
				{#if menuOpen}
					<ul
						role="menu"
						class="absolute right-0 z-40 mt-1 w-56 rounded-xl border border-base-200 bg-base-100 py-1 text-sm shadow-xl"
						transition:fly={{ y: -4, duration: MOTION_MICRO_MS }}
						onkeydown={handleMenuKeydown}
					>
						{#if hasCookProgress}
							<li>
								<button
									type="button"
									role="menuitem"
									data-recipe-menu-item
									class="min-h-11 w-full px-3 py-2 text-left hover:bg-base-200"
									onclick={menuAction(onResetCookProgress)}>{m.recipes_header_reset_cook_progress()}</button
								>
							</li>
						{/if}
						{#if recipe.imageUrl}
							<li class={hasCookProgress ? 'mt-1 border-t border-base-200 pt-1' : ''}>
								<button
									type="button"
									role="menuitem"
									data-recipe-menu-item
									class="min-h-11 w-full px-3 py-2 text-left text-error hover:bg-base-200"
									onclick={menuAction(onRemovePhoto)}>{m.recipes_header_remove_photo()}</button
								>
							</li>
						{/if}
					</ul>
				{/if}
			</div>
		{/if}
	</div>
	{#if viewLang === 'en' && translationLoading}
		<div class="flex items-center gap-2 px-3 pb-2 text-[11px] text-base-content/60">
			<Spinner size="xs" />
			<span>{m.recipes_header_translating()}</span>
		</div>
	{:else if viewLang === 'en' && translationMessage}
		<div class="flex items-center gap-2 px-3 pb-2 text-[11px] text-warning" role="status">
			<span class="min-w-0 flex-1">{translationMessage}</span>
			<button type="button" class="btn btn-ghost btn-xs shrink-0" onclick={() => onRetryTranslation(false)}>
				{m.recipes_translation_retry_button()}
			</button>
		</div>
	{:else if viewLang === 'en' && recipe.translationStatus === 'error'}
		<div class="flex items-center gap-2 px-3 pb-2 text-[11px] text-warning" role="status">
			<span class="min-w-0 flex-1">{m.recipes_translation_failed_retry()}</span>
			<button type="button" class="btn btn-ghost btn-xs shrink-0" onclick={() => onRetryTranslation(true)}>
				{m.recipes_translation_retry_button()}
			</button>
		</div>
	{/if}
</header>
