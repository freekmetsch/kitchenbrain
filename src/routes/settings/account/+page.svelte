<script lang="ts">
	import { base } from '$app/paths';
	import SettingsPanelHeader from '$lib/components/settings/SettingsPanelHeader.svelte';
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
			pwdError = 'Passwords do not match';
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
				pwdError = body.error ?? 'Could not change password';
				toast.error(pwdError);
			} else {
				currentPwd = '';
				newPwd = '';
				confirmPwd = '';
				toast.success('Password changed');
			}
		} catch {
			pwdError = 'Connection error';
			toast.error(pwdError);
		} finally {
			pwdLoading = false;
		}
	}
</script>

<svelte:head>
	<title>Account - Settings</title>
</svelte:head>

<div class="ui-page-shell px-4 pt-4">
	<SettingsPanelHeader title="Account" />

	<div class="flex flex-col gap-5">
		<section class="ui-form-card">
			<h2 class="ui-section-label mb-3">Password</h2>
			<p class="mb-3 text-xs text-base-content/50">Signed in as {data.username}</p>
			<form class="flex flex-col gap-2" onsubmit={(e) => { e.preventDefault(); void changePassword(); }}>
				<label class="ui-field-label" for="current-password">Current password</label>
				<input
					id="current-password"
					type="password"
					class="input input-bordered input-sm"
					bind:value={currentPwd}
					autocomplete="current-password"
					required
				/>
				<label class="ui-field-label" for="new-password">New password</label>
				<input
					id="new-password"
					type="password"
					class="input input-bordered input-sm"
					bind:value={newPwd}
					autocomplete="new-password"
					required
					minlength="8"
				/>
				<label class="ui-field-label" for="confirm-password">Repeat new password</label>
				<input
					id="confirm-password"
					type="password"
					class="input input-bordered input-sm"
					bind:value={confirmPwd}
					autocomplete="new-password"
					required
					minlength="8"
				/>
				{#if pwdError}
					<p class="text-sm text-error" role="alert">{pwdError}</p>
				{/if}
				<button class="btn btn-sm btn-primary mt-1" type="submit" disabled={pwdLoading}>
					{pwdLoading ? 'Saving...' : 'Update password'}
				</button>
			</form>
		</section>

		<a href="{base}/logout" class="btn btn-sm btn-ghost w-full text-error">Log out</a>
	</div>
</div>
