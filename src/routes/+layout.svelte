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
	<div class="fixed top-0 left-0 right-0 h-0.5 bg-primary z-[100] animate-pulse"></div>
{/if}

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
