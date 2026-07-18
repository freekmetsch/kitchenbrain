<script lang="ts">
	// Shared loading indicator, food edition: a steaming pot drawn from the
	// ACTIVE icon set (every set's `pot` ends with its two steam paths — that
	// positional contract is what gets animated here). Keeps the old
	// daisyUI-spinner API (size / class / label) so every call site — incl.
	// PendingButton — stays untouched. `variant="simmer"` is the inline
	// three-bubbles form that replaced the ad-hoc daisyUI loading-dots.
	// Reduced motion: steam/bubbles freeze at partial opacity (no keyframes).
	import { toPathDef } from '$lib/components/ui/icons/paths';
	import { iconSet } from '$lib/components/ui/icons/active.svelte';

	let {
		size = 'sm',
		variant = 'pot',
		class: klass = '',
		label = 'Loading'
	}: {
		/** Matches the old daisyUI loading sizes: xs 1rem, sm 1.25rem, md 1.5rem, lg 2.5rem. */
		size?: 'xs' | 'sm' | 'md' | 'lg';
		/** 'pot' = steaming pot; 'simmer' = three rising bubbles (dots replacement). */
		variant?: 'pot' | 'simmer';
		class?: string;
		/** Screen-reader status text. */
		label?: string;
	} = $props();

	const SIZES = { xs: 'h-4 w-4', sm: 'h-5 w-5', md: 'h-6 w-6', lg: 'h-10 w-10' } as const;

	const pot = $derived(iconSet.icons.pot);
	const bodyPaths = $derived(pot.paths.slice(0, -2).map(toPathDef));
	const steamPaths = $derived(pot.paths.slice(-2).map(toPathDef));
	const cap = $derived(pot.cap ?? 'round');
	// simmer is a wide-format inline row; height tracks `size`, width is 2× so
	// the bubbles keep their spacing.
	const SIMMER_SIZES = { xs: 'h-2 w-6', sm: 'h-2.5 w-7', md: 'h-3 w-9', lg: 'h-5 w-14' } as const;
</script>

{#if variant === 'simmer'}
	<span class="inline-flex items-center {klass}" role="status" aria-label={label}>
		<svg viewBox="0 0 40 20" class="simmer {SIMMER_SIZES[size]}" fill="currentColor" aria-hidden="true">
			<circle cx="8" cy="10" r="3.2" />
			<circle cx="20" cy="10" r="3.2" />
			<circle cx="32" cy="10" r="3.2" />
		</svg>
	</span>
{:else}
	<span class="inline-flex items-center justify-center {klass}" role="status" aria-label={label}>
		<svg
			viewBox={pot.viewBox}
			class={SIZES[size]}
			fill="none"
			stroke-width={pot.sw}
			stroke-linecap={cap}
			stroke-linejoin={cap === 'round' ? 'round' : 'miter'}
			aria-hidden="true"
		>
			{#each bodyPaths as pd}
				<path
					d={pd.d}
					fill={pd.fill ? 'currentColor' : 'none'}
					fill-rule="evenodd"
					stroke={pd.fill ? 'none' : 'currentColor'}
					stroke-width={pd.sw}
					opacity={pd.opacity}
				/>
			{/each}
			<path class="steam" d={steamPaths[0].d} stroke="currentColor" stroke-width={steamPaths[0].sw} />
			<path class="steam steam-2" d={steamPaths[1].d} stroke="currentColor" stroke-width={steamPaths[1].sw} />
		</svg>
	</span>
{/if}

<style>
	.steam {
		opacity: 0.5;
		animation: steam 1.6s ease-in-out infinite;
	}
	.steam-2 {
		animation-delay: 0.8s;
	}
	@keyframes steam {
		0% {
			opacity: 0;
			transform: translateY(2.5px);
		}
		35% {
			opacity: 0.9;
		}
		70%,
		100% {
			opacity: 0;
			transform: translateY(-1.5px);
		}
	}

	.simmer circle {
		opacity: 0.6;
		animation: simmer 1.4s ease-in-out infinite;
		transform-box: fill-box;
		transform-origin: center;
	}
	.simmer circle:nth-child(2) {
		animation-delay: 0.2s;
	}
	.simmer circle:nth-child(3) {
		animation-delay: 0.4s;
	}
	@keyframes simmer {
		0%,
		100% {
			opacity: 0.25;
			transform: translateY(1.5px) scale(0.7);
		}
		45% {
			opacity: 1;
			transform: translateY(-1.5px) scale(1);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.steam,
		.simmer circle {
			animation: none;
		}
	}
</style>
