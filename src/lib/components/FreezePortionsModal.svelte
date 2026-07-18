<!--
	P4.1 — freeze-from-cook prompt. After a batch meal is marked cooked, offer to
	freeze N portions as a leftover linked to the recipe. One tap → POST
	/api/recipes/[slug]/freeze. Controlled: parent sets `slug`/`title`/`open`.
-->
<script lang="ts">
	import { base } from '$app/paths';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
	import { m } from '$lib/paraglide/messages';
	import { untrack } from 'svelte';

	let {
		open = $bindable(false),
		slug,
		title,
		defaultPortions = 2,
		targets = [],
		onFrozen
	}: {
		open?: boolean;
		slug: string;
		title: string;
		defaultPortions?: number;
		// Meal Recipe attribution (ADR 0003): when the cooked recipe is a meal,
		// the leftover should link to the sub-recipe it came from (leftover taco
		// meat → the meat recipe). Pass [meal, ...subRecipes]; first entry is
		// the default. Empty/single = no picker, freeze to `slug` as before.
		targets?: { slug: string; title: string }[];
		onFrozen?: (portions: number) => void;
	} = $props();

	let portions = $state(untrack(() => defaultPortions));
	let submitting = $state(false);
	let errorMsg = $state('');
	let targetSlug = $state(untrack(() => slug));

	// Reset the count whenever a fresh prompt opens.
	$effect(() => {
		if (open) {
			portions = defaultPortions;
			errorMsg = '';
			targetSlug = targets[0]?.slug ?? slug;
		}
	});

	function close() {
		open = false;
	}

	async function freeze() {
		const n = Math.round(portions);
		if (!Number.isFinite(n) || n < 1) return;
		submitting = true;
		errorMsg = '';
		try {
			const res = await fetch(`${base}/api/recipes/${targets.length > 1 ? targetSlug : slug}/freeze`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ portions: n })
			});
			if (!res.ok) {
				errorMsg = m.recipes_freeze_toast_add_failed();
			} else {
				onFrozen?.(n);
				close();
			}
		} catch {
			errorMsg = m.recipes_freeze_toast_connection_failed();
		}
		submitting = false;
	}
</script>

<BottomSheet bind:open title={m.recipes_freeze_heading()}>
	<p class="mb-4 text-sm text-base-content/60">
		{m.recipes_freeze_desc_prefix()} <span class="font-medium text-base-content/80">{title}</span>
		{m.recipes_freeze_desc_suffix()}
	</p>

	{#if targets.length > 1}
		<div class="mb-4 flex flex-col gap-1.5">
					<span class="text-[11px] font-semibold uppercase tracking-wide text-base-content/50"
						>{m.recipes_freeze_link_label()}</span
					>
					{#each targets as t (t.slug)}
						<label
							class="flex items-center gap-2.5 rounded-xl border px-3 py-2 cursor-pointer {targetSlug ===
							t.slug
								? 'border-primary bg-primary/5'
								: 'border-base-300'}"
						>
							<input
								type="radio"
								class="radio radio-xs radio-primary"
								bind:group={targetSlug}
								value={t.slug}
							/>
							<span class="text-sm">{t.title}</span>
						</label>
					{/each}
		</div>
	{/if}

	<div class="mb-4 flex items-center justify-center gap-3">
				<button
					type="button"
					class="btn btn-circle btn-sm btn-ghost border border-base-300"
					aria-label={m.recipes_freeze_fewer_aria()}
					disabled={portions <= 1}
					onclick={() => (portions = Math.max(1, portions - 1))}>−</button
				>
				<div class="text-center tabular-nums">
					<div class="text-3xl font-bold leading-none">{portions}</div>
					<div class="text-[11px] text-base-content/50">{portions === 1 ? m.recipes_freeze_unit_singular() : m.recipes_freeze_unit_plural()}</div>
				</div>
				<button
					type="button"
					class="btn btn-circle btn-sm btn-ghost border border-base-300"
					aria-label={m.recipes_freeze_more_aria()}
					onclick={() => (portions = portions + 1)}>+</button
				>
	</div>

	{#if errorMsg}
		<p class="mb-2 text-center text-xs text-error">{errorMsg}</p>
	{/if}

	<button type="button" class="btn btn-primary btn-sm w-full" disabled={submitting} onclick={freeze}>
		{#if submitting}<Spinner size="xs" />{/if}
		{m.recipes_freeze_button({ count: portions })}
	</button>
</BottomSheet>
