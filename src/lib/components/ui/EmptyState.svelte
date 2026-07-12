<script lang="ts">
	import type { Snippet } from 'svelte';

	// Empty / no-results state. Visual recipe from the specimen (inventory
	// /+page.svelte:1069-1080): dashed rounded-2xl card, emoji, CTA. `mini` is the
	// compact inline variant (e.g. an empty meal-plan week).
	let {
		icon,
		title,
		description,
		action,
		mini = false
	}: {
		/** Emoji shown above the title (full variant only). */
		icon?: string;
		title: string;
		description?: string;
		/** Optional CTA row (button/link snippet). */
		action?: Snippet;
		mini?: boolean;
	} = $props();
</script>

{#if mini}
	<div class="rounded-xl border border-dashed border-base-300 bg-base-100/50 px-4 py-6 text-center">
		<p class="text-sm text-base-content/60">{title}</p>
		{#if description}<p class="mt-0.5 text-xs text-base-content/45">{description}</p>{/if}
		{#if action}<div class="mt-2">{@render action()}</div>{/if}
	</div>
{:else}
	<div
		class="mt-8 rounded-2xl border border-dashed border-base-300 bg-base-100/50 px-4 py-12 text-center"
	>
		{#if icon}<div class="text-4xl">{icon}</div>{/if}
		<p class="mt-2 text-sm font-medium text-base-content/60">{title}</p>
		{#if description}<p class="text-xs text-base-content/45">{description}</p>{/if}
		{#if action}<div class="mt-2">{@render action()}</div>{/if}
	</div>
{/if}
