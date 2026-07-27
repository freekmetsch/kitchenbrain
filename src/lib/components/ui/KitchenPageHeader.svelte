<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		eyebrow,
		title,
		actions,
		children
	}: {
		eyebrow: string;
		title: string;
		actions?: Snippet;
		children?: Snippet;
	} = $props();
</script>

<header class="kitchen-page-header">
	<div class="kitchen-page-header-inner">
		<div class="kitchen-page-header-identity">
			<div class="min-w-0">
				<p>{eyebrow}</p>
				<h1>{title}</h1>
			</div>
			{#if actions}
				<div class="kitchen-page-header-actions">
					{@render actions()}
				</div>
			{/if}
		</div>

		{#if children}
			<div class="kitchen-page-header-payload">
				{@render children()}
			</div>
		{/if}
	</div>
</header>

<style>
	.kitchen-page-header {
		position: relative;
		overflow: hidden;
		color: white;
		background:
			radial-gradient(circle at 86% 0, rgb(255 255 255 / 10%), transparent 13rem),
			linear-gradient(135deg, var(--kitchen-olive-deep), var(--kitchen-olive-soft));
	}

	.kitchen-page-header::after {
		position: absolute;
		right: -4rem;
		bottom: -6rem;
		width: 12rem;
		height: 12rem;
		border: 1px solid rgb(255 255 255 / 8%);
		border-radius: 999px;
		content: '';
		pointer-events: none;
	}

	.kitchen-page-header-inner {
		position: relative;
		z-index: 1;
		max-width: 74rem;
		margin-inline: auto;
		padding: 0.65rem 1rem 0.8rem;
	}

	.kitchen-page-header-identity {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		min-height: 2.75rem;
	}

	.kitchen-page-header-identity p {
		color: #f2ca74;
		font-size: 0.62rem;
		font-weight: 800;
		line-height: 1.2;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	.kitchen-page-header-identity h1 {
		margin-top: 0.08rem;
		font-family: var(--kitchen-display);
		font-size: 1.2rem;
		font-weight: 600;
		line-height: 1;
		letter-spacing: -0.025em;
	}

	.kitchen-page-header-actions {
		display: flex;
		flex: 0 0 auto;
		align-items: center;
		gap: 0.4rem;
	}

	.kitchen-page-header-payload {
		margin-top: 0.65rem;
	}

	@media (min-width: 48rem) {
		.kitchen-page-header-inner {
			padding: 0.8rem 1.5rem 1rem;
		}

		.kitchen-page-header-identity h1 {
			font-size: 1.3rem;
		}
	}
</style>
