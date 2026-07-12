<script lang="ts">
	import { base } from '$app/paths';
	import { invalidateAll } from '$app/navigation';
	import SettingsPanelHeader from '$lib/components/settings/SettingsPanelHeader.svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	function connectionChip(connected: boolean): string {
		return connected ? 'ui-chip-active' : 'ui-chip-muted';
	}

	let ahPayload = $state('');
	let ahSaving = $state(false);
	let ahError = $state('');
	let ahShowForm = $state(false);

	function toggleAhForm() {
		ahShowForm = !ahShowForm;
		if (!ahShowForm) {
			ahError = '';
			ahPayload = '';
		}
	}

	async function connectAh() {
		const payload = ahPayload.trim();
		if (!payload) return;
		ahSaving = true;
		ahError = '';
		try {
			const res = await fetch(`${base}/api/settings/ah`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ payload })
			});
			const body = await res.json();
			if (!res.ok || !body.ok) {
				ahError = body.reason ?? 'Could not connect to Albert Heijn.';
				toast.error(ahError);
			} else {
				toast.success(`Connected to AH${body.memberName ? ` as ${body.memberName}` : ''}`);
				ahPayload = '';
				ahShowForm = false;
				await invalidateAll();
			}
		} catch {
			ahError = 'Connection error';
			toast.error(ahError);
		} finally {
			ahSaving = false;
		}
	}
</script>

<svelte:head>
	<title>Connections - Settings</title>
</svelte:head>

<div class="ui-page-shell px-4 pt-4">
	<SettingsPanelHeader title="Connections" />

	<section class="ui-form-card">
		<div class="mb-3 flex items-center justify-between gap-3">
			<h2 class="ui-section-label">Albert Heijn</h2>
			<div class="flex flex-wrap justify-end gap-1.5" role="status" aria-live="polite">
				<span class={connectionChip(data.ah.connected)}>{data.ah.connected ? 'connected' : 'off'}</span>
			</div>
		</div>

		<div class="flex flex-col gap-4">
			<div>
				<div class="mb-1 flex items-center justify-between gap-2">
					<h3 class="text-sm font-semibold">Albert Heijn</h3>
					{#if data.ah.connected && data.ah.memberName}
						<span class="text-xs text-base-content/50">{data.ah.memberName}</span>
					{/if}
				</div>
				<p class="text-xs text-base-content/50">
					{data.ah.connected
						? 'Shopping-list pushes go to the connected AH app account.'
						: 'Connect Albert Heijn to send your shopping list straight to the AH app.'}
				</p>
				{#if data.ah.connected}
					<button type="button" class="btn btn-xs btn-ghost mt-2 px-0 text-base-content/60" onclick={toggleAhForm}>
						{ahShowForm ? 'Cancel' : 'Reconnect'}
					</button>
				{:else}
					<button type="button" class="btn btn-sm btn-primary mt-2" onclick={toggleAhForm}>
						{ahShowForm ? 'Cancel' : 'Connect Albert Heijn'}
					</button>
				{/if}
			</div>

			{#if ahShowForm}
				<div class="flex flex-col gap-3 border-t border-base-300 pt-3">
					<p class="text-xs text-base-content/50">
						Connecting links this household's Albert Heijn account so shopping lists can be sent
						straight to the AH app.
					</p>
					<details open class="text-xs">
						<summary class="cursor-pointer font-medium text-base-content/50 select-none">
							How to connect
						</summary>
						<div class="mt-2 flex flex-col gap-2">
							<label class="ui-field-label" for="ah-payload">Token from the login script</label>
							<p class="text-xs text-base-content/50">
								On your computer, run <code class="font-mono">python scripts/ah_local_login.py</code>
								and log in to Albert Heijn. It copies a token to your clipboard — paste it below to
								connect.
							</p>
							<textarea
								id="ah-payload"
								class="textarea textarea-bordered textarea-sm font-mono text-xs"
								rows="3"
								placeholder={'{"access_token": "...", "refresh_token": "..."}'}
								bind:value={ahPayload}
							></textarea>
							<button
								type="button"
								class="btn btn-sm btn-primary self-start"
								onclick={connectAh}
								disabled={ahSaving || !ahPayload.trim()}
							>
								{ahSaving ? 'Checking...' : 'Connect AH'}
							</button>
							{#if ahError}
								<p class="text-sm text-error" role="alert">{ahError}</p>
							{/if}
						</div>
					</details>
				</div>
			{/if}
		</div>
	</section>
</div>
