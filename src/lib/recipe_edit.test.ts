import { describe, expect, it } from 'vitest';
import {
	hydrateDirections,
	hydrateIngredients,
	recipeEditChangesCookingStructure,
	recipeEditSnapshot,
	recipeIngredientsEqual,
	serializeDirections,
	serializeIngredients
} from './recipe_edit';

describe('recipe edit UI identity', () => {
	it('hydrates legacy v1 drafts without client IDs', () => {
		const ingredients = hydrateIngredients([
			{
				name: 'ui',
				amount: '1',
				role: 'cook_in',
				substitutes: [{ name: 'sjalot', kind: 'vegetable' }]
			}
		]);
		const directions = hydrateDirections(['Snijd de ui.']);

		expect(ingredients[0].clientId).toMatch(/^ingredient-/);
		expect(ingredients[0].substitutes?.[0].clientId).toMatch(/^substitute-/);
		expect(directions[0].clientId).toMatch(/^direction-/);
	});

	it('keeps client IDs out of persisted JSON', () => {
		const ingredients = hydrateIngredients([
			{
				clientId: 'ingredient-existing',
				name: ' ui ',
				amount: ' 1 ',
				role: 'serve_fresh',
				substitutes: [
					{ clientId: 'substitute-existing', name: ' sjalot ', kind: 'vegetable', note: ' fijn ' }
				]
			}
		]);
		const directions = hydrateDirections([{ clientId: 'direction-existing', text: ' Snijd. ' }]);

		expect(JSON.parse(serializeIngredients(ingredients))).toEqual([
			{
				name: 'ui',
				amount: '1',
				role: 'serve_fresh',
				substitutes: [{ name: 'sjalot', kind: 'vegetable', note: 'fijn' }]
			}
		]);
		expect(JSON.parse(serializeDirections(directions))).toEqual(['Snijd.']);
	});

	it('treats omitted and empty alternative lists as the same saved recipe', () => {
		expect(
			recipeIngredientsEqual(
				[{ name: 'ui', amount: '1', role: 'cook_in' }],
				[{ name: 'ui', amount: '1', role: 'cook_in', substitutes: [] }]
			)
		).toBe(true);
	});

	it('builds the clean baseline through the same normalized seam as the live editor', () => {
		const serverDraft = {
			title: 'Pasta',
			language: 'nl' as const,
			notes: '',
			sourceUrl: '',
			servings: 4,
			ingredients: [{ name: ' ui ', amount: ' 1 ', substitutes: [] }],
			directions: [{ clientId: 'server-step-1', text: ' Snijd. ' }]
		};
		const hydratedDraft = {
			...serverDraft,
			ingredients: hydrateIngredients(serverDraft.ingredients),
			directions: hydrateDirections(serverDraft.directions)
		};

		expect(recipeEditSnapshot(serverDraft)).toBe(recipeEditSnapshot(hydratedDraft));
	});
});

describe('recipe edit cooking-view continuity', () => {
	it('refreshes only when ingredient or step identity changes', () => {
		const current = {
			ingredientIds: ['onion'],
			directionIds: ['step-1']
		};

		expect(
			recipeEditChangesCookingStructure(current, {
				...current,
				directionIds: ['step-2']
			})
		).toBe(true);
		expect(
			recipeEditChangesCookingStructure(current, {
				...current,
				ingredientIds: ['shallot']
			})
		).toBe(true);
	});
});
