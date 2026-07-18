<!--
	Ghost rows (UX-STOCK-14): keep-stocked recipes with no live meal row become
	"0 / N portions · cook again" cues in the Meals shelf. The cue survives row
	deletion. Ghost-row opt-out: "cooked it once, didn't like it" must be one tap
	from the cue itself — sets the recipe's opt-out via the staple PATCH. Renders
	<li> fragments; the parent supplies the <ul>.
-->
<script lang="ts">
	import { base } from '$app/paths';
	import { invalidateAll } from '$app/navigation';
	import { slide } from 'svelte/transition';
	import { m } from '$lib/paraglide/messages';
	import { patchKeepStocked } from '$lib/keep_stocked';
	import type { StapleGhost } from './shared';
	import { MOTION_MICRO_MS } from '$lib/motion';

	let {
		ghosts,
		flashToast
	}: {
		ghosts: StapleGhost[];
		flashToast: (msg: string) => void;
	} = $props();

	let ghostBusy = $state<string | null>(null);
	async function ghostOptOut(ghost: { slug: string; title: string }) {
		ghostBusy = ghost.slug;
		try {
			if (!(await patchKeepStocked(ghost.slug, false))) {
				flashToast(m.inventory_toast_update_failed());
				return;
			}
			flashToast(m.inventory_toast_ghost_opt_out({ title: ghost.title }));
			await invalidateAll();
		} finally {
			ghostBusy = null;
		}
	}
</script>

{#each ghosts as ghost (ghost.slug)}
	<li class="flex gap-2.5 bg-base-100 px-3 py-2" transition:slide={{ duration: MOTION_MICRO_MS }}>
		<span class="my-0.5 w-1 shrink-0 rounded-full bg-warning/50" aria-hidden="true"></span>
		<div class="min-w-0 flex-1">
			<div class="flex items-center gap-2">
				<a
					href="{base}/recipes/{ghost.slug}"
					class="min-w-0 flex-1 truncate text-sm font-medium leading-snug text-base-content/70"
					>{ghost.title}</a
				>
				<a
					href="{base}/recipes/{ghost.slug}"
					class="btn btn-ghost btn-sm h-8 min-h-0 shrink-0 px-2.5 text-xs font-medium text-warning"
					>{m.inventory_ghost_cook_again_button()}</a
				>
			</div>
			<div class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs leading-4 text-base-content/65">
				<span class="opacity-70">❄️</span>
				<span class="rounded-full border border-warning/40 bg-warning/10 px-1.5 font-medium tabular-nums text-warning"
					>{ghost.target != null ? m.inventory_ghost_portions_with_target({ target: ghost.target }) : m.inventory_ghost_portions_no_target()}</span
				>
				<button
					type="button"
					class="text-base-content/50 underline decoration-dotted underline-offset-2 hover:text-base-content/80 disabled:opacity-50"
					disabled={ghostBusy === ghost.slug}
					onclick={() => ghostOptOut(ghost)}>{m.inventory_ghost_stop_button()}</button
				>
			</div>
		</div>
	</li>
{/each}
