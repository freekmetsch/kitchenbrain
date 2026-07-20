<script lang="ts" generics="T extends string | number">
	// Segmented control (role=tablist). Replaces the four hand-rolled segmented
	// controls across settings/inventory. Visual recipe from the specimen's
	// section tabs (inventory/+page.svelte:922-932): bg-base-200 p-0.5 track,
	// active = bg-base-100 shadow-sm. Owns the tablist a11y + arrow-key contract.
	let {
		tabs,
		value = $bindable(),
		onchange,
		cols,
		ariaLabel
	}: {
		tabs: { value: T; label: string }[];
		value: T;
		onchange?: (v: T) => void;
		ariaLabel?: string;
		/** 2 → wrap into a 2-column grid (overflow). Default: single inline row. */
		cols?: 2;
	} = $props();

	function select(v: T) {
		value = v;
		onchange?.(v);
	}

	function onkeydown(e: KeyboardEvent) {
		if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
		e.preventDefault();
		const i = tabs.findIndex((t) => t.value === value);
		if (i === -1) return;
		const next = e.key === 'ArrowRight' ? (i + 1) % tabs.length : (i - 1 + tabs.length) % tabs.length;
		select(tabs[next].value);
	}
</script>

<div
	role="tablist"
	aria-label={ariaLabel}
	tabindex="-1"
	{onkeydown}
	class="rounded-lg bg-base-200 p-0.5 {cols === 2
		? 'grid grid-cols-2 gap-0.5'
		: 'inline-flex items-center gap-0.5'}"
>
	{#each tabs as t (t.value)}
		<button
			type="button"
			role="tab"
			aria-selected={value === t.value}
			tabindex={value === t.value ? 0 : -1}
			class="inline-flex min-h-9 items-center justify-center rounded-md px-2.5 py-1 text-xs font-medium transition-colors {value === t.value
				? 'bg-base-100 shadow-sm'
				: 'text-base-content/50 hover:text-base-content/80'}"
			onclick={() => select(t.value)}>{t.label}</button
		>
	{/each}
</div>
