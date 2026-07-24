<!--
	The one recipe-relationship surface for a stock meal. It keeps settled rows
	quiet while preserving every action: inspect a linked recipe, link another,
	plan one for later, mark it unnecessary, or clear the choice.
-->
<script lang="ts">
	import { base } from '$app/paths';
	import { m } from '$lib/paraglide/messages';
	import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
	import Icon from '$lib/components/ui/icons/Icon.svelte';
	import {
		matchesInventoryQuery,
		type Item,
		type RecipeLink,
		type RecipeOption,
		type RecipeRelationshipKind
	} from './shared';

	let {
		open = $bindable(false),
		item,
		link,
		relationship,
		search = $bindable(),
		options,
		onPick,
		onSetStatus,
		onClear
	}: {
		open?: boolean;
		item: Item | null;
		link: RecipeLink | null;
		relationship: RecipeRelationshipKind;
		search: string;
		options: RecipeOption[];
		onPick: (option: RecipeOption) => void;
		onSetStatus: (status: 'plan_to_add' | 'no_recipe') => Promise<boolean>;
		onClear: () => Promise<boolean>;
	} = $props();

	let busy = $state(false);
	const linkOptions = $derived.by(() => {
		const alternatives =
			relationship === 'linked' && link
				? options.filter((option) => option.slug !== link.slug)
				: options;
		return alternatives.filter((option) => matchesInventoryQuery(search, [option.title]));
	});

	async function setStatus(status: 'plan_to_add' | 'no_recipe') {
		busy = true;
		try {
			if (await onSetStatus(status)) open = false;
		} finally {
			busy = false;
		}
	}

	async function clearChoice() {
		busy = true;
		try {
			if (await onClear()) open = false;
		} finally {
			busy = false;
		}
	}
</script>

<BottomSheet
	bind:open
	desktopCentered
	title={item
		? m.inventory_recipe_sheet_title({ name: item.name })
		: m.inventory_link_sheet_title_default()}
>
	<p class="mb-2 ui-section-label">{m.inventory_recipe_relationship_label()}</p>
	<div class="grid grid-cols-2 gap-2">
		<button
			type="button"
			class="flex min-h-12 items-center gap-2 rounded-xl border px-3 text-left text-sm font-medium transition-colors {relationship ===
			'planned'
				? 'border-primary/40 bg-primary/10 text-primary'
				: 'border-base-300/70 bg-base-100 hover:bg-base-200/60'}"
			aria-pressed={relationship === 'planned'}
			disabled={busy}
			onclick={() => void setStatus('plan_to_add')}
		>
			<Icon name="clock" class="h-4 w-4 shrink-0" />
			{m.inventory_recipe_planned_label()}
		</button>
		<button
			type="button"
			class="flex min-h-12 items-center gap-2 rounded-xl border px-3 text-left text-sm font-medium transition-colors {relationship ===
			'not_needed'
				? 'border-primary/40 bg-primary/10 text-primary'
				: 'border-base-300/70 bg-base-100 hover:bg-base-200/60'}"
			aria-pressed={relationship === 'not_needed'}
			disabled={busy}
			onclick={() => void setStatus('no_recipe')}
		>
			<Icon name="minus" class="h-4 w-4 shrink-0" />
			{m.inventory_recipe_no_recipe_label()}
		</button>
	</div>

	{#if relationship === 'linked' && link}
		<div class="mt-2 flex items-center gap-3 rounded-xl border border-success/30 bg-success/10 px-3 py-2.5">
			<span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-success/15 text-success">
				<Icon name="check" class="h-4 w-4" />
			</span>
			<div class="min-w-0 flex-1">
				<p class="text-xs font-medium text-success">{m.inventory_recipe_linked_label({ title: m.inventory_recipe_link_default() })}</p>
				<p class="truncate text-sm font-semibold">{link.title}</p>
			</div>
			<a
				href="{base}/recipes/{link.slug}"
				class="btn btn-ghost btn-sm min-h-11 shrink-0 px-3 text-primary"
			>
				{m.inventory_recipe_view_button()}
			</a>
		</div>
	{/if}

	{#if relationship !== 'unresolved'}
		<button
			type="button"
			class="btn btn-ghost btn-sm mt-1 min-h-11 px-2 text-error"
			disabled={busy}
			onclick={() => void clearChoice()}
		>
			{m.inventory_recipe_clear_choice_button()}
		</button>
	{/if}

	<div class="my-3 h-px bg-base-200"></div>
	<label class="mb-2 block">
		<span class="mb-1.5 block ui-section-label">{m.inventory_recipe_existing_label()}</span>
		<span class="relative block">
			<svg
				viewBox="0 0 16 16"
				class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-base-content/45"
				fill="none"
				stroke="currentColor"
				stroke-width="1.5"
				aria-hidden="true"
			>
				<path d="M11.25 11.25 14 14" />
				<circle cx="7.25" cy="7.25" r="5" />
			</svg>
			<input
				type="search"
				class="input input-bordered h-11 w-full pl-9"
				placeholder={m.inventory_link_search_placeholder()}
				bind:value={search}
			/>
		</span>
	</label>
	{#if linkOptions.length === 0}
		<p class="py-6 text-center text-sm text-base-content/60">{m.inventory_link_no_match({ query: search })}</p>
	{:else}
		<ul class="-mx-1 max-h-72 divide-y divide-base-200 overflow-y-auto">
			{#each linkOptions as option (option.slug)}
				<li>
					<button
						type="button"
						class="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-2 text-left text-sm hover:bg-base-200"
						disabled={busy}
						onclick={() => onPick(option)}>{option.title}</button
					>
				</li>
			{/each}
		</ul>
	{/if}
</BottomSheet>
