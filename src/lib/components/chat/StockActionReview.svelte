<script lang="ts">
	import { base } from '$app/paths';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import { m } from '$lib/paraglide/messages';
	import type { StockActionProposalDisplay } from '$lib/tool_display';
	import { onMount, untrack } from 'svelte';

	let {
		proposal,
		isLatest = true
	}: {
		proposal: StockActionProposalDisplay;
		isLatest?: boolean;
	} = $props();

	let selected = $state<Record<string, boolean>>(
		untrack(() => Object.fromEntries(proposal.operations.map((operation) => [operation.id, true])))
	);
	let status = $state<StockActionProposalDisplay['status']>(
		untrack(() => (isLatest ? proposal.status : 'superseded'))
	);
	let busy = $state<'apply' | 'reject' | 'undo' | null>(null);
	let errorMessage = $state('');
	let selectedCount = $derived(Object.values(selected).filter(Boolean).length);
	let active = $derived(isLatest && status === 'active');

	onMount(() => {
		let cancelled = false;
		if (!isLatest) {
			status = 'superseded';
			return;
		}
		void (async () => {
			try {
				const response = await fetch(
					`${base}/api/stock/proposal?token=${encodeURIComponent(proposal.token)}`
				);
				const body = response.ok ? await response.json() : null;
				if (!cancelled && body?.status) status = body.status;
				else if (!cancelled) status = 'expired';
			} catch {
				if (!cancelled) status = 'expired';
			}
		})();
		return () => {
			cancelled = true;
		};
	});

	function confidenceLabel(level: StockActionProposalDisplay['recommendation']['confidence']) {
		if (level === 'high') return m.chat_meal_plan_confidence_high();
		if (level === 'medium') return m.chat_meal_plan_confidence_medium();
		return m.chat_meal_plan_confidence_low();
	}

	async function applySelected() {
		if (!active || busy) return;
		const operationIds = proposal.operations
			.filter((operation) => selected[operation.id])
			.map((operation) => operation.id);
		if (!operationIds.length) return;
		busy = 'apply';
		errorMessage = '';
		try {
			const response = await fetch(`${base}/api/stock/proposal`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ token: proposal.token, operationIds })
			});
			if (!response.ok) {
				status = response.status === 409 ? 'superseded' : 'active';
				errorMessage =
					response.status === 409
						? m.chat_stock_proposal_stale()
						: m.chat_stock_proposal_failed();
				return;
			}
			status = 'applied';
		} catch {
			status = 'active';
			errorMessage = m.chat_stock_proposal_failed();
		} finally {
			busy = null;
		}
	}

	async function reject() {
		if (!active || busy) return;
		busy = 'reject';
		errorMessage = '';
		try {
			const response = await fetch(`${base}/api/stock/proposal`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ token: proposal.token })
			});
			if (!response.ok) {
				errorMessage = m.chat_stock_proposal_failed();
				return;
			}
			status = 'rejected';
		} catch {
			errorMessage = m.chat_stock_proposal_failed();
		} finally {
			busy = null;
		}
	}

	async function undoAll() {
		if (status !== 'applied' || busy) return;
		busy = 'undo';
		errorMessage = '';
		try {
			const response = await fetch(`${base}/api/stock/proposal`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ token: proposal.token })
			});
			if (!response.ok) {
				errorMessage =
					response.status === 409
						? m.chat_stock_proposal_stale()
						: m.chat_stock_proposal_failed();
				return;
			}
			status = 'undone';
		} catch {
			errorMessage = m.chat_stock_proposal_failed();
		} finally {
			busy = null;
		}
	}
</script>

<section
	class="min-w-0 rounded-xl border border-base-300/70 bg-base-100/45 p-3"
	aria-label={m.chat_stock_proposal_title()}
