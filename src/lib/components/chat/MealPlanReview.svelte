<script lang="ts">
	import { base } from '$app/paths';
	import AssistantAhReview from '$lib/components/chat/AssistantAhReview.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import { m } from '$lib/paraglide/messages';
	import type { PreviewItem } from '$lib/shopping_ah';
	import type { MealPlanProposalDisplay } from '$lib/tool_display';
	import { onMount, untrack } from 'svelte';

	type PipelineNext =
		| {
				kind: 'ah_review';
				previewToken: string;
				items: PreviewItem[];
		  }
		| {
				kind: 'blocked';
				reason: 'not_connected' | 'preview_failed';
				consequence: string;
		  }
		| {
				kind: 'nothing_to_push';
				consequence: string;
		  };

	type Props = {
		proposal: MealPlanProposalDisplay;
		isLatest?: boolean;
	};

	let { proposal, isLatest = true }: Props = $props();
	let selected = $state<Record<string, boolean>>(
		untrack(() => Object.fromEntries(proposal.operations.map((operation) => [operation.id, true])))
	);
	let status = $state<MealPlanProposalDisplay['status']>(
		untrack(() => (isLatest ? proposal.status : 'superseded'))
	);
	let busy = $state<'apply' | 'reject' | 'undo' | null>(null);
	let errorMessage = $state('');
	let next = $state<PipelineNext | null>(null);
	let blockedSourceCount = $state(0);
	let externalAttempted = $state(false);
	let selectedCount = $derived(Object.values(selected).filter(Boolean).length);
	let active = $derived(isLatest && status === 'active');
	let hasRecommendationSummary = $derived(
		Boolean(proposal.recommendation.whyNow || proposal.recommendation.consequence)
	);
	let hasRecommendationDetails = $derived(
		proposal.recommendation.evidence.length > 0 ||
			Boolean(proposal.recommendation.uncertainty) ||
			proposal.recommendation.alternatives.length > 0
	);

	onMount(() => {
		let cancelled = false;
		if (!isLatest) {
			status = 'superseded';
			return;
		}
		void (async () => {
			try {
				const response = await fetch(
					`${base}/api/meal-plan/proposal?token=${encodeURIComponent(proposal.token)}&weekStartDate=${encodeURIComponent(proposal.weekStartDate)}`
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

	function confidenceLabel(
		level: NonNullable<MealPlanProposalDisplay['recommendation']['confidence']>
	) {
		if (level === 'high') return m.chat_meal_plan_confidence_high();
		if (level === 'medium') return m.chat_meal_plan_confidence_medium();
		return m.chat_meal_plan_confidence_low();
	}

	async function applySelected() {
		if (!active || busy) return;
		const operationIds = proposal.operations
			.filter((operation) => selected[operation.id])
			.map((operation) => operation.id);
		if (operationIds.length === 0) {
			errorMessage = m.chat_meal_plan_no_selection();
			return;
		}
		busy = 'apply';
		errorMessage = '';
		try {
			const response = await fetch(`${base}/api/meal-plan/proposal`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ token: proposal.token, operationIds })
			});
			if (!response.ok) {
				status = response.status === 409 ? 'superseded' : 'active';
				errorMessage =
					response.status === 409
						? m.chat_meal_plan_stale()
						: m.chat_meal_plan_failed();
				return;
			}
			const body = await response.json();
			status = 'applied';
			next = body.next ?? null;
			blockedSourceCount = body.shopping?.blocked?.length ?? 0;
		} catch {
			status = 'active';
			errorMessage = m.chat_meal_plan_failed();
		} finally {
			busy = null;
		}
	}

	async function reject() {
		if (!active || busy) return;
		busy = 'reject';
		errorMessage = '';
		try {
			const response = await fetch(`${base}/api/meal-plan/proposal`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ token: proposal.token })
			});
			if (!response.ok) {
				errorMessage = m.chat_meal_plan_failed();
				return;
			}
			status = 'rejected';
		} catch {
			errorMessage = m.chat_meal_plan_failed();
		} finally {
			busy = null;
		}
	}

	async function undoAll() {
		if (status !== 'applied' || busy) return;
		busy = 'undo';
		errorMessage = '';
		try {
			const response = await fetch(`${base}/api/meal-plan/proposal`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ token: proposal.token })
			});
			if (!response.ok) {
				errorMessage =
					response.status === 409
						? m.chat_meal_plan_stale()
						: m.chat_meal_plan_failed();
				return;
			}
			status = 'undone';
			next = null;
		} catch {
			errorMessage = m.chat_meal_plan_failed();
		} finally {
			busy = null;
		}
	}
</script>

