<!--
	Single beat row for the flat bench-sheet list.

	Renders ONE sub-action of a stream as one full-width row. The parent <ul>
	supplies the hairline between rows via `divide-y`; this component owns only
	its own row chrome:

	  - Persistent left color band (palette.bar) from the row's stream identity.
	  - Checkbox on the left (toggles done).
	  - Action-led `goal` headline as the dominant text.
	  - `body` (muted) below for supporting detail.
	  - Ingredient pills under the body.
	  - Timer chip on the right column (start / running / done states).

	Stream identity (the row's home) is communicated by the persistent left bar
	and by an inline ━━ STREAM NAME ━━ divider rendered by the parent above the
	first non-merge beat of each stream.
-->
<script lang="ts">
	import type { CookModeStep } from '$lib/types';
	import type { BeatPalette } from './palette';
	import TimerChip from './TimerChip.svelte';

	type Props = {
		step: CookModeStep;
		globalIdx: number;
		palette: BeatPalette;
		done: boolean;
		timerActive: boolean;
		timerDone: boolean;
		timerRemaining?: number | null;
		onToggle: (globalIdx: number) => void;
		onStartTimer: (globalIdx: number) => void;
		onResetTimer: (globalIdx: number) => void;
	};
	let {
		step,
		globalIdx,
		palette,
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
	<span class="absolute inset-y-0 left-0 w-1 {palette.bar} z-[1]" aria-hidden="true"></span>
	<!-- TimerChip is a flex sibling of the toggle button, not a child: a
	     <button> may not contain another <button>, and the browser's repair of
	     that nesting breaks Svelte's hydration. -->
	<div class="w-full pl-4 pr-3 py-2.5 flex items-start gap-3">
		<button
			type="button"
			class="flex-1 min-w-0 text-left flex items-start gap-3 active:scale-[0.99] transition"
			onclick={() => onToggle(globalIdx)}
		>
			<span
				class="shrink-0 w-5 h-5 rounded-md border-2 mt-0.5 flex items-center justify-center text-[11px] {done
					? 'bg-success border-success text-success-content'
					: 'border-base-300 bg-base-100'}">{done ? '✓' : ''}</span
			>
			<div class="flex-1 min-w-0">
				<p
					class="text-[14px] font-semibold leading-snug {done
						? 'line-through text-base-content/40'
						: ''}"
				>
					{step.goal}
				</p>
				{#if step.body && !done}
					<p class="text-[12px] text-base-content/60 leading-snug mt-1">{step.body}</p>
				{/if}
				{#if step.ingredients.length && !done}
					<div class="flex flex-wrap gap-1 mt-1.5">
						{#each step.ingredients as ing}
							<span
								class="text-[11px] px-1.5 py-0.5 rounded-full bg-base-100 border {palette.border} text-base-content/80"
								>{ing}</span
							>
						{/each}
					</div>
				{/if}
			</div>
		</button>
		<TimerChip
			seconds={step.timer_seconds}
			active={timerActive}
			done={timerDone}
			remaining={timerRemaining}
			hidden={done}
			onStart={() => onStartTimer(globalIdx)}
			onReset={() => onResetTimer(globalIdx)}
		/>
	</div>
</li>
