<script lang="ts">
	import { base } from '$app/paths';
	import { invalidateAll } from '$app/navigation';
	import { m } from '$lib/paraglide/messages';
	import { onMount, untrack } from 'svelte';
	import type { ButlerCandidate } from '$lib/server/butler/brief';
	import type { ButlerChangeSummary } from '$lib/server/butler/changes';
	import type {
		ButlerCandidateDisposition,
		ButlerDomain,
		ButlerInitiativeLevel
	} from '$lib/server/butler/state';
	import Icon from '$lib/components/ui/icons/Icon.svelte';

	type TriagedCandidate = {
		candidate: ButlerCandidate;
		disposition: ButlerCandidateDisposition;
		snoozedUntil: Date | null;
	};

	let {
		candidates,
		triaged,
		quietCount,
		initiative,
		changes
	}: {
		candidates: ButlerCandidate[];
		triaged: TriagedCandidate[];
		quietCount: number;
		initiative: Record<ButlerDomain, ButlerInitiativeLevel>;
		changes: ButlerChangeSummary;
	} = $props();

	const domains = ['shopping', 'planning', 'stock', 'cooking'] as const satisfies ButlerDomain[];
	const levels = ['quiet', 'notice', 'prepare'] as const satisfies ButlerInitiativeLevel[];
	let draftInitiative = $state(untrack(() => ({ ...initiative })));
	let ready = $state(false);
	let busy = $state<string | null>(null);
	let errorMessage = $state('');

	onMount(() => {
		ready = true;
	});

	function domainLabel(domain: ButlerDomain): string {
		if (domain === 'shopping') return m.home_butler_domain_shopping();
		if (domain === 'planning') return m.home_butler_domain_planning();
		if (domain === 'stock') return m.home_butler_domain_stock();
		return m.home_butler_domain_cooking();
	}

	function levelLabel(level: ButlerInitiativeLevel): string {
		if (level === 'quiet') return m.home_butler_level_quiet();
		if (level === 'notice') return m.home_butler_level_notice();
		return m.home_butler_level_prepare();
	}

	async function mutate(key: string, body: Record<string, unknown>): Promise<void> {
		if (busy) return;
		busy = key;
		errorMessage = '';
		try {
			const response = await fetch(`${base}/api/butler`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(body)
			});
			if (!response.ok) throw new Error('request_failed');
			await invalidateAll();
		} catch {
			errorMessage = m.home_butler_update_failed();
		} finally {
			busy = null;
		}
	}
</script>

