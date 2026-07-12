<!--
	Micro facet chips under a stock row: section emoji, the meal recipe-link
	affordances (linked chip / suggestions / picker / plan-to-add / no-recipe —
	UX-STOCK-2), staple + out/cook-again + best-before badges, the "N recipes"
	coverage link, and the review-reason strip with its fix affordance
	(UX-STOCK-1). The page owns the portion-edit state (one open editor at a
	time) and all writes; this component renders + signals intent.
-->
<script module lang="ts">
	// Static per-component constants + pure helpers live in module scope so they
	// are allocated once, not once per rendered stock row.
	import { base } from '$app/paths';
	import { RULE_REVIEW_CODES, reasonTokens } from '$lib/review_reasons';
	import type { Item } from './shared';

	const FOOD_CLASS_EMOJI: Record<string, string> = {
		meat: '🥩', chicken: '🍗', beef: '🥩', pork: '🥓', lamb: '🍖',
		fish: '🐟', vegetarian: '🥦', vegan: '🌱', other: '🫙'
	};
	// Humanize machine review-reason slugs for a non-technical reader (P6.5 #5).
	// Codes are written in inventory_writes.ts / _merge.ts / _guardian.ts; unmapped
	// ones fall through to a de-slugged form, so coverage need not be exhaustive.
	const REVIEW_REASON_LABEL: Record<string, string> = {
		undo_conflict: 'Changed since that action — undo skipped',
		unclassified: 'Needs a food class',
		unknown_kind: 'Kind needs checking',
		unknown_food_class: 'Food class needs checking',
		non_canonical_unit: 'Unusual unit',
		leftover_non_portion_unit: 'Not counted in portions',
		leftover_non_integer_portions: 'Fractional portions',
		manual_check: 'Flagged for a manual check'
	};

	function reviewReasonText(reason: string | null): string {
		// Reasons can be joined ('a; b') and each may carry a ':param' — map every token,
		// don't drop the tail. Raw string stays available via the title tooltip.
		return reasonTokens(reason)
			.map((part) => {
				const key = part.split(':')[0];
				return REVIEW_REASON_LABEL[key] ?? key.replace(/_/g, ' ');
			})
			.join(' · ');
	}
	function foodClassEmoji(slug: string | null): string {
		if (!slug) return '❓';
		return FOOD_CLASS_EMOJI[slug] ?? '🫙';
	}
	function expiryBadge(expiry: string | null): { label: string; cls: string } | null {
		if (!expiry) return null;
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const diff = Math.ceil((new Date(expiry).getTime() - today.getTime()) / 86400000);
		const cls = diff < 3 ? 'text-error' : diff < 7 ? 'text-warning' : 'text-base-content/65';
		let label: string;
		if (diff < 0) label = `${Math.abs(diff)}d over`;
		else if (diff === 0) label = 'today';
		else if (diff === 1) label = 'tomorrow';
		else if (diff < 8) label = `${diff}d`;
		else label = new Date(expiry).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
		return { label, cls };
	}

	// ── review fix affordances (UX-STOCK-1) ────────────────────────────────────
	// Rule-derived flags re-assert on every write, so a bare "resolve" can never
	// clear them — the offending fact has to change. Each rule code maps to the
	// control that changes it; only sticky (non-rule) flags keep plain Resolve.
	function reviewFix(item: Item): 'portions' | 'edit' | 'resolve' {
		const codes = reasonTokens(item.reviewReason).map((t) => t.split(':')[0]);
		if (codes.includes('leftover_non_portion_unit') || codes.includes('leftover_non_integer_portions')) {
			return 'portions';
		}
		if (codes.some((c) => RULE_REVIEW_CODES.has(c))) return 'edit';
		return 'resolve';
	}

	function recipeSearchHref(name: string): string {
		return `${base}/recipes?${new URLSearchParams({ ingredient: name }).toString()}`;
	}
</script>

<script lang="ts">
	import Icon from '$lib/components/ui/icons/Icon.svelte';
	import { autofocus, foodClassText } from './shared';
	import type { RecipeLink, RecipeMatch, RecipeSuggestion } from './shared';

	let {
		item,
		link,
		matches,
		suggestions,
		portionEditing,
		portionValue = $bindable(),
		onLinkRecipe,
		onOpenLinkPicker,
		onSetRecipeStatus,
		onClearRecipeStatus,
		onOpenPortionEdit,
		onCommitPortionEdit,
		onCancelPortionEdit,
		onOpenEdit,
		onResolveReview
	}: {
		item: Item;
		link: RecipeLink | null;
		matches: RecipeMatch[];
		suggestions: RecipeSuggestion[];
		portionEditing: boolean;
		portionValue: string;
		onLinkRecipe: (s: RecipeSuggestion) => void;
		onOpenLinkPicker: () => void;
		onSetRecipeStatus: (status: 'plan_to_add' | 'no_recipe') => void;
		onClearRecipeStatus: () => void;
		onOpenPortionEdit: () => void;
		onCommitPortionEdit: () => void;
		onCancelPortionEdit: () => void;
		onOpenEdit: () => void;
		onResolveReview: () => void;
	} = $props();

	const exp = $derived(expiryBadge(item.expiryDate));
</script>

