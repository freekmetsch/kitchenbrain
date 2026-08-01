<script lang="ts">
	import { onMount, tick } from 'svelte';
	import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
	import Icon from '$lib/components/ui/icons/Icon.svelte';
	import type { IconName } from '$lib/components/ui/icons/paths';

	export type HeaderActionMenuItem = {
		id: string;
		label: string;
		href?: string;
		icon?: IconName;
		tone?: 'default' | 'danger';
		separated?: boolean;
		onselect?: () => void;
	};

	let {
		id,
		triggerLabel,
		sheetTitle,
		triggerText = '⋯',
		triggerClass = 'ui-action ui-action-tertiary ui-action-on-dark',
		wrapperClass = '',
		iconOnly = false,
		focusAfterSelect,
		items
	}: {
		id: string;
		triggerLabel: string;
		sheetTitle: string;
		triggerText?: string;
		triggerClass?: string;
		wrapperClass?: string;
		iconOnly?: boolean;
		focusAfterSelect?: () => void;
		items: HeaderActionMenuItem[];
	} = $props();

	let open = $state(false);
	let compact = $state(true);
	let ready = $state(false);
	let trigger = $state<HTMLButtonElement>();
	let container = $state<HTMLDivElement>();
	let desktopPanel = $state<HTMLUListElement>();
	let selectingFromSheet = $state(false);
	let pendingSheetItem = $state<HeaderActionMenuItem>();

	onMount(() => {
		const query = window.matchMedia('(max-width: 47.99rem)');
		const sync = () => {
			const next = query.matches;
			if (ready && next !== compact) open = false;
			compact = next;
			ready = true;
		};
		sync();
		query.addEventListener('change', sync);
		return () => query.removeEventListener('change', sync);
	});

	function desktopItems(): HTMLElement[] {
		return Array.from(
			desktopPanel?.querySelectorAll<HTMLElement>('[data-header-menu-item="desktop"]') ?? []
		);
	}

	async function toggle() {
		open = !open;
		if (!open || compact) return;
		await tick();
		desktopItems()[0]?.focus();
	}

	function closeDesktop(restoreFocus = false) {
		open = false;
		if (restoreFocus) trigger?.focus();
	}

	function focusAfterAction() {
		if (focusAfterSelect) focusAfterSelect();
		else trigger?.focus();
	}

	async function selectDesktopItem(item: HeaderActionMenuItem) {
		open = false;
		await tick();
		item.onselect?.();
		await tick();
		focusAfterAction();
	}

	function selectSheetItem(item: HeaderActionMenuItem) {
		selectingFromSheet = true;
		pendingSheetItem = item;
		open = false;
	}

	function handleSheetClose() {
		const item = pendingSheetItem;
		if (!item) return;
		pendingSheetItem = undefined;
		item.onselect?.();
		queueMicrotask(() => {
			focusAfterAction();
			selectingFromSheet = false;
		});
	}

	function handleTriggerKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && open) {
			event.preventDefault();
			closeDesktop(true);
		} else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault();
			if (!open) {
				void toggle().then(() => {
					if (!compact && event.key === 'ArrowUp') desktopItems().at(-1)?.focus();
				});
			} else if (!compact) {
				const menuItems = desktopItems();
				(event.key === 'ArrowDown' ? menuItems[0] : menuItems.at(-1))?.focus();
			}
		}
	}

	function handleDesktopKeydown(event: KeyboardEvent) {
		const menuItems = desktopItems();
		const index = menuItems.indexOf(document.activeElement as HTMLElement);
		if (event.key === 'Escape') {
			event.preventDefault();
			closeDesktop(true);
		} else if (event.key === 'Tab') {
			closeDesktop();
		} else if (event.key === 'ArrowDown') {
			event.preventDefault();
			menuItems[(index + 1 + menuItems.length) % menuItems.length]?.focus();
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			menuItems[(index - 1 + menuItems.length) % menuItems.length]?.focus();
		} else if (event.key === 'Home') {
			event.preventDefault();
			menuItems[0]?.focus();
		} else if (event.key === 'End') {
			event.preventDefault();
			menuItems.at(-1)?.focus();
		}
	}
</script>

<svelte:window
	onkeydown={(event) => {
		if (open && !compact && event.key === 'Escape') {
			event.preventDefault();
			closeDesktop(true);
		}
	}}
	onclick={(event) => {
		if (!open || compact) return;
		const target = event.target;
		if (!(target instanceof Element) || !target.closest(`[data-header-action-menu="${id}"]`)) {
			closeDesktop();
		}
	}}
/>

