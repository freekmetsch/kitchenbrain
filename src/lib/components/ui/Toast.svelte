<script lang="ts">
	import { toast } from '$lib/stores/toast.svelte';

	const t = $derived(toast.current);

	// Dark neutral pill for success/undo (specimen), error surface for failures.
	const variantCls = $derived(
		t?.variant === 'error'
			? 'bg-error text-error-content'
			: 'bg-base-content text-base-100'
	);

	function runAction(a: NonNullable<typeof t>['action']) {
		toast.dismiss();
		a?.run();
	}
</script>

{#if t}
	<div
		class="ui-z-toast pointer-events-none fixed inset-x-0"
		style="bottom: calc(4.5rem + env(safe-area-inset-bottom, 0px))"
	>
		<div
			role={t.variant === 'error' ? 'alert' : 'status'}
			aria-live={t.variant === 'error' ? 'assertive' : 'polite'}
			class="pointer-events-auto mx-auto flex w-fit max-w-[92%] items-center gap-3 rounded-xl px-3.5 py-2 text-sm shadow-lg {variantCls}"
		>
			<span class="truncate">{t.msg}</span>
			{#if t.action}
				<button
					type="button"
					class="shrink-0 font-semibold underline-offset-2 hover:underline"
					onclick={() => runAction(t.action)}>{t.action.label}</button
				>
			{/if}
		</div>
	</div>
{/if}
