import { base } from '$app/paths';
import { browser } from '$app/environment';
import { m } from '$lib/paraglide/messages';
import { toast } from '$lib/stores/toast.svelte';
import { PlannedServingsRegistry, type PlannedServingMeal } from '$lib/planned_servings_registry';

export const PLANNED_SERVINGS_WRITE_TIMEOUT_MS = 15_000;

export async function writePlannedServings(
	mealId: number,
	servings: number
): Promise<PlannedServingMeal> {
	const response = await globalThis.fetch(`${base}/api/meal-plan/${mealId}`, {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ servings }),
		signal: AbortSignal.timeout(PLANNED_SERVINGS_WRITE_TIMEOUT_MS)
	});
	if (!response.ok) throw new Error(await response.text());
	return (await response.json()) as PlannedServingMeal;
}

function createRegistry(): PlannedServingsRegistry {
	return new PlannedServingsRegistry({
		write: writePlannedServings,
		onError: () => toast.error(m.mealplan_toast_could_not_update_servings())
	});
}

export const plannedServingsRegistry = createRegistry();

export function plannedServingsRegistryForScope(): PlannedServingsRegistry {
	return browser ? plannedServingsRegistry : createRegistry();
}