{#snippet menuItem(item: HeaderActionMenuItem, desktop: boolean)}
	<li role={desktop ? 'none' : undefined} class:separated={item.separated}>
		{#if item.href}
			<a
				href={item.href}
				role={desktop ? 'menuitem' : undefined}
				tabindex={desktop ? -1 : undefined}
				data-header-menu-item={desktop ? 'desktop' : 'sheet'}
				class:danger={item.tone === 'danger'}
				onclick={() => (open = false)}
			>
				{#if item.icon}<Icon name={item.icon} />{/if}
				<span>{item.label}</span>
			</a>
		{:else}
			<button
				type="button"
				role={desktop ? 'menuitem' : undefined}
				tabindex={desktop ? -1 : undefined}
				data-header-menu-item={desktop ? 'desktop' : 'sheet'}
				class:danger={item.tone === 'danger'}
				onclick={() =>
					compact ? selectSheetItem(item) : void selectDesktopItem(item)}
			>
				{#if item.icon}<Icon name={item.icon} />{/if}
				<span>{item.label}</span>
			</button>
		{/if}
	</li>
{/snippet}

<div
	bind:this={container}
	class="header-action-menu {wrapperClass}"
	data-header-action-menu={id}
	onfocusout={() => {
		if (!open || compact) return;
		queueMicrotask(() => {
			if (open && !container?.contains(document.activeElement)) closeDesktop();
		});
	}}
>
	<button
		bind:this={trigger}
		type="button"
		class={triggerClass}
		aria-label={triggerLabel}
		aria-haspopup={compact ? 'dialog' : 'menu'}
		aria-expanded={open}
		data-ready={ready ? 'true' : 'false'}
		onkeydown={handleTriggerKeydown}
		onclick={(event) => {
			event.stopPropagation();
			void toggle();
		}}
	>
		<span aria-hidden={iconOnly ? 'true' : undefined}>{triggerText}</span>
	</button>

	{#if open && !compact}
		<ul
			bind:this={desktopPanel}
			role="menu"
			class="header-action-popover"
			onkeydown={handleDesktopKeydown}
		>
			{#each items as item (item.id)}
				{@render menuItem(item, true)}
			{/each}
		</ul>
	{/if}

	{#if compact}
		<BottomSheet
			bind:open
			title={sheetTitle}
			initialFocus="[data-header-menu-item='sheet']"
			restoreFocus={!selectingFromSheet}
			onclose={handleSheetClose}
		>
			<ul class="header-action-sheet-list">
				{#each items as item (item.id)}
					{@render menuItem(item, false)}
				{/each}
			</ul>
		</BottomSheet>
	{/if}
</div>

<style>
	.header-action-menu {
		position: relative;
		display: flex;
		min-width: 0;
	}

	.header-action-menu > button {
		width: 100%;
	}

	.header-action-popover {
		position: absolute;
		z-index: 50;
		top: calc(100% + 0.4rem);
		right: 0;
		width: min(15rem, calc(100vw - 1rem));
		border: 1px solid var(--kitchen-line);
		border-radius: 0.75rem;
		padding: 0.3rem;
		background: var(--kitchen-card);
		color: var(--color-base-content);
		box-shadow: 0 16px 36px rgb(20 28 23 / 26%);
	}

	.header-action-popover li.separated,
	.header-action-sheet-list li.separated {
		margin-top: 0.3rem;
		border-top: 1px solid var(--kitchen-line);
		padding-top: 0.3rem;
	}

	.header-action-popover a,
	.header-action-popover button,
	.header-action-sheet-list a,
	.header-action-sheet-list button {
		display: flex;
		width: 100%;
		min-height: 2.75rem;
		align-items: center;
		gap: 0.65rem;
		border-radius: 0.55rem;
		padding: 0.55rem 0.7rem;
		color: var(--color-base-content);
		font-size: 0.78rem;
		font-weight: 700;
		line-height: 1.25;
		text-align: left;
	}

	.header-action-popover a:hover,
	.header-action-popover a:focus-visible,
	.header-action-popover button:hover,
	.header-action-popover button:focus-visible {
		background: var(--kitchen-paper);
	}

	.header-action-popover a:focus-visible,
	.header-action-popover button:focus-visible {
		outline: 2px solid var(--kitchen-olive);
		outline-offset: -2px;
	}

	.header-action-popover .danger,
	.header-action-sheet-list .danger {
		color: var(--color-error);
	}

	.header-action-sheet-list {
		overflow: hidden;
		border: 1px solid var(--kitchen-line);
		border-radius: 0.8rem;
		background: var(--kitchen-card);
	}

	.header-action-sheet-list li + li:not(.separated) {
		border-top: 1px solid var(--kitchen-line);
	}

	.header-action-sheet-list a,
	.header-action-sheet-list button {
		min-height: 3.25rem;
		border-radius: 0;
		padding-inline: 0.9rem;
		font-size: 0.85rem;
	}
</style>
