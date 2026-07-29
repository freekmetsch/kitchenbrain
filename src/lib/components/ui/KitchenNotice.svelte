<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		tone = 'info',
		flush = false,
		element = $bindable(),
		class: klass = '',
		children,
		...rest
	}: {
		tone?: 'info' | 'success' | 'warning' | 'error';
		flush?: boolean;
		element?: HTMLDivElement | null;
		class?: string;
		children: Snippet;
	} & HTMLAttributes<HTMLDivElement> = $props();
</script>

<div
	bind:this={element}
	{...rest}
	class="ui-kitchen-notice {klass}"
	class:ui-kitchen-notice-flush={flush}
	data-house-style="notice"
	data-tone={tone}
>
	{@render children()}
</div>
