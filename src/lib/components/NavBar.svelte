<!--
	Bottom tab bar — the app's primary navigation. Six destinations, rendered
	from one tab list so class strings and states stay in sync (was six
	hand-rolled <a> blocks with raw inline SVGs in +layout.svelte). Icons come
	from the shared Icon.svelte registry.

	Active state: exact match for Home ('/'), prefix match for the rest so a
	detail route (e.g. /recipes/<slug>) keeps its section tab lit — "you are
	here" survives on sub-pages (Krug trunk test). aria-current exposes it to AT.
-->
<script lang="ts">
	import { page } from '$app/state';
	import { base } from '$app/paths';
	import Icon from '$lib/components/ui/icons/Icon.svelte';
	import type { IconName } from '$lib/components/ui/icons/paths';
	import { m } from '$lib/paraglide/messages';

	// Destination icons from the shared registry: jar = pantry/freezer stock,
	// calendar = meal *planning* (the tab is about the week, not the food),
	// basket = shopping, chef hat = recipes.
	const TABS: { path: string; icon: IconName; label: string }[] = [
		{ path: '/', icon: 'home', label: m.nav_home() },
		{ path: '/inventory', icon: 'jar', label: m.nav_stock() },
		{ path: '/meal-plan', icon: 'calendar', label: m.nav_meals() },
		{ path: '/shopping', icon: 'basket', label: m.nav_shopping() },
		{ path: '/recipes', icon: 'chefHat', label: m.nav_recipes() },
		{ path: '/settings', icon: 'settings', label: m.nav_settings() }
	];

	const isActive = (path: string) => {
		const here = page.url.pathname;
		const target = base + path;
		return path === '/' ? here === target : here === target || here.startsWith(target + '/');
	};

	function tabHref(path: string): string {
		const here = page.url.pathname;
		const selectedWeek = page.url.searchParams.get('week');
		const carriesWeek =
			selectedWeek &&
			[`${base}/meal-plan`, `${base}/shopping`].includes(here) &&
			['/meal-plan', '/shopping'].includes(path);
		return carriesWeek
			? `${base}${path}?week=${encodeURIComponent(selectedWeek)}`
			: `${base}${path}`;
	}
</script>

<nav
	aria-label={m.nav_aria_primary()}
	class="app-nav ui-z-nav shrink-0 flex"
	style="padding-bottom: env(safe-area-inset-bottom)"
>
	{#each TABS as tab (tab.path)}
		{@const active = isActive(tab.path)}
		<a
			href={tabHref(tab.path)}
			aria-current={active ? 'page' : undefined}
			class:active={active}
			class="app-nav-item flex-1 flex flex-col items-center justify-center gap-0.5 no-underline transition-colors"
		>
			<Icon name={tab.icon} class="h-5 w-5 shrink-0" />
			<span class="max-w-full px-0.5 text-center text-[9px] font-medium leading-tight min-[360px]:text-[10px]"
				>{tab.label}</span
			>
		</a>
	{/each}
</nav>

<style>
	.app-nav {
		height: calc(var(--ui-nav-height) + var(--ui-safe-bottom));
		gap: 0.18rem;
		border: 0;
		padding: 0.28rem 0.18rem 0;
		background: var(--kitchen-grove);
	}

	.app-nav-item {
		min-width: 0;
		min-height: 2.75rem;
		border-radius: 0.72rem;
		color: var(--kitchen-ribbon-muted);
	}

	.app-nav-item:hover,
	.app-nav-item:focus-visible {
		background: rgb(255 255 255 / 7%);
		color: var(--kitchen-ribbon-ink);
	}

	.app-nav-item:focus-visible {
		outline: 2px solid var(--kitchen-ribbon-ink);
		outline-offset: -2px;
	}

	.app-nav-item.active {
		background: var(--kitchen-paper);
		color: var(--kitchen-grove);
	}
</style>
