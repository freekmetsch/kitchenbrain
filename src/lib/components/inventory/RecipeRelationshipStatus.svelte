<script lang="ts">
	import Icon from '$lib/components/ui/icons/Icon.svelte';
	import type { RecipeRelationshipKind } from './shared';

	let {
		relationship,
		label,
		showText = true,
		interactive = false,
		onactivate
	}: {
		relationship: RecipeRelationshipKind;
		label: string;
		showText?: boolean;
		interactive?: boolean;
		onactivate?: () => void;
	} = $props();

	const iconName = $derived(
		relationship === 'linked'
			? 'check'
			: relationship === 'planned'
				? 'clock'
				: relationship === 'not_needed'
					? 'minus'
					: 'warn'
	);
	const tone = $derived(
		relationship === 'unresolved'
			? 'border-warning/40 bg-warning/10 text-warning'
			: relationship === 'linked'
				? 'border-success/30 bg-success/10 text-success'
				: 'border-base-300/70 bg-base-200/60 text-base-content/60'
	);
</script>

{#if interactive}
	<button
		type="button"
		class="inline-flex min-h-9 items-center gap-1.5 rounded-full border px-2 font-medium transition-colors {tone}"
		aria-label={label}
		title={label}
		onclick={onactivate}
	>
		<Icon name={iconName} class="h-3.5 w-3.5 shrink-0" />
		{#if showText}<span>{label}</span>{/if}
	</button>
{:else}
	<span class="inline-flex items-center gap-1.5 whitespace-nowrap">
		<span class="inline-flex h-5 w-5 items-center justify-center rounded-full border {tone}">
			<Icon name={iconName} class="h-3 w-3" />
		</span>
		{#if showText}<span>{label}</span>{/if}
	</span>
{/if}
