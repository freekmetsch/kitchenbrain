<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		secondary,
		primary
	}: {
		secondary: Snippet;
		primary: Snippet;
	} = $props();
</script>

<div class="ui-kitchen-header-rail" data-house-style="header-action-rail">
	<div class="ui-kitchen-header-rail-cell">
		{@render secondary()}
	</div>
	<div class="ui-kitchen-header-rail-cell">
		{@render primary()}
	</div>
</div>
