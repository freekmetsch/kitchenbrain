<script lang="ts">
	import { base } from '$app/paths';
	import { enhance } from '$app/forms';
	import { m } from '$lib/paraglide/messages';
	import { getLocale, setLocale } from '$lib/paraglide/runtime';
	import PendingButton from '$lib/components/ui/PendingButton.svelte';

	let { form } = $props<{ form: { error?: string } | null }>();

	let submitting = $state(false);
</script>

<div class="min-h-screen flex items-center justify-center bg-base-200 p-4">
	<div class="card w-full max-w-sm bg-base-100 shadow-xl">
		<div class="card-body">
			<div class="flex flex-wrap items-center justify-between gap-2">
				<h1 class="card-title text-2xl font-bold">{m.login_title()}</h1>
				<div class="ml-auto flex gap-1 text-xs" role="group" aria-label="Language">
					<button
						type="button"
						class="ui-action ui-action-tertiary px-1.5 {getLocale() === 'en' ? 'font-bold underline' : ''}"
						onclick={() => setLocale('en')}>English</button
					>
					<button
						type="button"
						class="ui-action ui-action-tertiary px-1.5 {getLocale() === 'nl' ? 'font-bold underline' : ''}"
						onclick={() => setLocale('nl')}>Nederlands</button
					>
				</div>
			</div>
			<p class="text-base-content/60 text-sm mb-2">{m.login_subtitle()}</p>

			{#if form?.error}
				<div class="alert alert-error text-sm py-2">
					<span>{form.error}</span>
				</div>
			{/if}

			<form
				method="POST"
				action="{base}/login"
				class="space-y-4"
				use:enhance={() => {
					submitting = true;
					return async ({ update }) => {
						await update();
						submitting = false;
					};
				}}
			>
				<label class="form-control w-full">
					<div class="label"><span class="label-text">{m.login_username_label()}</span></div>
					<input
						type="text"
						name="username"
						class="ui-field w-full"
						required
						autocomplete="username"
					/>
				</label>

				<label class="form-control w-full">
					<div class="label"><span class="label-text">{m.login_password_label()}</span></div>
					<input
						type="password"
						name="password"
						class="ui-field w-full"
						required
						autocomplete="current-password"
					/>
				</label>

				<PendingButton type="submit" pending={submitting} class="ui-action ui-action-primary w-full"
					>{m.login_signin_button()}</PendingButton
				>
			</form>
		</div>
	</div>
</div>
