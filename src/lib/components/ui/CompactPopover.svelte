<script lang="ts">
	import { onMount, tick, type Snippet } from 'svelte';

	let {
		ariaLabel,
		disabled = false,
		trigger,
		children
	}: {
		ariaLabel: string;
		disabled?: boolean;
		trigger: Snippet;
		children: Snippet<[() => void]>;
	} = $props();

	let triggerButton: HTMLButtonElement;
	let panel: HTMLDivElement;
	let open = $state(false);

	function positionPanel() {
		if (!open || !triggerButton || !panel) return;
		const triggerRect = triggerButton.getBoundingClientRect();
		const panelRect = panel.getBoundingClientRect();
		const edge = 8;
		const gap = 6;
		const left = Math.min(
			Math.max(edge, triggerRect.right - panelRect.width),
			Math.max(edge, window.innerWidth - panelRect.width - edge)
		);
		const fitsBelow = triggerRect.bottom + gap + panelRect.height <= window.innerHeight - edge;
		const top = fitsBelow
			? triggerRect.bottom + gap
			: Math.max(edge, triggerRect.top - gap - panelRect.height);
		panel.style.left = `${left}px`;
		panel.style.top = `${top}px`;
	}

	async function show() {
		if (disabled || open) return;
		panel.showPopover();
		await tick();
		positionPanel();
		queueMicrotask(() => {
			panel
				.querySelector<HTMLElement>(
					'[role="radio"][tabindex="0"], button:not(:disabled), [href], input, select'
				)
				?.focus();
		});
	}

	function close() {
		if (!open) return;
		panel.hidePopover();
		queueMicrotask(() => triggerButton?.focus());
	}

	function toggle() {
		if (open) close();
		else void show();
	}

	function handleToggle(event: ToggleEvent) {
		open = event.newState === 'open';
		if (open) requestAnimationFrame(positionPanel);
	}

	onMount(() => {
		const reposition = () => positionPanel();
		window.addEventListener('resize', reposition);
		window.addEventListener('scroll', reposition, true);
		const observer = new ResizeObserver(reposition);
		observer.observe(panel);
		return () => {
			window.removeEventListener('resize', reposition);
			window.removeEventListener('scroll', reposition, true);
			observer.disconnect();
		};
	});
</script>

<button
	bind:this={triggerButton}
	type="button"
	class="ui-action ui-action-tertiary compact-popover-trigger"
	{disabled}
	aria-label={ariaLabel}
	aria-expanded={open}
	onclick={toggle}
>
	{@render trigger()}
</button>

<div
	bind:this={panel}
	popover="auto"
	ontoggle={handleToggle}
	class="compact-popover-panel"
>
	{@render children(close)}
</div>

<style>
	.compact-popover-panel {
		position: fixed;
		inset: auto;
		width: max-content;
		max-width: calc(100vw - 1rem);
		margin: 0;
		border: 1px solid color-mix(in oklab, var(--kitchen-grove) 18%, var(--kitchen-line));
		border-radius: 0.75rem;
		padding: 0.375rem;
		background: var(--kitchen-card);
		color: var(--kitchen-ink);
		box-shadow: 0 14px 36px rgb(22 38 29 / 22%);
		opacity: 0;
		transform: translateY(-0.2rem) scale(0.985);
		transform-origin: top right;
		transition:
			opacity var(--motion-micro) var(--ease-standard),
			transform var(--motion-micro) var(--ease-emphasized),
			overlay var(--motion-micro) var(--ease-standard) allow-discrete,
			display var(--motion-micro) var(--ease-standard) allow-discrete;
	}

	.compact-popover-panel:popover-open {
		opacity: 1;
		transform: translateY(0) scale(1);
	}

	@starting-style {
		.compact-popover-panel:popover-open {
			opacity: 0;
			transform: translateY(-0.2rem) scale(0.985);
		}
	}
</style>
