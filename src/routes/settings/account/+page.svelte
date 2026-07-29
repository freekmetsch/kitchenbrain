<script lang="ts">
	import { base } from '$app/paths';
	import SettingsPanelHeader from '$lib/components/settings/SettingsPanelHeader.svelte';
	import PendingButton from '$lib/components/ui/PendingButton.svelte';
	import { m } from '$lib/paraglide/messages';
	import { toast } from '$lib/stores/toast.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let currentPwd = $state('');
	let newPwd = $state('');
	let confirmPwd = $state('');
	let pwdError = $state('');
	let pwdLoading = $state(false);

	async function changePassword() {
		pwdError = '';
		if (newPwd !== confirmPwd) {
			pwdError = m.settings_account_password_mismatch();
			toast.error(pwdError);
			return;
		}
		pwdLoading = true;
		try {
			const res = await fetch(`${base}/api/settings/password`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ current_password: currentPwd, new_password: newPwd })
			});
			const body = await res.json();
			if (!res.ok) {
				pwdError = body.error ?? m.settings_account_change_password_failed();
				toast.error(pwdError);
			} else {
				currentPwd = '';
				newPwd = '';
				confirmPwd = '';
				toast.success(m.settings_account_password_changed());
			}
		} catch {
			pwdError = m.settingsshell_toast_connection_error();
			toast.error(pwdError);
		} finally {
			pwdLoading = false;
		}
	}
</script>

<svelte:head>
	<title>{m.settings_account_title()}</title>
</svelte:head>

<div class="ui-page-shell px-4 pt-4">
	<SettingsPanelHeader title={m.settingsshell_panel_account()} />

	<div class="flex flex-col gap-5">
		<section class="ui-form-card">
			<h2 class="ui-section-title mb-3">{m.settings_account_password_heading()}</h2>
			<p class="mb-3 text-xs text-base-content/50">{m.settings_account_signed_in_as({ username: data.username })}</p>
			<form class="flex flex-col gap-2" onsubmit={(e) => { e.preventDefault(); void changePassword(); }}>
				<label class="ui-field-label" for="current-password">{m.settings_account_current_password_label()}</label>
				<input
					id="current-password"
					type="password"
					class="ui-field"
					bind:value={currentPwd}
					autocomplete="current-password"
					required
				/>
				<label class="ui-field-label" for="new-password">{m.settings_account_new_password_label()}</label>
				<input
					id="new-password"
					type="password"
					class="ui-field"
					bind:value={newPwd}
					autocomplete="new-password"
					required
					minlength="8"
				/>
				<label class="ui-field-label" for="confirm-password">{m.settings_account_confirm_password_label()}</label>
				<input
					id="confirm-password"
					type="password"
					class="ui-field"
					bind:value={confirmPwd}
					autocomplete="new-password"
					required
					minlength="8"
				/>
				{#if pwdError}
					<p class="text-sm text-error" role="alert">{pwdError}</p>
				{/if}
				<PendingButton class="ui-action ui-action-primary mt-1" type="submit" pending={pwdLoading}>
					{pwdLoading ? m.settings_account_saving_label() : m.settings_account_update_password_button()}
				</PendingButton>
			</form>
		</section>

		<a href="{base}/logout" class="ui-action ui-action-danger w-full">{m.settings_account_logout_button()}</a>
	</div>
</div>
