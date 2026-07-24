<script lang="ts">
	import { projectInstruction } from './instruction_projection';
	import TimerChip from './TimerChip.svelte';

	let {
		text,
		timerSeconds = null,
		timerPurpose = null,
		timerActive = false,
		timerDone = false,
		timerRemaining = null,
		onStartTimer = () => {},
		onResetTimer = () => {}
	}: {
		text: string;
		timerSeconds?: number | null;
		timerPurpose?: string | null;
		timerActive?: boolean;
		timerDone?: boolean;
		timerRemaining?: number | null;
		onStartTimer?: () => void;
		onResetTimer?: () => void;
	} = $props();
	let lines = $derived(projectInstruction(text));
	let timerLine = $derived.by(() => {
		if (!timerSeconds) return -1;
		if (!timerPurpose) return Math.max(0, lines.length - 1);
		const needle = timerPurpose.toLocaleLowerCase();
		return lines.findIndex((line) => line.segments.map((segment) => segment.text).join('').toLocaleLowerCase().includes(needle)) >= 0
			? lines.findIndex((line) => line.segments.map((segment) => segment.text).join('').toLocaleLowerCase().includes(needle))
			: Math.max(0, lines.length - 1);
	});
</script>

<div class="grid gap-2 text-lg leading-relaxed text-base-content/90">
	{#each lines as line, lineIndex}
		<p class="leading-relaxed">
			{#each line.segments as segment}
				{#if segment.kind === 'action'}<strong class="font-bold text-base-content">{segment.text}</strong>{:else}{segment.text}{/if}
			{/each}
			{#if lineIndex === timerLine}
				<span class="mx-1 inline-flex align-middle"><TimerChip seconds={timerSeconds} active={timerActive} done={timerDone} remaining={timerRemaining} onStart={onStartTimer} onReset={onResetTimer} /></span>
			{/if}
		</p>
	{/each}
</div>
