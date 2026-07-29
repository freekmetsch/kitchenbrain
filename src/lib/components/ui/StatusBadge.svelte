<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		tone = 'neutral',
		onDark = false,
		class: klass = '',
		children,
		...rest
	}: {
		tone?: 'neutral' | 'success' | 'warning' | 'error' | 'info';
		onDark?: boolean;
		class?: string;
		children: Snippet;
	} & HTMLAttributes<HTMLSpanElement> = $props();
</script>

<span
	{...rest}
	class="ui-status-badge {klass}"
	class:ui-status-badge-on-dark={onDark}
	data-house-style="status-badge"
	data-tone={tone}
>
	{@render children()}
</span>
