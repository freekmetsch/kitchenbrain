<script lang="ts">
	import type { Snippet } from 'svelte';
	import { m } from '$lib/paraglide/messages';

	let {
		open = $bindable(false),
		title,
		children,
		onclose
	}: {
		open?: boolean;
		title?: string;
		children: Snippet;
		onclose?: () => void;
	} = $props();

	let dialog = $state<HTMLDialogElement>();

	// Drive the native <dialog> from `open` — showModal() gives focus-trap +
	// Escape-to-close for free (the a11y contract this component owns).
	$effect(() => {
		if (!dialog) return;
		if (open && !dialog.open) dialog.showModal();
		else if (!open && dialog.open) dialog.close();
	});

	function handleClose() {
		open = false;
		onclose?.();
	}

	// Backdrop click (the ::backdrop region maps to the dialog element itself).
	function handleClick(e: MouseEvent) {
		if (e.target === dialog) open = false;
	}
</script>

<dialog
	bind:this={dialog}
	onclose={handleClose}
	onclick={handleClick}
	class="ui-z-sheet m-0 mx-auto mt-auto mb-0 w-full max-w-2xl bg-transparent p-0"
>
	<div
		class="max-h-[75dvh] overflow-y-auto rounded-t-2xl bg-base-100 shadow-2xl"
		style="padding-bottom: env(safe-area-inset-bottom)"
	>
		{#if title}
			<div class="flex items-center justify-between border-b border-base-200 px-4 py-3">
				<h2 class="text-sm font-semibold">{title}</h2>
				<button type="button" class="btn btn-ghost btn-sm h-8 min-h-0" onclick={() => (open = false)}
					>{m.ui_bottomsheet_close()}</button
				>
			</div>
		{/if}
		<div class="px-4 py-3">
			{@render children()}
		</div>
	</div>
</dialog>

<style>
	/* Slide-up entrance + fade-out exit via @starting-style / allow-discrete.
	   Older browsers skip the animation entirely (instant open/close) — the
	   showModal() behavior above is untouched. Durations are clamped globally
	   by the reduced-motion guard in app.css. */
	dialog {
		opacity: 0;
		translate: 0 1.25rem;
		transition:
			opacity 0.2s ease,
			translate 0.25s cubic-bezier(0.32, 0.72, 0, 1),
			overlay 0.25s ease allow-discrete,
			display 0.25s ease allow-discrete;
	}
	dialog[open] {
		opacity: 1;
		translate: 0 0;
	}
	@starting-style {
		dialog[open] {
			opacity: 0;
			translate: 0 1.25rem;
		}
	}
	dialog::backdrop {
		background-color: rgb(0 0 0 / 0);
		transition:
			background-color 0.25s ease,
			overlay 0.25s ease allow-discrete,
			display 0.25s ease allow-discrete;
	}
	dialog[open]::backdrop {
		background-color: rgb(0 0 0 / 0.3);
	}
	@starting-style {
		dialog[open]::backdrop {
			background-color: rgb(0 0 0 / 0);
		}
	}
</style>
