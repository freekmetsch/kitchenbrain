import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function source(path: string): string {
	return readFileSync(path, 'utf8');
}

describe('portion review contracts', () => {
	it('keeps recipe archive state live and discards a plan only after DELETE succeeds', () => {
		const archiveControl = source(
			'src/lib/components/recipe-detail/RecipeArchiveControl.svelte'
		);
		const recipePage = source('src/routes/recipes/[slug]/+page.svelte');
		const planContext = source('src/lib/components/recipe-detail/RecipePlanContext.svelte');
		const removeMeal = planContext.slice(planContext.indexOf('async function removeMeal'));

		expect(archiveControl).toContain('onArchivedChange?.(next)');
		expect(recipePage).toContain('onArchivedChange={(archived) => {');
		expect(removeMeal.indexOf('if (!response.ok)')).toBeLessThan(
			removeMeal.indexOf('plannedServingsRegistry.discard(meal.id)')
		);
	});

	it('defers AH revision acknowledgement and uses stable direct-choice labeling', () => {
		const ahSheet = source('src/lib/components/shopping/AhSheet.svelte');
		const revisionEffect = ahSheet.slice(
			ahSheet.indexOf('$effect(() => {', ahSheet.indexOf('$effect(() => {') + 1),
			ahSheet.indexOf('let pushSummary')
		);
		const quickControls = source(
			'src/lib/components/shopping/ShoppingSourceQuickControls.svelte'
		);

		expect(revisionEffect.indexOf('if (pushing) return')).toBeLessThan(
			revisionEffect.indexOf('observedListRevision = revision')
		);
		expect(quickControls).toContain('shopping_future_lists_aria');
		expect(quickControls).not.toContain('shopping_need_cycle_aria');
	});

	it('bounds client writes and rejects unguarded nullable serving updates', () => {
		const client = source('src/lib/planned_servings_client.ts');
		const route = source('src/routes/api/meal-plan/[id]/+server.ts');
		const proposal = source('src/lib/server/ai/meal_plan_proposal.ts');
		const executor = source('src/lib/server/ai/executors/meal_plan.ts');

		expect(client).toContain('signal: AbortSignal.timeout(PLANNED_SERVINGS_WRITE_TIMEOUT_MS)');
		expect(route).toContain('servings: z.number().int().positive().max(99).optional()');
		expect(proposal).toContain('validatePlannedServingsChange(tx, operation.mealId)');
		expect(executor).toContain('servings: z.number().int().positive().max(99).optional()');
	});
});
