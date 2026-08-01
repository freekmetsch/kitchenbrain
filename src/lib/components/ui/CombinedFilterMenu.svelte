<script lang="ts">
	import { tick, type Snippet } from 'svelte';

	let {
		id,
		open = $bindable(false),
		label,
		summary,
		activeCount = 0,
		panelLabel,
		doneLabel,
		children
	}: {
		id: string;
		open?: boolean;
		label: string;
		summary: string;
		activeCount?: number;
		panelLabel: string;
		doneLabel: string;
		children: Snippet;
	} = $props();

	let trigger = $state<HTMLButtonElement>();
	let panel = $state<HTMLElement>();

	function focusableElements() {
		return Array.from(
			panel?.querySelectorAll<HTMLElement>(
				'button:not([disabled]), select:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
			) ?? []
		);
	}

	async function toggle() {
		open = !open;
		if (!open) return;
		await tick();
		focusableElements()[0]?.focus();
	}

	function close(restoreFocus = false) {
		open = false;
		if (restoreFocus) trigger?.focus();
	}

	function containFocus(event: KeyboardEvent) {
		const focusable = focusableElements();
		if (focusable.length === 0) return;
		const current = document.activeElement;
		if (event.shiftKey && (current === focusable[0] || !panel?.contains(current))) {
			event.preventDefault();
			focusable.at(-1)?.focus();
		} else if (!event.shiftKey && current === focusable.at(-1)) {
			event.preventDefault();
			focusable[0]?.focus();
		}
	}
</script>

<svelte:window
	onclick={(event) => {
		if (!open) return;
		const target = event.target;
		if (!(target instanceof Element) || !target.closest(`[data-combined-filter="${id}"]`)) close();
	}}
	onkeydown={(event) => {
		if (!open) return;
		if (event.key === 'Escape') {
			event.preventDefault();
			close(true);
		} else if (event.key === 'Tab') containFocus(event);
	}}
/>

<div class="combined-filter" data-combined-filter={id}>
	<button
		bind:this={trigger}
		type="button"
		class="combined-filter-trigger"
		class:active={activeCount > 0}
		aria-expanded={open}
		aria-controls={`${id}-panel`}
		aria-haspopup="dialog"
		data-ready={trigger ? 'true' : 'false'}
		onclick={(event) => {
			event.stopPropagation();
			void toggle();
		}}
	>
		<span class="combined-filter-label">{label}</span>
		<span class="combined-filter-summary">
			{#if activeCount > 0}<strong>{activeCount}</strong>{/if}
			<span>{summary}</span>
		</span>
		<svg viewBox="0 0 16 16" aria-hidden="true" class:open>
			<path d="m4.5 6 3.5 3.5L11.5 6" />
		</svg>
	</button>

	{#if open}
		<div
			bind:this={panel}
			id={`${id}-panel`}
			class="combined-filter-panel"
			role="dialog"
			aria-label={panelLabel}
		>
			<div class="combined-filter-content">
				{@render children()}
			</div>
			<button type="button" class="combined-filter-done" onclick={() => close(true)}>
				{doneLabel}
			</button>
		</div>
	{/if}
</div>

<style>
	.combined-filter {
		position: relative;
		min-width: 0;
	}

	.combined-filter-trigger {
		display: grid;
		width: 100%;
		min-height: 2.75rem;
		grid-template-columns: auto minmax(0, 1fr) auto;
		align-items: center;
		gap: 0.55rem;
		border: 1px solid rgb(255 255 255 / 25%);
		border-radius: 0.72rem;
		padding: 0.38rem 0.65rem;
		background: rgb(255 255 255 / 10%);
		color: white;
		text-align: left;
		transition:
			border-color var(--motion-micro) var(--ease-standard),
			background var(--motion-micro) var(--ease-standard);
	}

	.combined-filter-trigger:hover,
	.combined-filter-trigger:focus-visible,
	.combined-filter-trigger.active {
		border-color: rgb(255 255 255 / 45%);
		background: rgb(255 255 255 / 16%);
	}

	.combined-filter-label {
		font-size: 0.72rem;
		font-weight: 800;
	}

	.combined-filter-summary {
		display: flex;
		min-width: 0;
		align-items: center;
		justify-content: flex-end;
		gap: 0.35rem;
		color: rgb(255 255 255 / 78%);
		font-size: 0.67rem;
		font-weight: 650;
	}

	.combined-filter-summary strong {
		display: inline-grid;
		min-width: 1.25rem;
		height: 1.25rem;
		place-items: center;
		border-radius: 999px;
		background: var(--kitchen-honey);
		color: #332613;
		font-size: 0.64rem;
		font-variant-numeric: tabular-nums;
	}

	.combined-filter-summary span {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.combined-filter-trigger svg {
		width: 1rem;
		height: 1rem;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.6;
		transition: transform var(--motion-micro) var(--ease-standard);
	}

	.combined-filter-trigger svg.open {
		transform: rotate(180deg);
	}

	.combined-filter-panel {
		position: absolute;
		z-index: 45;
		top: calc(100% + 0.4rem);
		left: 0;
		width: min(23rem, calc(100vw - 2rem));
		max-height: min(31rem, calc(100dvh - 12rem));
		overflow-y: auto;
		border: 1px solid var(--kitchen-line);
		border-radius: 0.9rem;
		padding: 0.75rem;
		background: var(--kitchen-card);
		color: var(--color-base-content);
		box-shadow: 0 18px 42px rgb(20 28 23 / 28%);
	}

	.combined-filter-content {
		display: grid;
		gap: 0.8rem;
	}

	.combined-filter-done {
		width: 100%;
		min-height: 2.75rem;
		margin-top: 0.8rem;
		border-radius: 0.68rem;
		background: var(--kitchen-terra);
		color: white;
		font-size: 0.75rem;
		font-weight: 800;
	}

	.combined-filter-done:hover,
	.combined-filter-done:focus-visible {
		background: color-mix(in oklab, var(--kitchen-terra) 86%, white);
	}
</style>
