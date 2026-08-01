<script lang="ts">
	import { base } from '$app/paths';
	import { goto, invalidateAll } from '$app/navigation';
	import { m } from '$lib/paraglide/messages';
	import { toast } from '$lib/stores/toast.svelte';

	let {
		slug,
		title,
		archived,
		onArchivedChange
	}: {
		slug: string;
		title: string;
		archived: boolean;
		onArchivedChange?: (archived: boolean) => void;
	} = $props();

	let pending = $state(false);

	async function setArchived(next: boolean, refresh = true): Promise<boolean> {
		if (pending) return false;
		pending = true;
		try {
			const response = await fetch(`${base}/api/recipes/${slug}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ archived: next })
			});
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			onArchivedChange?.(next);
			if (refresh) await invalidateAll();
			return true;
		} catch {
			toast.error(next ? m.recipes_archive_failed() : m.recipes_restore_failed());
			return false;
		} finally {
			pending = false;
		}
	}

	async function archive(): Promise<void> {
		if (!confirm(m.recipes_archive_confirm({ title }))) return;
		if (!(await setArchived(true, false))) return;
		toast.undo(m.recipes_archived_toast({ title }), () => void setArchived(false));
		await goto(`${base}/recipes`);
	}
</script>

<div class:archived class="recipe-archive-control">
	{#if archived}
		<div>
			<strong>{m.recipes_archived_heading()}</strong>
			<span>{m.recipes_archived_description()}</span>
		</div>
		<button
			type="button"
			class="ui-action ui-action-secondary"
			disabled={pending}
			onclick={() => void setArchived(false)}
		>{m.recipes_restore_button()}</button>
	{:else}
		<span>{m.recipes_archive_description()}</span>
		<button
			type="button"
			class="ui-action ui-action-danger"
			disabled={pending}
			onclick={() => void archive()}
		>{m.recipes_archive_button()}</button>
	{/if}
</div>

<style>
	.recipe-archive-control {
		display: flex;
		min-height: 3rem;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		margin: 0.75rem;
		border: 1px solid var(--kitchen-line);
		border-radius: 0.85rem;
		padding: 0.65rem 0.75rem;
		color: var(--kitchen-muted);
		font-size: 0.75rem;
	}

	.recipe-archive-control.archived {
		border-color: color-mix(in oklab, var(--color-warning) 40%, var(--kitchen-line));
		background: color-mix(in oklab, var(--color-warning) 8%, var(--kitchen-card));
	}

	.recipe-archive-control div {
		display: grid;
	}

	@media (max-width: 30rem) {
		.recipe-archive-control {
			align-items: stretch;
			flex-direction: column;
		}
	}
</style>
