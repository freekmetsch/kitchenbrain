<!--
	Merge / plate row for the flat bench-sheet list.

	Renders ONE step whose `merges_from` lists ≥ 2 stream_ids — a convergence
	point ("Plate", "Combine", "Fold X through Y"). Sits inline in the parent
	<ul class="divide-y"> at its original step order; hairlines come from the
	parent.

	Chrome:
	  - Top stripe split into N flex segments, one per merging stream's `bar`
	    color (V9-V1 multi-color crown).
	  - Multi-segment side bar on the left edge: N stacked flex-1 colored
	    segments, one per merging stream — keeps stream identity affordance
	    consistent with single-stream rows even at the moment streams converge.
	  - "Plate · Stream A + Stream B" superscript above the goal, with each
	    name rendered in its source stream's palette.text color (WCAG-AA via
	    text-{color}-700 shades from the palette).
	  - Action-led `goal` headline (large, semibold), body, ingredient pills,
	    timer chip — same affordances as a sub-action row.
-->
<script lang="ts">
	import type { CookModeStep } from '$lib/types';
	import type { BeatPalette } from './palette';
	import TimerChip from './TimerChip.svelte';

	type Props = {
		step: CookModeStep;
		mergesFromPalettes: BeatPalette[];
		streamNames: string[];
		done: boolean;
		timerActive: boolean;
		timerDone: boolean;
		timerRemaining?: number | null;
		onToggle: () => void;
		onStartTimer: () => void;
		onResetTimer: () => void;
	};
	let {
		step,
		mergesFromPalettes,
		streamNames,
		done,
		timerActive,
		timerDone,
		timerRemaining = null,
		onToggle,
		onStartTimer,
		onResetTimer
	}: Props = $props();
</script>

<li class="relative bg-base-100 {done ? 'opacity-60' : ''}">
	{#if mergesFromPalettes.length}
		<div class="flex h-1.5 w-full" aria-hidden="true">
			{#each mergesFromPalettes as p}
				<span class="flex-1 {p.bar}"></span>
			{/each}
		</div>
		<span
			class="absolute inset-y-0 left-0 w-1 flex flex-col z-[1]"
			aria-hidden="true"
		>
			{#each mergesFromPalettes as p}
				<span class="flex-1 {p.bar}"></span>
			{/each}
		</span>
	{/if}

	<button
		type="button"
		class="w-full text-left pl-4 pr-3 py-2.5 flex items-start gap-3 active:scale-[0.99] transition"
		onclick={onToggle}
	>
		<span
			class="shrink-0 w-5 h-5 rounded-md border-2 mt-0.5 flex items-center justify-center text-[11px] {done
				? 'bg-success border-success text-success-content'
				: 'border-base-300 bg-base-100'}">{done ? '✓' : ''}</span
		>
		<div class="flex-1 min-w-0">
			{#if streamNames.length}
				<!-- "From", not "Plate": mid-recipe merges (wet + dry → batter) are
				     combines, only the final merge is plating. -->
				<p class="text-[10px] uppercase tracking-wider font-bold text-base-content/50 mb-0.5">
					<span>From </span>
					{#each streamNames as name, i}
						<span class={mergesFromPalettes[i]?.text ?? 'text-base-content/70'}>{name}</span>
						{#if i < streamNames.length - 1}<span class="text-base-content/40"> + </span>{/if}
					{/each}
				</p>
			{/if}
			<p
				class="text-[15px] font-semibold leading-snug {done
					? 'line-through text-base-content/40'
					: ''}"
			>
				{step.goal}
			</p>
			{#if step.body && !done}
				<p class="text-[13px] text-base-content/70 leading-snug mt-1">{step.body}</p>
			{/if}
			{#if step.ingredients.length && !done}
				<div class="flex flex-wrap gap-1 mt-2">
					{#each step.ingredients as ing}
						<span
							class="text-[11px] px-1.5 py-0.5 rounded-full bg-base-100 border border-base-300 text-base-content/80"
							>{ing}</span
						>
					{/each}
				</div>
			{/if}
		</div>
		<TimerChip
			seconds={step.timer_seconds}
			active={timerActive}
			done={timerDone}
			remaining={timerRemaining}
			hidden={done}
			onStart={onStartTimer}
			onReset={onResetTimer}
		/>
	</button>
</li>
