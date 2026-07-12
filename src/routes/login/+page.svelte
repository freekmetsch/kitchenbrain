<script lang="ts">
	import { base } from '$app/paths';

	let { form } = $props<{ form: { error?: string } | null }>();
</script>

<div class="min-h-screen flex items-center justify-center bg-base-200 p-4">
	<div class="card w-full max-w-sm bg-base-100 shadow-xl">
		<div class="card-body">
			<h1 class="card-title text-2xl font-bold">Household Brain</h1>
			<p class="text-base-content/60 text-sm mb-2">Sign in to continue</p>

			{#if form?.error}
				<div class="alert alert-error text-sm py-2">
					<span>{form.error}</span>
				</div>
			{/if}

			<form method="POST" action="{base}/login" class="space-y-4">
				<label class="form-control w-full">
					<div class="label"><span class="label-text">Username</span></div>
					<input
						type="text"
						name="username"
						class="input input-bordered w-full"
						required
						autocomplete="username"
					/>
				</label>

				<label class="form-control w-full">
					<div class="label"><span class="label-text">Password</span></div>
					<input
						type="password"
						name="password"
						class="input input-bordered w-full"
						required
						autocomplete="current-password"
					/>
				</label>

				<button type="submit" class="btn btn-primary w-full">Sign in</button>
			</form>
		</div>
	</div>
</div>
