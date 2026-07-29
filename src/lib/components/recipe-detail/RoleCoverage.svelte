<script lang="ts">
	import { base } from '$app/paths';
	import Icon from '$lib/components/ui/icons/Icon.svelte';
	import KitchenNotice from '$lib/components/ui/KitchenNotice.svelte';
	import { m } from '$lib/paraglide/messages';
	import type { IngredientRoleCoverage } from '$lib/server/domains/recipes';

	let {
		slug,
		coverage
	}: {
		slug: string;
		coverage: IngredientRoleCoverage;
	} = $props();

	let percent = $derived(coverage.total > 0 ? Math.round((coverage.classified / coverage.total) * 100) : 0);
</script>

<KitchenNotice tone="warning" class="mx-4 mt-3" aria-labelledby="role-coverage-title">
		<div class="flex items-start gap-3">
			<div class="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-warning/15 text-warning">
				<Icon name="warn" class="h-4 w-4" />
			</div>
			<div class="min-w-0 flex-1">
				<div class="flex items-center justify-between gap-3">
					<h2 id="role-coverage-title" class="ui-section-title">{m.recipes_roles_heading()}</h2>
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
			<a href="{base}/recipes/{slug}/edit" class="ui-action ui-action-secondary">{m.recipes_roles_edit_manually()}</a>
		</div>
	</KitchenNotice>
