<script lang="ts">
	import { base } from '$app/paths';
	import { invalidateAll } from '$app/navigation';
	import { onMount, untrack } from 'svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import { m } from '$lib/paraglide/messages';
	import type { CookingActionDisplay } from '$lib/tool_display';
	import {
		type CookTimerRestoreSnapshot
	} from '$lib/timer/cook-timer-coordinator.svelte';
	import { useCookTimerCoordinator } from '$lib/timer/coordinator-context';

	let { action }: { action: CookingActionDisplay } = $props();
	const coordinator = useCookTimerCoordinator();
	let ready = $state(false);
	let busy = $state(false);
	let status = $state<'active' | 'applied' | 'rejected' | 'undone'>('active');
	let errorMessage = $state('');
	let undoSnapshot = $state<CookTimerRestoreSnapshot | null>(null);
	let appliedTimer = $state<{ sessionKey: string; index: number } | null>(null);
	let defrostOpId = $state<number | null>(null);
	let cueStarted = $state(false);
	let cueMinutes = $state(
		untrack(() => Math.max(1, Math.round((action.defrost?.reminderSeconds ?? 3600) / 60)))
	);
	let selectedTimer = $state('');
	let runningTimers = $derived(coordinator.visibleTimers.filter((timer) => !timer.done));
	let active = $derived(ready && status === 'active' && !busy);

	onMount(() => {
		if (action.kind === 'timer' && action.timer?.operation === 'start') {
			const existing = coordinator.visibleTimers.find(
				(timer) => timer.sessionKey === `assistant:${action.id}` && timer.index === 0
			);
			if (existing) {
				status = 'applied';
				appliedTimer = { sessionKey: existing.sessionKey, index: existing.index };
			}
		} else if (action.kind === 'timer') {
			const target = action.timer?.targetLabel?.toLocaleLowerCase();
			const match = runningTimers.find(
				(timer) =>
					target &&
					(timer.label.toLocaleLowerCase() === target ||
						timer.label.toLocaleLowerCase().includes(target))
			);
			const fallback = runningTimers.length === 1 ? runningTimers[0] : null;
			const selected = match ?? fallback;
			if (selected) selectedTimer = timerValue(selected.sessionKey, selected.index);
		} else if (action.kind === 'defrost') {
			const existing = coordinator.visibleTimers.find(
				(timer) => timer.sessionKey === `defrost:${action.id}` && timer.index === 0
			);
			cueStarted = Boolean(existing);
		}
		ready = true;
	});

	function timerValue(sessionKey: string, index: number) {
		return `${sessionKey}\u0000${index}`;
	}

	function selectedTimerTarget() {
		const split = selectedTimer.lastIndexOf('\u0000');
		if (split < 1) return null;
		const index = Number(selectedTimer.slice(split + 1));
		if (!Number.isInteger(index)) return null;
		return { sessionKey: selectedTimer.slice(0, split), index };
	}

	function confidenceLabel(level: CookingActionDisplay['recommendation']['confidence']) {
		if (level === 'high') return m.chat_meal_plan_confidence_high();
		if (level === 'medium') return m.chat_meal_plan_confidence_medium();
		return m.chat_meal_plan_confidence_low();
	}

	function startClientTimer(
		sessionKey: string,
		title: string,
		seconds: number,
		label: string
	) {
		coordinator
			.session({
				key: sessionKey,
				recipeSlug: 'assistant',
				recipeTitle: title,
				href: '/'
			})
			.start(0, seconds, { label });
		return { sessionKey, index: 0 };
	}

	function applyTimer() {
		if (!active || action.kind !== 'timer' || !action.timer) return;
		errorMessage = '';
		const timer = action.timer;
		if (timer.operation === 'start') {
			appliedTimer = startClientTimer(
				`assistant:${action.id}`,
				timer.label ?? action.title,
				timer.seconds ?? 1,
				timer.label ?? action.title
			);
			status = 'applied';
			return;
		}
		const target = selectedTimerTarget();
		if (!target) {
			errorMessage = m.chat_cooking_action_no_timer();
			return;
		}
		undoSnapshot = coordinator.timerSnapshot(target.sessionKey, target.index);
		if (!undoSnapshot) {
			errorMessage = m.chat_cooking_action_no_timer();
			return;
		}
		if (timer.operation === 'extend') {
			coordinator.extend(target.sessionKey, target.index, timer.seconds ?? 1);
		} else if (timer.operation === 'rename') {
			coordinator.rename(target.sessionKey, target.index, timer.label ?? action.title);
		} else {
			coordinator.cancel(target.sessionKey, target.index);
		}
		appliedTimer = target;
		status = 'applied';
	}

	function startDefrostCue() {
		if (!active || action.kind !== 'defrost' || !action.defrost) return;
		const minutes = Math.max(1, Math.min(720, Math.round(cueMinutes)));
		cueMinutes = minutes;
		appliedTimer = startClientTimer(
			`defrost:${action.id}`,
			action.defrost.itemName,
			minutes * 60,
			action.title
		);
		cueStarted = true;
	}

	async function completeDefrost() {
		if (!active || action.kind !== 'defrost' || !action.defrost) return;
		busy = true;
		errorMessage = '';
		try {
			const response = await fetch(`${base}/api/cooking-action/defrost`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					item_id: action.defrost.itemId,
					expected_updated_at: action.defrost.expectedUpdatedAt
				})
			});
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			const body = await response.json();
			defrostOpId = typeof body.opId === 'number' ? body.opId : null;
			if (appliedTimer) coordinator.cancel(appliedTimer.sessionKey, appliedTimer.index);
			status = 'applied';
			await invalidateAll();
		} catch {
			errorMessage = m.chat_cooking_action_failed();
		} finally {
			busy = false;
		}
	}

	async function undo() {
		if (status !== 'applied' || busy) return;
		errorMessage = '';
		if (action.kind === 'defrost' && defrostOpId !== null) {
			busy = true;
			try {
				const response = await fetch(`${base}/api/cooking-action/defrost`, {
					method: 'DELETE',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ op_id: defrostOpId })
				});
				if (!response.ok) throw new Error(`HTTP ${response.status}`);
				status = 'undone';
				await invalidateAll();
			} catch {
				errorMessage = m.chat_cooking_action_failed();
			} finally {
				busy = false;
			}
			return;
		}
		if (appliedTimer) coordinator.cancel(appliedTimer.sessionKey, appliedTimer.index);
		if (undoSnapshot) coordinator.restoreTimer(undoSnapshot);
		status = 'undone';
	}
