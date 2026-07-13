<script lang="ts">
	import { base } from '$app/paths';
	import { m } from '$lib/paraglide/messages';
	import { getLocale, setLocale } from '$lib/paraglide/runtime';

	let { form } = $props<{ form: { error?: string } | null }>();
</script>

<div class="min-h-screen flex items-center justify-center bg-base-200 p-4">
	<div class="card w-full max-w-sm bg-base-100 shadow-xl">
		<div class="card-body">
			<div class="flex items-center justify-between gap-2">
				<h1 class="card-title text-2xl font-bold">{m.login_title()}</h1>
				<div class="flex gap-1 text-xs" role="group" aria-label="Language">
					<button
						type="button"
						class="btn btn-ghost btn-xs px-1.5 {getLocale() === 'en' ? 'font-bold underline' : ''}"
						onclick={() => setLocale('en')}>English</button
					>
					<button
						type="button"
						class="btn btn-ghost btn-xs px-1.5 {getLocale() === 'nl' ? 'font-bold underline' : ''}"
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

			<form method="POST" action="{base}/login" class="space-y-4">
				<label class="form-control w-full">
					<div class="label"><span class="label-text">{m.login_username_label()}</span></div>
					<input
						type="text"
						name="username"
						class="input input-bordered w-full"
						required
						autocomplete="username"
					/>
				</label>

				<label class="form-control w-full">
					<div class="label"><span class="label-text">{m.login_password_label()}</span></div>
					<input
						type="password"
						name="password"
						class="input input-bordered w-full"
						required
						autocomplete="current-password"
					/>
				</label>

				<button type="submit" class="btn btn-primary w-full">{m.login_signin_button()}</button>
			</form>
		</div>
	</div>
</div>