<section class="min-w-0 rounded-xl border border-base-300/70 bg-base-100/45 p-3" aria-label={m.chat_meal_plan_title()}>
	<header class="flex flex-wrap items-start justify-between gap-2">
		<div class="min-w-0">
			<h3 class="break-words text-sm font-semibold">{proposal.title}</h3>
			<p class="mt-0.5 text-xs text-base-content/55">{proposal.weekStartDate}</p>
		</div>
		{#if proposal.recommendation.confidence}
			<span class="badge badge-outline badge-sm">
				{m.chat_meal_plan_confidence({
					level: confidenceLabel(proposal.recommendation.confidence)
				})}
			</span>
		{/if}
	</header>

	{#if hasRecommendationSummary}
		<div
			class="mt-3 grid gap-2 text-xs {proposal.recommendation.whyNow &&
			proposal.recommendation.consequence
				? 'md:grid-cols-2'
				: ''}"
		>
			{#if proposal.recommendation.whyNow}
				<section class="rounded-lg bg-base-200/55 p-2.5">
					<h4 class="font-semibold">{m.chat_meal_plan_why_now()}</h4>
					<p class="mt-1 leading-relaxed">{proposal.recommendation.whyNow}</p>
				</section>
			{/if}
			{#if proposal.recommendation.consequence}
				<section class="rounded-lg bg-base-200/55 p-2.5">
					<h4 class="font-semibold">{m.chat_meal_plan_consequence()}</h4>
					<p class="mt-1 leading-relaxed">{proposal.recommendation.consequence}</p>
				</section>
			{/if}
		</div>
	{/if}

	{#if hasRecommendationDetails}
		<details class="mt-2 rounded-lg border border-base-300/60 px-2.5 py-2 text-xs">
			<summary class="min-h-6 cursor-pointer font-semibold">{m.chat_meal_plan_evidence()}</summary>
			{#if proposal.recommendation.evidence.length > 0}
				<ul class="mt-1 list-disc space-y-1 pl-4">
					{#each proposal.recommendation.evidence as fact}
						<li>{fact}</li>
					{/each}
				</ul>
			{/if}
			{#if proposal.recommendation.uncertainty}
				<h4 class="mt-2 font-semibold">{m.chat_meal_plan_uncertainty()}</h4>
				<p class="mt-1 text-base-content/65">{proposal.recommendation.uncertainty}</p>
			{/if}
			{#if proposal.recommendation.alternatives.length > 0}
				<h4 class="mt-2 font-semibold">{m.chat_meal_plan_alternatives()}</h4>
				<ul class="mt-1 list-disc space-y-1 pl-4 text-base-content/65">
					{#each proposal.recommendation.alternatives as alternative}
						<li>{alternative}</li>
					{/each}
				</ul>
			{/if}
		</details>
	{/if}

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

	<div class="mt-3 space-y-1 rounded-lg border border-primary/20 bg-primary/5 p-2.5 text-xs">
		<p>{m.chat_meal_plan_atomic()}</p>
		<p class="text-base-content/65">{m.chat_meal_plan_external_prep()}</p>
	</div>

	{#if errorMessage}
		<p class="mt-2 text-xs text-error" role="alert">{errorMessage}</p>
	{/if}

	{#if active}
		<footer class="mt-3 flex flex-wrap items-center justify-between gap-2">
			<span class="text-xs text-base-content/55">{m.chat_meal_plan_selected({ count: selectedCount })}</span>
			<div class="flex gap-2">
				<button
					type="button"
					class="btn btn-ghost btn-sm min-h-11"
					disabled={busy !== null}
					onclick={reject}
				>
					{m.chat_meal_plan_not_now()}
				</button>
				<button
					type="button"
					class="btn btn-primary btn-sm min-h-11"
					disabled={busy !== null || selectedCount === 0}
					onclick={applySelected}
				>
					{#if busy === 'apply'}<Spinner size="xs" />{/if}
					{busy === 'apply' ? m.chat_meal_plan_applying() : m.chat_meal_plan_apply()}
				</button>
			</div>
		</footer>
	{:else if status === 'applied'}
		<div class="mt-3 flex flex-wrap items-center justify-between gap-2">
			<p class="text-xs font-medium text-success">{m.chat_meal_plan_applied()}</p>
			<button
				type="button"
				class="btn btn-outline btn-sm min-h-11"
				disabled={busy !== null}
				onclick={undoAll}
			>
				{#if busy === 'undo'}<Spinner size="xs" />{/if}
				{busy === 'undo'
					? m.chat_meal_plan_undoing()
					: externalAttempted
						? m.chat_meal_plan_undo_local()
						: m.chat_meal_plan_undo()}
			</button>
		</div>
		{#if externalAttempted}
			<p class="mt-1 text-xs text-warning">{m.chat_meal_plan_ah_not_undone()}</p>
		{/if}
	{:else}
		<p class="mt-3 text-xs text-base-content/60" aria-live="polite">
			{status === 'undone'
				? m.chat_meal_plan_undone()
				: status === 'rejected'
					? m.chat_meal_plan_rejected()
					: m.chat_meal_plan_stale()}
		</p>
	{/if}

	{#if status === 'applied' && blockedSourceCount > 0}
		<p class="mt-2 text-xs text-warning">
			{m.chat_meal_plan_blocked_sources({ count: blockedSourceCount })}
		</p>
	{/if}
	{#if status === 'applied' && next?.kind === 'ah_review'}
		<AssistantAhReview
			previewToken={next.previewToken}
			items={next.items}
			onExternalAttempt={() => (externalAttempted = true)}
		/>
	{:else if status === 'applied' && next?.kind === 'nothing_to_push'}
		<p class="mt-2 text-xs text-base-content/60">{m.chat_meal_plan_nothing_to_push()}</p>
	{:else if status === 'applied' && next?.kind === 'blocked'}
		<p class="mt-2 text-xs text-warning">
			{next.reason === 'not_connected'
				? m.chat_meal_plan_ah_not_connected()
				: m.chat_meal_plan_ah_preview_failed()}
		</p>
	{/if}
</section>
