<script lang="ts">
	import { base } from '$app/paths';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import { m } from '$lib/paraglide/messages';
	import type { RecipePatchDisplay } from '$lib/tool_display';
	import { untrack } from 'svelte';

	type Props = { proposal: RecipePatchDisplay; onApplied?: () => void | Promise<void> };
	let { proposal, onApplied }: Props = $props();
	let selected = $state<Record<string, boolean>>(
		untrack(() => Object.fromEntries(proposal.operations.map((operation) => [operation.id, false])))
	);
	let applyState = $state<'ready' | 'applying' | 'done' | 'error' | 'stale'>('ready');
	let statusEl: HTMLParagraphElement | undefined = $state();
	let selectedCount = $derived(Object.values(selected).filter(Boolean).length);

	async function apply() {
		if (selectedCount === 0) return;
		applyState = 'applying';
		try {
			const response = await fetch(`${base}/api/recipes/${proposal.recipeSlug}/enhance`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'apply',
					token: proposal.token,
					operationIds: proposal.operations
						.filter((operation) => selected[operation.id])
						.map((operation) => operation.id)
				})
			});
			applyState = response.ok ? 'done' : response.status === 409 ? 'stale' : 'error';
			if (response.ok) await onApplied?.();
		} catch {
			applyState = 'error';
		} finally {
			queueMicrotask(() => statusEl?.focus());
		}
	}
</script>

<div class="space-y-2">
	{#if applyState !== 'ready' && applyState !== 'applying'}
		<p
			bind:this={statusEl}
			tabindex="-1"
			class:text-success={applyState === 'done'}
			class:text-warning={applyState === 'stale'}
			class:text-error={applyState === 'error'}
			class="text-xs outline-none"
			aria-live="polite"
		>
			{applyState === 'done'
				? m.recipe_enhance_applied()
				: applyState === 'stale'
					? m.recipe_enhance_stale()
					: m.recipe_enhance_failed()}
		</p>
	{/if}

	{#if applyState !== 'done'}
		{#each proposal.operations as operation (operation.id)}
			<article class="rounded-md border border-base-300/70 p-2">
				<label class="flex min-w-0 gap-2">
					<input
						type="checkbox"
						class="checkbox checkbox-xs mt-0.5 shrink-0"
						bind:checked={selected[operation.id]}
					/>
					<span class="min-w-0 text-xs">
						<span class="block break-words font-medium">{operation.label}</span>
						<span class="mt-1 grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-2 text-[0.7rem]">
							<span class="opacity-55">{m.recipe_patch_before()}</span>
							<span class="break-words line-through opacity-60">{operation.before ?? '—'}</span>
							<span class="opacity-55">{m.recipe_patch_after()}</span>
							<span class="break-words">{operation.after}</span>
						</span>
						<span class="mt-1 block break-words opacity-65">
							{m.recipe_enhance_reason({ reason: operation.reason })}
						</span>
						{#if operation.evidence}
							<span class="mt-1 block break-words text-success/80">
								{m.recipe_patch_ah_evidence({
									product: operation.evidence.productName,
									size: operation.evidence.packageSize ?? m.recipe_patch_size_unknown()
								})}
							</span>
						{:else if operation.kind === 'add_ingredient' || operation.kind === 'update_ingredient'}
							<span class="mt-1 block text-warning/80">{m.recipe_patch_unverified()}</span>
						{/if}
					</span>
				</label>
			</article>
		{/each}

		<button
			type="button"
			class="btn btn-primary btn-sm min-h-11"
			disabled={applyState === 'applying' || selectedCount === 0}
			onclick={apply}
		>
			{#if applyState === 'applying'}<Spinner size="xs" />{/if}
			{m.recipe_enhance_apply()}
		</button>
	{/if}
</div>
