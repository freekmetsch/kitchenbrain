<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import type { CookModeStep } from '$lib/types';
	import InstructionLines from './InstructionLines.svelte';
	import TimerChip from './TimerChip.svelte';

	type Props = {
		step: CookModeStep;
		index: number;
		current: boolean;
		timerActive: boolean;
		timerDone: boolean;
		timerRemaining?: number | null;
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
		onSelect,
		onStartTimer,
		onResetTimer
	}: Props = $props();
</script>

<li
	id={`cook-step-${index}`}
	class="relative scroll-mt-28 border-l-4 bg-base-100 transition-colors {current
		? 'border-primary bg-primary/5'
		: 'border-transparent'}"
>
	<button
		type="button"
		class="min-h-16 w-full rounded-lg px-4 py-4 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary {step.timer_seconds
			? 'pr-28'
			: ''}"
		aria-current={current ? 'step' : undefined}
		aria-label={m.cookmode_select_step_aria({ number: index + 1, goal: step.body })}
		onclick={onSelect}
	>
		{#if step.ingredients.length}
			<div class="mb-2 flex flex-wrap gap-2" aria-label={m.benchsheet_ingredients_label()}>
				{#each step.ingredients as ingredient}
					<span class="inline-flex min-h-9 items-center rounded-full border border-base-300 bg-base-100 px-3 py-1.5 text-base text-base-content/80">
						{ingredient}
					</span>
				{/each}
			</div>
		{/if}
		{#if current}<span class="badge badge-primary badge-sm mb-2">{m.cookmode_current_badge()}</span>{/if}
		<InstructionLines text={step.body || step.goal || step.title} />
	</button>
	{#if step.timer_seconds}
		<div class="absolute right-3 top-3">
			<TimerChip
				seconds={step.timer_seconds}
				active={timerActive}
				done={timerDone}
				remaining={timerRemaining}
				onStart={onStartTimer}
				onReset={onResetTimer}
			/>
		</div>
	{/if}
</li>
