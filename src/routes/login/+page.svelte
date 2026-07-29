<script lang="ts">
	import { base } from '$app/paths';
	import { enhance } from '$app/forms';
	import { m } from '$lib/paraglide/messages';
	import { getLocale, setLocale } from '$lib/paraglide/runtime';
	import KitchenNotice from '$lib/components/ui/KitchenNotice.svelte';
	import KitchenPageHeader from '$lib/components/ui/KitchenPageHeader.svelte';
	import PendingButton from '$lib/components/ui/PendingButton.svelte';

	let { form } = $props<{ form: { error?: string } | null }>();

	let submitting = $state(false);
</script>

<div class="login-page min-h-screen">
	<KitchenPageHeader eyebrow={m.settingsshell_brand_label()} title={m.login_title()} />

	<main class="login-main">
		<div class="login-surface">
			<div class="mb-5 flex flex-wrap items-start justify-between gap-3">
				<p class="max-w-xs text-sm leading-relaxed text-base-content/65">{m.login_subtitle()}</p>
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

			{#if form?.error}
				<KitchenNotice tone="error" class="mb-4 text-sm" role="alert">
					<span>{form.error}</span>
				</KitchenNotice>
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
	</main>
</div>

<style>
	.login-page {
		background: var(--kitchen-paper);
	}

	.login-main {
		display: grid;
		min-height: calc(100dvh - 4rem);
		place-items: start center;
		padding: clamp(2rem, 9vh, 5.5rem) 1rem 2rem;
	}

	.login-surface {
		width: min(100%, 25rem);
		border-top: 1px solid color-mix(in oklab, var(--kitchen-olive) 20%, var(--kitchen-line));
		padding-top: 1.25rem;
	}

	@media (min-width: 48rem) {
		.login-main {
			min-height: calc(100dvh - 4.5rem);
		}
	}
</style>