>
	<header class="flex flex-wrap items-start justify-between gap-2">
		<div class="min-w-0">
			<h3 class="break-words text-sm font-semibold">{proposal.title}</h3>
			<p class="mt-0.5 text-xs text-base-content/55">{proposal.weekStartDate}</p>
		</div>
		<span class="badge badge-outline badge-sm">
			{m.chat_meal_plan_confidence({
				level: confidenceLabel(proposal.recommendation.confidence)
			})}
		</span>
	</header>

	<div class="mt-3 grid gap-2 text-xs md:grid-cols-2">
		<section class="rounded-lg bg-base-200/55 p-2.5">
			<h4 class="font-semibold">{m.chat_meal_plan_why_now()}</h4>
			<p class="mt-1 leading-relaxed">{proposal.recommendation.whyNow}</p>
		</section>
		<section class="rounded-lg bg-base-200/55 p-2.5">
			<h4 class="font-semibold">{m.chat_meal_plan_consequence()}</h4>
			<p class="mt-1 leading-relaxed">{proposal.recommendation.consequence}</p>
		</section>
	</div>

	<details class="mt-2 rounded-lg border border-base-300/60 px-2.5 py-2 text-xs">
		<summary class="min-h-6 cursor-pointer font-semibold">{m.chat_meal_plan_evidence()}</summary>
		<ul class="mt-1 list-disc space-y-1 pl-4">
			{#each proposal.recommendation.evidence as fact}
				<li>{fact}</li>
			{/each}
		</ul>
		{#if proposal.recommendation.uncertainty}
			<h4 class="mt-2 font-semibold">{m.chat_meal_plan_uncertainty()}</h4>
			<p class="mt-1 text-base-content/65">{proposal.recommendation.uncertainty}</p>
		{/if}
		<h4 class="mt-2 font-semibold">{m.chat_meal_plan_alternatives()}</h4>
		<ul class="mt-1 list-disc space-y-1 pl-4 text-base-content/65">
			{#each proposal.recommendation.alternatives as alternative}
				<li>{alternative}</li>
			{/each}
		</ul>
	</details>

	<div class="mt-3 divide-y divide-base-300/60 border-y border-base-300/60">
		{#each proposal.operations as operation (operation.id)}
			<label class="grid min-h-11 cursor-pointer grid-cols-[auto_minmax(0,1fr)] gap-2 py-2">
				<input
					type="checkbox"
					class="checkbox checkbox-sm mt-0.5"
					bind:checked={selected[operation.id]}
					disabled={!active || busy !== null}
					onchange={() => (errorMessage = '')}
				/>
				<span class="min-w-0 text-xs">
					<span class="block font-semibold">{operation.label}</span>
					<span class="mt-0.5 block break-words">
						{#if operation.before}
							<span class="line-through opacity-55">{operation.before}</span>
							<span class="px-1 opacity-45">→</span>
						{/if}
						{operation.after}
					</span>
					<span class="mt-1 block text-base-content/60">{operation.reason}</span>
				</span>
			</label>
		{/each}
	</div>

	<p class="mt-3 rounded-lg border border-primary/20 bg-primary/5 p-2.5 text-xs">
		{m.chat_stock_proposal_atomic()}
	</p>

	{#if errorMessage}
		<p class="mt-2 text-xs text-error" role="alert">{errorMessage}</p>
	{/if}

	{#if active}
		<footer class="mt-3 flex flex-wrap items-center justify-between gap-2">
			<span class="text-xs text-base-content/55">
				{m.chat_stock_proposal_selected({ count: selectedCount })}
			</span>
			<div class="flex gap-2">
				<button
					type="button"
					class="btn btn-ghost btn-sm min-h-11"
					disabled={busy !== null}
					onclick={reject}
				>
					{m.chat_stock_proposal_reject()}
				</button>
				<button
					type="button"
					class="btn btn-primary btn-sm min-h-11"
					disabled={busy !== null || selectedCount === 0}
					onclick={applySelected}
				>
					{#if busy === 'apply'}<Spinner size="sm" />{/if}
					{busy === 'apply'
						? m.chat_stock_proposal_applying()
						: m.chat_stock_proposal_apply()}
				</button>
			</div>
		</footer>
	{:else if status === 'applied'}
		<div class="mt-3 flex flex-wrap items-center justify-between gap-2">
			<p class="text-xs text-success">{m.chat_stock_proposal_applied()}</p>
			<button
				type="button"
				class="btn btn-ghost btn-sm min-h-11"
				disabled={busy !== null}
				onclick={undoAll}
			>
				{#if busy === 'undo'}<Spinner size="sm" />{/if}
				{busy === 'undo' ? m.chat_stock_proposal_undoing() : m.chat_stock_proposal_undo()}
			</button>
		</div>
	{:else if status === 'undone'}
		<p class="mt-3 text-xs text-success">{m.chat_stock_proposal_undone()}</p>
	{:else if status === 'rejected'}
		<p class="mt-3 text-xs text-base-content/60">{m.chat_stock_proposal_rejected()}</p>
	{:else}
		<p class="mt-3 text-xs text-base-content/60">{m.chat_stock_proposal_stale()}</p>
	{/if}
</section>
