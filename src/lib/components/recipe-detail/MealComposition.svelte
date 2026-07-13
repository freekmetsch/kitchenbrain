<!--
	Meal Recipe composition (ADR 0003): remove/add sub-recipe links in place.
	Shows the "combines" chip row for meal recipes plus the "Part of" backlinks,
	and owns the add-a-recipe bottom sheet (candidate fetch, search filter) and
	the PATCH /api/meals/[slug] calls. Renders nothing for a plain recipe.
-->
<script lang="ts">
	import { base } from '$app/paths';
	import { invalidateAll } from '$app/navigation';
	import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import { m } from '$lib/paraglide/messages';

	let {
		slug,
		subRecipes,
		partOfMeals,
		subDisplayTitle
	}: {
		slug: string;
		subRecipes: Array<{ id: number; slug: string; title: string; titleEn: string | null; sortOrder: number }>;
		partOfMeals: Array<{ id: number; slug: string; title: string; titleEn: string | null }>;
		subDisplayTitle: (s: { title: string; titleEn: string | null }) => string;
	} = $props();

	let mealEditError = $state('');
	let addSubOpen = $state(false);
	let addSubQuery = $state('');
	let addSubLoading = $state(false);
	let addSubCandidates = $state<Array<{ slug: string; title: string; titleEn: string | null }>>([]);

	async function patchMeal(body: { add_slug?: string; remove_slug?: string }) {
		mealEditError = '';
		try {
			const res = await fetch(`${base}/api/meals/${slug}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});
			if (!res.ok) {
				const err = await res.json().catch(() => ({}));
				mealEditError = err.message ?? m.recipes_meal_toast_update_failed({ status: res.status });
				toast.error(mealEditError);
				return;
			}
			await invalidateAll();
		} catch {
			mealEditError = m.recipes_meal_toast_connection_failed();
			toast.error(mealEditError);
		}
	}

	async function openAddSub() {
		addSubOpen = true;
		addSubQuery = '';
		if (addSubCandidates.length) return;
		addSubLoading = true;
		try {
			const res = await fetch(`${base}/api/meals`);
			if (res.ok) addSubCandidates = (await res.json()).candidates ?? [];
		} catch {
			mealEditError = m.recipes_meal_toast_load_failed();
			toast.error(mealEditError);
		}
		addSubLoading = false;
	}

	let addSubFiltered = $derived(
		addSubCandidates
			.filter((c) => c.slug !== slug && !subRecipes.some((s) => s.slug === c.slug))
			.filter((c) => {
				const q = addSubQuery.trim().toLowerCase();
				if (!q) return true;
				return c.title.toLowerCase().includes(q) || (c.titleEn?.toLowerCase().includes(q) ?? false);
			})
			.slice(0, 30)
	);
</script>

{#if subRecipes.length || partOfMeals.length}
	<section class="mx-3 mt-3 rounded-xl border border-base-200 bg-base-100 px-3 py-2.5">
		{#if subRecipes.length}
			<p class="text-[11px] uppercase tracking-wide font-bold text-base-content/50 mb-1.5">
				{m.recipes_meal_combines_label()}
			</p>
			<ul class="flex flex-wrap items-center gap-1.5">
				{#each subRecipes as sub (sub.slug)}
					<li
						class="inline-flex items-center gap-0.5 rounded-full border border-base-300 bg-base-200/50 pl-2.5 pr-1 py-0.5"
					>
						<a class="text-[13px] py-1" href="{base}/recipes/{sub.slug}">{subDisplayTitle(sub)}</a>
						<button
							type="button"
							class="w-8 h-8 rounded-full text-base-content/50 hover:bg-base-300 text-[11px]"
							aria-label={m.recipes_meal_remove_aria({ title: subDisplayTitle(sub) })}
							onclick={async () => {
								await patchMeal({ remove_slug: sub.slug });
								if (!mealEditError)
									toast.undo(m.recipes_meal_removed_toast({ title: subDisplayTitle(sub) }), () => patchMeal({ add_slug: sub.slug }));
							}}>✕</button
						>
					</li>
				{/each}
				<li>
					<button
						type="button"
						class="btn btn-xs btn-ghost border border-base-300 rounded-full"
						onclick={openAddSub}>{m.recipes_meal_add_button()}</button
					>
				</li>
			</ul>
		{/if}
		{#if partOfMeals.length}
			<p class="text-[12px] text-base-content/60 {subRecipes.length ? 'mt-2' : ''}">
				{m.recipes_meal_part_of_label()}
				{#each partOfMeals as m, i (m.slug)}
					<a class="link" href="{base}/recipes/{m.slug}">{subDisplayTitle(m)}</a
					>{#if i < partOfMeals.length - 1}<span> · </span>{/if}
				{/each}
			</p>
		{/if}
		{#if mealEditError}
			<p class="text-[11px] text-error mt-1.5">{mealEditError}</p>
		{/if}
	</section>
{/if}

<BottomSheet bind:open={addSubOpen} title={m.recipes_meal_add_sheet_title()}>
	<div class="flex max-h-[62dvh] flex-col">
		<input
			type="search"
			class="input input-bordered input-sm w-full mb-2"
			placeholder={m.recipes_meal_search_placeholder()}
			bind:value={addSubQuery}
		/>
		<div class="flex-1 overflow-y-auto min-h-0">
			{#if addSubLoading}
				<div class="py-6 text-center"><span class="loading loading-spinner"></span></div>
			{:else if addSubFiltered.length === 0}
				<p class="py-6 text-center text-sm text-base-content/50">{m.recipes_meal_no_matching()}</p>
			{:else}
				<ul class="divide-y divide-base-200">
					{#each addSubFiltered as c (c.slug)}
						<li>
							<button
								type="button"
								class="w-full text-left px-1 py-2.5 text-sm hover:bg-base-200"
								onclick={async () => {
									addSubOpen = false;
									await patchMeal({ add_slug: c.slug });
								}}>{subDisplayTitle(c)}</button
							>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
		<button class="btn btn-ghost btn-sm mt-3" onclick={() => (addSubOpen = false)}>{m.recipes_cancel_button()}</button>
	</div>
</BottomSheet>
