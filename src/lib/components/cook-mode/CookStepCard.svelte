<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import type { CookModeStep } from '$lib/types';
	import InstructionLines from './InstructionLines.svelte';
	import type { BeatPalette } from './palette';

	type Props = {
		step: CookModeStep;
		index: number;
		current: boolean;
		timerActive: boolean;
		timerDone: boolean;
		timerRemaining?: number | null;
		palette: BeatPalette;
		streamName?: string | null;
		mergeNames?: string[];
		onSelect: () => void;
		onStartTimer: () => void;
		onResetTimer: () => void;
	};

	let {
		step,
		index,
		current,
		timerActive,
		timerDone,
		timerRemaining = null,
		palette,
		streamName = null,
		mergeNames = [],
		onSelect,
		onStartTimer,
		onResetTimer
	}: Props = $props();
</script>

<li
	id={`cook-step-${index}`}
	class="relative overflow-hidden rounded-2xl border border-base-300/70 bg-base-100 transition-all {current
		? 'translate-y-[-1px] shadow-lg ring-2 ring-primary/35'
		: 'shadow-sm'}"
	style="scroll-margin-top: 1rem"
>
	<div class="absolute inset-y-0 left-0 w-1.5 {palette.bar}" aria-hidden="true"></div>
	<button
		type="button"
		class="absolute inset-0 z-0 rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
		aria-current={current ? 'step' : undefined}
		aria-label={m.cookmode_select_step_aria({ number: index + 1, goal: step.body })}
		onclick={onSelect}
	></button>
	<div class="relative z-10 pointer-events-none min-h-20 px-4 py-4 pl-5 text-left">
		<div class="mb-2 flex items-center gap-2">
			<span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-bold tabular-nums {palette.soft} {palette.text}">
				{index + 1}
			</span>
			{#if streamName}
				<span class="text-[11px] font-semibold uppercase tracking-wide {palette.text}">{streamName}</span>
			{/if}
			{#if mergeNames.length > 1}
				<span class="text-[11px] text-base-content/50">← {mergeNames.join(' + ')}</span>
			{/if}
		</div>
		{#if step.ingredients.length}
			<div class="mb-2 flex flex-wrap gap-1.5" aria-label={m.benchsheet_ingredients_label()}>
				{#each step.ingredients as ingredient}
					<span class="inline-flex min-h-8 items-center rounded-full border bg-base-100 px-2.5 py-1 text-sm font-normal text-base-content/75 {palette.border}">
						{ingredient}
					</span>
				{/each}
			</div>
		{/if}
		<InstructionLines
			text={step.body || step.goal || step.title}
			timerSeconds={step.timer_seconds}
			timerPurpose={step.timer_purpose}
			timerActive={timerActive}
			timerDone={timerDone}
			timerRemaining={timerRemaining}
			onStartTimer={onStartTimer}
			onResetTimer={onResetTimer}
		/>
	</div>
</li>
