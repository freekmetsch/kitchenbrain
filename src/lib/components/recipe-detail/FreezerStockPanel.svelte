<!--
	P4.3 freezer & stock panel: frozen-portion count vs target, the
	keep-stocked staple toggle + target portions editor (PATCH
	/api/recipes/[slug]), and the serve-from-freezer flow that pushes the
	serve-fresh items onto a week's shopping list. Parent applies the staple
	patch to its recipe state via onSaved (the payload mirrors the API body).
-->
<script lang="ts">
	import { base } from '$app/paths';
	import { invalidateAll } from '$app/navigation';
	import { untrack } from 'svelte';
	import SegmentedTabs from '$lib/components/ui/SegmentedTabs.svelte';
	import Icon from '$lib/components/ui/icons/Icon.svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import { m } from '$lib/paraglide/messages';
	import type { Recipe, Week } from './types';

	let {
		recipe,
		weeks,
		currentWeekStart,
		frozenPortions,
		hasRoles,
		serveFresh,
		onSaved,
		onOpenRolesAiEdit
	}: {
		recipe: Recipe;
		weeks: Week[];
		currentWeekStart: string;
		frozenPortions: number;
		hasRoles: boolean;
		serveFresh: Array<{ name: string; amount: string | null; unit: string | null }>;
		onSaved: (payload: { is_freezer_staple?: boolean; target_portions?: number }) => void;
		onOpenRolesAiEdit: () => void;
	} = $props();

	let stapleSaving = $state(false);
	let stapleError = $state('');
	let targetInput = $state(
		untrack(() => recipe.targetPortions ?? recipe.servings ?? 2)
	);
	let serveOpen = $state(false);
	let serveWeek = $state(untrack(() => weeks[0]?.weekStartDate ?? currentWeekStart));
	let serveWeekTabs = $derived(weeks.map((w) => ({ value: w.weekStartDate, label: w.label })));
	let serveSubmitting = $state(false);
	let serveAdded = $state(false);
	let serveError = $state('');

	// Switching the target week re-enables the add action — a success state
	// only applies to the week it was added for.
	$effect(() => {
		serveWeek;
		serveAdded = false;
		serveError = '';
	});

	function weekLabel(weekStartDate: string): string {
		return weeks.find((w) => w.weekStartDate === weekStartDate)?.label ?? m.recipes_freezer_week_of({ date: weekStartDate });
	}
	let belowTarget = $derived(
		recipe.isFreezerStaple &&
			recipe.targetPortions != null &&
			frozenPortions < recipe.targetPortions
	);

	async function patchFreezer(payload: {
		is_freezer_staple?: boolean;
		target_portions?: number;
	}) {
		stapleSaving = true;
		stapleError = '';
		try {
			const res = await fetch(`${base}/api/recipes/${recipe.slug}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				stapleError = body.message ?? m.recipes_freezer_toast_save_failed({ status: res.status });
				toast.error(stapleError);
			} else {
				onSaved(payload);
			}
		} catch {
			stapleError = m.recipes_toast_connection_failed();
			toast.error(stapleError);
		}
		stapleSaving = false;
	}

	function sanitizedTarget(): number {
		return Number.isFinite(targetInput) && targetInput >= 1
			? Math.round(targetInput)
			: (recipe.servings ?? 2);
	}

	async function toggleFreezerStaple(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const on = input.checked;
		await patchFreezer(
			on
				? { is_freezer_staple: true, target_portions: sanitizedTarget() }
				: { is_freezer_staple: false }
		);
		// PATCH failed → snap the checkbox back to the authoritative state.
		if (stapleError) input.checked = recipe.isFreezerStaple;
	}

	function saveTargetPortions() {
		const n = sanitizedTarget();
		targetInput = n;
		void patchFreezer({ target_portions: n });
	}

	async function addServeFreshToShopping() {
		serveSubmitting = true;
		serveError = '';
		try {
			const res = await fetch(`${base}/api/recipes/${recipe.slug}/serve-fresh`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ weekStart: serveWeek })
			});
			if (res.ok) {
				serveAdded = true;
				void invalidateAll();
			} else {
				const body = await res.json().catch(() => ({}));
				serveError = body.message ?? m.recipes_freezer_toast_generic_failed({ status: res.status });
				toast.error(serveError);
			}
		} catch {
			serveError = m.recipes_toast_connection_failed();
			toast.error(serveError);
		}
		serveSubmitting = false;
	}
</script>

<section class="px-3 pt-3">
	<div class="rounded-2xl border border-base-200 bg-base-100 p-3 flex flex-col gap-2">
		<div class="flex items-center justify-between gap-2">
			<span
				class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[13px] font-medium {belowTarget
					? 'border-warning/40 bg-warning/10 text-warning'
					: 'border-base-300/70 bg-base-200/60 text-base-content/60'}"
			>
				❄️
				{#if recipe.isFreezerStaple && recipe.targetPortions}
					{m.recipes_freezer_portions_of_target({ frozen: frozenPortions, target: recipe.targetPortions })}{belowTarget
						? m.recipes_freezer_below_target_suffix()
						: ''}
				{:else}
					{frozenPortions === 1
						? m.recipes_freezer_portion_singular_in_freezer({ count: frozenPortions })
						: m.recipes_freezer_portions_plural_in_freezer({ count: frozenPortions })}
				{/if}
			</span>
			<label class="flex items-center gap-2 py-1 min-h-8 cursor-pointer shrink-0">
				<span class="text-xs text-base-content/70">{m.recipes_freezer_keep_stocked_label()}</span>
				<input
					type="checkbox"
					class="toggle toggle-sm toggle-primary"
					checked={recipe.isFreezerStaple}
					disabled={stapleSaving}
					onchange={toggleFreezerStaple}
				/>
			</label>
		</div>
		{#if recipe.isFreezerStaple}
			<label class="flex items-center gap-2 min-h-8">
				<span class="text-xs text-base-content/70">{m.recipes_freezer_target_portions_label()}</span>
				<input
					type="number"
					min="1"
					inputmode="numeric"
					class="input input-bordered input-sm w-20"
					bind:value={targetInput}
					disabled={stapleSaving}
					onchange={saveTargetPortions}
				/>
			</label>
		{/if}
		{#if stapleError}
			<p class="text-[11px] text-error">{stapleError}</p>
		{/if}
		{#if frozenPortions > 0}
			{#if hasRoles}
				<div>
					<button
						type="button"
						class="btn btn-sm btn-primary"
						aria-expanded={serveOpen}
						onclick={() => {
							serveOpen = !serveOpen;
						}}>🍽️ {m.recipes_freezer_serve_button()}</button
					>
				</div>
			{:else}
				<button
					type="button"
					class="text-left text-[11px] text-base-content/50"
					onclick={onOpenRolesAiEdit}
				>
					🍽️ {m.recipes_freezer_needs_roles_prefix()}
					<span class="underline decoration-dotted underline-offset-2">{m.recipes_freezer_set_roles_link()}</span>
				</button>
			{/if}
		{/if}
		{#if serveOpen && hasRoles && frozenPortions > 0}
			{#if serveFresh.length > 0}
				<div class="flex flex-col gap-2">
					<p class="text-xs font-medium text-base-content/70">{m.recipes_freezer_fresh_needed_label()}</p>
					<ul class="text-sm flex flex-col gap-0.5">
						{#each serveFresh as item}
							<li class="flex items-baseline gap-2">
								<span>{item.name}</span>
								{#if item.amount || item.unit}
									<span class="text-xs text-base-content/50"
										>{[item.amount, item.unit].filter(Boolean).join(' ')}</span
									>
								{/if}
							</li>
						{/each}
					</ul>
					{#if serveAdded}
						<p class="text-xs text-success">
							{m.recipes_freezer_added_to_shopping({ week: weekLabel(serveWeek).toLowerCase() })}
						</p>
						<a
							class="btn btn-xs btn-outline self-start gap-1"
							href="{base}/shopping?week={serveWeek}"
						>
							<Icon name="cart" class="h-3.5 w-3.5" />
							{m.recipes_freezer_open_shopping_link()}
						</a>
					{:else}
						<div>
							<span class="text-xs text-base-content/70 mb-1 block">{m.recipes_freezer_add_to_week_label()}</span>
							<SegmentedTabs tabs={serveWeekTabs} value={serveWeek} onchange={(v) => (serveWeek = v)} />
						</div>
						<button
							class="btn btn-sm btn-outline btn-primary self-start"
							disabled={serveSubmitting}
							onclick={addServeFreshToShopping}
						>
							{#if serveSubmitting}
								<span class="loading loading-spinner loading-xs"></span>
							{/if}
							{m.recipes_freezer_add_to_shopping_button({ count: serveFresh.length })}
						</button>
					{/if}
					{#if serveError}
						<p class="text-[11px] text-error">{serveError}</p>
					{/if}
				</div>
			{:else}
				<p class="text-sm text-base-content/70">
					{m.recipes_freezer_nothing_fresh()}
				</p>
			{/if}
		{/if}
	</div>
</section>
