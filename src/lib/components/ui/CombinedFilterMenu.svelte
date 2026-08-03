<script lang="ts">
	import type { Snippet } from 'svelte';
	import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
	import { onMediaQuery } from '$lib/components/ui/media-query';

	let {
		id,
		open = $bindable(false),
		label,
		summary,
		activeCount = 0,
		panelLabel,
		doneLabel,
		closeAt = '64rem',
		tone = 'ribbon',
		children
	}: {
		id: string;
		open?: boolean;
		label: string;
		summary: string;
		activeCount?: number;
		panelLabel: string;
		doneLabel: string;
		closeAt?: '48rem' | '64rem';
		tone?: 'ribbon' | 'paper';
		children: Snippet;
	} = $props();

	let trigger = $state<HTMLButtonElement>();

	onMediaQuery(() => `(min-width: ${closeAt})`, (matches) => {
		if (matches) open = false;
	});
</script>

<div class="combined-filter" data-combined-filter={id} data-tone={tone}>
	<button
		bind:this={trigger}
		type="button"
		class="combined-filter-trigger"
		class:active={activeCount > 0}
		class:paper={tone === 'paper'}
		aria-expanded={open}
		aria-controls={`${id}-sheet`}
		aria-haspopup="dialog"
		data-ready={trigger ? 'true' : 'false'}
		onclick={() => (open = true)}
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
</div>

<BottomSheet id={`${id}-sheet`} bind:open title={panelLabel} initialFocus="button[aria-pressed]">
	<div class="combined-filter-content">
		{@render children()}
	</div>
	<button type="button" class="combined-filter-done" onclick={() => (open = false)}>
		{doneLabel}
	</button>
</BottomSheet>

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
	.combined-filter-trigger.active,
	.combined-filter-trigger[aria-expanded='true'] {
		border-color: rgb(255 255 255 / 45%);
		background: rgb(255 255 255 / 16%);
	}

	.combined-filter-trigger.paper {
		border-color: var(--kitchen-line);
		background: var(--kitchen-card);
		color: var(--color-base-content);
	}

	.combined-filter-trigger.paper:hover,
	.combined-filter-trigger.paper:focus-visible,
	.combined-filter-trigger.paper.active,
	.combined-filter-trigger.paper[aria-expanded='true'] {
		border-color: color-mix(in oklab, var(--kitchen-olive) 48%, var(--kitchen-line));
		background: color-mix(in oklab, var(--kitchen-olive-soft) 58%, var(--kitchen-card));
	}

	.combined-filter-trigger.paper .combined-filter-summary {
		color: color-mix(in oklab, var(--color-base-content) 70%, transparent);
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

	.combined-filter-content {
		display: grid;
		gap: 0.8rem;
	}

	.combined-filter-done {
		width: 100%;
		min-height: 2.75rem;
		margin-top: 1rem;
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
