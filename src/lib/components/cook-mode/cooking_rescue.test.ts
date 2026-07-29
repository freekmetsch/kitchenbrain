import { describe, expect, it } from 'vitest';
import { cookingRescue } from './cooking_rescue';

describe('deterministic cooking rescue', () => {
	it('grounds salty-sauce help in the active step and existing recipe ingredients', () => {
		const rescue = cookingRescue({
			issue: 'too_salty',
			language: 'en',
			step: 'Simmer the tomato sauce until thick.',
			ingredients: ['tomatoes', 'unsalted stock', 'cream']
		});

		expect(rescue.whyNow).toContain('Simmer the tomato sauce');
		expect(rescue.guidance.join(' ')).toContain('unsalted stock');
		expect(rescue.guidance.join(' ')).not.toContain('potato');
		expect(rescue.consequence).toContain('small');
	});

	it('shows a food-safety caution when raw animal ingredients may still be cooking', () => {
		const rescue = cookingRescue({
			issue: 'not_browning',
			language: 'en',
			step: 'Brown the chicken pieces.',
			ingredients: ['raw chicken thighs', 'oil']
		});

		expect(rescue.safetyCaution).toMatch(/safe internal temperature/i);
	});

	it('returns Dutch guidance for a thin sauce without adding a new ingredient', () => {
		const rescue = cookingRescue({
			issue: 'too_thin',
			language: 'nl',
			step: 'Laat de saus zacht koken.',
			ingredients: ['tomaten', 'maizena']
		});

		expect(rescue.guidance.join(' ')).toContain('maizena');
		expect(rescue.alternatives.length).toBeGreaterThan(0);
	});
});
