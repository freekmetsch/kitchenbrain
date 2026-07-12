<!--
	Free-text model id field + curated shortcut chips + effective-value provenance
	+ reset-to-default. Shared by the four model roles (chat/fallback in the AI
	panel, vision/background in Advanced) — same test-on-save + reset contract
	against POST /api/settings/models. See FEATURE_LIST_SETTINGS_MENU.md Phase 1c.
-->
<script lang="ts">
	import { base } from '$app/paths';
	import { invalidateAll } from '$app/navigation';
	import { toast } from '$lib/stores/toast.svelte';
	import { SOURCE_LABEL, type ConfigSource } from '$lib/components/settings/provenance';
	import { untrack } from 'svelte';

	type Role = 'chat' | 'chat_fallback' | 'vision' | 'background';

	let {
		role,
		label,
		hint,
		initial,
		shortcuts
	}: {
		role: Role;
		label: string;
		hint?: string;
		initial: { value: string; source: ConfigSource };
		shortcuts: string[];
	} = $props();

	let modelInput = $state(untrack(() => initial.value));
	let effective = $state(untrack(() => initial));
	let saving = $state(false);
	let testError = $state('');

	async function save() {
		const model = modelInput.trim();
		if (!model || saving || model === effective.value) return;
		saving = true;
		testError = '';
		try {
			const res = await fetch(`${base}/api/settings/models`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ role, model })
			});
			const body = await res.json();
			if (!res.ok || !body.ok) {
				testError = body.error ?? 'Model test failed.';
				toast.error(testError);
				return;
			}
			effective = body.effective;
			modelInput = body.effective.value;
			toast.success(`Saved ${label.toLowerCase()} model`);
			await invalidateAll();
		} catch {
			testError = 'Connection error';
			toast.error(testError);
		} finally {
			saving = false;
		}
	}

	async function resetToDefault() {
		if (saving) return;
		saving = true;
		testError = '';
		try {
			const res = await fetch(`${base}/api/settings/models`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ role, reset: true })
			});
			const body = await res.json();
			if (!res.ok || !body.ok) {
				toast.error('Could not reset.');
				return;
			}
			effective = body.effective;
			modelInput = body.effective.value;
			toast.success('Reset to default');
			await invalidateAll();
		} finally {
			saving = false;
		}
	}
</script>

<div class="flex flex-col gap-1.5">
	<div class="flex items-center justify-between gap-2">
		<span class="ui-field-label" id="{role}-model-label">{label}</span>
		<span class="text-[11px] text-base-content/40">{SOURCE_LABEL[effective.source]}</span>
	</div>
	{#if hint}<p class="text-xs text-base-content/50">{hint}</p>{/if}
	<div class="flex gap-1.5">
		<input
			type="text"
			class="input input-bordered input-sm flex-1 font-mono text-xs"
			aria-labelledby="{role}-model-label"
			bind:value={modelInput}
			disabled={saving}
		/>
		<button
			type="button"
			class="btn btn-sm btn-primary shrink-0"
			disabled={saving || !modelInput.trim() || modelInput.trim() === effective.value}
			onclick={save}
		>
			{saving ? '...' : 'Save'}
		</button>
	</div>
	{#if shortcuts.length}
		<div class="flex flex-wrap gap-1.5">
			{#each shortcuts as m (m)}
				<button
					type="button"
					class={m === modelInput ? 'ui-chip-active' : 'ui-chip'}
					onclick={() => (modelInput = m)}
				>
					{m}
				</button>
			{/each}
		</div>
	{/if}
	{#if effective.source !== 'default'}
		<button
			type="button"
			class="btn btn-xs btn-ghost self-start px-0 text-base-content/50"
			disabled={saving}
			onclick={resetToDefault}
		>
			Reset to default
		</button>
	{/if}
	{#if testError}
		<p class="text-xs text-error" role="alert">{testError}</p>
	{/if}
</div>
