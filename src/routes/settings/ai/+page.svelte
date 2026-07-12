<script lang="ts">
	import { base } from '$app/paths';
	import { invalidateAll } from '$app/navigation';
	import SegmentedTabs from '$lib/components/ui/SegmentedTabs.svelte';
	import ModelPicker from '$lib/components/settings/ModelPicker.svelte';
	import SpendCapField from '$lib/components/settings/SpendCapField.svelte';
	import SettingsPanelHeader from '$lib/components/settings/SettingsPanelHeader.svelte';
	import { optimistic } from '$lib/optimistic';
	import { toast } from '$lib/stores/toast.svelte';
	import { isoDateInAppTimeZone, APP_TIME_ZONE } from '$lib/week';
	import { untrack } from 'svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	type Reasoning = 'default' | 'off';
	type ProviderSort = 'auto' | 'latency' | 'throughput' | 'price';

	const reasoningTabs = [
		{ value: 'default', label: 'Balanced' },
		{ value: 'off', label: 'Fast' }
	] satisfies { value: Reasoning; label: string }[];

	const providerSortTabs = [
		{ value: 'auto', label: 'Auto' },
		{ value: 'latency', label: 'Fastest' },
		{ value: 'price', label: 'Cheapest' },
		{ value: 'throughput', label: 'Steady' }
	] satisfies { value: ProviderSort; label: string }[];

	let reasoning = $state<Reasoning>(untrack(() => data.chatTuning.reasoning));
	let providerSort = $state<ProviderSort>(untrack(() => data.chatTuning.providerSort));
	let chatTuningSaving = $state(false);
	let householdProfile = $state(untrack(() => data.householdProfile));
	let householdProfileSaving = $state(false);

	async function saveHouseholdProfile() {
		if (householdProfileSaving) return;
		householdProfileSaving = true;
		const ok = await optimistic(
			() =>
				fetch(`${base}/api/settings/household-profile`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ profile: householdProfile })
				}),
			() => {},
			'Could not save the household profile.'
		);
		householdProfileSaving = false;
		if (ok) {
			toast.success('Saved household profile');
			await invalidateAll();
		}
	}

	async function saveChatTuning(patch: { reasoning?: Reasoning; provider_sort?: ProviderSort }) {
		if (chatTuningSaving) return;
		const previousReasoning = reasoning;
		const previousProviderSort = providerSort;
		if (patch.reasoning) reasoning = patch.reasoning;
		if (patch.provider_sort) providerSort = patch.provider_sort;
		chatTuningSaving = true;
		const ok = await optimistic(
			() =>
				fetch(`${base}/api/settings/chat-tuning`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(patch)
				}),
			() => {
				reasoning = previousReasoning;
				providerSort = previousProviderSort;
			},
			'Could not save chat speed.'
		);
		chatTuningSaving = false;
		if (ok) {
			toast.success('Saved chat speed');
			await invalidateAll();
		}
	}

	const today = new Date();
	const spendDays = Array.from({ length: 7 }, (_, i) => {
		const d = new Date(today);
		d.setDate(d.getDate() - (6 - i));
		const iso = isoDateInAppTimeZone(d);
		return {
			iso,
			label: d.toLocaleDateString('en-GB', { weekday: 'short', timeZone: APP_TIME_ZONE }),
			eur: data.dailySpend[iso] ?? 0
		};
	});
	const maxSpend = Math.max(...spendDays.map((d) => d.eur), 0.01);
	const weekTotal = spendDays.reduce((s, d) => s + d.eur, 0);
</script>

<svelte:head>
	<title>AI - Settings</title>
</svelte:head>

