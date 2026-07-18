<script lang="ts">
	import { navigating, page } from '$app/stores';
	import { afterNavigate, beforeNavigate, onNavigate } from '$app/navigation';
	import { browser } from '$app/environment';
	import { onDestroy, untrack } from 'svelte';
	import { MainScrollRestoration } from '$lib/navigation/scroll_restoration';
	import { provideChatAgent } from '$lib/chat/agent_context';
	import { ChatAgentController } from '$lib/stores/chat-agent.svelte';
	import { m } from '$lib/paraglide/messages';
	import NavBar from '$lib/components/NavBar.svelte';
	import Toast from '$lib/components/ui/Toast.svelte';
	import ChatAgent from '$lib/components/chat/ChatAgent.svelte';
	import '../app.css';

	let { data, children } = $props<{
		data: { user: { id: number; username: string } | null; theme: string; recipeLang: 'en' | 'nl' };
		children: import('svelte').Snippet;
	}>();
	const chatAgent = untrack(() => (data.user ? new ChatAgentController(data.user.username) : null));
	if (chatAgent) provideChatAgent(chatAgent);
	onDestroy(() => chatAgent?.destroy());

	function fallbackScreen(routeId: string) {
		const section = routeId.startsWith('/inventory')
			? { label: m.nav_stock(), kind: 'inventory' as const }
			: routeId.startsWith('/meal-plan')
				? { label: m.nav_meals(), kind: 'meal-plan' as const }
				: routeId.startsWith('/shopping')
					? { label: m.nav_shopping(), kind: 'shopping' as const }
					: routeId.startsWith('/recipes')
						? { label: m.nav_recipes(), kind: 'recipe' as const }
						: routeId.startsWith('/settings')
							? { label: m.nav_settings(), kind: 'settings' as const }
							: { label: m.nav_home(), kind: 'other' as const };
		return {
			v: 1 as const,
			routeId,
			label: section.label,
			entity: { kind: section.kind }
		};
	}

	$effect(() => {
		if (!chatAgent || !$page.route.id) return;
		return chatAgent.publishScreen(fallbackScreen($page.route.id));
	});

	let mainEl = $state<HTMLElement>();
	let scrollFrame: number | null = null;
	const mainScroll = new MainScrollRestoration();

	beforeNavigate(() => {
		if (mainEl) mainScroll.capture(mainEl.scrollTop);
	});

	afterNavigate((navigation) => {
		const scroller = mainEl;
		if (!scroller) return;
		const top = mainScroll.destination(navigation.type, navigation.delta);
		if (top === null) return;
		if (scrollFrame !== null) cancelAnimationFrame(scrollFrame);
		scrollFrame = requestAnimationFrame(() => {
			scroller.scrollTop = top;
			scrollFrame = null;
		});
	});

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
	<div class="app-shell h-dvh flex flex-col overflow-hidden">
		<main bind:this={mainEl} class="app-main flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
			{@render children()}
		</main>

		<NavBar />
		<Toast />
		{#if chatAgent}<ChatAgent controller={chatAgent} />{/if}
	</div>
{:else}
	{@render children()}
{/if}
