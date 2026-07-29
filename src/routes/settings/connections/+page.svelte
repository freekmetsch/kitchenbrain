<script lang="ts">
	import { base } from '$app/paths';
	import { invalidateAll } from '$app/navigation';
	import SettingsPanelHeader from '$lib/components/settings/SettingsPanelHeader.svelte';
	import PendingButton from '$lib/components/ui/PendingButton.svelte';
	import KitchenNotice from '$lib/components/ui/KitchenNotice.svelte';
	import StatusBadge from '$lib/components/ui/StatusBadge.svelte';
	import Icon from '$lib/components/ui/icons/Icon.svelte';
	import { m } from '$lib/paraglide/messages';
	import { toast } from '$lib/stores/toast.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const LOGIN_COMMAND = 'python scripts/ah_local_login.py';

	let ahPayload = $state('');
	let ahSaving = $state(false);
	let ahError = $state('');
	let ahShowForm = $state(false);
	let ahShowManual = $state(false);
	let ahPasting = $state(false);
	let cmdCopied = $state(false);
	let cmdCopiedTimer: ReturnType<typeof setTimeout> | null = null;

	function toggleAhForm() {
		ahShowForm = !ahShowForm;
		if (!ahShowForm) {
			ahError = '';
			ahPayload = '';
			ahShowManual = false;
		}
	}

	// The pasted line is exactly {"access_token":"...","refresh_token":"..."}. Validate
	// client-side so a wrong clipboard (or a browser that blocks reads) gets a clear
	// nudge to the manual box instead of a server round-trip on garbage.
	function looksLikeToken(text: string): boolean {
		try {
			const o = JSON.parse(text);
			return !!o && typeof o === 'object' && typeof o.refresh_token === 'string' && o.refresh_token.length > 0;
		} catch {
			return false;
		}
	}

	async function copyCommand() {
		try {
			await navigator.clipboard.writeText(LOGIN_COMMAND);
			cmdCopied = true;
			if (cmdCopiedTimer) clearTimeout(cmdCopiedTimer);
			cmdCopiedTimer = setTimeout(() => (cmdCopied = false), 2000);
		} catch {
			// Clipboard write blocked — the command is on screen to select by hand.
		}
	}

	// One-tap finish: the login script already put the token on the clipboard, so
	// read it, validate it, and connect — no manual copy/paste. Falls back to the
	// manual box whenever the browser blocks the read or the clipboard isn't a token.
	async function pasteAndConnect() {
		if (ahPasting || ahSaving) return;
		ahError = '';
		ahPasting = true;
		let text: string;
		try {
			text = (await navigator.clipboard.readText()).trim();
		} catch {
			ahShowManual = true;
			ahError = m.settings_connections_clipboard_blocked();
			return;
		} finally {
			ahPasting = false;
		}
		if (!looksLikeToken(text)) {
			ahShowManual = true;
			ahError = m.settings_connections_clipboard_not_token();
			return;
		}
		await submitPayload(text);
	}

	async function connectAhManual() {
		await submitPayload(ahPayload.trim());
	}

	async function submitPayload(payload: string) {
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
				ahError = body.reason ?? m.settings_connections_connect_failed();
				toast.error(ahError);
			} else {
				toast.success(
					body.memberName
						? m.settings_connections_connected_as_toast({ name: body.memberName })
						: m.settings_connections_connected_toast()
				);
				ahPayload = '';
				ahShowForm = false;
				ahShowManual = false;
				await invalidateAll();
			}
		} catch {
			ahError = m.settingsshell_toast_connection_error();
			toast.error(ahError);
		} finally {
			ahSaving = false;
		}
	}
</script>

<svelte:head>
	<title>{m.settings_connections_title()}</title>
</svelte:head>

