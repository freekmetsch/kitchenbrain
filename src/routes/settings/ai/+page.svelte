<script lang="ts">
	import { base } from '$app/paths';
	import { invalidateAll } from '$app/navigation';
	import SegmentedTabs from '$lib/components/ui/SegmentedTabs.svelte';
	import ModelPicker from '$lib/components/settings/ModelPicker.svelte';
	import SpendCapField from '$lib/components/settings/SpendCapField.svelte';
	import SettingsPanelHeader from '$lib/components/settings/SettingsPanelHeader.svelte';
	import PendingButton from '$lib/components/ui/PendingButton.svelte';
	import { optimistic } from '$lib/optimistic';
	import { m } from '$lib/paraglide/messages';
	import { toast } from '$lib/stores/toast.svelte';
	import { isoDateInAppTimeZone, APP_TIME_ZONE } from '$lib/week';
	import { untrack } from 'svelte';
	import type { PageData } from './$types';
	import { formatDate } from '$lib/i18n';

	let { data }: { data: PageData } = $props();

	type Reasoning = 'default' | 'off';
	type ProviderSort = 'auto' | 'latency' | 'throughput' | 'price';

	const reasoningTabs = [
		{ value: 'default', label: m.settingsshell_reasoning_balanced() },
		{ value: 'off', label: m.settingsshell_reasoning_fast() }
	] satisfies { value: Reasoning; label: string }[];

	const providerSortTabs = [
		{ value: 'auto', label: m.settings_ai_route_auto() },
		{ value: 'latency', label: m.settings_ai_route_fastest() },
		{ value: 'price', label: m.settings_ai_route_cheapest() },
		{ value: 'throughput', label: m.settings_ai_route_steady() }
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
			m.settings_ai_household_profile_save_failed()
		);
		householdProfileSaving = false;
		if (ok) {
			toast.success(m.settings_ai_household_profile_saved());
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
			m.settings_ai_chat_speed_save_failed()
		);
		chatTuningSaving = false;
		if (ok) {
			toast.success(m.settings_ai_chat_speed_saved());
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
			label: formatDate(d, { weekday: 'short', timeZone: APP_TIME_ZONE }),
			eur: data.dailySpend[iso] ?? 0
		};
	});
	const maxSpend = Math.max(...spendDays.map((d) => d.eur), 0.01);
	const weekTotal = spendDays.reduce((s, d) => s + d.eur, 0);
</script>

<svelte:head>
	<title>{m.settings_ai_title()}</title>
</svelte:head>

<div class="ui-page-shell px-4 pt-4">
	<SettingsPanelHeader title={m.settingsshell_panel_ai()} />

	<div class="flex flex-col gap-5">
		<section class="ui-form-card">
			<h2 class="ui-section-label mb-3">{m.settings_ai_usage_caps_heading()}</h2>
			<div class="rounded-xl bg-base-200/70 p-3">
				<div class="flex h-14 items-end gap-1.5">
					{#each spendDays as day}
						<div class="flex flex-1 flex-col items-center gap-1">
							<div
								class="min-h-0 w-full rounded-sm bg-primary transition-all"
								style="height: {day.eur > 0 ? Math.max((day.eur / maxSpend) * 40, 3) : 0}px"
								title={m.settings_ai_spend_tooltip({ amount: day.eur.toFixed(4) })}
							></div>
							<span class="text-xs leading-none text-base-content/40">{day.label.slice(0, 2)}</span>
						</div>
					{/each}
				</div>
				<p class="mt-2 text-right text-xs text-base-content/50">{m.settings_ai_spend_total({ total: weekTotal.toFixed(3) })}</p>
			</div>
			<div class="mt-3 flex flex-col gap-3 border-t border-base-300 pt-3">
				<SpendCapField category="chat" label={m.settings_ai_chat_cap_label()} initial={data.chatCap} />
				<SpendCapField category="background" label={m.settings_ai_background_cap_label()} initial={data.backgroundCap} />
			</div>
		</section>

		<section class="ui-form-card">
			<h2 class="ui-section-label mb-3">{m.settings_ai_household_heading()}</h2>
			<label class="ui-field-label mb-1.5 block" for="household-profile">{m.settings_ai_household_profile_label()}</label>
			<textarea
				id="household-profile"
				class="textarea textarea-bordered textarea-sm w-full"
				rows="3"
				maxlength="2000"
				placeholder={m.settings_ai_household_profile_placeholder()}
				bind:value={householdProfile}
			></textarea>
			<p class="mt-1.5 text-xs text-base-content/50">
				{m.settings_ai_household_profile_hint()}
			</p>
			<PendingButton
				class="btn btn-sm btn-primary mt-2"
				pending={householdProfileSaving}
				disabled={householdProfile === data.householdProfile}
				onclick={saveHouseholdProfile}
			>
				{m.settingsshell_save_button()}
			</PendingButton>
		</section>

		<section class="ui-form-card">
			<h2 class="ui-section-label mb-3">{m.settings_ai_chat_speed_heading()}</h2>
			<div class="flex flex-col gap-4">
				<div>
					<span class="ui-field-label mb-1.5 block" id="thinking-label">{m.settings_ai_thinking_label()}</span>
					<div class:pointer-events-none={chatTuningSaving} class:opacity-60={chatTuningSaving} aria-labelledby="thinking-label">
						<SegmentedTabs
							tabs={reasoningTabs}
							value={reasoning}
							onchange={(v) => saveChatTuning({ reasoning: v })}
						/>
					</div>
					<p class="mt-1.5 text-xs text-base-content/50">
						{m.settings_ai_thinking_hint()}
					</p>
				</div>

				<div class="border-t border-base-300 pt-3">
					<span class="ui-field-label mb-1.5 block" id="provider-sort-label">{m.settings_ai_reply_route_label()}</span>
					<div class:pointer-events-none={chatTuningSaving} class:opacity-60={chatTuningSaving} aria-labelledby="provider-sort-label">
						<SegmentedTabs
							tabs={providerSortTabs}
							value={providerSort}
							cols={2}
							onchange={(v) => saveChatTuning({ provider_sort: v })}
						/>
					</div>
					<p class="mt-1.5 text-xs text-base-content/50">
						{m.settings_ai_reply_route_hint()}
					</p>
				</div>
			</div>
		</section>

		<section class="ui-form-card">
			<h2 class="ui-section-label mb-3">{m.settings_model_heading()}</h2>
			<div class="flex flex-col gap-4">
				<ModelPicker
					role="chat"
					label={m.settings_ai_chat_model_label()}
					initial={data.chatModel}
					shortcuts={data.chatModelShortcuts}
				/>
				<div class="border-t border-base-300 pt-4">
					<ModelPicker
						role="chat_fallback"
						label={m.settings_ai_fallback_model_label()}
						hint={m.settings_ai_fallback_model_hint()}
						initial={data.chatFallbackModel}
						shortcuts={data.chatModelShortcuts}
					/>
				</div>
			</div>
		</section>
	</div>
</div>
