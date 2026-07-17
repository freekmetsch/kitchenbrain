<script lang="ts">
	import { navigating } from '$app/stores';
	import { onNavigate } from '$app/navigation';
	import { browser } from '$app/environment';
	import NavBar from '$lib/components/NavBar.svelte';
	import Toast from '$lib/components/ui/Toast.svelte';
	import '../app.css';

	let { data, children } = $props<{
		data: { user: { id: number; username: string } | null; theme: string; recipeLang: 'en' | 'nl' };
		children: import('svelte').Snippet;
	}>();

	$effect(() => {
		if (browser) {
			document.documentElement.setAttribute('data-theme', data.theme ?? 'light');
		}
	});

	onNavigate((navigation) => {
		if (!document.startViewTransition) return;
		// Respect prefers-reduced-motion — skip the slide entirely (app.css also
		// neutralizes the ::view-transition animations as a CSS-level fallback).
		if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
		return new Promise((resolve) => {
			document.startViewTransition(async () => {
				resolve();
				await navigation.complete;
			});
		});
	});
</script>

{#if $navigating}
	<!-- Route-change progress: a shimmer sweeping along a faint primary track.
	     Reduced motion: the sweep stops, leaving a steady bar. -->
	<div class="nav-progress fixed top-0 left-0 right-0 h-0.5 z-[100]"></div>
{/if}

<style>
	.nav-progress {
		background:
			linear-gradient(
					90deg,
					transparent 0%,
					var(--color-primary) 40%,
					var(--color-primary) 60%,
					transparent 100%
				)
				no-repeat,
			color-mix(in oklab, var(--color-primary) 25%, transparent);
		background-size: 40% 100%;
		animation: nav-progress-sweep 1.1s ease-in-out infinite;
	}
	@keyframes nav-progress-sweep {
		0% {
			background-position: -40% 0;
		}
		100% {
			background-position: 140% 0;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.nav-progress {
			animation: none;
			background: var(--color-primary);
		}
	}
</style>

{#if data.user}
	<div class="h-dvh flex flex-col overflow-hidden">
		<main class="flex-1 min-h-0 overflow-y-auto">
			{@render children()}
		</main>

		<NavBar />
		<Toast />
	</div>
{:else}
	{@render children()}
{/if}
