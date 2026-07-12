<!--
	Sticky page header for the recipe detail route: back link, photo thumb,
	title, "+ Plan" shortcut, and the ⋯ overflow menu (owns the menu open state,
	roving focus, and click-away). Translation + image-upload status rows ride
	along under the toolbar. All actions are page-level and arrive as callbacks.
-->
<script lang="ts">
	import { base } from '$app/paths';
	import { tick } from 'svelte';
	import Icon from '$lib/components/ui/icons/Icon.svelte';
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
		onRegenerateCookMode: () => void;
		onForceRetranslate: () => void;
		onAiEdit: () => void;
		onPickPhoto: () => void;
		onRemovePhoto: () => void;
		onRetryTranslation: (force: boolean) => void;
	} = $props();

	let menuOpen = $state(false);

	function closeMenu() {
		menuOpen = false;
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

	function openEditRaw() {
		closeMenu();
		onEditRaw();
	}

	function regenerateCookMode() {
		closeMenu();
		onRegenerateCookMode();
	}

	function toggleLanguage() {
		closeMenu();
		onToggleLanguage();
	}

	function forceRetranslate() {
		closeMenu();
		onForceRetranslate();
	}

	function openAiEdit() {
		closeMenu();
		onAiEdit();
	}

	function pickPhoto() {
		closeMenu();
		onPickPhoto();
	}

	function removePhoto() {
		closeMenu();
		onRemovePhoto();
	}

	function openSource() {
		closeMenu();
		if (recipe.sourceUrl) window.open(recipe.sourceUrl, '_blank', 'noopener,noreferrer');
	}
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
	style="padding-top: env(safe-area-inset-top)"
>
	<div class="px-3 py-2 flex items-center gap-2">
		<a
			href="{base}/recipes"
			class="btn btn-ghost btn-sm h-9 min-h-0 w-9 shrink-0 p-0"
			aria-label="Back to recipes"><Icon name="chevronLeft" /></a
		>
		<button
			type="button"
			class="shrink-0 w-10 h-10 rounded-lg overflow-hidden bg-base-200 border border-base-200 flex items-center justify-center text-base-content/40 text-sm"
			onclick={pickPhoto}
			aria-label={recipe.imageUrl ? 'Replace photo' : 'Add photo'}
		>
			{#if recipe.imageUrl}
				<img src={recipe.imageUrl} alt="" class="w-full h-full object-cover" loading="lazy" />
			{:else if imageUploading}
				<span class="loading loading-spinner loading-xs"></span>
			{:else}
				<span aria-hidden="true">📷</span>
			{/if}
		</button>
		<h1 class="text-[15px] font-semibold leading-tight flex-1 min-w-0 truncate">{displayTitle}</h1>
		<button
			class="btn btn-sm btn-primary shrink-0"
			onclick={() => {
				onAddToPlan();
			}}>+ Plan</button
		>
		<div class="relative shrink-0" data-recipe-menu>
			<button
				bind:this={menuButton}
				type="button"
				class="btn btn-sm btn-ghost border border-base-300"
				aria-haspopup="menu"
				aria-expanded={menuOpen}
				aria-label="More actions"
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
					onkeydown={handleMenuKeydown}
				>
					<li>
						<button
							type="button"
							role="menuitem"
							data-recipe-menu-item
							class="w-full text-left px-3 py-2 hover:bg-base-200"
							onclick={toggleLanguage}
							>🌐 {viewLang === 'en' ? 'View in Dutch' : 'View in English'}</button
						>
					</li>
					<li>
						<button
							type="button"
							role="menuitem"
							data-recipe-menu-item
							class="w-full text-left px-3 py-2 hover:bg-base-200"
							onclick={openEditRaw}>✏️ Edit raw recipe</button
						>
					</li>
					<li>
						<button
							type="button"
							role="menuitem"
							data-recipe-menu-item
							class="w-full text-left px-3 py-2 hover:bg-base-200"
							onclick={regenerateCookMode}>↻ Regenerate cook mode</button
						>
					</li>
					{#if viewLang === 'en' && recipe.translationStatus === 'ready'}
						<li>
							<button
								type="button"
								role="menuitem"
								data-recipe-menu-item
								class="w-full text-left px-3 py-2 hover:bg-base-200"
								onclick={forceRetranslate}>↻ Re-translate to EN</button
							>
						</li>
					{/if}
					<li>
						<button
							type="button"
							role="menuitem"
							data-recipe-menu-item
							class="w-full text-left px-3 py-2 hover:bg-base-200"
							onclick={openAiEdit}>✏️ AI edit</button
						>
					</li>
					<li>
						<button
							type="button"
							role="menuitem"
							data-recipe-menu-item
							class="w-full text-left px-3 py-2 hover:bg-base-200"
							onclick={pickPhoto}
							>{recipe.imageUrl ? '📷 Replace photo' : '📷 Add photo'}</button
						>
					</li>
					{#if recipe.imageUrl}
						<li>
							<button
								type="button"
								role="menuitem"
								data-recipe-menu-item
								class="w-full text-left px-3 py-2 hover:bg-base-200 text-error"
								onclick={removePhoto}>🗑 Remove photo</button
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
								onclick={openSource}>↗ Open source</button
							>
						</li>
					{/if}
				</ul>
			{/if}
		</div>
	</div>
	{#if viewLang === 'en' && translationLoading}
		<div class="px-3 pb-2 flex items-center gap-2 text-[11px] text-base-content/60">
			<span class="loading loading-spinner loading-xs"></span>
			<span>Translating recipe…</span>
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
			>Translation failed — viewing Dutch. Tap to retry.</button
		>
	{/if}
	{#if imageUploadError}
		<p class="px-3 pb-2 text-[11px] text-error">{imageUploadError}</p>
	{/if}
</header>
