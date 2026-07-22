<!--
	Full-width photo section under the sticky header. The image is the primary
	photo affordance (tap = replace, camera chip signals it); the no-photo state
	stays a compact add-photo row instead of a hollow hero block. Remove-photo
	lives in the header's overflow menu.
-->
<script lang="ts">
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import { m } from '$lib/paraglide/messages';
	import SmartImage from '$lib/components/ui/SmartImage.svelte';

	let {
		imageUrl,
		title,
		uploading,
		uploadError,
		onPickPhoto
	}: {
		imageUrl: string | null;
		title: string;
		uploading: boolean;
		uploadError: string;
		onPickPhoto: () => void;
	} = $props();
</script>

{#if imageUrl}
	<button
		type="button"
		class="relative block w-full aspect-[16/9] overflow-hidden bg-base-200 text-left"
		onclick={onPickPhoto}
		aria-label={m.recipes_header_replace_photo()}
	>
		<SmartImage src={imageUrl} alt={title} class="h-full w-full object-cover" />
		<span
			class="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-base-100/85 px-2.5 py-1 text-[11px] text-base-content/80 shadow-sm backdrop-blur"
		>
			{#if uploading}<Spinner size="xs" />{:else}<span aria-hidden="true">📷</span>{/if}
			{m.recipes_header_replace_photo()}
		</span>
	</button>
{:else}
	<button
		type="button"
		class="mx-3 mt-3 flex min-h-11 w-[calc(100%-1.5rem)] items-center justify-center gap-2 rounded-xl border border-dashed border-base-300 bg-base-200/40 px-3 py-2.5 text-sm text-base-content/60"
		onclick={onPickPhoto}
	>
		{#if uploading}<Spinner size="xs" />{:else}<span aria-hidden="true">📷</span>{/if}
		{m.recipes_header_add_photo()}
	</button>
{/if}
{#if uploadError}
	<p class="px-3 pt-2 text-[11px] text-error">{uploadError}</p>
{/if}
