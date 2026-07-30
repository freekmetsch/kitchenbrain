<script lang="ts">
	import { base } from '$app/paths';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import Icon from '$lib/components/ui/icons/Icon.svelte';
	import { invalidateAll } from '$app/navigation';
	import SettingsPanelHeader from '$lib/components/settings/SettingsPanelHeader.svelte';
	import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
	import KitchenNotice from '$lib/components/ui/KitchenNotice.svelte';
	import StatusBadge from '$lib/components/ui/StatusBadge.svelte';
	import { m } from '$lib/paraglide/messages';
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
			toast.success(m.settings_data_export_ready());
		} catch {
			toast.error(m.settings_data_export_failed());
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
				importError = body.error ?? m.settings_data_import_failed();
				toast.error(importError);
			} else {
				toast.success(m.settings_data_import_complete());
				importFile = null;
				if (importFileInput) importFileInput.value = '';
				await invalidateAll();
			}
		} catch {
			importError = m.settings_data_connection_error();
			toast.error(importError);
		} finally {
			importLoading = false;
		}
	}

	// ── Reset (type-the-exact-group-name confirm, re-checked server-side) ──
	type ResetGroup = PageData['resetGroups'][number];

	function resetGroupLabel(key: ResetGroup['key']): string {
		switch (key) {
			case 'inventory': return m.settings_data_group_inventory();
			case 'recipes': return m.settings_data_group_recipes();
			case 'meal_history': return m.settings_data_group_meal_history();
			case 'chat_history': return m.settings_data_group_chat_history();
			case 'spending_log': return m.settings_data_group_spending_log();
			case 'shopping_data': return m.settings_data_group_shopping_data();
			case 'ah_favorites': return m.settings_data_group_ah_favorites();
		}
	}

	function resetGroupDescription(key: ResetGroup['key']): string {
		switch (key) {
			case 'inventory': return m.settings_data_group_inventory_desc();
			case 'recipes': return m.settings_data_group_recipes_desc();
			case 'meal_history': return m.settings_data_group_meal_history_desc();
			case 'chat_history': return m.settings_data_group_chat_history_desc();
			case 'spending_log': return m.settings_data_group_spending_log_desc();
			case 'shopping_data': return m.settings_data_group_shopping_data_desc();
			case 'ah_favorites': return m.settings_data_group_ah_favorites_desc();
		}
	}

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
				resetError = body.error ?? m.settings_data_reset_failed();
			} else {
				toast.success(m.settings_data_reset_success({ label: resetTarget.label }));
				resetOpen = false;
				await invalidateAll();
			}
		} catch {
			resetError = m.settings_data_connection_error();
		} finally {
			resetLoading = false;
		}
	}
</script>

<svelte:head>
	<title>{m.settings_data_title()}</title>
</svelte:head>

