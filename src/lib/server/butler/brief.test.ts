import { describe, expect, it } from 'vitest';
import { deriveButlerBrief, type ButlerSnapshot } from './brief';

function snapshot(patch: Partial<ButlerSnapshot> = {}): ButlerSnapshot {
	return {
		today: '2026-07-29',
		weekStart: '2026-07-29',
		expiring: [],
		plannedMeals: 3,
		shopping: { toBuy: 0, conflicts: 0, sourcesNeedingReview: 0 },
		freezerTargets: [],
		pendingReviews: 0,
		...patch
	};
}

describe('deterministic Butler Brief', () => {
	it('returns at most three highest-value candidates with the full trust envelope', () => {
		const brief = deriveButlerBrief(
			snapshot({
				expiring: [
					{ id: 1, name: 'spinach', expiryDate: '2026-07-29', section: 'fridge' },
					{ id: 2, name: 'yoghurt', expiryDate: '2026-07-31', section: 'fridge' }
				],
				plannedMeals: 0,
				shopping: { toBuy: 9, conflicts: 2, sourcesNeedingReview: 1 },
				freezerTargets: [
					{ recipeSlug: 'lentil-curry', title: 'Lentil curry', currentPortions: 1, targetPortions: 6 }
				],
				pendingReviews: 1
			})
		);

		expect(brief).toHaveLength(3);
		expect(brief.map((candidate) => candidate.kind)).toEqual([
			'pending_review',
			'expiring_stock',
			'shopping_conflict'
		]);
		for (const candidate of brief) {
			expect(candidate.whyNow).not.toBe('');
			expect(candidate.evidence.length).toBeGreaterThan(0);
			expect(['high', 'medium', 'low']).toContain(candidate.confidence);
			expect(candidate).toHaveProperty('uncertainty');
			expect(candidate.consequence).not.toBe('');
			expect(candidate.alternatives.length).toBeGreaterThan(0);
			expect(candidate.href.startsWith('/')).toBe(true);
		}
	});

	it('uses stable candidate ids and never mutates or depends on ranking time', () => {
		const input = snapshot({
			expiring: [{ id: 8, name: 'tofu', expiryDate: '2026-07-30', section: 'fridge' }],
			plannedMeals: 0
		});

		expect(deriveButlerBrief(input)).toEqual(deriveButlerBrief(structuredClone(input)));
		expect(deriveButlerBrief(input).map((candidate) => candidate.id)).toEqual([
			'brief:expiring:8-2026-07-30',
			'brief:plan-gap:2026-07-29'
		]);
	});

	it('stays empty when there is no material household cue', () => {
		expect(deriveButlerBrief(snapshot())).toEqual([]);
	});
});
