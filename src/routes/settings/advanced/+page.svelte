<script lang="ts">
	import { base } from '$app/paths';
	import { invalidateAll } from '$app/navigation';
	import ModelPicker from '$lib/components/settings/ModelPicker.svelte';
	import SettingsPanelHeader from '$lib/components/settings/SettingsPanelHeader.svelte';
	import { SOURCE_LABEL } from '$lib/components/settings/provenance';
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
				toast.error('Could not save temperature.');
				return;
			}
			temperatureEffective = { value: n, source: 'ui' };
			toast.success('Saved temperature');
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
				toast.error('Could not reset.');
				return;
			}
			temperatureInput = '';
			temperatureEffective = { value: null, source: 'default' };
			toast.success('Reset to default');
			await invalidateAll();
		} finally {
			temperatureSaving = false;
		}
	}
</script>

<svelte:head>
	<title>Advanced - Settings</title>
</svelte:head>

<div class="ui-page-shell px-4 pt-4">
	<SettingsPanelHeader title="Advanced" />

	<div class="flex flex-col gap-5">
		<section class="ui-form-card">
			<h2 class="ui-section-label mb-3">Model</h2>
			<div class="flex flex-col gap-4">
				<ModelPicker
					role="vision"
					label="Vision model"
					hint="Handles photo turns in chat. Must support image input."
					initial={data.visionModel}
					shortcuts={data.visionModelShortcuts}
				/>
				<div class="border-t border-base-300 pt-4">
					<ModelPicker
						role="background"
						label="Background model"
						hint="Recipe ingest + translate — cheap, no chat-latency requirement."
						initial={data.backgroundModel}
						shortcuts={data.backgroundModelShortcuts}
					/>
				</div>
			</div>
		</section>

		<section class="ui-form-card">
			<h2 class="ui-section-label mb-3">Temperature</h2>
			<div class="flex items-center justify-between gap-2">
				<span class="ui-field-label" id="temperature-label">Output randomness (0-2)</span>
				<span class="text-[11px] text-base-content/40">{SOURCE_LABEL[temperatureEffective.source]}</span>
			</div>
			<p class="mt-1.5 mb-2 text-xs text-base-content/50">
				Leave blank to use the model's own default. Lower is more focused; higher is more varied.
			</p>
			<div class="flex flex-wrap items-center gap-1.5">
				<input
					type="number"
					min="0"
					max="2"
					step="0.1"
					placeholder="default"
					class="input input-bordered input-sm w-24"
					aria-labelledby="temperature-label"
					bind:value={temperatureInput}
					disabled={temperatureSaving}
				/>
				<button
					type="button"
					class="btn btn-xs btn-primary"
					disabled={temperatureSaving || !temperatureInput.trim()}
					onclick={saveTemperature}
				>
					Save
				</button>
				{#if temperatureEffective.source !== 'default'}
					<button
						type="button"
						class="btn btn-xs btn-ghost text-base-content/50"
						disabled={temperatureSaving}
						onclick={resetTemperature}
					>
						Reset
					</button>
				{/if}
			</div>
		</section>

		<section class="ui-form-card">
			<h2 class="ui-section-label mb-3">Environment-only knobs</h2>
			<p class="mb-3 text-xs text-base-content/50">
				These stay env-only by design — infra or dangerous enough that a UI control isn't worth
				the risk. Set them where you deploy; see <code class="text-[11px]">v2/.env.example</code>.
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
								<span class="text-[11px] text-base-content/30">default: {knob.default}</span>
							{/if}
						</div>
						<p class="mt-0.5 text-xs text-base-content/50">{knob.description}</p>
					</div>
				{/each}
				<div class="py-2.5 last:pb-0">
					<p class="text-xs font-semibold">Per-model pricing overrides</p>
					<p class="mt-0.5 text-xs text-base-content/50">
						<code class="text-[11px]">*_PRICE_PER_M</code> vars per model (e.g.
						<code class="text-[11px]">GLM5_INPUT_PRICE_PER_M</code>) — fallback USD/M-token
						rates used only when a provider doesn't report its own cost. Rarely needed; see
						<code class="text-[11px]">pricing.ts</code>.
					</p>
				</div>
			</div>
		</section>
	</div>
</div>
