<script lang="ts">
	import { base } from '$app/paths';
	import { invalidateAll } from '$app/navigation';
	import ModelPicker from '$lib/components/settings/ModelPicker.svelte';
	import SettingsPanelHeader from '$lib/components/settings/SettingsPanelHeader.svelte';
	import PendingButton from '$lib/components/ui/PendingButton.svelte';
	import { SOURCE_LABEL } from '$lib/components/settings/provenance';
	import { m } from '$lib/paraglide/messages';
	import { toast } from '$lib/stores/toast.svelte';
	import { untrack } from 'svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let temperatureInput = $state(
		untrack(() => (data.temperature.value != null ? String(data.temperature.value) : ''))
	);
	let temperatureEffective = $state(untrack(() => data.temperature));
	let temperatureSaving = $state(false);

	async function saveTemperature() {
		const raw = temperatureInput.trim();
		const n = parseFloat(raw);
		if (!raw || !Number.isFinite(n) || n < 0 || n > 2 || temperatureSaving) return;
		temperatureSaving = true;
		try {
			const res = await fetch(`${base}/api/settings/chat-tuning`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ temperature: n })
			});
			if (!res.ok) {
				toast.error(m.settings_advanced_temperature_save_failed());
				return;
			}
			temperatureEffective = { value: n, source: 'ui' };
			toast.success(m.settings_advanced_temperature_saved());
			await invalidateAll();
		} finally {
			temperatureSaving = false;
		}
	}

	async function resetTemperature() {
		if (temperatureSaving) return;
		temperatureSaving = true;
		try {
			const res = await fetch(`${base}/api/settings/chat-tuning`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ temperature: null })
			});
			if (!res.ok) {
				toast.error(m.settingsshell_toast_reset_failed());
				return;
			}
			temperatureInput = '';
			temperatureEffective = { value: null, source: 'default' };
			toast.success(m.settingsshell_reset_to_default());
			await invalidateAll();
		} finally {
			temperatureSaving = false;
		}
	}
</script>

<svelte:head>
	<title>{m.settings_advanced_title()}</title>
</svelte:head>

<div class="ui-page-shell px-4 pt-4">
	<SettingsPanelHeader title={m.settingsshell_panel_advanced()} />

	<div class="flex flex-col gap-5">
		<section class="ui-form-card">
			<h2 class="ui-section-title mb-3">{m.settings_model_heading()}</h2>
			<div class="flex flex-col gap-4">
				<ModelPicker
					role="vision"
					label={m.settings_advanced_vision_label()}
					hint={m.settings_advanced_vision_hint()}
					initial={data.visionModel}
					shortcuts={data.visionModelShortcuts}
				/>
				<div class="border-t border-base-300 pt-4">
					<ModelPicker
						role="background"
						label={m.settings_advanced_background_label()}
						hint={m.settings_advanced_background_hint()}
						initial={data.backgroundModel}
						shortcuts={data.backgroundModelShortcuts}
					/>
				</div>
			</div>
		</section>

		<section class="ui-form-card">
			<h2 class="ui-section-title mb-3">{m.settings_advanced_temperature_heading()}</h2>
			<div class="flex items-center justify-between gap-2">
				<span class="ui-field-label" id="temperature-label">{m.settings_advanced_temperature_label()}</span>
				<span class="text-[11px] text-base-content/40">{SOURCE_LABEL[temperatureEffective.source]}</span>
			</div>
			<p class="mt-1.5 mb-2 text-xs text-base-content/50">
				{m.settings_advanced_temperature_desc()}
			</p>
			<div class="flex flex-wrap items-center gap-1.5">
				<input
					type="number"
					min="0"
					max="2"
					step="0.1"
					placeholder={m.settings_advanced_temperature_placeholder()}
					class="ui-field w-24"
					aria-labelledby="temperature-label"
					bind:value={temperatureInput}
					disabled={temperatureSaving}
				/>
				<PendingButton
					class="ui-action ui-action-primary"
					pending={temperatureSaving}
					disabled={!temperatureInput.trim()}
					onclick={saveTemperature}
				>
					{m.settingsshell_save_button()}
				</PendingButton>
				{#if temperatureEffective.source !== 'default'}
					<button
						type="button"
						class="ui-action ui-action-tertiary"
						disabled={temperatureSaving}
						onclick={resetTemperature}
					>
						{m.settingsshell_reset_button()}
					</button>
				{/if}
			</div>
		</section>

		<section class="ui-form-card">
			<h2 class="ui-section-title mb-3">{m.settings_advanced_env_knobs_heading()}</h2>
			<p class="mb-3 text-xs text-base-content/50">
				{m.settings_advanced_env_knobs_desc()} <code class="text-[11px]">.env.example</code>.
			</p>
			<div class="flex flex-col divide-y divide-base-300">
				{#each data.envKnobs as knob (knob.name)}
					<div class="py-2.5 first:pt-0">
						<div class="flex items-center justify-between gap-2">
							<code class="text-xs font-semibold">{knob.name}</code>
							{#if knob.current !== null}
								<span
									class="max-w-[55%] truncate text-[11px] text-base-content/40"
									title={knob.current}>{knob.current}</span
								>
							{:else}
								<span class="text-[11px] text-base-content/30">{m.settings_advanced_env_default_prefix({ value: knob.default })}</span>
							{/if}
						</div>
						<p class="mt-0.5 text-xs text-base-content/50">{knob.description}</p>
					</div>
				{/each}
				<div class="py-2.5 last:pb-0">
					<p class="text-xs font-semibold">{m.settings_advanced_pricing_heading()}</p>
					<p class="mt-0.5 text-xs text-base-content/50">
						<code class="text-[11px]">*_PRICE_PER_M</code> {m.settings_advanced_pricing_desc_a()}
						<code class="text-[11px]">GLM5_INPUT_PRICE_PER_M</code>{m.settings_advanced_pricing_desc_b()}
						<code class="text-[11px]">pricing.ts</code>.
					</p>
				</div>
			</div>
		</section>
	</div>
</div>
