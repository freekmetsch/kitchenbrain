<script lang="ts">
	import Icon from '$lib/components/ui/icons/Icon.svelte';
	import { m } from '$lib/paraglide/messages';

	let { meals }: { meals: string[] } = $props();
</script>

{#if meals.length === 1}
	<span class="ui-chip-muted min-h-7 max-w-full py-1">
		<Icon name="chefHat" class="h-3 w-3 shrink-0" />
		<span class="truncate">{meals[0]}</span>
	</span>
{:else if meals.length > 1}
	<details class="relative">
		<summary class="ui-chip-muted min-h-7 cursor-pointer list-none py-1" aria-label={m.shopping_recipe_references_aria({ count: meals.length })}>
			<Icon name="chefHat" class="h-3 w-3" />
			{m.shopping_recipe_references_count({ count: meals.length })}
			<span aria-hidden="true">⌄</span>
		</summary>
		<ul class="mt-1.5 flex flex-wrap gap-1" aria-label={m.shopping_recipe_references_aria({ count: meals.length })}>
			{#each meals as meal}
				<li class="rounded-full bg-base-200 px-2 py-1 text-[11px] text-base-content/65">{meal}</li>
			{/each}
		</ul>
	</details>
{/if}
