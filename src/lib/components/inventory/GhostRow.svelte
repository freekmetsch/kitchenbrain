<script lang="ts">
	import { base } from '$app/paths';
	import { invalidateAll } from '$app/navigation';
	import { m } from '$lib/paraglide/messages';
	import { patchKeepStocked } from '$lib/keep_stocked';
	import type { StapleGhost } from './shared';

	let {
		ghost,
		flashToast
	}: {
		ghost: StapleGhost;
		flashToast: (message: string) => void;
	} = $props();

	let busy = $state(false);

	async function stopKeepingStocked() {
		busy = true;
		try {
			if (!(await patchKeepStocked(ghost.slug, false))) {
				flashToast(m.inventory_toast_update_failed());
				return;
			}
			flashToast(m.inventory_toast_ghost_opt_out({ title: ghost.title }));
			await invalidateAll();
		} finally {
			busy = false;
		}
	}
</script>

<div class="stock-item-row stock-ghost-row relative bg-[var(--stock-row-bg,var(--color-base-100))] px-3 py-2">
	<div class="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
		<a href="{base}/recipes/{ghost.slug}" class="min-w-0 truncate text-sm font-medium leading-snug">
			{ghost.title}
		</a>
		<a href="{base}/recipes/{ghost.slug}" class="ui-action ui-action-warning shrink-0 px-2.5 text-xs">
			{m.inventory_ghost_cook_again_button()}
		</a>
	</div>
	<div class="stock-ghost-meta">
		<strong>{m.inventory_cook_again_badge()}</strong>
		<span>{ghost.target != null ? m.inventory_ghost_portions_with_target({ target: ghost.target }) : m.inventory_ghost_portions_no_target()}</span>
		<button type="button" disabled={busy} onclick={stopKeepingStocked}>
			{m.inventory_ghost_stop_button()}
		</button>
	</div>
</div>

<style>
	.stock-ghost-meta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.15rem 0.65rem;
		margin-top: 0.2rem;
		color: color-mix(in oklab, var(--color-base-content) 68%, transparent);
		font-size: 0.7rem;
		line-height: 1.35;
	}

	.stock-ghost-meta strong {
		color: var(--kitchen-honey-ink);
		font-weight: 760;
	}

	.stock-ghost-meta button {
		min-height: 2.75rem;
		border-radius: 0.4rem;
		color: var(--kitchen-olive);
		font-weight: 720;
		text-decoration: underline dotted;
		text-underline-offset: 0.18rem;
	}

	.stock-ghost-meta button:focus-visible {
		outline: 2px solid var(--kitchen-grove);
		outline-offset: 2px;
	}

	.stock-ghost-meta button:disabled {
		cursor: wait;
		opacity: 0.55;
	}
</style>
