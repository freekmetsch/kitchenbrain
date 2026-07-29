<script lang="ts">
	import { base } from '$app/paths';
	import { onMount } from 'svelte';
	import { m } from '$lib/paraglide/messages';
	import {
		cookingRescue,
		type CookingRescue,
		type CookingRescueIssue
	} from './cooking_rescue';

	let {
		recipeSlug,
		stepIndex,
		step,
		ingredients,
		language
	}: {
		recipeSlug: string;
		stepIndex: number;
		step: string;
		ingredients: string[];
		language: 'en' | 'nl';
	} = $props();

	let issue = $state<CookingRescueIssue | null>(null);
	let ready = $state(false);
	let rescue = $derived<CookingRescue | null>(
		issue ? cookingRescue({ issue, language, step, ingredients }) : null
	);
	let assistantHref = $derived(
		issue
			? `${base}/?cook_recipe=${encodeURIComponent(recipeSlug)}&cook_step=${stepIndex}&cook_issue=${issue}`
			: `${base}/`
	);

	onMount(() => {
		ready = true;
	});
</script>

<details class="mb-3 rounded-2xl border border-warning/30 bg-warning/5">
	<summary class="min-h-12 cursor-pointer px-4 py-3 font-semibold">{m.cook_rescue_title()}</summary>
	<div class="border-t border-warning/20 p-3">
		<p class="text-xs text-base-content/65">{m.cook_rescue_hint()}</p>
		<div class="mt-3 grid grid-cols-3 gap-2">
			<button
				class="btn min-h-12 px-2 {issue === 'too_salty' ? 'btn-warning' : 'btn-outline'}"
				type="button"
				disabled={!ready}
				onclick={() => (issue = 'too_salty')}
			>
				{m.cook_rescue_too_salty()}
			</button>
			<button
				class="btn min-h-12 px-2 {issue === 'too_thin' ? 'btn-warning' : 'btn-outline'}"
				type="button"
				disabled={!ready}
				onclick={() => (issue = 'too_thin')}
			>
				{m.cook_rescue_too_thin()}
			</button>
			<button
				class="btn min-h-12 px-2 {issue === 'not_browning' ? 'btn-warning' : 'btn-outline'}"
				type="button"
				disabled={!ready}
				onclick={() => (issue = 'not_browning')}
			>
				{m.cook_rescue_not_browning()}
			</button>
		</div>
		{#if rescue}
			<div class="mt-3 rounded-xl bg-base-100/75 p-3 text-sm">
				<p class="font-medium">{rescue.whyNow}</p>
				<ul class="mt-2 list-disc space-y-1 pl-4">
					{#each rescue.guidance as guidance}
						<li>{guidance}</li>
					{/each}
				</ul>
				{#if rescue.safetyCaution}
					<p class="mt-2 rounded-lg bg-warning/10 p-2 text-xs">
						<strong>{m.cook_rescue_safety()}:</strong> {rescue.safetyCaution}
					</p>
				{/if}
				<a class="btn btn-ghost btn-sm mt-2 min-h-11 text-primary" href={assistantHref}>
					{m.cook_rescue_ask_assistant()}
				</a>
			</div>
		{/if}
	</div>
</details>
