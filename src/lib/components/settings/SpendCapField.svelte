<!--
	Editable €/day spend cap (chat or background) with effective-value provenance
	+ reset-to-default, against POST /api/settings/spend-caps. See
	FEATURE_LIST_SETTINGS_MENU.md Phase 1c.
-->
<script lang="ts">
	import { base } from '$app/paths';
	import { invalidateAll } from '$app/navigation';
	import { toast } from '$lib/stores/toast.svelte';
	import { SOURCE_LABEL, type ConfigSource } from '$lib/components/settings/provenance';
	import { untrack } from 'svelte';
	import { m } from '$lib/paraglide/messages';

	type Category = 'chat' | 'background';

	let {
		category,
		label,
		initial
	}: {
		category: Category;
		label: string;
		initial: { value: number; source: ConfigSource };
	} = $props();

	let capInput = $state(untrack(() => String(initial.value)));
	let effective = $state(untrack(() => initial));
	let saving = $state(false);

	async function save() {
		const n = parseFloat(capInput);
		if (!Number.isFinite(n) || n <= 0 || n > 20 || saving) return;
		saving = true;
		try {
			const res = await fetch(`${base}/api/settings/spend-caps`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ category, cap_eur: n })
			});
			const body = await res.json();
			if (!res.ok || !body.ok) {
				toast.error(m.settingsshell_toast_cap_save_failed());
				return;
			}
			effective = body.effective;
			capInput = String(body.effective.value);
			toast.success(m.settingsshell_toast_cap_saved({ label: label.toLowerCase() }));
			await invalidateAll();
		} finally {
			saving = false;
		}
	}

	async function resetToDefault() {
		if (saving) return;
		saving = true;
		try {
			const res = await fetch(`${base}/api/settings/spend-caps`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ category, reset: true })
			});
			const body = await res.json();
			if (!res.ok || !body.ok) {
				toast.error(m.settingsshell_toast_reset_failed());
				return;
			}
			effective = body.effective;
			capInput = String(body.effective.value);
			toast.success(m.settingsshell_reset_to_default());
			await invalidateAll();
		} finally {
			saving = false;
		}
	}
</script>

<div class="flex flex-col gap-1">
	<div class="flex items-center justify-between gap-2">
		<span class="ui-field-label" id="{category}-cap-label">{label}</span>
		<span class="text-[11px] text-base-content/40">{SOURCE_LABEL[effective.source]}</span>
	</div>
	<div class="flex flex-wrap items-center gap-1.5">
		<span class="text-xs text-base-content/50">EUR</span>
		<input
			type="number"
			min="0.01"
			max="20"
			step="0.01"
			class="input input-bordered input-sm w-24"
			aria-labelledby="{category}-cap-label"
			bind:value={capInput}
			disabled={saving}
		/>
		<span class="text-xs text-base-content/50">{m.settingsshell_per_day_suffix()}</span>
		<button
			type="button"
			class="btn btn-xs btn-primary"
			disabled={saving || !capInput || capInput === String(effective.value)}
			onclick={save}
		>
			{m.settingsshell_save_button()}
		</button>
		{#if effective.source !== 'default'}
			<button
				type="button"
				class="btn btn-xs btn-ghost text-base-content/50"
				disabled={saving}
				onclick={resetToDefault}
			>
				{m.settingsshell_reset_button()}
			</button>
		{/if}
	</div>
</div>