<section class="shrink-0 px-3 pt-3" aria-labelledby="butler-brief-title">
	<header class="mb-2 flex items-start justify-between gap-3 px-0.5">
		<div class="min-w-0">
			<h2 id="butler-brief-title" class="flex items-center gap-1.5 text-sm font-semibold">
				<Icon name="home" class="h-4 w-4 text-primary" />
				{m.home_butler_title()}
			</h2>
			<p class="mt-0.5 text-xs text-base-content/55">{m.home_butler_intro()}</p>
		</div>
		<details class="dropdown dropdown-end shrink-0">
			<summary class="btn btn-ghost btn-xs">{m.home_butler_initiative()}</summary>
			<div
				class="dropdown-content z-20 mt-1 w-[min(22rem,calc(100vw-1.5rem))] rounded-xl border border-base-300 bg-base-100 p-3 shadow-lg"
			>
				<h3 class="text-sm font-semibold">{m.home_butler_initiative_title()}</h3>
				<p class="mt-1 text-xs text-base-content/60">
					{m.home_butler_initiative_intro()}
				</p>
				<div class="mt-3 space-y-3">
					{#each domains as domain}
						<div
							class="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2"
							data-butler-domain={domain}
						>
							<label class="form-control min-w-0">
								<span class="mb-1 text-xs font-semibold">{domainLabel(domain)}</span>
								<select
									class="select select-sm w-full"
									value={draftInitiative[domain]}
									onchange={(event) =>
										(draftInitiative[domain] = event.currentTarget
											.value as ButlerInitiativeLevel)}
								>
									{#each levels as level}
										<option value={level}>{levelLabel(level)}</option>
									{/each}
								</select>
							</label>
							<button
								class="btn btn-primary btn-sm"
								disabled={!ready || busy !== null}
								onclick={() =>
									mutate(`initiative:${domain}`, {
										action: 'save_initiative',
										domain,
										level: draftInitiative[domain]
									})}
							>
								{m.home_butler_save()}
							</button>
						</div>
						<button
							class="btn btn-ghost btn-xs"
							disabled={!ready || busy !== null}
							onclick={() =>
								mutate(`forget:${domain}`, { action: 'forget_initiative', domain })}
						>
							{m.home_butler_forget_domain({ domain: domainLabel(domain) })}
						</button>
					{/each}
				</div>
				<p class="mt-3 text-xs text-base-content/55">{m.home_butler_act_locked()}</p>
			</div>
		</details>
	</header>

	{#if errorMessage}
		<p class="alert alert-error mb-2 py-2 text-xs" role="alert">{errorMessage}</p>
	{/if}

	{#if candidates.length > 0}
		<div class="grid gap-2 md:grid-cols-3">
			{#each candidates as candidate (candidate.id)}
				<article
					class="rounded-xl border border-base-300/70 bg-base-100 p-3 shadow-sm"
					data-butler-kind={candidate.kind}
				>
					<div class="flex items-start justify-between gap-2">
						<h3 class="text-sm font-semibold leading-snug">{candidate.title}</h3>
						<span class="badge badge-outline badge-xs shrink-0">
							{m.home_butler_confidence({
								confidence:
									candidate.confidence === 'high'
										? m.home_butler_confidence_high()
										: candidate.confidence === 'medium'
											? m.home_butler_confidence_medium()
											: m.home_butler_confidence_low()
							})}
						</span>
					</div>
					<p class="mt-1 text-xs leading-relaxed text-base-content/70">{candidate.summary}</p>

					<div class="mt-2 space-y-1.5 text-xs">
						<div>
							<span class="font-semibold">{m.home_butler_why_now()}</span>
							<span class="text-base-content/65"> {candidate.whyNow}</span>
						</div>
						<div>
							<span class="font-semibold">{m.home_butler_consequence()}</span>
							<span class="text-base-content/65"> {candidate.consequence}</span>
						</div>
					</div>

					<details class="mt-2 rounded-lg bg-base-200/55 px-2.5 py-2 text-xs">
						<summary class="min-h-5 cursor-pointer font-semibold">
							{m.home_butler_evidence_and_options()}
						</summary>
						<h4 class="mt-2 font-semibold">{m.home_butler_evidence()}</h4>
						<ul class="mt-1 list-disc space-y-1 pl-4 text-base-content/65">
							{#each candidate.evidence as fact}
								<li>{fact}</li>
							{/each}
						</ul>
						<h4 class="mt-2 font-semibold">{m.home_butler_uncertainty()}</h4>
						<p class="mt-1 text-base-content/65">
							{candidate.uncertainty ?? m.home_butler_no_known_uncertainty()}
						</p>
						<h4 class="mt-2 font-semibold">{m.home_butler_alternatives()}</h4>
						<ul class="mt-1 list-disc space-y-1 pl-4 text-base-content/65">
							{#each candidate.alternatives as alternative}
								<li>{alternative}</li>
							{/each}
						</ul>
					</details>

					<a class="btn btn-primary btn-sm mt-3 w-full" href={`${base}${candidate.href}`}>
						{candidate.actionLabel}
						<Icon name="chevronRight" class="h-3.5 w-3.5" />
					</a>
					<div class="mt-1 grid grid-cols-2 gap-1">
						<button
							class="btn btn-ghost btn-xs"
							disabled={!ready || busy !== null}
							onclick={() =>
								mutate(`snooze:${candidate.id}`, {
									action: 'snooze',
									candidateKey: candidate.id,
									duration: 'day'
								})}
						>
							{m.home_butler_snooze_day()}
						</button>
						<button
							class="btn btn-ghost btn-xs"
							disabled={!ready || busy !== null}
							onclick={() =>
								mutate(`dismiss:${candidate.id}`, {
									action: 'dismiss',
									candidateKey: candidate.id
								})}
						>
							{m.home_butler_dismiss()}
						</button>
					</div>
				</article>
			{/each}
		</div>
	{:else}
		<p class="rounded-xl border border-base-300/60 bg-base-100 px-3 py-2 text-xs text-base-content/60">
			{m.home_butler_clear()}
		</p>
	{/if}

	{#if triaged.length > 0 || quietCount > 0}
		<details
			class="mt-2 rounded-lg border border-base-300/60 bg-base-100 px-3 py-2 text-xs"
			data-butler-hidden
		>
			<summary class="cursor-pointer font-semibold">
				{m.home_butler_hidden({
					count: triaged.length + quietCount
				})}
			</summary>
			{#if quietCount > 0}
				<p class="mt-2 text-base-content/60">
					{m.home_butler_quiet_hidden({ count: quietCount })}
				</p>
			{/if}
			{#each triaged as item (item.candidate.id)}
				<div class="mt-2 flex items-center justify-between gap-2 border-t border-base-300/60 pt-2">
					<div class="min-w-0">
						<span class="block truncate font-semibold">{item.candidate.title}</span>
						<span class="text-base-content/55">
							{item.disposition === 'dismissed'
								? m.home_butler_dismissed()
								: m.home_butler_snoozed()}
						</span>
					</div>
					<button
						class="btn btn-ghost btn-xs shrink-0"
						disabled={!ready || busy !== null}
						onclick={() =>
							mutate(`return:${item.candidate.id}`, {
								action: 'return',
								candidateKey: item.candidate.id
							})}
					>
						{m.home_butler_return()}
					</button>
				</div>
			{/each}
		</details>
	{/if}

	<details
		class="mt-2 rounded-lg border border-base-300/60 bg-base-100 px-3 py-2 text-xs"
		data-butler-changes
	>
		<summary class="cursor-pointer font-semibold">{m.home_butler_changes_title()}</summary>
		{#if changes.since === null}
			<p class="mt-2 text-base-content/65">{m.home_butler_changes_not_started()}</p>
			<button
				class="btn btn-ghost btn-xs mt-2"
				disabled={!ready || busy !== null}
				onclick={() => mutate('changes:start', { action: 'mark_changes_seen' })}
			>
				{m.home_butler_changes_start()}
			</button>
		{:else}
			{#if changes.events.length > 0}
				<ul class="mt-2 space-y-2">
					{#each changes.events as event (event.id)}
						<li class="border-t border-base-300/60 pt-2 first:border-0 first:pt-0">
							<span class="font-semibold">{event.actor}</span>
							<span class="text-base-content/65"> · {event.summary} · {event.subject}</span>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="mt-2 text-base-content/65">{m.home_butler_changes_none()}</p>
			{/if}
			<button
				class="btn btn-ghost btn-xs mt-2"
				disabled={!ready || busy !== null}
				onclick={() => mutate('changes:caught-up', { action: 'mark_changes_seen' })}
			>
				{m.home_butler_changes_caught_up()}
			</button>
		{/if}
		<details class="mt-2 text-base-content/55">
			<summary class="cursor-pointer">{m.home_butler_changes_limits()}</summary>
			<ul class="mt-1 list-disc space-y-1 pl-4">
				{#each changes.limitations as limitation}
					<li>{limitation}</li>
				{/each}
			</ul>
		</details>
		<p class="mt-2 text-base-content/55">{m.home_butler_changes_consequence()}</p>
	</details>
</section>
