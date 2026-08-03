import { describe, expect, it } from 'vitest';
import {
	buildMealLedger,
	displayQuantity,
	matchesInventoryQuickView,
	matchesInventoryScope,
	matchesInventoryQuery,
	recipeCoverage,
	recipeRelationshipKind,
	stockAttention
} from './shared';
import type { StockRadarItem, StockRadarLink } from './shared';

describe('inventory display quantity', () => {
	it('pluralizes portions in English and Dutch', () => {
		expect(displayQuantity(1, 'portion', 'en')).toBe('1 portion');
		expect(displayQuantity(2, 'portion', 'en')).toBe('2 portions');
		expect(displayQuantity(1, 'portion', 'nl')).toBe('1 portie');
		expect(displayQuantity(2, 'portion', 'nl')).toBe('2 porties');
	});

	it('localizes decimal values while preserving canonical units', () => {
		expect(displayQuantity(1.5, 'kg', 'en')).toBe('1.5 kg');
		expect(displayQuantity(1.5, 'kg', 'nl')).toBe('1,5 kg');
		expect(displayQuantity(2, 'stuk', 'nl')).toBe('2');
	});
});

describe('inventory recipe relationship', () => {
	it('keeps linked, planned, dismissed, and unresolved states distinct', () => {
		expect(recipeRelationshipKind({ recipeStatus: 'linked' }, { slug: 'soup' })).toBe('linked');
		expect(recipeRelationshipKind({ recipeStatus: 'plan_to_add' }, null)).toBe('planned');
		expect(recipeRelationshipKind({ recipeStatus: 'no_recipe' }, null)).toBe('not_needed');
		expect(recipeRelationshipKind({ recipeStatus: null }, null)).toBe('unresolved');
	});

	it('summarizes meal relationships without counting other stock', () => {
		expect(
			recipeCoverage([
				{ kind: 'leftover', madeFromRecipeId: 1, recipeStatus: 'linked' },
				{ kind: 'leftover', madeFromRecipeId: null, recipeStatus: 'plan_to_add' },
				{ kind: 'leftover', madeFromRecipeId: null, recipeStatus: 'no_recipe' },
				{ kind: 'leftover', madeFromRecipeId: null, recipeStatus: null },
				{ kind: 'ingredient', madeFromRecipeId: null, recipeStatus: null }
			])
		).toEqual({ linked: 1, planned: 1, not_needed: 1, unresolved: 1 });
	});
});

describe('inventory search', () => {
	it('matches every query term across row facts', () => {
		expect(matchesInventoryQuery('chicken freezer', ['Chicken soup', 'freezer', 'meal'])).toBe(true);
		expect(matchesInventoryQuery('chicken pantry', ['Chicken soup', 'freezer', 'meal'])).toBe(false);
	});

	it('is case- and accent-insensitive', () => {
		expect(matchesInventoryQuery('puree', ['Tomatenpurée', 'Voorraadkast'])).toBe(true);
		expect(matchesInventoryQuery('', ['Anything'])).toBe(true);
	});
});

