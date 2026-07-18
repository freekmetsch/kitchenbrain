<!--
	Slide-down AI edit bar. `open` and `value` are bindable because the parent
	drives both: the ⋯ menu opens the bar, and the roles hint in the freezer
	panel prefills the ask ("Mark each ingredient as cook-in or serve-fresh").
	Sending hands off to the chat route with the recipe title as context.
-->
<script lang="ts">
	import { base } from '$app/paths';
	import { goto } from '$app/navigation';
	import { slide } from 'svelte/transition';
	import { m } from '$lib/paraglide/messages';
	import PendingButton from '$lib/components/ui/PendingButton.svelte';
	import Icon from '$lib/components/ui/icons/Icon.svelte';

	let {
		open = $bindable(false),
		value = $bindable(''),
		recipeTitle
	}: {
		open?: boolean;
		value?: string;
		recipeTitle: string;
	} = $props();

	let sending = $state(false);

	function sendEditWithAi() {
		if (!value.trim() || sending) return;
		sending = true;
		const msg = `[Recipe: ${recipeTitle}]\n${value.trim()}`;
		goto(`${base}/?msg=${encodeURIComponent(msg)}`);
	}
</script>

{#if open}
	<div class="px-3 py-2 border-b border-base-200 bg-base-200/50 flex gap-2" transition:slide={{ duration: 150 }}>
		<input
			type="text"
			class="input input-bordered input-sm flex-1"
			placeholder={m.recipes_aiedit_placeholder()}
			bind:value
			disabled={sending}
			onkeydown={(e) => {
				if (e.key === 'Enter') sendEditWithAi();
			}}
		/>
		<PendingButton
			class="btn btn-sm btn-primary"
			pending={sending}
			disabled={!value.trim()}
			onclick={sendEditWithAi}>→</PendingButton
		>
		<button
			type="button"
			class="btn btn-sm btn-ghost border border-base-300"
			aria-label={m.recipes_aiedit_close_aria()}
			onclick={() => (open = false)}><Icon name="x" /></button
		>
	</div>
{/if}
