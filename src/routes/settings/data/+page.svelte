<script lang="ts">
	import { base } from '$app/paths';
	import { invalidateAll } from '$app/navigation';
	import SettingsPanelHeader from '$lib/components/settings/SettingsPanelHeader.svelte';
	import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let exportLoading = $state(false);

	async function downloadExport() {
		exportLoading = true;
		try {
			const res = await fetch(`${base}/api/settings/export`);
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const blob = await res.blob();
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `household-brain-export-${new Date().toISOString().slice(0, 10)}.json`;
			a.click();
			URL.revokeObjectURL(url);
			toast.success('Export ready');
		} catch {
			toast.error('Could not export data.');
		} finally {
			exportLoading = false;
		}
	}

	// ── Import (bootstrap mode only — server re-checks eligibility regardless
	// of what this panel shows, per Correctness Req #3) ─────────────────────
	let importFileInput = $state<HTMLInputElement>();
	let importFile = $state<File | null>(null);
	let importLoading = $state(false);
	let importError = $state('');

	function pickImportFile(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		importFile = input.files?.[0] ?? null;
		importError = '';
	}

	async function runImport() {
		if (!importFile || importLoading) return;
		importLoading = true;
		importError = '';
		try {
			const text = await importFile.text();
			const res = await fetch(`${base}/api/settings/import`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: text
			});
			const body = await res.json();
			if (!res.ok || !body.ok) {
				importError = body.error ?? 'Import failed.';
				toast.error(importError);
			} else {
				toast.success('Import complete');
				importFile = null;
				if (importFileInput) importFileInput.value = '';
				await invalidateAll();
			}
		} catch {
			importError = 'Connection error.';
			toast.error(importError);
		} finally {
			importLoading = false;
		}
	}

	// ── Reset (type-the-exact-group-name confirm, re-checked server-side) ──
	type ResetGroup = PageData['resetGroups'][number];

	let resetOpen = $state(false);
	let resetTarget = $state<ResetGroup | null>(null);
	let resetConfirmText = $state('');
	let resetLoading = $state(false);
	let resetError = $state('');

	function openReset(group: ResetGroup) {
		resetTarget = group;
		resetConfirmText = '';
		resetError = '';
		resetOpen = true;
	}

	async function confirmReset() {
		if (!resetTarget || resetLoading) return;
		resetLoading = true;
		resetError = '';
		try {
			const res = await fetch(`${base}/api/settings/reset`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ group: resetTarget.key, confirm: resetConfirmText })
			});
			const body = await res.json();
			if (!res.ok || !body.ok) {
				resetError = body.error ?? 'Reset failed.';
			} else {
				toast.success(`${resetTarget.label} reset`);
				resetOpen = false;
				await invalidateAll();
			}
		} catch {
			resetError = 'Connection error.';
		} finally {
			resetLoading = false;
		}
	}
</script>

<svelte:head>
	<title>Data - Settings</title>
</svelte:head>

<div class="ui-page-shell px-4 pt-4">
	<SettingsPanelHeader title="Data" />

	<div class="flex flex-col gap-5">
		<section class="ui-form-card">
			<h2 class="ui-section-label mb-3">Export</h2>
			<button
				type="button"
				class="btn btn-sm btn-outline w-full"
				onclick={downloadExport}
				disabled={exportLoading}
			>
				{#if exportLoading}
					<span class="loading loading-spinner loading-xs"></span>
				{/if}
				Export as JSON
			</button>
		</section>

		<section class="ui-form-card">
			<h2 class="ui-section-label mb-3">Import</h2>
			<p class="mb-3 text-xs text-base-content/50">
				{#if data.importEligible}
					Restore recipes, inventory, and the meal plan/log from a previous export. Only works on
					an empty database.
				{:else}
					{data.importIneligibleReason}
				{/if}
			</p>
			<input
				bind:this={importFileInput}
				type="file"
				accept="application/json"
				class="hidden"
				disabled={!data.importEligible || importLoading}
				onchange={pickImportFile}
			/>
			<button
				type="button"
				class="btn btn-sm btn-outline w-full"
				disabled={!data.importEligible || importLoading}
				onclick={() => importFileInput?.click()}
			>
				{importFile ? importFile.name : 'Choose export file'}
			</button>
			{#if importError}
				<p class="mt-2 text-sm text-error" role="alert">{importError}</p>
			{/if}
			<button
				type="button"
				class="btn btn-sm btn-primary mt-2 w-full"
				disabled={!data.importEligible || !importFile || importLoading}
				onclick={runImport}
			>
				{#if importLoading}
					<span class="loading loading-spinner loading-xs"></span>
				{/if}
				Import
			</button>
		</section>

		<section class="ui-form-card">
			<h2 class="ui-section-label mb-3">Reset data</h2>
			<p class="mb-3 text-xs text-base-content/50">
				Permanently deletes the selected group. This cannot be undone.
			</p>
			<div class="flex flex-col divide-y divide-base-300">
				{#each data.resetGroups as group (group.key)}
					<div class="flex items-center justify-between gap-3 py-2.5">
						<div class="min-w-0">
							<p class="text-sm font-medium">{group.label}</p>
							<p class="text-xs text-base-content/50">{group.description}</p>
						</div>
						<div class="flex shrink-0 items-center gap-2">
							<span class="text-xs tabular-nums text-base-content/40">{group.count}</span>
							<button
								type="button"
								class="btn btn-outline btn-error btn-sm"
								disabled={group.count === 0}
								onclick={() => openReset(group)}
							>
								Reset
							</button>
						</div>
					</div>
				{/each}
			</div>
		</section>
	</div>
</div>

<BottomSheet bind:open={resetOpen} title={resetTarget?.label} onclose={() => (resetTarget = null)}>
	{#if resetTarget}
		<p class="mb-3 text-sm text-base-content/70">
			This permanently deletes <strong>{resetTarget.count}</strong>
			row{resetTarget.count === 1 ? '' : 's'} from {resetTarget.label}. Type
			<strong>{resetTarget.label}</strong> to confirm.
		</p>
		<input
			type="text"
			class="input input-bordered input-sm w-full"
			autocapitalize="off"
			autocorrect="off"
			spellcheck="false"
			bind:value={resetConfirmText}
			placeholder={resetTarget.label}
		/>
		{#if resetError}
			<p class="mt-2 text-sm text-error" role="alert">{resetError}</p>
		{/if}
		<div class="mt-4 flex gap-2">
			<button type="button" class="btn btn-ghost btn-sm flex-1" onclick={() => (resetOpen = false)}>
				Cancel
			</button>
			<button
				type="button"
				class="btn btn-error btn-sm flex-1"
				disabled={resetConfirmText !== resetTarget.label || resetLoading}
				onclick={confirmReset}
			>
				{#if resetLoading}<span class="loading loading-spinner loading-xs"></span>{/if}
				Delete
			</button>
		</div>
	{/if}
</BottomSheet>
