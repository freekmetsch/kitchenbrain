<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import type { CookModeStep } from '$lib/types';
	import type { BeatPalette } from './palette';
	import InstructionLines from './InstructionLines.svelte';
	import TimerChip from './TimerChip.svelte';

	type Props = {
		step: CookModeStep;
		globalIdx: number;
		mergesFromPalettes: BeatPalette[];
		streamNames: string[];
		done: boolean;
		current: boolean;
		timerActive: boolean;
		timerDone: boolean;
		timerRemaining?: number | null;
		onToggle: () => void;
		onSelect: () => void;
		onStartTimer: () => void;
		onResetTimer: () => void;
		resultPalette: BeatPalette;
		ingredientChecks: Record<number, boolean>;
		onToggleIngredient: (ingredientIndex: number) => void;
	};
	let {
		step, globalIdx, mergesFromPalettes, streamNames, done, current, timerActive, timerDone,
		timerRemaining = null, onToggle, onSelect, onStartTimer, onResetTimer, resultPalette,
		ingredientChecks, onToggleIngredient
	}: Props = $props();
</script>

<li id={`cook-step-${globalIdx}`} class="relative scroll-mt-28 bg-base-100 transition-colors {current ? 'outline-2 outline-offset-[-2px] outline-primary bg-primary/5' : ''} {done && !current ? 'bg-base-200/45 text-base-content/65' : ''}">
	{#if mergesFromPalettes.length}
		<div class="h-1.5 w-full {resultPalette.bar}" aria-hidden="true"></div>
		<div class="flex h-1.5 w-full" aria-hidden="true">{#each mergesFromPalettes as palette}<span class="flex-1 {palette.bar}"></span>{/each}</div>
		<span class="absolute inset-y-0 left-0 z-[1] flex w-1 flex-col" aria-hidden="true">{#each mergesFromPalettes as palette}<span class="flex-1 {palette.bar}"></span>{/each}</span>
	{/if}
	<div class="flex w-full items-start gap-2 py-3 pl-3 pr-3">
		<button type="button" class="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" aria-label={done ? m.cookmode_reopen_step_aria({ number: globalIdx + 1 }) : m.cookmode_complete_step_aria({ number: globalIdx + 1 })} aria-pressed={done} onclick={onToggle}>
			<span class="flex h-6 w-6 items-center justify-center rounded-md border-2 text-xs {done ? 'border-success bg-success text-success-content' : 'border-base-300 bg-base-100'}" aria-hidden="true">{done ? '✓' : ''}</span>
		</button>
		<div class="min-w-0 flex-1">
			{#if streamNames.length}<p class="mb-2 text-xs font-bold uppercase tracking-wider text-base-content/55"><span>{m.cookmode_merge_from_prefix()}</span> {#each streamNames as name, index}<span class={mergesFromPalettes[index]?.text ?? 'text-base-content/70'}>{name}</span>{#if index < streamNames.length - 1}<span class="text-base-content/40"> + </span>{/if}{/each}</p>{/if}
			{#if step.ingredients.length && (!done || current)}
				<div class="mb-2 flex flex-wrap gap-2">
					{#each step.ingredients as ing, index}
						{@const ingredientIndex = step.ingredient_indexes?.[index]}
						{#if ingredientIndex == null}<span class="flex min-h-11 items-center rounded-full border border-base-300 bg-base-100 px-3 py-2 text-base">{ing}</span>{:else}<button type="button" class="min-h-11 rounded-full border border-base-300 bg-base-100 px-3 py-2 text-base {ingredientChecks[ingredientIndex] ? 'text-base-content/45' : 'text-base-content/85'}" aria-pressed={!!ingredientChecks[ingredientIndex]} onclick={() => onToggleIngredient(ingredientIndex)}>{ingredientChecks[ingredientIndex] ? '✓ ' : ''}{ing}</button>{/if}
					{/each}
				</div>
			{/if}
			<button type="button" class="min-h-11 w-full text-left" aria-current={current ? 'step' : undefined} aria-label={m.cookmode_select_step_aria({ number: globalIdx + 1, goal: step.goal })} onclick={onSelect}>
				{#if current}<span class="badge badge-primary badge-sm mb-1">{m.cookmode_current_badge()}</span>{/if}
				{#if done && !current}<p class="text-base font-medium leading-snug"><span aria-hidden="true">✓ </span>{step.goal}</p>{:else}<InstructionLines {step} />{/if}
			</button>
		</div>
		<TimerChip seconds={step.timer_seconds} active={timerActive} done={timerDone} remaining={timerRemaining} hidden={done} onStart={onStartTimer} onReset={onResetTimer} />
	</div>
</li>
