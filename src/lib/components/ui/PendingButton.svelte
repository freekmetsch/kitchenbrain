<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';
	import Spinner from './Spinner.svelte';

	// Button that disables itself and shows a leading spinner while `pending`.
	// The label stays visible (spinner prepends), so adopting this needs no new
	// i18n copy. Semantic house-style classes pass through via `class`; any extra attributes
	// (aria-*, title, onclick, form) flow through `...rest`. `rest` is spread
	// first so the control props below always win.
	let {
		pending = false,
		type = 'button',
		disabled = false,
		class: klass = 'ui-action ui-action-primary',
		children,
		...rest
	}: {
		pending?: boolean;
		class?: string;
		children: Snippet;
	} & HTMLButtonAttributes = $props();
</script>

<button {...rest} {type} class={klass} disabled={pending || disabled}>
	{#if pending}<Spinner size="xs" label="Working" />{/if}
	{@render children()}
</button>
