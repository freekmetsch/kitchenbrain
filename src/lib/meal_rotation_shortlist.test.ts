import { describe, expect, it } from 'vitest';
import { buildRotationShortlist } from './meal_rotation_shortlist';

const baseRecipe = {
	id: 1,
	slug: 'bolo',
	title: 'Spaghetti bolognese',
	titleEn: null,
	rating: 4,
	servings: 4,
	rotationPolicy: 'weekly' as const,
	rotationSeasons: [],
	lastCookedAt: new Date('2026-07-20T12:00:00.000Z'),
	isFreezerStaple: true,
	targetPortions: 6,
	onHandPortions: 2
};

describe('buildRotationShortlist', () => {
	it('places a due low-stock recipe only in the For this week lane', () => {
		const result = buildRotationShortlist({
			recipes: [baseRecipe],
			plannedMeals: [],
			targetWeekStart: '2026-08-03',
			currentWeekStart: '2026-08-03'
		});

		expect(result.due).toHaveLength(1);
		expect(result.due[0]).toMatchObject({ slug: 'bolo', action: 'cook', source: 'fresh' });
		expect(result.freezerLow).toEqual([]);
	});

	it('uses Freezer low for a below-target recipe that is not due', () => {
		const result = buildRotationShortlist({
			recipes: [{ ...baseRecipe, rotationPolicy: 'monthly', lastCookedAt: new Date('2026-07-20T12:00:00.000Z') }],
			plannedMeals: [],
			targetWeekStart: '2026-08-03',
			currentWeekStart: '2026-08-03'
		});

		expect(result.due).toEqual([]);
		expect(result.freezerLow[0]).toMatchObject({ slug: 'bolo', action: 'cook' });
	});

	it('suppresses recipes already planned for the target week', () => {
		const result = buildRotationShortlist({
			recipes: [baseRecipe],
			plannedMeals: [{ recipeSlug: 'bolo', weekStartDate: '2026-08-03', status: 'planned' }],
			targetWeekStart: '2026-08-03',
			currentWeekStart: '2026-08-03'
		});

		expect(result).toEqual({ due: [], freezerLow: [] });
	});

	it('caps and ranks deterministically by oldest due date, rating, then title', () => {
		const recipes = [
			{ ...baseRecipe, id: 1, slug: 'z', title: 'Ziti', rating: 5, lastCookedAt: new Date('2026-07-20') },
			{ ...baseRecipe, id: 2, slug: 'a', title: 'Aubergine', rating: 5, lastCookedAt: new Date('2026-07-20') },
			{ ...baseRecipe, id: 3, slug: 'old', title: 'Oldest', rating: 1, lastCookedAt: new Date('2026-07-01') },
			{ ...baseRecipe, id: 4, slug: 'extra', title: 'Extra', rating: 5, lastCookedAt: new Date('2026-07-20') }
		];
		const result = buildRotationShortlist({
			recipes,
			plannedMeals: [],
			targetWeekStart: '2026-08-03',
			currentWeekStart: '2026-08-03'
		});

		expect(result.due.map((candidate) => candidate.slug)).toEqual(['old', 'a', 'extra']);
	});
});
