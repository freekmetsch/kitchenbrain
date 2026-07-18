<script lang="ts">
	import Icon from '$lib/components/ui/icons/Icon.svelte';
	import { m } from '$lib/paraglide/messages';
	import type { Ingredient } from './types';

	let { ingredients }: { ingredients: Ingredient[] } = $props();
	let entries = $derived(
		ingredients
			.filter((ingredient) => ingredient.substitutes?.length)
			.map((ingredient) => ({ name: ingredient.name, substitutes: ingredient.substitutes ?? [] }))
	);
	let count = $derived(entries.reduce((total, entry) => total + entry.substitutes.length, 0));

	function kindLabel(kind: string | undefined): string | null {
		if (kind === 'protein') return m.recipes_substitutes_kind_protein();
		if (kind === 'spice') return m.recipes_substitutes_kind_spice();
		if (kind === 'vegetable') return m.recipes_substitutes_kind_vegetable();
		if (kind === 'other') return m.recipes_substitutes_kind_other();
		return null;
	}
</script>

{#if count > 0}
	<details class="mx-4 mt-2 rounded-xl border border-base-300/60 bg-base-100/60 text-sm">
		<summary class="flex min-h-10 cursor-pointer list-none items-center gap-2 px-3 text-base-content/70">
			<Icon name="spoon" class="h-3.5 w-3.5 text-secondary" />
			<span class="flex-1 font-medium">{m.recipes_substitutes_heading()}</span>
			<span class="text-xs tabular-nums text-base-content/55">{count}</span>
			<span aria-hidden="true" class="text-xs">⌄</span>
		</summary>
		<div class="border-t border-base-200 px-3 py-3">
			<p class="mb-3 text-xs leading-relaxed text-base-content/65" role="note">
				{m.recipes_substitutes_disclaimer()}
			</p>
			<ul class="space-y-3">
				{#each entries as entry (entry.name)}
					<li>
						<p class="text-xs font-semibold text-base-content/70">{entry.name}</p>
						<ul class="mt-1.5 flex flex-wrap gap-1.5">
							{#each entry.substitutes as substitute}
								<li class="rounded-lg border border-base-300/70 bg-base-200/55 px-2 py-1.5">
									<span class="font-medium">{substitute.name}</span>
									{#if kindLabel(substitute.kind)}
										<span class="ml-1 text-[11px] text-base-content/55">· {kindLabel(substitute.kind)}</span>
									{/if}
									{#if substitute.note}
										<span class="block max-w-[32rem] text-xs leading-snug text-base-content/60">{substitute.note}</span>
									{/if}
								</li>
							{/each}
						</ul>
					</li>
				{/each}
			</ul>
		</div>
	</details>
{/if}
