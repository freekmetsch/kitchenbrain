<!--
	Serve-from-freezer prompt — the eating-side twin of FreezePortionsModal.
	After a freezer-planned meal is marked cooked, ask how many portions came
	out of the freezer and POST /api/recipes/[slug]/consume so the stock count
	stays honest. Controlled: parent sets `slug`/`title`/`open`.
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
		maxPortions = 99,
		onConsumed
	}: {
		open?: boolean;
		slug: string;
		title: string;
		defaultPortions?: number;
		/** Frozen portions currently on hand — the take-out ceiling. */
		maxPortions?: number;
		onConsumed?: (consumed: number, remaining: number) => void;
	} = $props();

	let portions = $state(untrack(() => defaultPortions));
	let submitting = $state(false);
	let errorMsg = $state('');

	// Reset the count whenever a fresh prompt opens.
	$effect(() => {
		if (open) {
			portions = Math.max(1, Math.min(defaultPortions, maxPortions));
			errorMsg = '';
		}
	});

	function close() {
		open = false;
	}

	async function consume() {
		const n = Math.round(portions);
		if (!Number.isFinite(n) || n < 1) return;
		submitting = true;
		errorMsg = '';
		try {
			const res = await fetch(`${base}/api/recipes/${slug}/consume`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ portions: n })
			});
			if (!res.ok) {
				errorMsg = m.mealplan_consume_toast_failed();
			} else {
				const body = (await res.json()) as { consumed: number; remaining: number };
				onConsumed?.(body.consumed, body.remaining);
				close();
			}
		} catch {
			errorMsg = m.recipes_freeze_toast_connection_failed();
		}
		submitting = false;
	}
</script>

<BottomSheet bind:open title={m.mealplan_consume_heading()}>
	<p class="mb-4 text-sm text-base-content/60">
		{m.mealplan_consume_desc_prefix()} <span class="font-medium text-base-content/80">{title}</span>
		{m.mealplan_consume_desc_suffix({ count: maxPortions })}
	</p>

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
			disabled={portions >= maxPortions}
			onclick={() => (portions = Math.min(maxPortions, portions + 1))}>+</button
		>
	</div>

	{#if errorMsg}
		<p class="mb-2 text-center text-xs text-error">{errorMsg}</p>
	{/if}

	<button type="button" class="btn btn-primary btn-sm w-full" disabled={submitting} onclick={consume}>
		{#if submitting}<Spinner size="xs" />{/if}
		{m.mealplan_consume_button({ count: portions })}
	</button>
</BottomSheet>
