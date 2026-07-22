<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import type { CookModeStep } from '$lib/types';
	import type { BeatPalette } from './palette';
	import InstructionLines from './InstructionLines.svelte';
	import TimerChip from './TimerChip.svelte';

	type Props = {
		step: CookModeStep;
		globalIdx: number;
		palette: BeatPalette;
		done: boolean;
		current: boolean;
		timerActive: boolean;
		timerDone: boolean;
		timerRemaining?: number | null;
		onToggle: (globalIdx: number) => void;
		onSelect: (globalIdx: number) => void;
		onStartTimer: (globalIdx: number) => void;
		onResetTimer: (globalIdx: number) => void;
		ingredientChecks: Record<number, boolean>;
		onToggleIngredient: (ingredientIndex: number) => void;
	};
	let {
		step, globalIdx, palette, done, current, timerActive, timerDone, timerRemaining = null,
		onToggle, onSelect, onStartTimer, onResetTimer, ingredientChecks, onToggleIngredient
	}: Props = $props();
</script>

<li id={`cook-step-${globalIdx}`} class="relative scroll-mt-28 bg-base-100 transition-colors {current ? 'outline-2 outline-offset-[-2px] outline-primary bg-primary/5' : ''} {done && !current ? 'bg-base-200/45 text-base-content/65' : ''}">
	<span class="absolute inset-y-0 left-0 z-[1] w-1 {palette.bar}" aria-hidden="true"></span>
	<div class="flex w-full items-start gap-2 py-3 pl-3 pr-3">
		<button
			type="button"
			class="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
			aria-label={done ? m.cookmode_reopen_step_aria({ number: globalIdx + 1 }) : m.cookmode_complete_step_aria({ number: globalIdx + 1 })}
			aria-pressed={done}
			onclick={() => onToggle(globalIdx)}
		>
			<span class="flex h-6 w-6 items-center justify-center rounded-md border-2 text-xs {done ? 'border-success bg-success text-success-content' : 'border-base-300 bg-base-100'}" aria-hidden="true">{done ? '✓' : ''}</span>
		</button>
		<div class="min-w-0 flex-1">
			{#if step.ingredients.length && (!done || current)}
				<div class="mb-2 flex flex-wrap gap-2">
					{#each step.ingredients as ing, index}
						{@const ingredientIndex = step.ingredient_indexes?.[index]}
						{#if ingredientIndex == null}
							<span class="flex min-h-11 items-center rounded-full border bg-base-100 px-3 py-2 text-base {palette.border}">{ing}</span>
						{:else}
							<button type="button" class="min-h-11 rounded-full border bg-base-100 px-3 py-2 text-base {palette.border} {ingredientChecks[ingredientIndex] ? 'text-base-content/45' : 'text-base-content/85'}" aria-pressed={!!ingredientChecks[ingredientIndex]} onclick={() => onToggleIngredient(ingredientIndex)}>{ingredientChecks[ingredientIndex] ? '✓ ' : ''}{ing}</button>
						{/if}
					{/each}
				</div>
			{/if}
			<button type="button" class="min-h-11 w-full text-left" aria-current={current ? 'step' : undefined} aria-label={m.cookmode_select_step_aria({ number: globalIdx + 1, goal: step.goal })} onclick={() => onSelect(globalIdx)}>
				{#if current}<span class="badge badge-primary badge-sm mb-1">{m.cookmode_current_badge()}</span>{/if}
				{#if done && !current}<p class="text-base font-medium leading-snug"><span aria-hidden="true">✓ </span>{step.goal}</p>{:else}<InstructionLines {step} />{/if}
			</button>
		</div>
		<TimerChip seconds={step.timer_seconds} active={timerActive} done={timerDone} remaining={timerRemaining} hidden={done} onStart={() => onStartTimer(globalIdx)} onReset={() => onResetTimer(globalIdx)} />
	</div>
</li>
