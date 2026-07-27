<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from '$lib/components/ui/icons/Icon.svelte';

	let {
		previousHref,
		nextHref,
		previousLabel,
		nextLabel,
		ariaLabel,
		children
	}: {
		previousHref: string | null;
		nextHref: string | null;
		previousLabel: string;
		nextLabel: string;
		ariaLabel: string;
		children: Snippet;
	} = $props();
</script>

<nav class="kitchen-week-navigator" aria-label={ariaLabel}>
	{#if previousHref}
		<a href={previousHref} class="kitchen-week-button" aria-label={previousLabel}>
			<Icon name="chevronLeft" />
		</a>
	{:else}
		<button type="button" class="kitchen-week-button" aria-label={previousLabel} disabled>
			<Icon name="chevronLeft" />
		</button>
	{/if}

	<div class="kitchen-week-center">
		{@render children()}
	</div>

	{#if nextHref}
		<a href={nextHref} class="kitchen-week-button" aria-label={nextLabel}>
			<Icon name="chevronRight" />
		</a>
	{:else}
		<button type="button" class="kitchen-week-button" aria-label={nextLabel} disabled>
			<Icon name="chevronRight" />
		</button>
	{/if}
</nav>

<style>
	.kitchen-week-navigator {
		display: grid;
		grid-template-columns: 2.75rem minmax(0, 1fr) 2.75rem;
		align-items: center;
		gap: 0.45rem;
		min-width: 0;
	}

	.kitchen-week-button {
		display: inline-flex;
		width: 2.75rem;
		height: 2.75rem;
		align-items: center;
		justify-content: center;
		border: 1px solid rgb(255 255 255 / 23%);
		border-radius: 0.7rem;
		background: rgb(255 255 255 / 7%);
		color: white;
		transition:
			background var(--motion-micro) var(--ease-standard),
			border-color var(--motion-micro) var(--ease-standard);
	}

	.kitchen-week-button:hover,
	.kitchen-week-button:focus-visible {
		border-color: rgb(255 255 255 / 34%);
		background: rgb(255 255 255 / 15%);
	}

	.kitchen-week-button:disabled {
		cursor: not-allowed;
		opacity: 0.35;
	}

	.kitchen-week-center {
		min-width: 0;
		text-align: center;
	}
</style>
