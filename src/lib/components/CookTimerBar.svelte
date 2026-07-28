<script lang="ts">
	import { base } from '$app/paths';
	import { m } from '$lib/paraglide/messages';
	import type { CookTimerCoordinator } from '$lib/timer/cook-timer-coordinator.svelte';
	import { fmtClock } from './cook-mode/palette';

	let { coordinator }: { coordinator: CookTimerCoordinator } = $props();
	let timers = $derived(coordinator.visibleTimers);
	let timer = $derived(timers[0]);
</script>

{#if timer}
	<div
		class="flex min-h-14 items-center gap-2 border-t border-amber-500/30 bg-amber-50 px-3 py-1.5 text-amber-950 shadow-[0_-6px_18px_rgba(0,0,0,0.06)]"
		role="timer"
		aria-live={timer.done ? 'assertive' : 'off'}
	>
		<a
			class="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-lg px-2 hover:bg-amber-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700"
			href={`${base}/recipes/${timer.recipeSlug}`}
			aria-label={m.cook_timer_bar_return_aria({ recipe: timer.recipeTitle })}
		>
			<span class="min-w-0 flex-1">
				<span class="block truncate text-xs font-semibold uppercase tracking-wide">{timer.label}</span>
				<span class="block truncate text-[11px] text-amber-900/70">{timer.recipeTitle}</span>
			</span>
			<strong class="font-mono text-base tabular-nums">
				{timer.done ? m.cook_timer_bar_done() : fmtClock(timer.remainingSeconds)}
			</strong>
			{#if timers.length > 1}
				<span class="rounded-full bg-amber-200 px-2 py-0.5 text-[11px] font-semibold">
					+{timers.length - 1}
				</span>
			{/if}
		</a>
		<button
			type="button"
			class="btn btn-ghost h-11 min-h-0 w-11 shrink-0 p-0 text-lg"
			aria-label={timer.done
				? m.cook_timer_bar_dismiss_aria()
				: m.cook_timer_bar_cancel_aria()}
			onclick={() => coordinator.cancel(timer.sessionKey, timer.index)}
		>
			{timer.done ? '✓' : '✕'}
		</button>
	</div>
{/if}
