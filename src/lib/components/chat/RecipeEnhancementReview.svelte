<script lang="ts">
	import { base } from '$app/paths';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import { m } from '$lib/paraglide/messages';
	import type { RecipeEnhancementDisplay } from '$lib/tool_display';
	import { untrack } from 'svelte';

	type Props = { proposal: RecipeEnhancementDisplay };
	let { proposal }: Props = $props();
	let additions = $state<Record<string, boolean>>(untrack(() => Object.fromEntries(proposal.additions.map((item) => [item.id, false]))));
	let substitutes = $state<Record<string, boolean>>(untrack(() => Object.fromEntries(proposal.substitutes.map((item) => [item.id, false]))));
	let needs = $state<Record<string, 'required' | 'optional' | 'stocked'>>(untrack(() => Object.fromEntries(proposal.additions.map((item) => [item.id, 'optional']))));
	let applyState = $state<'ready' | 'applying' | 'done' | 'error' | 'stale'>('ready');

	async function apply() {
		applyState = 'applying';
		try {
			const response = await fetch(`${base}/api/recipes/${proposal.recipeSlug}/enhance`, {
				method: 'POST', headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'apply', token: proposal.token,
					additions: proposal.additions.filter((item) => additions[item.id]).map((item) => ({ id: item.id, need: needs[item.id] })),
					substituteIds: proposal.substitutes.filter((item) => substitutes[item.id]).map((item) => item.id)
				})
			});
			applyState = response.ok ? 'done' : response.status === 409 ? 'stale' : 'error';
		} catch {
			applyState = 'error';
		}
	}
</script>

<div class="space-y-2">
	{#if applyState === 'done'}
		<p class="text-xs text-success">{m.recipe_enhance_applied()}</p>
	{:else if applyState === 'stale'}
		<p class="text-xs text-warning">{m.recipe_enhance_stale()}</p>
	{:else if applyState === 'error'}
		<p class="text-xs text-error">{m.recipe_enhance_failed()}</p>
	{:else}
		{#each proposal.additions as item (item.id)}
			<div class="rounded-md border border-base-300/70 p-2">
				<label class="flex gap-2"><input type="checkbox" class="checkbox checkbox-xs" bind:checked={additions[item.id]} /><span class="text-xs font-medium">{[item.amount, item.unit, item.name].filter(Boolean).join(' ')}</span></label>
				{#if additions[item.id]}<select class="select select-xs mt-1 w-full" aria-label={m.recipe_enhance_need_aria({ name: item.name })} bind:value={needs[item.id]}><option value="optional">{m.shopping_need_nice_to_have()}</option><option value="required">{m.shopping_need_every_time()}</option><option value="stocked">{m.shopping_need_usually_stocked()}</option></select>{/if}
			</div>
		{/each}
		{#each proposal.substitutes as item (item.id)}
			<label class="flex gap-2 rounded-md border border-base-300/70 p-2"><input type="checkbox" class="checkbox checkbox-xs" bind:checked={substitutes[item.id]} /><span class="text-xs"><span class="font-medium">{item.name}</span><span class="block opacity-60">{m.recipe_enhance_for({ name: item.ingredientName })}</span></span></label>
		{/each}
		<button type="button" class="btn btn-primary btn-xs min-h-9" disabled={applyState === 'applying' || (!Object.values(additions).some(Boolean) && !Object.values(substitutes).some(Boolean))} onclick={apply}>{#if applyState === 'applying'}<Spinner size="xs" />{/if}{m.recipe_enhance_apply()}</button>
	{/if}
</div>
