<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		eyebrow,
		title,
		layout = 'standard',
		variant = 'standard',
		leading,
		action,
		actions,
		children
	}: {
		eyebrow: string;
		title: string;
		layout?: 'standard' | 'contextual';
		variant?: 'standard' | 'command';
		leading?: Snippet;
		action?: Snippet;
		actions?: Snippet;
		children?: Snippet;
	} = $props();
</script>

<header
	class="kitchen-page-header"
	data-house-style="green-ribbon"
	data-layout={layout}
	data-variant={variant}
>
	<div class="kitchen-page-header-inner">
		<div class="kitchen-page-header-identity">
			<div class="kitchen-page-header-title">
				{#if leading}
					<div class="kitchen-page-header-leading">
						{@render leading()}
					</div>
				{/if}
				<div class="kitchen-page-header-copy min-w-0">
					<p>{eyebrow}</p>
					<h1>{title}</h1>
				</div>
			</div>
			{#if actions}
				<div class="kitchen-page-header-actions">
					{@render actions()}
				</div>
			{:else if action}
				<div class="kitchen-page-header-action">
					{@render action()}
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
		color: var(--kitchen-ribbon-ink);
		background: var(--kitchen-ribbon);
	}

	.kitchen-page-header-inner {
		max-width: var(--kitchen-focus-width);
		margin-inline: auto;
		padding-inline: 1rem;
	}

	.kitchen-page-header-identity {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		min-height: 4rem;
	}

	.kitchen-page-header-title {
		display: flex;
		min-width: 0;
		flex: 1 1 10rem;
		align-items: center;
		gap: 0.625rem;
	}

	.kitchen-page-header-copy {
		min-width: 0;
		flex: 1 1 10rem;
	}

	.kitchen-page-header-leading {
		display: flex;
		flex: 0 0 auto;
		align-items: center;
	}

	.kitchen-page-header-identity p {
		color: var(--kitchen-ribbon-muted);
		font-size: 0.625rem;
		font-weight: 800;
		line-height: 1.2;
		letter-spacing: 0.11em;
		text-transform: uppercase;
	}

	.kitchen-page-header-identity h1 {
		margin-top: 0.075rem;
		font-size: clamp(1.125rem, 4.8vw, 1.35rem);
		font-weight: 760;
		line-height: 1.05;
		letter-spacing: -0.02em;
		text-wrap: balance;
	}

	.kitchen-page-header[data-layout='contextual'] h1 {
		text-wrap: wrap;
	}

	@media (max-width: 47.99rem) {
		.kitchen-page-header[data-layout='contextual'] h1 {
			display: -webkit-box;
			overflow: hidden;
			-webkit-box-orient: vertical;
			-webkit-line-clamp: 2;
			line-clamp: 2;
		}
	}

	.kitchen-page-header-action {
		display: flex;
		flex: 0 0 auto;
		align-items: center;
		justify-content: flex-end;
		gap: 0.35rem;
		margin-left: auto;
	}

	.kitchen-page-header-action :global(.ui-action) {
		max-width: min(11rem, 42vw);
		border-color: rgb(255 255 255 / 18%);
		box-shadow: 0 1px 0 rgb(0 0 0 / 9%);
	}

	.kitchen-page-header-action :global(.ui-action-primary:disabled) {
		border-color: rgb(255 255 255 / 12%);
		background: rgb(255 255 255 / 8%);
		color: var(--kitchen-ribbon-muted);
		opacity: 1;
		box-shadow: none;
	}

	.kitchen-page-header-leading :global(.ui-action) {
		color: var(--kitchen-ribbon-ink);
	}

	.kitchen-page-header-leading :global(.ui-action:hover),
	.kitchen-page-header-leading :global(.ui-action:focus-visible) {
		background: rgb(255 255 255 / 11%);
	}

	.kitchen-page-header[data-variant='command'] {
		position: relative;
		z-index: 25;
		overflow: visible;
	}

	.kitchen-page-header[data-variant='command'] .kitchen-page-header-inner {
		padding-block: 0.5rem 0.65rem;
	}

	.kitchen-page-header[data-variant='command'] .kitchen-page-header-identity {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		align-items: start;
		gap: 0.45rem;
		min-height: 0;
	}

	.kitchen-page-header[data-variant='command'] h1 {
		display: -webkit-box;
		overflow: hidden;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		text-wrap: wrap;
	}

	.kitchen-page-header-actions {
		display: grid;
		width: 100%;
		grid-auto-flow: column;
		grid-auto-columns: minmax(0, 1fr);
		gap: 0;
	}

	.kitchen-page-header-actions :global(.ui-action) {
		width: 100%;
		min-width: 0;
		border-color: rgb(255 255 255 / 20%);
		border-radius: 0;
		white-space: normal;
		line-height: 1.1;
	}

	.kitchen-page-header-actions :global(.ui-action-segment) {
		position: relative;
		display: flex;
		min-width: 0;
	}

	.kitchen-page-header-actions :global(.ui-action-segment .ui-action) {
		border-radius: 0;
	}

	.kitchen-page-header-actions :global(.ui-action + .ui-action),
	.kitchen-page-header-actions :global(* + .ui-action),
	.kitchen-page-header-actions :global(.ui-action + .ui-action-segment) {
		margin-left: -1px;
	}

	.kitchen-page-header-actions :global(.ui-action:first-child) {
		border-radius: 0.625rem 0 0 0.625rem;
	}

	.kitchen-page-header-actions :global(.ui-action:last-child) {
		border-radius: 0 0.625rem 0.625rem 0;
	}

	.kitchen-page-header-actions :global(.ui-action-primary) {
		position: relative;
		z-index: 1;
	}

	.kitchen-page-header-payload {
		margin-top: 0.5rem;
	}

	@media (max-width: 23rem) {
		.kitchen-page-header:not([data-variant='command']) .kitchen-page-header-identity {
			flex-wrap: wrap;
			padding-block: 0.5rem;
		}

		.kitchen-page-header:not([data-variant='command'])[data-layout='contextual']
			.kitchen-page-header-identity {
			flex-wrap: nowrap;
			padding-block: 0;
		}

		.kitchen-page-header:not([data-variant='command'])[data-layout='contextual']
			.kitchen-page-header-action
			:global(.ui-action) {
			width: 2.75rem;
			padding-inline: 0;
		}

		.kitchen-page-header:not([data-variant='command'])[data-layout='contextual']
			.kitchen-page-header-action
			:global(.kitchen-page-header-action-label) {
			position: absolute;
			width: 1px;
			height: 1px;
			padding: 0;
			margin: -1px;
			overflow: hidden;
			clip: rect(0, 0, 0, 0);
			clip-path: inset(50%);
			white-space: nowrap;
			border: 0;
		}
	}

	@media (min-width: 48rem) {
		.kitchen-page-header-inner {
			padding-inline: 1.5rem;
		}

		.kitchen-page-header:not([data-variant='command']) .kitchen-page-header-identity {
			min-height: 4.5rem;
		}

		.kitchen-page-header[data-variant='command'] .kitchen-page-header-identity {
			grid-template-columns: minmax(0, 1fr) auto;
			align-items: center;
			gap: 1rem;
		}

		.kitchen-page-header-actions {
			width: auto;
			grid-auto-columns: minmax(5.25rem, auto);
		}
	}
</style>
