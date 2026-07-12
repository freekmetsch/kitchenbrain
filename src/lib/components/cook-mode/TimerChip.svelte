<!--
	Timer chip — shared right-column affordance for ComponentCard sub-rows and
	MergeCard. Three states: idle (start button with minute count), active
	(live countdown, tap to cancel), done (success badge with reset). Stops
	click propagation so the surrounding row tap-target doesn't fire on chip
	taps. All states keep a ≥ 40 px touch target — the chip sits inside the
	whole-row toggle button, so an undersized chip turns "start the timer"
	mistaps into "step done" toggles.
-->
<script lang="ts">
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
				onclick={(e) => {
					e.stopPropagation();
					onReset();
				}}
				aria-label="Reset timer"
			>
				<span>done</span>
				<span class="opacity-70">↺</span>
			</button>
		{:else if !active}
			<button
				type="button"
				class="inline-flex items-center min-h-10 px-3.5 py-1.5 rounded-full bg-amber-500 text-white text-[13px] font-semibold active:scale-95"
				onclick={(e) => {
					e.stopPropagation();
					onStart();
				}}
				aria-label="Start {Math.ceil(seconds / 60)} minute timer">⏱ {Math.ceil(seconds / 60)}m</button
			>
		{:else}
			<button
				type="button"
				class="inline-flex items-center gap-1.5 min-h-10 px-3 py-1.5 rounded-full border-2 border-amber-500 text-amber-600 text-[13px] font-mono font-semibold tabular-nums active:scale-95"
				onclick={(e) => {
					e.stopPropagation();
					onReset();
				}}
				aria-label="Cancel timer"
			>
				<span>{remaining != null ? fmtClock(remaining) : '⏱'}</span>
				<span class="text-[11px] opacity-70">✕</span>
			</button>
		{/if}
	</div>
{/if}