<div class="ui-page-shell px-4 pt-4">
	<SettingsPanelHeader title={m.settingsshell_panel_connections()} />

	<section class="ui-form-card">
		<div class="mb-3 flex items-center justify-between gap-3">
			<h2 class="ui-section-title">{m.settings_connections_ah_heading()}</h2>
			<div class="flex flex-wrap justify-end gap-1.5" role="status" aria-live="polite">
				<StatusBadge tone={data.ah.connected ? 'success' : 'neutral'}>
					{data.ah.connected ? m.settings_connections_status_connected() : m.settings_connections_status_off()}
				</StatusBadge>
			</div>
		</div>

		<div class="flex flex-col gap-4">
			<div>
				<div class="mb-1 flex items-center justify-between gap-2">
					<h3 class="text-sm font-semibold">{m.settings_connections_ah_heading()}</h3>
					{#if data.ah.connected && data.ah.memberName}
						<span class="text-xs text-base-content/50">{data.ah.memberName}</span>
					{/if}
				</div>
				<p class="text-xs text-base-content/50">
					{data.ah.connected
						? m.settings_connections_ah_connected_desc()
						: m.settings_connections_ah_disconnected_desc()}
				</p>
				{#if data.ah.connected}
					<button type="button" class="ui-action ui-action-tertiary mt-2 px-0" onclick={toggleAhForm}>
						{ahShowForm ? m.settings_connections_cancel_button() : m.settings_connections_reconnect_button()}
					</button>
				{:else}
					<button type="button" class="ui-action ui-action-primary mt-2" onclick={toggleAhForm}>
						{ahShowForm ? m.settings_connections_cancel_button() : m.settings_connections_connect_button()}
					</button>
				{/if}
			</div>

			{#if ahShowForm}
				<div class="flex flex-col gap-4 border-t border-base-300 pt-3">
					<p class="text-xs text-base-content/50">
						{m.settings_connections_connect_intro()}
					</p>

					<!-- Step 1 — run the login script -->
					<div class="flex flex-col gap-1.5">
						<h4 class="text-sm font-semibold">{m.settings_connections_step1_label()}</h4>
						<p class="text-xs text-base-content/50">{m.settings_connections_step1_desc()}</p>
						<div class="mt-0.5 flex items-center gap-2 rounded-lg border border-base-300 bg-base-200/60 py-1.5 pr-1.5 pl-2.5">
							<code class="flex-1 overflow-x-auto font-mono text-xs whitespace-nowrap text-base-content/80">{LOGIN_COMMAND}</code>
							<button
								type="button"
								class="ui-action ui-action-tertiary shrink-0"
								onclick={copyCommand}
								aria-label={m.settings_connections_copy_command()}
							>
								<Icon name={cmdCopied ? 'check' : 'copy'} class="h-3.5 w-3.5" />
								<span class="hidden sm:inline">{cmdCopied ? m.settings_connections_command_copied() : m.settings_connections_copy_command()}</span>
							</button>
						</div>
					</div>

					<!-- Step 2 — paste the token -->
					<div class="flex flex-col gap-1.5">
						<h4 class="text-sm font-semibold">{m.settings_connections_step2_label()}</h4>
						<p class="text-xs text-base-content/50">{m.settings_connections_step2_desc()}</p>
						<PendingButton
							class="ui-action ui-action-primary mt-0.5 self-start"
							onclick={pasteAndConnect}
							pending={ahSaving || ahPasting}
						>
							{#if !(ahSaving || ahPasting)}<Icon name="clipboard" class="h-4 w-4" />{/if}
							{ahSaving
								? m.settings_connections_checking_label()
								: m.settings_connections_paste_connect_button()}
						</PendingButton>

						{#if ahError}
							<KitchenNotice tone="error" class="text-sm" role="alert">
								<span class="flex items-start gap-2">
									<Icon name="warn" class="mt-0.5 h-4 w-4 shrink-0 text-error" />
									{ahError}
								</span>
							</KitchenNotice>
						{/if}

						{#if !ahShowManual}
							<button
								type="button"
								class="ui-action ui-action-tertiary mt-0.5 self-start px-0"
								onclick={() => (ahShowManual = true)}
							>
								{m.settings_connections_paste_manually()}
							</button>
						{:else}
							<div class="mt-1 flex flex-col gap-2">
								<label class="ui-field-label" for="ah-payload">{m.settings_connections_token_label()}</label>
								<textarea
									id="ah-payload"
									class="ui-field font-mono text-xs"
									rows="3"
									placeholder={'{"access_token": "...", "refresh_token": "..."}'}
									bind:value={ahPayload}
								></textarea>
								<div class="flex items-center gap-2">
									<PendingButton
										class="ui-action ui-action-primary self-start"
										onclick={connectAhManual}
										pending={ahSaving}
										disabled={!ahPayload.trim()}
									>
										{ahSaving ? m.settings_connections_checking_label() : m.settings_connections_connect_ah_button()}
									</PendingButton>
									<button
										type="button"
										class="ui-action ui-action-tertiary"
										onclick={() => (ahShowManual = false)}
									>
										{m.settings_connections_manual_hide()}
									</button>
								</div>
							</div>
						{/if}
					</div>
				</div>
			{/if}
		</div>
	</section>
</div>
