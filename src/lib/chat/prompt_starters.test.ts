import { describe, expect, it } from 'vitest';
import type { ScreenContextV1 } from './screen_context';
import {
	ALL_PROMPT_STARTER_IDS,
	promptStarterDraft,
	promptStarterIds,
	promptStarterText
} from './prompt_starters';

function context(
	routeId: string,
	options?: { dirty?: boolean }
): ScreenContextV1 {
	return {
		v: 1,
		routeId,
		label: routeId,
		...(routeId === '/recipes/[slug]/edit'
			? { interaction: { mode: 'edit' as const, dirty: options?.dirty === true } }
			: {})
	};
}

describe('contextual prompt starters', () => {
	it.each([
		['/', 'general'],
		['/inventory', 'inventory'],
		['/meal-plan', 'mealPlan'],
		['/shopping', 'shopping'],
		['/recipes', 'recipes'],
		['/recipes/[slug]', 'recipe'],
		['/settings', 'settings'],
		['/settings/account', 'account'],
		['/settings/advanced', 'advanced'],
		['/settings/ai', 'ai'],
		['/settings/connections', 'connections'],
		['/settings/data', 'data'],
		['/settings/display', 'display'],
		['/settings/meal-plan', 'mealSettings'],
		['/settings/recipes', 'recipeSettings']
	])('selects %s starters', (routeId, prefix) => {
		const ids = promptStarterIds(context(routeId), true);

		expect(ids.length).toBeGreaterThanOrEqual(2);
		expect(ids.every((id) => id.startsWith(prefix))).toBe(true);
	});

	it('uses draft-safe guidance when the recipe edit screen is dirty', () => {
		expect(promptStarterIds(context('/recipes/[slug]/edit', { dirty: false }), true)).toEqual([
			'recipeEditCheck',
			'recipeEditStep',
			'recipeEditImprove'
		]);
		expect(promptStarterIds(context('/recipes/[slug]/edit', { dirty: true }), true)).toEqual([
			'recipeDirtyExplain',
			'recipeDirtyRole',
			'recipeDirtyStep'
		]);
	});

	it('falls back to general starters when context is absent, disabled, or unknown', () => {
		const general = ['generalCook', 'generalPlan', 'generalShop'];

		expect(promptStarterIds(undefined, true)).toEqual(general);
		expect(promptStarterIds(context('/inventory'), false)).toEqual(general);
		expect(promptStarterIds(context('/unexpected'), true)).toEqual(general);
	});

	it('keeps every starter incomplete and turns it into an editable draft', () => {
		for (const id of ALL_PROMPT_STARTER_IDS) {
			const text = promptStarterText(id);
			const draft = promptStarterDraft(text);

			expect(text.length).toBeGreaterThan(3);
			expect(text).not.toMatch(/[.!?…]$/);
			expect(draft).toBe(`${text} `);
		}
	});
});
