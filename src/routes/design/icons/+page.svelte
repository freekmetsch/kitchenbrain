<!--
	Icon design shotgun — side-by-side preview of every icon set, with one-tap
	apply. Applying swaps the whole app live (nav, spinners, buttons) via the
	active-set rune store; the choice persists per-device in localStorage.
	This page exists to pick a winner: once a set is chosen, the losers can be
	deleted and the winner promoted to default.
-->
<script lang="ts">
	import Icon from '$lib/components/ui/icons/Icon.svelte';
	import { ICONS, type IconName } from '$lib/components/ui/icons/paths';
	import { ICON_SETS, type IconSetId } from '$lib/components/ui/icons/sets';
	import { iconSet } from '$lib/components/ui/icons/active.svelte';

	const setIds = Object.keys(ICON_SETS) as IconSetId[];
	const allNames = Object.keys(ICONS) as IconName[];

	// Rows mirror real app contexts so each set is judged where it will live.
	const NAV: { icon: IconName; label: string }[] = [
		{ icon: 'home', label: 'Home' },
		{ icon: 'jar', label: 'Stock' },
		{ icon: 'calendar', label: 'Plan' },
		{ icon: 'basket', label: 'Shopping' },
		{ icon: 'chefHat', label: 'Recipes' },
		{ icon: 'settings', label: 'Settings' }
	];
	const UTILITY: IconName[] = ['plus', 'minus', 'check', 'x', 'trash', 'warn', 'clock', 'chevronLeft', 'chevronRight', 'clipboard', 'copy', 'cart', 'calendar'];
	const FOOD: IconName[] = allNames.filter((n) => !UTILITY.includes(n) && !NAV.some((t) => t.icon === n));
</script>

<svelte:head><title>Icon design shotgun</title></svelte:head>

<div class="mx-auto max-w-2xl px-4 py-6 flex flex-col gap-6">
	<header>
		<h1 class="text-xl font-semibold">Icon design shotgun</h1>
		<p class="mt-1 text-sm text-base-content/60">
			Five candidates, each built from scratch in its own visual language — carved stamps, one
			continuous line, pixels, paper collage, stamped coins. Tap
			<span class="font-medium">Use this set</span> to restyle the whole app instantly — nav,
			buttons, spinners, everything. The choice sticks on this device, so browse around and come
			back to switch.
		</p>
	</header>

	{#each setIds as id (id)}
		{@const set = ICON_SETS[id]}
		{@const active = iconSet.id === id}
		<section
			class="rounded-2xl border bg-base-100 overflow-hidden {active
				? 'border-primary shadow-md'
				: 'border-base-300'}"
		>
			<div class="flex items-start justify-between gap-3 px-4 pt-4">
				<div>
					<h2 class="font-semibold flex items-center gap-2">
						{set.name}
						{#if active}<span class="badge badge-primary badge-sm">active</span>{/if}
					</h2>
					<p class="text-xs text-base-content/55 mt-0.5">{set.tagline}</p>
				</div>
				{#if !active}
					<button class="btn btn-primary btn-sm shrink-0" onclick={() => iconSet.set(id)}>
						Use this set
					</button>
				{/if}
			</div>

			<!-- mock bottom-nav: the highest-stakes context -->
			<div class="mt-4 mx-4 rounded-xl border border-base-300 bg-base-100 flex">
				{#each NAV as tab, i (tab.icon)}
					<span
						class="flex-1 flex flex-col items-center gap-0.5 py-2 {i === 2
							? 'text-primary'
							: 'text-base-content/40'}"
					>
						<Icon name={tab.icon} set={id} class="h-5 w-5" />
						<span class="text-[10px] font-medium leading-none">{tab.label}</span>
					</span>
				{/each}
			</div>

			<!-- utility glyphs at true in-app size -->
			<div class="mt-3 px-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-base-content/80">
				{#each UTILITY as n (n)}
					<Icon name={n} set={id} class="h-4 w-4" />
				{/each}
				<span class="inline-flex h-7 items-center gap-1.5 rounded-full bg-primary/10 px-2.5 text-xs font-medium text-primary">
					<Icon name="plus" set={id} class="h-3.5 w-3.5" /> Add item
				</span>
			</div>

			<!-- food family, larger -->
			<div class="mt-3 mb-4 px-4 grid grid-cols-7 gap-2 text-base-content/70 sm:grid-cols-10">
				{#each FOOD as n (n)}
					<span class="flex items-center justify-center rounded-lg bg-base-200/60 py-2" title={n}>
						<Icon name={n} set={id} class="h-6 w-6" />
					</span>
				{/each}
			</div>
		</section>
	{/each}

	<p class="text-xs text-base-content/45">
		Applied set: <span class="font-medium">{ICON_SETS[iconSet.id].name}</span> — stored in this
		browser only. Tell Claude which one won and the rest get retired.
	</p>
</div>