</script>

<section
	class="min-w-0 rounded-xl border border-base-300/70 bg-base-100/45 p-3"
	aria-label={m.chat_cooking_action_title()}
	data-testid="cooking-action-review"
	data-action-kind={action.kind}
>
	<header class="flex min-w-0 flex-wrap items-start justify-between gap-2">
		<h3 class="min-w-0 break-words text-sm font-semibold">{action.title}</h3>
		<span class="badge badge-outline badge-sm shrink-0">
			{m.chat_meal_plan_confidence({
				level: confidenceLabel(action.recommendation.confidence)
			})}
		</span>
	</header>

	<div class="mt-3 grid min-w-0 gap-2 text-xs md:grid-cols-2">
		<section class="min-w-0 rounded-lg bg-base-200/55 p-2.5">
			<h4 class="font-semibold">{m.chat_meal_plan_why_now()}</h4>
			<p class="mt-1 break-words leading-relaxed">{action.recommendation.whyNow}</p>
		</section>
		<section class="min-w-0 rounded-lg bg-base-200/55 p-2.5">
			<h4 class="font-semibold">{m.chat_meal_plan_consequence()}</h4>
			<p class="mt-1 break-words leading-relaxed">{action.recommendation.consequence}</p>
		</section>
	</div>

	<section class="mt-2 rounded-lg border border-base-300/60 px-2.5 py-2 text-xs">
		<h4 class="font-semibold">{m.chat_meal_plan_evidence()}</h4>
		<ul class="mt-1 list-disc space-y-1 pl-4">
			{#each action.recommendation.evidence as fact}
				<li class="break-words">{fact}</li>
			{/each}
		</ul>
		{#if action.recommendation.uncertainty}
			<h4 class="mt-2 font-semibold">{m.chat_meal_plan_uncertainty()}</h4>
			<p class="mt-1 break-words text-base-content/65">{action.recommendation.uncertainty}</p>
		{/if}
	</section>

	{#if action.recommendation.alternatives.length > 0}
		<details class="mt-2 rounded-lg border border-base-300/60 px-2.5 py-2 text-xs">
			<summary class="min-h-6 cursor-pointer font-semibold">
				{m.chat_meal_plan_alternatives()}
			</summary>
			<ul class="mt-1 list-disc space-y-1 pl-4 text-base-content/65">
				{#each action.recommendation.alternatives as alternative}
					<li>{alternative}</li>
				{/each}
			</ul>
		</details>
	{/if}

	{#if action.kind === 'rescue' && action.rescue}
		<div class="mt-3 min-w-0 rounded-xl border border-base-300/70 p-3 text-sm">
			<p class="font-semibold">{m.chat_cooking_action_active_step()}</p>
			<p class="mt-1 break-words text-xs text-base-content/70">{action.rescue.step}</p>
			<ul class="mt-2 list-disc space-y-1 pl-4">
				{#each action.rescue.guidance as guidance}
					<li class="break-words">{guidance}</li>
				{/each}
			</ul>
			{#if action.rescue.safetyCaution}
				<p class="mt-2 rounded-lg bg-warning/10 p-2 text-xs">
					<strong>{m.chat_cooking_action_safety()}:</strong>
					{action.rescue.safetyCaution}
				</p>
			{/if}
			<a
				class="btn btn-primary btn-sm mt-3 min-h-11"
				href={`${base}/recipes/${encodeURIComponent(action.rescue.recipeSlug)}`}
			>
				{m.chat_cooking_action_open_recipe()}
			</a>
		</div>
	{:else if action.kind === 'timer' && action.timer}
		{#if action.timer.operation !== 'start'}
			<label class="form-control mt-3 min-w-0">
				<span class="label-text text-xs font-semibold">{m.chat_cooking_action_choose_timer()}</span>
				<select class="select select-bordered mt-1 min-h-11 w-full" bind:value={selectedTimer} disabled={!active}>
					<option value="">{m.chat_cooking_action_choose_timer()}</option>
					{#each runningTimers as timer}
						<option value={timerValue(timer.sessionKey, timer.index)}>{timer.label}</option>
					{/each}
				</select>
			</label>
		{/if}
	{:else if action.kind === 'defrost' && action.defrost}
		<label class="form-control mt-3 min-w-0">
			<span class="label-text text-xs font-semibold">{m.chat_cooking_action_cue_minutes()}</span>
			<input
				class="input input-bordered mt-1 min-h-11 w-full"
				type="number"
				min="1"
				max="720"
				step="1"
				bind:value={cueMinutes}
				disabled={!active || cueStarted}
			/>
		</label>
		{#if cueStarted}
			<p class="mt-2 text-xs text-success">{m.chat_cooking_action_cue_started()}</p>
		{/if}
	{/if}

	{#if errorMessage}
		<p class="mt-2 text-xs text-error" role="alert">{errorMessage}</p>
	{/if}

	{#if action.kind !== 'rescue'}
		{#if status === 'active'}
			<div class="mt-3 flex flex-wrap justify-end gap-2">
				<button
					type="button"
					class="btn btn-ghost min-h-11"
					disabled={!active}
					onclick={() => (status = 'rejected')}
				>
					{m.chat_cooking_action_not_now()}
				</button>
				{#if action.kind === 'defrost' && !cueStarted}
					<button
						type="button"
						class="btn btn-primary min-h-11"
						disabled={!active}
						onclick={startDefrostCue}
					>
						{m.chat_cooking_action_start_cue()}
					</button>
				{:else}
					<button
						type="button"
						class="btn btn-primary min-h-11"
						disabled={!active}
						onclick={action.kind === 'defrost' ? completeDefrost : applyTimer}
					>
						{#if busy}<Spinner size="xs" />{/if}
						{action.kind === 'defrost'
							? m.chat_cooking_action_moved()
							: m.chat_cooking_action_apply()}
					</button>
				{/if}
			</div>
		{:else if status === 'applied'}
			<p class="mt-3 text-xs font-medium text-success">{m.chat_cooking_action_applied()}</p>
			<button
				type="button"
				class="btn btn-ghost btn-sm mt-1 min-h-11"
				disabled={busy}
				onclick={undo}
			>
				{#if busy}<Spinner size="xs" />{/if}
				{m.chat_cooking_action_undo()}
			</button>
		{:else if status === 'undone'}
			<p class="mt-3 text-xs text-base-content/60">{m.chat_cooking_action_undone()}</p>
		{/if}
	{/if}
</section>
