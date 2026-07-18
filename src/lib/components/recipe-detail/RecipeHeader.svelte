<!--
	Sticky page header for the recipe detail route: back link, photo thumb,
	title, "+ Plan" shortcut, and the ⋯ overflow menu (owns the menu open state,
	roving focus, and click-away). Translation + image-upload status rows ride
	along under the toolbar. All actions are page-level and arrive as callbacks.
-->
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
		imageUploading,
		imageUploadError,
		onAddToPlan,
		onToggleLanguage,
		onEditRaw,
		hasCookProgress,
		onResetCookProgress,
		onRegenerateCookMode,
		onForceRetranslate,
		onAiEdit,
		onPickPhoto,
		onRemovePhoto,
		onRetryTranslation
	}: {
		recipe: Recipe;
		displayTitle: string;
		viewLang: 'en' | 'nl';
		translationLoading: boolean;
		translationMessage: string;
		imageUploading: boolean;
		imageUploadError: string;
		onAddToPlan: () => void;
		onToggleLanguage: () => void;
		onEditRaw: () => void;
		hasCookProgress: boolean;
		onResetCookProgress: () => void;
		onRegenerateCookMode: () => void;
		onForceRetranslate: () => void;
		onAiEdit: () => void;
		onPickPhoto: () => void;
		onRemovePhoto: () => void;
		onRetryTranslation: (force: boolean) => void;
	} = $props();

	let menuOpen = $state(false);

	// Every menu item closes the menu, then delegates to its page-level callback.
	function menuAction(fn: () => void) {
		return () => {
			menuOpen = false;
			fn();
		};
	}

	let menuButton: HTMLButtonElement | null = $state(null);
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

	const pickPhoto = menuAction(() => onPickPhoto());

	const openSource = menuAction(() => {
		if (recipe.sourceUrl) window.open(recipe.sourceUrl, '_blank', 'noopener,noreferrer');
	});
</script>

<svelte:window
	onclick={(e) => {
		if (!menuOpen) return;
		const target = e.target as HTMLElement;
		if (!target.closest('[data-recipe-menu]')) menuOpen = false;
	}}
/>

<header
	class="sticky top-0 z-30 bg-base-100/95 backdrop-blur border-b border-base-200"
>
	<div class="px-3 py-2 flex items-center gap-2">
		<a
			href="{base}/recipes"
			class="btn btn-ghost btn-sm h-9 min-h-0 w-9 shrink-0 p-0"
			aria-label={m.recipes_header_back_aria()}><Icon name="chevronLeft" /></a
		>
		<button
			type="button"
			class="shrink-0 w-10 h-10 rounded-lg overflow-hidden bg-base-200 border border-base-200 flex items-center justify-center text-base-content/40 text-sm"
			onclick={pickPhoto}
			aria-label={recipe.imageUrl ? m.recipes_header_replace_photo() : m.recipes_header_add_photo()}
		>
			{#if recipe.imageUrl}
				<img src={recipe.imageUrl} alt="" class="w-full h-full object-cover" loading="lazy" />
			{:else if imageUploading}
				<Spinner size="xs" />
			{:else}
				<span aria-hidden="true">📷</span>
			{/if}
		</button>
		<h1 class="text-[15px] font-semibold leading-tight flex-1 min-w-0 truncate">{displayTitle}</h1>
		<button
			class="btn btn-sm btn-primary shrink-0 gap-1"
			onclick={() => {
				onAddToPlan();
			}}><Icon name="plus" class="h-3.5 w-3.5" /> {m.recipes_header_plan_button()}</button
		>
		<button
			type="button"
			class="btn btn-sm btn-ghost h-9 min-h-9 shrink-0 border border-base-300 px-2"
			onclick={onEditRaw}
			aria-label={m.recipes_edit_heading()}
		>
			<span aria-hidden="true">✎</span>
			<span class="hidden sm:inline">{m.recipes_edit_heading()}</span>
		</button>
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
					class="absolute right-0 mt-1 w-56 rounded-xl border border-base-200 bg-base-100 shadow-xl z-40 py-1 text-sm"
					transition:fly={{ y: -4, duration: MOTION_MICRO_MS }}
					onkeydown={handleMenuKeydown}
				>
					{#if hasCookProgress}
						<li>
							<button
								type="button"
								role="menuitem"
								data-recipe-menu-item
								class="w-full text-left px-3 py-2 hover:bg-base-200"
								onclick={menuAction(onResetCookProgress)}>↺ {m.recipes_header_reset_cook_progress()}</button
							>
						</li>
					{/if}
					<li>
						<button
							type="button"
							role="menuitem"
							data-recipe-menu-item
							class="w-full text-left px-3 py-2 hover:bg-base-200"
							onclick={menuAction(onToggleLanguage)}
							>🌐 {viewLang === 'en' ? m.recipes_header_view_in_dutch() : m.recipes_header_view_in_english()}</button
						>
					</li>
					<li>
						<button
							type="button"
							role="menuitem"
							data-recipe-menu-item
							class="w-full text-left px-3 py-2 hover:bg-base-200"
							onclick={menuAction(onRegenerateCookMode)}>↻ {m.recipes_header_regenerate_cook_mode()}</button
						>
					</li>
					{#if viewLang === 'en' && recipe.translationStatus === 'ready'}
						<li>
							<button
								type="button"
								role="menuitem"
								data-recipe-menu-item
								class="w-full text-left px-3 py-2 hover:bg-base-200"
								onclick={menuAction(onForceRetranslate)}>↻ {m.recipes_header_retranslate()}</button
							>
						</li>
					{/if}
					<li>
						<button
							type="button"
							role="menuitem"
							data-recipe-menu-item
							class="w-full text-left px-3 py-2 hover:bg-base-200"
							onclick={menuAction(onAiEdit)}>✦ {m.recipes_header_ask_ai()}</button
						>
					</li>
					{#if recipe.imageUrl}
						<li>
							<button
								type="button"
								role="menuitem"
								data-recipe-menu-item
								class="w-full text-left px-3 py-2 hover:bg-base-200 text-error"
								onclick={menuAction(onRemovePhoto)}>🗑 {m.recipes_header_remove_photo()}</button
							>
						</li>
					{/if}
					{#if recipe.sourceUrl}
						<li>
							<button
								type="button"
								role="menuitem"
								data-recipe-menu-item
								class="w-full text-left px-3 py-2 hover:bg-base-200"
								onclick={openSource}>↗ {m.recipes_header_open_source()}</button
							>
						</li>
					{/if}
				</ul>
			{/if}
		</div>
	</div>
	{#if viewLang === 'en' && translationLoading}
		<div class="px-3 pb-2 flex items-center gap-2 text-[11px] text-base-content/60">
			<Spinner size="xs" />
			<span>{m.recipes_header_translating()}</span>
		</div>
	{:else if viewLang === 'en' && translationMessage}
		<button
			class="w-full px-3 pb-2 text-left text-[11px] text-warning"
			onclick={() => onRetryTranslation(false)}>{translationMessage}</button
		>
	{:else if viewLang === 'en' && recipe.translationStatus === 'error'}
		<button
			class="w-full px-3 pb-2 text-left text-[11px] text-warning"
			onclick={() => onRetryTranslation(true)}
			>{m.recipes_translation_failed_retry()}</button
		>
	{/if}
	{#if imageUploadError}
		<p class="px-3 pb-2 text-[11px] text-error">{imageUploadError}</p>
	{/if}
</header>