<div class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs leading-4 text-base-content/65">
	<span class="opacity-70">{item.section === 'freezer' ? '❄️' : '🫙'}</span>

	{#if item.kind === 'leftover'}
		{#if link}
			{@const sameName =
				link.title.toLowerCase() === item.name.toLowerCase() ||
				link.titleNl.toLowerCase() === item.name.toLowerCase()}
			<!-- Recipe title usually equals the row name — repeating it is noise
			     (UX-STOCK-5); keep a compact open-recipe affordance instead. -->
			<a href="{base}/recipes/{link.slug}" class="max-w-40 truncate text-primary/80 hover:text-primary"
				>↗ {sameName ? 'recipe' : link.title}</a
			>
			{#if link.isFreezerStaple && link.targetPortions != null}
				<span
					class="rounded-full border px-1.5 font-medium tabular-nums {link.onHandPortions < link.targetPortions
						? 'border-warning/40 bg-warning/10 text-warning'
						: 'border-base-300 text-base-content/60'}">{link.onHandPortions} / {link.targetPortions} portions</span
				>
			{/if}
		{:else if item.recipeStatus === 'plan_to_add'}
			<button
				type="button"
				class="inline-flex items-center gap-1 text-base-content/60 hover:text-base-content/80"
				title="Undo — show link options again"
				onclick={() => onClearRecipeStatus()}
			>
				<span class="h-1 w-1 rounded-full bg-info/70"></span> recipe planned ✕
			</button>
		{:else if item.recipeStatus === 'no_recipe'}
			<button
				type="button"
				class="text-base-content/60 hover:text-base-content/80"
				title="Undo — show link options again"
				onclick={() => onClearRecipeStatus()}>no recipe ✕</button
			>
		{:else}
			<!-- Unlinked meal: suggestion chips are shortcuts; the picker, Plan to
			     add, and No recipe are always available so no branch dead-ends
			     (UX-STOCK-2). -->
			{@const top = suggestions.slice(0, 3)}
			{#each top as s (s.slug)}
				<button
					type="button"
					class="max-w-36 truncate rounded-full border border-primary/40 bg-primary/10 px-1.5 font-medium text-primary hover:bg-primary/20"
					onclick={() => onLinkRecipe(s)}>+ {s.title}</button
				>
			{/each}
			<button
				type="button"
				class="rounded-full border border-primary/40 px-1.5 font-medium text-primary hover:bg-primary/10"
				onclick={() => onOpenLinkPicker()}>Link recipe…</button
			>
			<button
				type="button"
				class="rounded-full border border-base-300 px-1.5 font-medium text-base-content/60 hover:border-base-content/25 hover:text-base-content"
				onclick={() => onSetRecipeStatus('plan_to_add')}>Plan to add</button
			>
			<button
				type="button"
				class="rounded-full border border-base-300 px-1.5 text-base-content/60 hover:border-base-content/25 hover:text-base-content"
				onclick={() => onSetRecipeStatus('no_recipe')}>No recipe</button
			>
		{/if}
	{:else if item.foodClass}
		<span class="inline-flex items-center gap-1">{foodClassEmoji(item.foodClass)} {foodClassText(item.foodClass)}</span>
	{/if}

	{#if item.isStaple}
		<span class="inline-flex items-center gap-1 text-base-content/60">
			<span class="h-1 w-1 rounded-full bg-secondary/70"></span> staple
		</span>
	{/if}

	{#if item.qtyNum === 0}
		{#if item.kind === 'leftover' && link?.isFreezerStaple}
			<span class="rounded-full bg-warning/10 px-1.5 font-medium text-warning">cook again</span>
		{:else}
			<span class="rounded-full bg-error/10 px-1.5 font-medium text-error/80">out</span>
		{/if}
	{/if}

	{#if exp}
		<span class="font-medium {exp.cls}">best before {exp.label}</span>
	{/if}

	{#if matches.length > 0}
		<a
			href={recipeSearchHref(item.name)}
			class="rounded-full bg-base-200 px-1.5 font-medium text-base-content/60 hover:bg-base-300 hover:text-base-content"
		>{matches.length} {matches.length === 1 ? 'recipe' : 'recipes'}</a>
	{/if}

	{#if item.needsReview}
		<span class="inline-flex min-w-0 items-center gap-1.5 text-warning">
			<Icon name="warn" class="h-3 w-3" />
			{#if item.reviewReason}<span class="max-w-40 truncate" title={item.reviewReason}>{reviewReasonText(item.reviewReason)}</span>{/if}
			{#if portionEditing}
				<span class="inline-flex shrink-0 items-center gap-1">
					<input
						type="number"
						inputmode="numeric"
						min="0"
						step="1"
						class="w-12 rounded border border-warning/50 bg-base-100 px-1 text-center tabular-nums text-base-content outline-none"
						bind:value={portionValue}
						use:autofocus
						onkeydown={(e) => {
							if (e.key === 'Enter') onCommitPortionEdit();
							else if (e.key === 'Escape') onCancelPortionEdit();
						}}
						aria-label={`Portion count for ${item.name}`}
					/>
					<button
						type="button"
						class="shrink-0 font-medium underline decoration-dotted underline-offset-2"
						onmousedown={(e) => e.preventDefault()}
						onclick={() => onCommitPortionEdit()}>Save</button
					>
				</span>
			{:else if reviewFix(item) === 'portions'}
				<button type="button" class="shrink-0 font-medium underline decoration-dotted underline-offset-2" onclick={() => onOpenPortionEdit()}>Set portions</button>
			{:else if reviewFix(item) === 'edit'}
				<button type="button" class="shrink-0 font-medium underline decoration-dotted underline-offset-2" onclick={() => onOpenEdit()}>Fix</button>
			{:else}
				<button type="button" class="shrink-0 font-medium underline decoration-dotted underline-offset-2" onclick={() => onResolveReview()}>Resolve</button>
			{/if}
		</span>
	{/if}
</div>
