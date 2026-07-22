<script lang="ts">
	import type { CookModeStep } from '$lib/types';
	import { projectBody, projectGoal } from './instruction_projection';

	let { step }: { step: CookModeStep } = $props();
	let goal = $derived(projectGoal(step.goal));
	let body = $derived(projectBody(step.body, step.ingredient_names ?? []));
</script>

<p class="text-lg font-semibold leading-snug">
	{#each goal as segment}
		{#if segment.kind === 'action'}<strong>{segment.text}</strong>{:else}{segment.text}{/if}
	{/each}
</p>
{#if body.length}
	<div class="mt-2 grid gap-1 text-base leading-relaxed text-base-content/75">
		{#each body as line}
			<p>
				{#each line.segments as segment}
					{#if segment.kind === 'ingredient'}<u class="decoration-2 underline-offset-2">{segment.text}</u>{:else}{segment.text}{/if}
				{/each}
			</p>
		{/each}
	</div>
{/if}
