<script lang="ts">
	import { base } from '$app/paths';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import { m } from '$lib/paraglide/messages';
	import type { AfterCookProposalDisplay } from '$lib/tool_display';
	import { onMount, untrack } from 'svelte';

	let {
		proposal,
		isLatest = true
	}: {
		proposal: AfterCookProposalDisplay;
		isLatest?: boolean;
	} = $props();

	let status = $state<AfterCookProposalDisplay['status']>(
		untrack(() => (isLatest ? proposal.status : 'superseded'))
	);
	let portions = $state(untrack(() => proposal.defaultEatenPortions));
	let busy = $state<'apply' | 'reject' | 'undo' | null>(null);
	let errorMessage = $state('');
	let receipt = $state<{ eatenPortions: number; remainingPortions: number } | null>(null);
	let statusChecked = $state(false);
	let active = $derived(isLatest && status === 'active');

	onMount(() => {
		let cancelled = false;
		if (!isLatest) {
			status = 'superseded';
			statusChecked = true;
			return;
		}
		void (async () => {
			try {
				const response = await fetch(
					`${base}/api/meal-plan/after-cook?token=${encodeURIComponent(proposal.token)}&mealId=${proposal.mealId}`
				);
				const body = response.ok ? await response.json() : null;
				if (!cancelled && status === 'active' && body?.status) status = body.status;
				else if (!cancelled && status === 'active' && !body?.status) status = 'expired';
			} catch {
				if (!cancelled) status = 'expired';
			} finally {
				if (!cancelled) statusChecked = true;
			}
		})();
		return () => {
			cancelled = true;
		};
	});

	function confidenceLabel(level: AfterCookProposalDisplay['recommendation']['confidence']) {
		if (level === 'high') return m.chat_meal_plan_confidence_high();
		if (level === 'medium') return m.chat_meal_plan_confidence_medium();
		return m.chat_meal_plan_confidence_low();
	}

	async function applyCheckout() {
		if (!statusChecked || !active || busy) return;
		if (
			!Number.isInteger(portions) ||
			portions < (proposal.availablePortions > 0 ? 1 : 0) ||
			portions > proposal.availablePortions
		) {
			errorMessage = m.chat_after_cook_invalid_portions();
			return;
		}
		busy = 'apply';
		errorMessage = '';
		try {
			const response = await fetch(`${base}/api/meal-plan/after-cook`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ token: proposal.token, eatenPortions: portions })
			});
			if (!response.ok) {
				status = response.status === 409 ? 'superseded' : 'active';
				errorMessage =
					response.status === 409
						? m.chat_after_cook_stale()
						: m.chat_after_cook_failed();
				return;
			}
			const body = await response.json();
			status = 'applied';
			receipt = {
				eatenPortions: body.receipt?.eatenPortions ?? portions,
				remainingPortions: body.receipt?.remainingPortions ?? 0
			};
		} catch {
			errorMessage = m.chat_after_cook_failed();
		} finally {
			busy = null;
		}
	}

	async function reject() {
		if (!statusChecked || !active || busy) return;
		busy = 'reject';
		errorMessage = '';
		try {
			const response = await fetch(`${base}/api/meal-plan/after-cook`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ token: proposal.token })
			});
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			status = 'rejected';
		} catch {
			errorMessage = m.chat_after_cook_failed();
		} finally {
			busy = null;
		}
	}

	async function undo() {
		if (status !== 'applied' || busy) return;
		busy = 'undo';
		errorMessage = '';
		try {
			const response = await fetch(`${base}/api/meal-plan/after-cook`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ token: proposal.token })
			});
			if (!response.ok) {
				errorMessage =
					response.status === 409
						? m.chat_after_cook_stale()
						: m.chat_after_cook_failed();
				return;
			}
			status = 'undone';
			receipt = null;
		} catch {
			errorMessage = m.chat_after_cook_failed();
		} finally {
			busy = null;
		}
	}
</script>

<section
	class="min-w-0 rounded-xl border border-base-300/70 bg-base-100/45 p-3"
	aria-label={m.chat_after_cook_title()}
	data-testid="after-cook-review"
