<!--
	Import-review banner: scrapeReview() flags gappy/non-Dutch imports on the row,
	but nothing surfaced it before. Show it until the user edits (auto-clears) or
	dismisses it here. Owns the dismiss PATCH; parent clears the flag on success
	via onDismissed.
-->
<script lang="ts">
	import { base } from '$app/paths';
	import { toast } from '$lib/stores/toast.svelte';

	let {
		slug,
		reason,
		onEditRaw,
		onDismissed
	}: {
		slug: string;
		reason: string | null;
		onEditRaw: () => void;
		onDismissed: () => void;
	} = $props();

	let reviewDismissing = $state(false);
	let reviewError = $state('');
	async function dismissReview() {
		reviewDismissing = true;
		reviewError = '';
		try {
			const res = await fetch(`${base}/api/recipes/${slug}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ dismiss_review: true })
			});
			if (res.ok) {
				onDismissed();
			} else {
				const body = await res.json().catch(() => ({}));
				reviewError = body.message ?? `Couldn't dismiss (${res.status})`;
				toast.error(reviewError);
			}
		} catch {
			reviewError = 'Connection failed — tap to retry';
			toast.error('Could not clear the review flag.');
		}
		reviewDismissing = false;
	}

	function reviewReason(r: string | null): string {
		if (!r) return 'Some fields may be incomplete.';
		const known: Record<string, string> = {
			missing_title: 'The title may need a check.',
			missing_ingredients: 'Ingredients may be incomplete.',
			missing_directions: 'Directions may be incomplete.',
			missing_servings: 'Servings may be missing.',
			flagged_by_ai: 'AI flagged this for a human check.'
		};
		return known[r] ?? r.replaceAll('_', ' ');
	}
</script>

<div class="mx-3 mt-3 rounded-xl border border-warning/40 bg-warning/10 px-3 py-2.5">
	<div class="flex items-start gap-2">
		<span class="text-base leading-none mt-0.5" aria-hidden="true">📝</span>
		<div class="min-w-0 flex-1">
			<p class="text-[13px] font-medium text-base-content">Imported — worth a quick check</p>
			<p class="text-[12px] text-base-content/70 leading-snug mt-0.5">
				{reviewReason(reason)}
			</p>
			<div class="flex gap-2 mt-2">
				<button class="btn btn-xs btn-warning" onclick={onEditRaw}>Edit recipe</button>
				<button
					class="btn btn-xs btn-ghost"
					disabled={reviewDismissing}
					onclick={dismissReview}
				>
					{#if reviewDismissing}
						<span class="loading loading-spinner loading-xs"></span>
					{/if}
					Looks good
				</button>
			</div>
			{#if reviewError}
				<p class="text-[11px] text-error mt-1.5">{reviewError}</p>
			{/if}
		</div>
	</div>
</div>
