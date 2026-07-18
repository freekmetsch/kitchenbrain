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
	import { page } from '$app/stores';
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
		const here = $page.url.pathname;
		const target = base + path;
		return path === '/' ? here === target : here === target || here.startsWith(target + '/');
	};
</script>

<nav
	aria-label={m.nav_aria_primary()}
	class="ui-z-nav shrink-0 flex bg-base-100 border-t border-base-300"
	style="padding-bottom: env(safe-area-inset-bottom)"
>
	{#each TABS as tab (tab.path)}
		{@const active = isActive(tab.path)}
		<a
			href="{base}{tab.path}"
			aria-current={active ? 'page' : undefined}
			class="flex-1 flex flex-col items-center justify-center py-2 gap-0.5 min-h-[3.5rem] no-underline transition-colors active:bg-base-200 {active
				? 'text-primary'
				: 'text-base-content/40 hover:text-base-content/70'}"
		>
			<Icon name={tab.icon} class="h-5 w-5 shrink-0" />
			<span class="text-[10px] font-medium leading-none {tab.path === '/shopping' ? 'truncate px-1' : ''}"
				>{tab.label}</span
			>
		</a>
	{/each}
</nav>