<div class="ui-page-shell px-4 pt-4">
	<SettingsPanelHeader title="AI" />

	<div class="flex flex-col gap-5">
		<section class="ui-form-card">
			<h2 class="ui-section-label mb-3">Usage &amp; caps</h2>
			<div class="rounded-xl bg-base-200/70 p-3">
				<div class="flex h-14 items-end gap-1.5">
					{#each spendDays as day}
						<div class="flex flex-1 flex-col items-center gap-1">
							<div
								class="min-h-0 w-full rounded-sm bg-primary transition-all"
								style="height: {day.eur > 0 ? Math.max((day.eur / maxSpend) * 40, 3) : 0}px"
								title="EUR {day.eur.toFixed(4)}"
							></div>
							<span class="text-xs leading-none text-base-content/40">{day.label.slice(0, 2)}</span>
						</div>
					{/each}
				</div>
				<p class="mt-2 text-right text-xs text-base-content/50">Total: EUR {weekTotal.toFixed(3)}</p>
			</div>
			<div class="mt-3 flex flex-col gap-3 border-t border-base-300 pt-3">
				<SpendCapField category="chat" label="Chat cap" initial={data.chatCap} />
				<SpendCapField category="background" label="Background cap" initial={data.backgroundCap} />
			</div>
		</section>

		<section class="ui-form-card">
			<h2 class="ui-section-label mb-3">Household</h2>
			<label class="ui-field-label mb-1.5 block" for="household-profile">About your household</label>
			<textarea
				id="household-profile"
				class="textarea textarea-bordered textarea-sm w-full"
				rows="3"
				maxlength="2000"
				placeholder="Names, who cooks and shops, where you live."
				bind:value={householdProfile}
			></textarea>
			<p class="mt-1.5 text-xs text-base-content/50">
				The chat assistant reads this at the start of every conversation.
			</p>
			<button
				type="button"
				class="btn btn-sm btn-primary mt-2"
				disabled={householdProfileSaving || householdProfile === data.householdProfile}
				onclick={saveHouseholdProfile}
			>
				Save
			</button>
		</section>

		<section class="ui-form-card">
			<h2 class="ui-section-label mb-3">Chat speed</h2>
			<div class="flex flex-col gap-4">
				<div>
					<span class="ui-field-label mb-1.5 block" id="thinking-label">Thinking</span>
					<div class:pointer-events-none={chatTuningSaving} class:opacity-60={chatTuningSaving} aria-labelledby="thinking-label">
						<SegmentedTabs
							tabs={reasoningTabs}
							value={reasoning}
							onchange={(v) => saveChatTuning({ reasoning: v })}
						/>
					</div>
					<p class="mt-1.5 text-xs text-base-content/50">
						Balanced is better for multi-step questions. Fast replies sooner for simple requests.
					</p>
				</div>

				<div class="border-t border-base-300 pt-3">
					<span class="ui-field-label mb-1.5 block" id="provider-sort-label">Reply route</span>
					<div class:pointer-events-none={chatTuningSaving} class:opacity-60={chatTuningSaving} aria-labelledby="provider-sort-label">
						<SegmentedTabs
							tabs={providerSortTabs}
							value={providerSort}
							cols={2}
							onchange={(v) => saveChatTuning({ provider_sort: v })}
						/>
					</div>
					<p class="mt-1.5 text-xs text-base-content/50">
						Auto is usually best. Fastest avoids slow routes; Cheapest favors lower-cost routes.
					</p>
				</div>
			</div>
		</section>

		<section class="ui-form-card">
			<h2 class="ui-section-label mb-3">Model</h2>
			<div class="flex flex-col gap-4">
				<ModelPicker
					role="chat"
					label="Chat model"
					initial={data.chatModel}
					shortcuts={data.chatModelShortcuts}
				/>
				<div class="border-t border-base-300 pt-4">
					<ModelPicker
						role="chat_fallback"
						label="Fallback model"
						hint="Used when the chat model errors mid-turn."
						initial={data.chatFallbackModel}
						shortcuts={data.chatModelShortcuts}
					/>
				</div>
			</div>
		</section>
	</div>
</div>
