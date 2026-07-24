<script lang="ts">
	import { base } from '$app/paths';
	import { invalidateAll } from '$app/navigation';
	import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import { m } from '$lib/paraglide/messages';
	import { toast } from '$lib/stores/toast.svelte';
	import type { Ingredient } from '$lib/recipe_ingredient';

	type Need = 'required' | 'optional' | 'stocked';
	type Addition = { id: string; name: string; amount: string; unit?: string; preparation?: string; component?: string; reason: string };
	type Substitute = { id: string; ingredientId: string; ingredientName: string; name: string; note?: string; reason: string };
	type Proposal = { token: string; additions: Addition[]; substitutes: Substitute[] };
	type Props = { slug: string; ingredients: Ingredient[] };
	let { slug, ingredients }: Props = $props();
	let open = $state(false);
	let loading = $state(false);
	let applying = $state(false);
	let proposal = $state<Proposal | null>(null);
	let selectedAdditions = $state<Record<string, boolean>>({});
	let needs = $state<Record<string, Need>>({});
	let selectedSubstitutes = $state<Record<string, boolean>>({});
	let ingredientNames = $derived(new Map(ingredients.map((ingredient) => [ingredient.id, ingredient.name])));

	async function generate() {
		open = true;
		loading = true;
		proposal = null;
		try {
			const response = await fetch(`${base}/api/recipes/${slug}/enhance`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'generate' }) });
			if (!response.ok) throw new Error();
			proposal = await response.json();
			selectedAdditions = Object.fromEntries(proposal!.additions.map((addition) => [addition.id, false]));
			needs = Object.fromEntries(proposal!.additions.map((addition) => [addition.id, 'optional']));
			selectedSubstitutes = Object.fromEntries(proposal!.substitutes.map((substitute) => [substitute.id, false]));
		} catch { toast.error(m.recipe_enhance_failed()); open = false; }
		finally { loading = false; }
	}

	function openReview() {
		if (proposal) open = true;
		else void generate();
	}

	async function apply() {
		if (!proposal) return;
		applying = true;
		try {
			const response = await fetch(`${base}/api/recipes/${slug}/enhance`, {
				method: 'POST', headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'apply', token: proposal.token,
					additions: proposal.additions.filter((addition) => selectedAdditions[addition.id]).map((addition) => ({ id: addition.id, need: needs[addition.id] ?? 'optional' })),
					substituteIds: proposal.substitutes.filter((substitute) => selectedSubstitutes[substitute.id]).map((substitute) => substitute.id)
				})
			});
			if (!response.ok) { toast.error(response.status === 409 ? m.recipe_enhance_stale() : m.recipe_enhance_failed()); return; }
			open = false;
			proposal = null;
			toast.success(m.recipe_enhance_applied());
			await invalidateAll();
		} catch {
			toast.error(m.recipe_enhance_failed());
		} finally {
			applying = false;
		}
	}
</script>

<button
	type="button"
	class="btn btn-outline btn-sm mx-3 mb-4 mt-3 min-h-11"
	aria-haspopup="dialog"
	onclick={openReview}
>
	{m.recipe_enhance_button()}
</button>

<BottomSheet bind:open title={m.recipe_enhance_title()}>
	{#if loading}
		<div class="flex items-center gap-2 py-8 text-sm text-base-content/65" role="status"><Spinner size="sm" />{m.recipe_enhance_loading()}</div>
	{:else if proposal}
		{#if proposal.additions.length}
			<h3 class="mb-2 font-semibold">{m.recipe_enhance_additions()}</h3>
			<div class="space-y-2">
				{#each proposal.additions as addition (addition.id)}
					<article class="rounded-xl border border-base-300 p-3">
						<label class="flex gap-3"><input class="checkbox checkbox-primary" type="checkbox" bind:checked={selectedAdditions[addition.id]} /><span class="min-w-0"><span class="block text-sm font-semibold">{[addition.amount, addition.unit, addition.name].filter(Boolean).join(' ')}</span><span class="block text-xs text-base-content/60">{m.recipe_enhance_reason({ reason: addition.reason })}</span></span></label>
						{#if selectedAdditions[addition.id]}<select class="select select-sm mt-2 w-full" aria-label={m.recipe_enhance_need_aria({ name: addition.name })} bind:value={needs[addition.id]}><option value="optional">{m.shopping_need_nice_to_have()}</option><option value="required">{m.shopping_need_every_time()}</option><option value="stocked">{m.shopping_need_usually_stocked()}</option></select>{/if}
					</article>
				{/each}
			</div>
		{/if}
		{#if proposal.substitutes.length}
			<h3 class="mb-2 mt-4 font-semibold">{m.recipe_enhance_substitutes()}</h3>
			<div class="space-y-2">{#each proposal.substitutes as substitute (substitute.id)}<label class="flex gap-3 rounded-xl border border-base-300 p-3"><input class="checkbox checkbox-primary" type="checkbox" bind:checked={selectedSubstitutes[substitute.id]} /><span><span class="block text-sm font-semibold">{substitute.name}</span><span class="block text-xs text-base-content/60">{m.recipe_enhance_for({ name: ingredientNames.get(substitute.ingredientId) ?? substitute.ingredientId })} · {m.recipe_enhance_reason({ reason: substitute.reason })}</span></span></label>{/each}</div>
		{/if}
		{#if !proposal.additions.length && !proposal.substitutes.length}<p class="py-8 text-sm text-base-content/65">{m.recipe_enhance_empty()}</p>{/if}
		<div class="mt-4 flex justify-end gap-2"><button type="button" class="btn btn-ghost" onclick={() => (open = false)}>{m.shopping_cancel_button()}</button><button type="button" class="btn btn-primary" disabled={applying || (!Object.values(selectedAdditions).some(Boolean) && !Object.values(selectedSubstitutes).some(Boolean))} onclick={apply}>{#if applying}<Spinner size="xs" />{/if}{m.recipe_enhance_apply()}</button></div>
	{/if}
</BottomSheet>
