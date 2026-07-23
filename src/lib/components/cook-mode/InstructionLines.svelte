<script lang="ts">
	import { projectInstruction } from './instruction_projection';

	let { text }: { text: string } = $props();
	let lines = $derived(projectInstruction(text));
</script>

<div class="grid gap-2 text-lg leading-relaxed text-base-content/90">
	{#each lines as line}
		<p>
			{#each line.segments as segment}
				{#if segment.kind === 'action'}<strong class="font-bold text-base-content">{segment.text}</strong>{:else}{segment.text}{/if}
			{/each}
		</p>
	{/each}
</div>
