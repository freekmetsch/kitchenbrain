<script lang="ts">
	import { base } from '$app/paths';
	import Icon from '$lib/components/ui/icons/Icon.svelte';
	import { m } from '$lib/paraglide/messages';
	import type { IngredientRoleCoverage } from '$lib/server/recipe_links';

	let {
		slug,
		coverage,
		onAskAi
	}: {
		slug: string;
		coverage: IngredientRoleCoverage;
		onAskAi: () => void;
	} = $props();

	let percent = $derived(coverage.total > 0 ? Math.round((coverage.classified / coverage.total) * 100) : 0);
</script>

{#if coverage.complete}
	<!-- Once roles have done their job, collapse the component to quiet metadata.
	     Editing remains discoverable without competing with the cooking surface. -->
	<details class="mx-4 mt-2 rounded-xl border border-base-300/60 bg-base-100/60 text-xs">
		<summary class="flex min-h-10 cursor-pointer list-none items-center gap-2 px-3 text-base-content/60">
			<Icon name="check" class="h-3.5 w-3.5 text-success" />
			<span class="flex-1">{m.recipes_roles_heading()}</span>
			<span class="tabular-nums">{coverage.classified}/{coverage.total}</span>
			<span aria-hidden="true">⌄</span>
		</summary>
		<div class="flex items-center justify-between gap-3 border-t border-base-200 px-3 py-2">
			<span class="text-base-content/60">{m.recipes_roles_complete()}</span>
			<a href="{base}/recipes/{slug}/edit" class="btn btn-ghost btn-xs shrink-0">{m.recipes_roles_edit_manually()}</a>
		</div>
	</details>
{:else}
	<section class="mx-4 mt-3 rounded-2xl border border-warning/30 bg-warning/5 p-3.5" aria-labelledby="role-coverage-title">
		<div class="flex items-start gap-3">
			<div class="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-warning/15 text-warning">
				<Icon name="warn" class="h-4 w-4" />
			</div>
			<div class="min-w-0 flex-1">
				<div class="flex items-center justify-between gap-3">
					<h2 id="role-coverage-title" class="text-sm font-semibold">{m.recipes_roles_heading()}</h2>
					<span class="text-xs tabular-nums text-base-content/60">{coverage.classified}/{coverage.total}</span>
				</div>
				<progress class="progress progress-warning mt-2 h-1.5 w-full" value={percent} max="100"></progress>
				<p class="mt-2 text-xs text-base-content/70">{m.recipes_roles_consequence()}</p>
				{#if coverage.unknownNames.length > 0}
					<p class="mt-1 break-words text-xs font-medium text-base-content/80">
						{m.recipes_roles_unknown({ names: coverage.unknownNames.join(', ') })}
					</p>
				{/if}
			</div>
		</div>
		<div class="mt-3 flex flex-wrap gap-2 pl-12">
			<a href="{base}/recipes/{slug}/edit" class="btn btn-sm btn-outline min-h-9">{m.recipes_roles_edit_manually()}</a>
			<button type="button" class="btn btn-sm btn-primary min-h-9" onclick={onAskAi}>{m.recipes_roles_ask_ai()}</button>
		</div>
	</section>
{/if}
