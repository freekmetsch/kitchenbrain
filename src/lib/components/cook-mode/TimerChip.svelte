<!--
	Timer chip — shared right-column affordance for ComponentCard sub-rows and
	MergeCard. Three states: idle (start button with minute count), active
	(live countdown, tap to cancel), done (success badge with reset). Rendered
	as a SIBLING of the row's toggle button, never inside it — nesting a
	<button> in a <button> is invalid HTML the browser repairs at parse time,
	which breaks SSR hydration. All states keep a ≥ 40 px touch target — the
	chip sits flush against the whole-row toggle button, so an undersized chip
	turns "start the timer" mistaps into "step done" toggles.
-->
<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import { fmtClock } from './palette';

	type Props = {
		seconds: number | null;
		active: boolean;
		done: boolean;
		// Live remaining seconds while active (worker-driven, second-quantized).
		remaining?: number | null;
		hidden?: boolean;
		onStart: () => void;
		onReset: () => void;
	};
	let { seconds, active, done, remaining = null, hidden = false, onStart, onReset }: Props = $props();
</script>

{#if seconds && !hidden}
	<div class="shrink-0 flex flex-col items-end gap-1">
		{#if done}
			<button
				type="button"
				class="inline-flex items-center gap-1.5 min-h-10 px-3 py-1.5 rounded-full bg-success/20 text-success text-[12px] font-semibold active:scale-95"
				onclick={onReset}
				aria-label={m.cookmode_timerchip_reset_aria()}
			>
				<span>{m.cookmode_timerchip_done_label()}</span>
				<span class="opacity-70">↺</span>
			</button>
		{:else if !active}
			<button
				type="button"
				class="inline-flex items-center min-h-10 px-3.5 py-1.5 rounded-full bg-amber-500 text-white text-[13px] font-semibold active:scale-95"
				onclick={onStart}
				aria-label={m.cookmode_timerchip_start_exact_aria({ duration: fmtClock(seconds) })}>⏱ {fmtClock(seconds)}</button
			>
		{:else}
			<button
				type="button"
				class="inline-flex items-center gap-1.5 min-h-10 px-3 py-1.5 rounded-full border-2 border-amber-500 text-amber-600 text-[13px] font-mono font-semibold tabular-nums active:scale-95"
				onclick={onReset}
				aria-label={m.cookmode_cancel_timer_aria()}
			>
				<span>{remaining != null ? fmtClock(remaining) : '⏱'}</span>
				<span class="text-[11px] opacity-70">✕</span>
			</button>
		{/if}
	</div>
{/if}
