<!--
	Multi-pill timer stack — one floating pill per active timer.

	BenchSheet owns the canonical timer state; this stack is a pure render of
	the FIFO-ordered id list. Oldest pill sits at the bottom (stable position
	for the long-running oven bake), newer timers stack upward. Cap at 3
	visible pills with a `+N more` overflow chip when concurrent timers are
	rare (the realistic ceiling on a stovetop is 2-3).
-->
<script lang="ts">
	import Timer from './Timer.svelte';
	import { m } from '$lib/paraglide/messages';
	import type { CookModeStep } from '$lib/types';

	type Props = {
		// Insertion order of active timer ids. Index 0 = oldest (bottom).
		ids: number[];
		// Wall-clock fire times keyed by step idx.
		timerEnds: Record<number, number>;
		// Step records for label derivation.
		steps: CookModeStep[];
		// Worker-driven tick from the parent.
		now: number;
		bottomClearanceRem?: number;
		onDismiss: (id: number) => void;
	};
	let { ids, timerEnds, steps, now, bottomClearanceRem = 0, onDismiss }: Props = $props();

	const VISIBLE_CAP = 3;
	let visibleIds = $derived(ids.slice(0, VISIBLE_CAP));
	let overflowCount = $derived(Math.max(0, ids.length - VISIBLE_CAP));
	let announcement = $state('');
	const announcedComplete = new Set<number>();

	function purposeFor(id: number): string {
		const step = steps[id];
		return step?.timer_purpose ?? step?.goal ?? step?.title ?? '';
	}

	function announce(text: string) {
		announcement = '';
		queueMicrotask(() => (announcement = text));
	}

	function dismiss(id: number) {
		if ((timerEnds[id] ?? 0) > now) {
			announce(m.cookmode_timer_cancelled_announcement({ purpose: purposeFor(id) }));
		}
		onDismiss(id);
	}

	$effect(() => {
		const currentIds = new Set(ids);
		for (const id of announcedComplete) {
			if (!currentIds.has(id)) announcedComplete.delete(id);
		}
		for (const id of ids) {
			const endsAt = timerEnds[id];
			if (endsAt != null && endsAt <= now && !announcedComplete.has(id)) {
				announcedComplete.add(id);
				announce(m.cookmode_timer_complete_announcement({ purpose: purposeFor(id) }));
			}
		}
	});
</script>

<span class="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</span>

{#each visibleIds as id, index (id)}
	{@const step = steps[id]}
	{#if step}
		<Timer
			{id}
			{index}
			endsAt={timerEnds[id] ?? null}
			{now}
			stepTitle={step.title}
			purpose={step.timer_purpose ?? step.goal}
			action={step.timer_action}
			location={step.timer_location}
			{bottomClearanceRem}
			onDismiss={() => dismiss(id)}
		/>
	{/if}
{/each}

{#if overflowCount > 0}
	<div
		class="fixed right-3 z-[74] rounded-full bg-amber-500/85 text-white text-[11px] font-semibold px-3 py-1 shadow-lg pointer-events-none"
		style="bottom: calc(4.5rem + env(safe-area-inset-bottom) + {bottomClearanceRem + VISIBLE_CAP * 3.75}rem);"
		aria-label={m.cookmode_timerstack_more_aria({ count: overflowCount })}
	>
		{m.cookmode_timerstack_more_label({ count: overflowCount })}
	</div>
{/if}
