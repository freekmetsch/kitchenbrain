<script lang="ts">
	import { base } from '$app/paths';
	import { invalidateAll } from '$app/navigation';
	import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
	import Icon from '$lib/components/ui/icons/Icon.svelte';
	import KitchenNotice from '$lib/components/ui/KitchenNotice.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import RecipeEnhancementReview from '$lib/components/chat/RecipeEnhancementReview.svelte';
	import { m } from '$lib/paraglide/messages';
	import { toast } from '$lib/stores/toast.svelte';
	import type { Ingredient } from '$lib/recipe_ingredient';
	import type { RecipePatchDisplay } from '$lib/tool_display';

	type Props = { slug: string; ingredients: Ingredient[] };
	let { slug, ingredients: _ingredients }: Props = $props();
	let open = $state(false);
	let loading = $state(false);
	let status = $state<'idle' | 'loading' | 'ready' | 'error'>('idle');
	let proposal = $state<RecipePatchDisplay | null>(null);

	async function generate() {
		if (loading) return;
		loading = true;
		status = 'loading';
		proposal = null;
		try {
			const response = await fetch(`${base}/api/recipes/${slug}/enhance`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'generate' })
			});
			if (!response.ok) throw new Error();
			proposal = await response.json();
			status = 'ready';
			open = true;
			toast.success(m.recipe_enhance_ready());
		} catch {
			status = 'error';
			toast.error(m.recipe_enhance_failed());
		} finally {
			loading = false;
		}
	}

	function openReview() {
		if (proposal) open = true;
		else void generate();
	}

	async function applied() {
		open = false;
		proposal = null;
		status = 'idle';
		toast.success(m.recipe_enhance_applied());
		await invalidateAll();
	}
</script>

<div class="flex h-full min-w-0 flex-col rounded-2xl border border-primary/20 bg-primary/5 p-2 md:p-3">
	<button
		type="button"
		class="ui-action ui-action-secondary w-full min-w-0 whitespace-normal px-2 text-xs md:px-3 md:text-sm"
		aria-haspopup={proposal ? 'dialog' : undefined}
		disabled={loading}
		onclick={openReview}
	>
		{#if loading}
			{m.recipe_enhance_working()}
		{:else if proposal}
			{m.recipe_enhance_review_button()}
		{:else if status === 'error'}
			{m.recipe_enhance_retry_button()}
		{:else}
			{m.recipe_enhance_button()}
		{/if}
	</button>
	{#if loading}
		<KitchenNotice tone="info" class="mt-2 text-xs" role="status" aria-busy="true">
			<Spinner size="xs" />{m.recipe_enhance_background_status()}
		</KitchenNotice>
	{:else if status === 'ready'}
		<KitchenNotice tone="success" class="mt-2 text-xs" role="status">
			<span class="flex items-center gap-2"><Icon name="check" class="h-4 w-4 shrink-0 text-success" />{m.recipe_enhance_ready()}</span>
		</KitchenNotice>
	{:else if status === 'error'}
		<KitchenNotice tone="error" class="mt-2 text-xs" role="status">
			<span class="flex items-center gap-2"><Icon name="warn" class="h-4 w-4 shrink-0 text-error" />{m.recipe_enhance_failed()}</span>
		</KitchenNotice>
	{/if}
</div>

<BottomSheet bind:open title={m.recipe_enhance_title()}>
	{#if loading}
		<div class="flex items-center gap-2 py-8 text-sm text-base-content/65" role="status">
			<Spinner size="sm" />{m.recipe_enhance_loading()}
		</div>
	{:else if proposal}
		<RecipeEnhancementReview {proposal} verifyStatus={false} onApplied={applied} />
	{/if}
</BottomSheet>