>
	<header class="flex min-w-0 flex-wrap items-start justify-between gap-2">
		<div class="min-w-0">
			<h3 class="break-words text-sm font-semibold">{proposal.meal}</h3>
			<p class="mt-0.5 text-xs text-base-content/55">{proposal.cookedDate}</p>
		</div>
		<span class="badge badge-outline badge-sm shrink-0">
			{m.chat_meal_plan_confidence({
				level: confidenceLabel(proposal.recommendation.confidence)
			})}
		</span>
	</header>

	<div class="mt-3 grid min-w-0 gap-2 text-xs md:grid-cols-2">
		<section class="min-w-0 rounded-lg bg-base-200/55 p-2.5">
			<h4 class="font-semibold">{m.chat_meal_plan_why_now()}</h4>
			<p class="mt-1 break-words leading-relaxed">{proposal.recommendation.whyNow}</p>
		</section>
		<section class="min-w-0 rounded-lg bg-base-200/55 p-2.5">
			<h4 class="font-semibold">{m.chat_meal_plan_consequence()}</h4>
			<p class="mt-1 break-words leading-relaxed">{proposal.recommendation.consequence}</p>
		</section>
	</div>

	<section class="mt-2 rounded-lg border border-base-300/60 px-2.5 py-2 text-xs">
		<h4 class="font-semibold">{m.chat_meal_plan_evidence()}</h4>
		<ul class="mt-1 list-disc space-y-1 pl-4">
			{#each proposal.recommendation.evidence as fact}
				<li class="break-words">{fact}</li>
			{/each}
		</ul>
		{#if proposal.recommendation.uncertainty}
			<h4 class="mt-2 font-semibold">{m.chat_meal_plan_uncertainty()}</h4>
			<p class="mt-1 break-words text-base-content/65">
				{proposal.recommendation.uncertainty}
			</p>
		{/if}
	</section>

	{#if proposal.recommendation.alternatives.length > 0}
		<details class="mt-2 rounded-lg border border-base-300/60 px-2.5 py-2 text-xs">
			<summary class="min-h-6 cursor-pointer font-semibold">
				{m.chat_meal_plan_alternatives()}
			</summary>
			<ul class="mt-1 list-disc space-y-1 pl-4 text-base-content/65">
				{#each proposal.recommendation.alternatives as alternative}
					<li>{alternative}</li>
				{/each}
			</ul>
		</details>
	{/if}

	<div class="mt-3 rounded-xl border border-base-300/70 p-3">
		{#if proposal.availablePortions > 0}
			<label class="form-control min-w-0">
				<span class="label-text text-xs font-semibold">
					{m.chat_after_cook_eaten_portions()}
				</span>
				<input
					type="number"
					class="input input-bordered mt-1 min-h-11 w-full"
					min="1"
					max={proposal.availablePortions}
					step="1"
					bind:value={portions}
					disabled={!active || busy !== null}
				/>
			</label>
			<p class="mt-1 text-xs text-base-content/55">
				{m.chat_after_cook_available({ count: proposal.availablePortions })}
			</p>
		{:else}
			<p class="text-xs text-warning">{m.chat_after_cook_no_stock()}</p>
		{/if}
		<p class="mt-2 text-xs font-medium">{proposal.atomicity.consequence}</p>
	</div>

	{#if errorMessage}
		<p class="mt-2 text-xs text-error" role="alert">{errorMessage}</p>
	{/if}

	{#if active}
		<div class="mt-3 flex flex-wrap justify-end gap-2">
			<button
				type="button"
				class="btn btn-ghost min-h-11"
				disabled={!statusChecked || busy !== null}
				onclick={reject}
			>
				{m.chat_meal_plan_not_now()}
			</button>
			<button
				type="button"
				class="btn btn-primary min-h-11"
				disabled={!statusChecked || busy !== null}
				onclick={applyCheckout}
			>
				{#if busy === 'apply'}<Spinner size="xs" />{/if}
				{busy === 'apply' ? m.chat_after_cook_applying() : m.chat_after_cook_apply()}
			</button>
		</div>
	{:else if status === 'applied' && receipt}
		<p class="mt-3 text-xs font-medium text-success">
			{m.chat_after_cook_applied({
				eaten: receipt.eatenPortions,
				remaining: receipt.remainingPortions
			})}
		</p>
		<button
			type="button"
			class="btn btn-ghost btn-sm mt-1 min-h-11"
			disabled={busy !== null}
			onclick={undo}
		>
			{#if busy === 'undo'}<Spinner size="xs" />{/if}
			{busy === 'undo' ? m.chat_after_cook_undoing() : m.chat_after_cook_undo()}
		</button>
	{:else}
		<p class="mt-3 text-xs text-base-content/60">
			{status === 'undone'
				? m.chat_after_cook_undone()
				: status === 'rejected'
					? m.chat_after_cook_rejected()
					: m.chat_after_cook_stale()}
		</p>
	{/if}
</section>