<div class="ui-page-shell px-4 pt-4">
	<SettingsPanelHeader title={m.settingsshell_panel_data()} />

	<div class="flex flex-col gap-5">
		<section class="ui-form-card">
			<h2 class="ui-section-title mb-3">{m.settings_data_export_heading()}</h2>
			<button
				type="button"
				class="ui-action ui-action-secondary w-full"
				onclick={downloadExport}
				disabled={exportLoading}
			>
				{#if exportLoading}
					<Spinner size="xs" />
				{/if}
				{m.settings_data_export_button()}
			</button>
		</section>

		<section class="ui-form-card">
			<h2 class="ui-section-title mb-3">{m.settings_data_import_heading()}</h2>
			<p class="mb-3 text-xs text-base-content/50">{m.settings_data_import_desc()}</p>
			{#if data.importEligible}
				<KitchenNotice tone="success" class="mb-3 text-sm font-medium">
					<span class="flex items-center gap-2">
						<Icon name="check" class="h-4 w-4 shrink-0 text-success" />
						{m.settings_data_import_ready()}
					</span>
				</KitchenNotice>
			{:else}
				<KitchenNotice tone="warning" class="mb-3">
					<div class="flex items-start gap-2">
						<Icon name="warn" class="mt-0.5 h-4 w-4 shrink-0 text-warning" />
						<div class="min-w-0 flex-1">
							<p class="text-sm font-semibold">
								{m.settings_data_import_blocked({ count: data.importBlockerCount })}
							</p>
							<ul class="mt-2 flex flex-col gap-1">
								{#each data.resetGroups.filter((group) => group.blocksImport) as group (group.key)}
									<li>
										<a
											href={`#reset-group-${group.key}`}
											class="flex min-h-11 items-center justify-between gap-3 rounded-lg bg-base-100 px-3 py-2 text-sm font-medium text-primary"
										>
											<span>{resetGroupLabel(group.key)}</span>
											<StatusBadge>{group.count}</StatusBadge>
										</a>
									</li>
								{/each}
							</ul>
						</div>
					</div>
				</KitchenNotice>
			{/if}
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
				class="ui-action ui-action-secondary w-full"
				disabled={!data.importEligible || importLoading}
				onclick={() => importFileInput?.click()}
			>
				{importFile ? importFile.name : m.settings_data_choose_file_button()}
			</button>
			{#if importError}
				<p class="mt-2 text-sm text-error" role="alert">{importError}</p>
			{/if}
			<button
				type="button"
				class="ui-action ui-action-primary mt-2 w-full"
				disabled={!data.importEligible || !importFile || importLoading}
				onclick={runImport}
			>
				{#if importLoading}
					<Spinner size="xs" />
				{/if}
				{m.settings_data_import_button()}
			</button>
		</section>

		<section class="ui-form-card">
			<h2 class="ui-section-title mb-3">{m.settings_data_reset_heading()}</h2>
			<p class="mb-3 text-xs text-base-content/50">
				{m.settings_data_reset_desc()}
			</p>
			<div class="flex flex-col divide-y divide-base-300">
				{#each data.resetGroups as group (group.key)}
					<div
						id={`reset-group-${group.key}`}
						class="flex scroll-mt-20 items-center justify-between gap-3 rounded-lg py-2.5 focus:outline-2 focus:outline-primary"
						tabindex="-1"
					>
						<div class="min-w-0">
							<p class="text-sm font-medium">{resetGroupLabel(group.key)}</p>
							<p class="text-xs text-base-content/50">{resetGroupDescription(group.key)}</p>
						</div>
						<div class="flex shrink-0 items-center gap-2">
							<span class="text-xs tabular-nums text-base-content/40">{group.count}</span>
							<button
								type="button"
								class="ui-action ui-action-danger"
								disabled={group.count === 0}
								onclick={() => openReset(group)}
							>
								{m.settingsshell_reset_button()}
							</button>
						</div>
					</div>
				{/each}
			</div>
		</section>
	</div>
</div>

<BottomSheet
	bind:open={resetOpen}
	title={resetTarget ? resetGroupLabel(resetTarget.key) : undefined}
	onclose={() => (resetTarget = null)}
>
	{#if resetTarget}
		<p class="mb-3 text-sm text-base-content/70">
			{#if resetTarget.count === 1}
				{m.settings_data_reset_confirm_body_singular({ count: resetTarget.count, label: resetTarget.label })}
			{:else}
				{m.settings_data_reset_confirm_body_plural({ count: resetTarget.count, label: resetTarget.label })}
			{/if}
		</p>
		<input
			type="text"
			class="ui-field w-full"
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
			<button type="button" class="ui-action ui-action-tertiary flex-1" onclick={() => (resetOpen = false)}>
				{m.settings_data_cancel_button()}
			</button>
			<button
				type="button"
				class="ui-action ui-action-danger flex-1"
				disabled={resetConfirmText !== resetTarget.label || resetLoading}
				onclick={confirmReset}
			>
				{#if resetLoading}<Spinner size="xs" />{/if}
				{m.settings_data_delete_button()}
			</button>
		</div>
	{/if}
</BottomSheet>
