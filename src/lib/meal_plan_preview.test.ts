import { describe, expect, it } from 'vitest';
import { buildMealPlanPreview } from './meal_plan_preview';

describe('buildMealPlanPreview', () => {
	it('uses the same week and delivery boundaries as the meal plan', () => {
		const preview = buildMealPlanPreview('2026-07-24', {
			weekStartDay: 2,
			groceryDay: 1
		});

		expect(preview.weekStart).toBe('2026-07-22');
		expect(preview.weekEnd).toBe('2026-07-28');
		expect(preview.deliveryDate).toBe('2026-07-21');
		expect(preview.days).toEqual([
			'2026-07-22',
			'2026-07-23',
			'2026-07-24',
			'2026-07-25',
			'2026-07-26',
			'2026-07-27',
			'2026-07-28'
		]);
	});
});
