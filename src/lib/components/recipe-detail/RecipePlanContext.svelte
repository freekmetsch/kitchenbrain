<script lang="ts">
	import { base } from '$app/paths';
	import { goto, invalidateAll } from '$app/navigation';
	import { formatDate } from '$lib/i18n';
	import { m } from '$lib/paraglide/messages';
	import { plannedServingsRegistry } from '$lib/planned_servings_client';
	import { toast } from '$lib/stores/toast.svelte';

	export type RecipePlanOccurrence = {
		id: number;
		weekStartDate: string;
		dinner: string;
		recipeSlug: string | null;
		servings: number | null;
		plannedDate: string | null;
		status: 'planned' | 'cooked';
		source: 'fresh' | 'freezer';
		note: string | null;
	};

	let {
		slug,
		selectedMealId,
		occurrences
	}: {
		slug: string;
		selectedMealId: number | null;
		occurrences: RecipePlanOccurrence[];
	} = $props();

	let removing = $state(false);
	let selectedMeal = $derived(
		selectedMealId == null
			? null
			: (occurrences.find((meal) => meal.id === selectedMealId) ?? null)
	);

	function occurrenceLabel(meal: RecipePlanOccurrence): string {
		const date = formatDate(`${meal.plannedDate ?? meal.weekStartDate}T00:00:00`, {
			weekday: 'short',
			day: 'numeric',
			month: 'short'
		});
		return `${date} · ${meal.dinner} · ${m.mealplan_servings_count({ count: meal.servings ?? 0 })}`;
	}

	function chooseContext(event: Event): void {
		const value = (event.currentTarget as HTMLSelectElement).value;
		void goto(value ? `${base}/recipes/${slug}?plan=${value}` : `${base}/recipes/${slug}`);
	}

	async function restoreMeal(meal: RecipePlanOccurrence): Promise<void> {
		try {
			const response = await fetch(`${base}/api/meal-plan`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					weekStartDate: meal.weekStartDate,
					dinner: meal.dinner,
					recipeSlug: meal.recipeSlug,
					servings: meal.servings,
					plannedDate: meal.plannedDate,
					source: meal.source,
					note: meal.note
				})
			});
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			await invalidateAll();
		} catch {
			toast.error(m.mealplan_toast_could_not_restore());
		}
	}

	async function removeMeal(meal: RecipePlanOccurrence): Promise<void> {
		if (removing || meal.status === 'cooked') return;
		removing = true;
		try {
			const response = await fetch(`${base}/api/meal-plan/${meal.id}`, { method: 'DELETE' });
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			plannedServingsRegistry.discard(meal.id);
			toast.undo(m.mealplan_toast_removed({ dinner: meal.dinner }), () => void restoreMeal(meal));
			await goto(`${base}/recipes/${slug}`);
		} catch {
			toast.error(m.mealplan_toast_could_not_remove());
		} finally {
			removing = false;
		}
	}
</script>

{#if occurrences.length > 0}
	<section class="recipe-plan-context" aria-labelledby="recipe-plan-context-heading">
		<div>
			<h2 id="recipe-plan-context-heading">{m.recipes_plan_context_heading()}</h2>
			<p>{m.recipes_plan_context_description()}</p>
		</div>
		<label>
			<span>{m.recipes_plan_context_label()}</span>
			<select class="ui-field" value={selectedMealId?.toString() ?? ''} onchange={chooseContext}>
				<option value="">{m.recipes_plan_context_local()}</option>
				{#each occurrences as meal (meal.id)}
					<option value={meal.id}>{occurrenceLabel(meal)}</option>
				{/each}
			</select>
		</label>
		{#if selectedMeal}
			<div class="recipe-plan-context-status">
				<p>
					{selectedMeal.status === 'cooked'
						? m.recipes_plan_context_cooked()
						: m.recipes_plan_context_synced()}
				</p>
				{#if selectedMeal.status !== 'cooked'}
					<button
						type="button"
						class="ui-action ui-action-danger"
						disabled={removing}
						aria-label={m.mealplan_remove_meal_aria({ dinner: selectedMeal.dinner })}
						onclick={() => void removeMeal(selectedMeal!)}
					>{m.recipes_remove_planned_meal_button()}</button>
				{/if}
			</div>
		{/if}
	</section>
{/if}

<style>
	.recipe-plan-context {
		display: grid;
		gap: 0.65rem;
		margin: 0.75rem;
		border: 1px solid var(--kitchen-line);
		border-radius: 0.85rem;
		padding: 0.75rem;
		background: var(--kitchen-paper);
	}

	.recipe-plan-context h2,
	.recipe-plan-context label > span {
		font-size: 0.72rem;
		font-weight: 800;
	}

	.recipe-plan-context p {
		color: var(--kitchen-muted);
		font-size: 0.72rem;
	}

	.recipe-plan-context label {
		display: grid;
		gap: 0.3rem;
	}

	.recipe-plan-context-status {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
	}

	@media (max-width: 30rem) {
		.recipe-plan-context-status {
			align-items: stretch;
			flex-direction: column;
		}
	}
</style>
