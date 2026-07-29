<script lang="ts">
	import Icon from '$lib/components/ui/icons/Icon.svelte';
	import StatusBadge from '$lib/components/ui/StatusBadge.svelte';
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
</script>

{#if interactive}
	<button
		type="button"
		class="ui-action ui-action-tertiary"
		aria-label={label}
		title={label}
		onclick={onactivate}
	>
		<Icon name={iconName} class="h-3.5 w-3.5 shrink-0" />
		{#if showText}<span>{label}</span>{/if}
	</button>
{:else}
	<StatusBadge
		tone={relationship === 'unresolved'
			? 'warning'
			: relationship === 'linked'
				? 'success'
				: 'neutral'}
		class="whitespace-nowrap"
	>
		<Icon name={iconName} class="h-3 w-3" />
		{#if showText}<span>{label}</span>{/if}
	</StatusBadge>
{/if}