describe('stock radar attention', () => {
	const todayIso = '2026-07-25';
	const meal = (
		name: string,
		qtyNum: number,
		createdAt = '2026-07-20'
	): StockRadarItem => ({
		name,
		qtyNum,
		kind: 'leftover',
		createdAt
	});
	const staple = (targetPortions: number | null): StockRadarLink => ({
		isFreezerStaple: true,
		targetPortions
	});

	it('ignores expiry and uses below-target, low-stock, then aging precedence', () => {
		const dated = { ...meal('Expires', 1, '2026-06-01'), expiryDate: '2026-07-26' };
		expect(stockAttention(dated, staple(8), todayIso))
			.toEqual({ kind: 'below_target', portionsBelow: 7 });
		expect(stockAttention(meal('Target', 4), staple(8), todayIso))
			.toEqual({ kind: 'below_target', portionsBelow: 4 });
		expect(stockAttention(meal('Low', 2), null, todayIso))
			.toEqual({ kind: 'low_stock', portions: 2 });
		expect(stockAttention(meal('Old', 4, '2026-07-01'), null, todayIso))
			.toEqual({ kind: 'aging', daysOld: 24 });
		expect(stockAttention(meal('Settled', 4), null, todayIso)).toBeNull();
	});

	it('does not use expiry dates to rank meals', () => {
		const items = [
			{ ...meal('Later expiry', 2, '2026-07-10'), id: 1, expiryDate: '2026-07-29' },
			{ ...meal('Sooner expiry', 2, '2026-07-19'), id: 2, expiryDate: '2026-07-27' }
		];
		const entries = buildMealLedger(items, [], () => null, todayIso);

		expect(entries.map(({ name }) => name)).toEqual(['Later expiry', 'Sooner expiry']);
	});

	it('builds one alphabetic meal ledger from unique live and ghost rows', () => {
		const apple = meal('Apple stew', 2);
		const banana = meal('Banana curry', 0);
		const entries = buildMealLedger(
			[
				{ ...banana, id: 2 },
				{ ...apple, id: 1 },
				{ ...apple, id: 1 },
				{ ...meal('Carrot soup', 0), id: 3 }
			],
			[
				{ slug: 'date-tagine', title: 'Date tagine' },
				{ slug: 'date-tagine', title: 'Date tagine' }
			],
			(item) => (item.id === 2 ? { ...staple(6), slug: 'banana-curry' } : null),
			todayIso
		);

		expect(entries.map((entry) => [entry.kind, entry.name])).toEqual([
			['item', 'Apple stew'],
			['item', 'Banana curry'],
			['ghost', 'Date tagine']
		]);
		expect(entries.map((entry) => entry.key)).toEqual([
			'item-1',
			'item-2',
			'ghost-date-tagine'
		]);
	});

	it('keeps Meals, Ingredients, and All stock scopes explicit', () => {
		expect(matchesInventoryScope({ kind: 'leftover' }, 'meals')).toBe(true);
		expect(matchesInventoryScope({ kind: 'ingredient' }, 'meals')).toBe(false);
		expect(matchesInventoryScope({ kind: 'ingredient' }, 'ingredients')).toBe(true);
		expect(matchesInventoryScope({ kind: 'processed' }, 'all')).toBe(true);
	});
});

describe('stock quick views', () => {
	it('shows only meals with portions in the Ready meals view', () => {
		expect(
			matchesInventoryQuickView(
				{ kind: 'leftover', qtyNum: 2 },
				{ isFreezerStaple: false, targetPortions: null },
				'ready'
			)
		).toBe(true);
		expect(
			matchesInventoryQuickView(
				{ kind: 'leftover', qtyNum: 0 },
				{ isFreezerStaple: true, targetPortions: 4 },
				'ready'
			)
		).toBe(false);
		expect(
			matchesInventoryQuickView(
				{ kind: 'ingredient', qtyNum: 3 },
				null,
				'ready'
			)
		).toBe(false);
	});

	it('shows only freezer staples below target and skips filtering when no quick view is active', () => {
		expect(
			matchesInventoryQuickView(
				{ kind: 'leftover', qtyNum: 1 },
				{ isFreezerStaple: true, targetPortions: 4 },
				'below_target'
			)
		).toBe(true);
		expect(
			matchesInventoryQuickView(
				{ kind: 'leftover', qtyNum: 4 },
				{ isFreezerStaple: true, targetPortions: 4 },
				'below_target'
			)
		).toBe(false);
		expect(
			matchesInventoryQuickView(
				{ kind: 'leftover', qtyNum: 0 },
				{ isFreezerStaple: false, targetPortions: 4 },
				'below_target'
			)
		).toBe(false);
		expect(
			matchesInventoryQuickView(
				{ kind: 'ingredient', qtyNum: 2 },
				null,
				null
			)
		).toBe(true);
	});
});
