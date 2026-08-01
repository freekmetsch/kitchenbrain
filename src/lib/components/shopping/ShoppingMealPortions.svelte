<script lang="ts">
	import { base } from '$app/paths';
	import { invalidateAll } from '$app/navigation';
	import { onDestroy, untrack } from 'svelte';
	import { m } from '$lib/paraglide/messages';
	import { plannedServingsRegistryForScope } from '$lib/planned_servings_client';
	import type { PlannedServingsSnapshot } from '$lib/planned_servings_registry';
	import { toast } from '$lib/stores/toast.svelte';
	import { formatDate } from '$lib/i18n';
	import { batchServingTarget } from '$lib/meal_batch';
	import ServingBatchPicker from '$lib/components/ServingBatchPicker.svelte';

	export type ShoppingPlannedMeal = {
		id: number;
		dinner: string;
		recipeSlug: string;
		servings: number;
		baselineServings: number;
		scalingMode: 'scalable' | 'fixed_batch';
		status: 'planned' | 'cooked';
		source: 'fresh' | 'freezer';
		plannedDate: string | null;
		note: string | null;
		contributesActiveItems: boolean;
	};

	let {
		meals,
		editable,
		weekStart,
		onpendingchange,
		onservingssettled
	}: {
		meals: ShoppingPlannedMeal[];
		editable: boolean;
		weekStart: string;
		onpendingchange?: (pending: boolean) => void;
		onservingssettled?: (mealId: number) => void;
	} = $props();

	const registry = plannedServingsRegistryForScope();
	let snapshots = $state<Record<number, PlannedServingsSnapshot>>({});
	let removedMealIds = $state<number[]>([]);
	let removingMealIds = $state<number[]>([]);
	const pendingBefore = new Set<number>();
	const unsubscribers = new Map<number, () => void>();
	let subscriptionRevision = $state(0);
	let displayedMeals = $derived(
		meals.filter((meal) => !removedMealIds.includes(meal.id)).map((meal) => ({
			...meal,
			servings: snapshots[meal.id]?.desired ?? meal.servings,
			pending: snapshots[meal.id]?.pending ?? false
		}))
	);

	function subscribeToMeal(meal: ShoppingPlannedMeal): void {
		unsubscribers.get(meal.id)?.();
		const unsubscribe = registry.subscribe(meal, (snapshot) => {
			const nextSnapshots = { ...untrack(() => snapshots), [meal.id]: snapshot };
			snapshots = nextSnapshots;
			onpendingchange?.(Object.values(nextSnapshots).some((value) => value.pending));
			if (snapshot.pending) {
				pendingBefore.add(meal.id);
			} else if (pendingBefore.delete(meal.id)) {
				onservingssettled?.(meal.id);
				void invalidateAll();
			}
		});
		unsubscribers.set(meal.id, unsubscribe);
	}

	$effect(() => {
		const _revision = subscriptionRevision;
		const activeIds = new Set(meals.map((meal) => meal.id));
		for (const [mealId, unsubscribe] of unsubscribers) {
			if (activeIds.has(mealId)) continue;
			unsubscribe();
			unsubscribers.delete(mealId);
			pendingBefore.delete(mealId);
			const nextSnapshots = { ...untrack(() => snapshots) };
			delete nextSnapshots[mealId];
			snapshots = nextSnapshots;
		}
		for (const meal of meals) {
			if (unsubscribers.has(meal.id)) registry.sync(meal);
			else subscribeToMeal(meal);
		}
		onpendingchange?.(
			Object.values(untrack(() => snapshots)).some((value) => value.pending)
		);
	});

	onDestroy(() => {
		for (const unsubscribe of unsubscribers.values()) unsubscribe();
		onpendingchange?.(false);
	});

	function mealDate(meal: ShoppingPlannedMeal): string {
		return formatDate(`${meal.plannedDate ?? weekStart}T00:00:00`, {
			weekday: 'short',
			day: 'numeric',
			month: 'short'
		});
	}

	function setBatch(meal: ShoppingPlannedMeal, multiplier: number): void {
		const target = batchServingTarget(meal.baselineServings, multiplier);
		if (target != null) void registry.set(meal.id, target);
	}

	async function removeMeal(meal: ShoppingPlannedMeal): Promise<void> {
		if (removingMealIds.includes(meal.id)) return;
		removingMealIds = [...removingMealIds, meal.id];
		removedMealIds = [...removedMealIds, meal.id];
		registry.discard(meal.id);
		try {
			const response = await fetch(`${base}/api/meal-plan/${meal.id}`, { method: 'DELETE' });
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			await invalidateAll();
			toast.undo(m.mealplan_toast_removed({ dinner: meal.dinner }), () => void restoreMeal(meal));
		} catch {
			removedMealIds = removedMealIds.filter((id) => id !== meal.id);
			unsubscribers.get(meal.id)?.();
			unsubscribers.delete(meal.id);
			pendingBefore.delete(meal.id);
			subscriptionRevision += 1;
			toast.error(m.mealplan_toast_could_not_remove());
		} finally {
			removingMealIds = removingMealIds.filter((id) => id !== meal.id);
		}
	}

	async function restoreMeal(meal: ShoppingPlannedMeal): Promise<void> {
		try {
			const response = await fetch(`${base}/api/meal-plan`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					weekStartDate: weekStart,
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
</script>

{#if meals.length}
	<section class="shopping-meal-portions ui-list-group" aria-labelledby="shopping-meal-portions-title">
		<header>
			<h2 id="shopping-meal-portions-title" class="ui-section-title">
				{m.shopping_planned_meals_heading()}
			</h2>
			<p>{m.shopping_planned_meals_description()}</p>
		</header>
		<ul>
			{#each displayedMeals as meal (meal.id)}
				<li>
					<div class="shopping-meal-copy">
						<a href={`${base}/recipes/${meal.recipeSlug}?plan=${meal.id}`}>{meal.dinner}</a>
						<span>
							{mealDate(meal)} · {meal.source === 'freezer'
								? m.shopping_meal_source_freezer()
								: m.shopping_meal_source_fresh()}{meal.status === 'cooked'
								? ` · ${m.shopping_meal_cooked()}`
								: ''}
						</span>
						{#if !meal.contributesActiveItems}
							<span>{m.shopping_meal_no_active_items()}</span>
						{/if}
					</div>
					<div class="shopping-meal-actions">
						<div class="shopping-meal-stepper" aria-label={m.mealplan_servings_label()} aria-busy={meal.pending}>
							<button
								type="button"
								disabled={!editable || meal.status === 'cooked' || meal.servings <= 1}
								aria-label={m.mealplan_decrease_servings_aria({ dinner: meal.dinner })}
								onclick={() => void registry.change(meal.id, -1)}
							>−</button>
							<span>{m.mealplan_servings_count({ count: meal.servings })}</span>
							<button
								type="button"
								disabled={!editable || meal.status === 'cooked' || meal.servings >= 99}
								aria-label={m.mealplan_increase_servings_aria({ dinner: meal.dinner })}
								onclick={() => void registry.change(meal.id, 1)}
							>+</button>
						</div>
						{#if meal.scalingMode !== 'fixed_batch'}
							<ServingBatchPicker
								baselineServings={meal.baselineServings}
								currentServings={meal.servings}
								ariaLabel={m.mealplan_batch_size_aria({ dinner: meal.dinner })}
								menuLabel={m.benchsheet_batch_size_button()}
								disabled={!editable || meal.status === 'cooked'}
								onselect={(multiplier) => setBatch(meal, multiplier)}
							/>
						{/if}
						<button
							type="button"
							class="shopping-meal-remove ui-action ui-action-tertiary ui-action-icon"
							disabled={!editable || meal.status === 'cooked' || removingMealIds.includes(meal.id)}
							aria-label={m.mealplan_remove_meal_aria({ dinner: meal.dinner })}
							onclick={() => void removeMeal(meal)}
						>×</button>
					</div>
				</li>
			{/each}
		</ul>
	</section>
{/if}

<style>
	.shopping-meal-portions {
		margin-bottom: 0.75rem;
		padding: 0.75rem;
	}

	.shopping-meal-portions > header {
		display: grid;
		gap: 0.2rem;
		margin-bottom: 0.55rem;
	}

	.shopping-meal-portions > header p,
	.shopping-meal-copy span {
		color: var(--kitchen-muted);
		font-size: 0.72rem;
	}

	.shopping-meal-portions ul {
		display: grid;
		gap: 0.4rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.shopping-meal-portions li {
		display: flex;
		min-height: 3rem;
		align-items: center;
		justify-content: space-between;
		gap: 0.6rem;
		border-top: 1px solid var(--kitchen-line);
		padding-top: 0.4rem;
	}

	.shopping-meal-copy {
		display: grid;
		min-width: 0;
	}

	.shopping-meal-copy a {
		overflow: hidden;
		font-weight: 700;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.shopping-meal-stepper {
		display: inline-flex;
		min-height: 2.75rem;
		flex: 0 0 auto;
		align-items: center;
		border: 1px solid var(--kitchen-line);
		border-radius: 0.75rem;
	}

	.shopping-meal-actions {
		display: flex;
		min-width: 0;
		align-items: center;
		gap: 0.3rem;
	}

	.shopping-meal-remove {
		width: 2.75rem;
		flex: 0 0 2.75rem;
		font-size: 1.1rem;
	}

	.shopping-meal-stepper button {
		width: 2.75rem;
		height: 2.75rem;
		font-size: 1.1rem;
	}

	.shopping-meal-stepper span {
		min-width: 4.5rem;
		text-align: center;
		font-size: 0.75rem;
		font-weight: 750;
	}

	@media (max-width: 28rem) {
		.shopping-meal-portions li {
			align-items: stretch;
			flex-direction: column;
		}

		.shopping-meal-actions {
			width: 100%;
			align-self: stretch;
			flex-wrap: wrap;
		}
	}
</style>
