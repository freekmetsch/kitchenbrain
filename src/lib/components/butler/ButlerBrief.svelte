<script lang="ts">
	import { base } from '$app/paths';
	import { m } from '$lib/paraglide/messages';
	import type { ButlerCandidate } from '$lib/server/butler/brief';
	import Icon from '$lib/components/ui/icons/Icon.svelte';

	let { candidates }: { candidates: ButlerCandidate[] } = $props();
</script>

{#if candidates.length > 0}
	<section class="shrink-0 px-3 pt-3" aria-labelledby="butler-brief-title">
		<header class="mb-2 flex items-start justify-between gap-3 px-0.5">
			<div class="min-w-0">
				<h2 id="butler-brief-title" class="flex items-center gap-1.5 text-sm font-semibold">
					<Icon name="home" class="h-4 w-4 text-primary" />
					{m.home_butler_title()}
				</h2>
				<p class="mt-0.5 text-xs text-base-content/55">{m.home_butler_intro()}</p>
			</div>
			<span class="badge badge-ghost badge-sm shrink-0">
				{m.home_butler_count({ count: candidates.length })}
			</span>
		</header>

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
				</article>
			{/each}
		</div>
	</section>
{/if}
