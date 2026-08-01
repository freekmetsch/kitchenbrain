import { describe, expect, it } from 'vitest';
import { createTestDb } from '$lib/server/test_db';
import { buildHouseholdExport } from '$lib/server/settings/export';

describe('buildHouseholdExport', () => {
	it('exports only the supported household datasets', () => {
		const exported = buildHouseholdExport(
			createTestDb(),
			new Date('2026-07-28T12:00:00.000Z')
		);

		expect(Object.keys(exported)).toEqual([
			'exported_at',
			'inventory',
			'recipes',
			'meal_plan',
			'meal_log',
			'meal_sub_recipes',
			'shopping_overrides',
			'recurring_shopping_items',
			'shopping_week_entries',
			'shopping_week_exclusions',
			'ah_favorites',
			'recipe_ah_preferences'
		]);
	});
});
