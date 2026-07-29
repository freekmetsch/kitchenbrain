import { describe, expect, it } from 'vitest';
import {
	displayQuantity,
	groupMealStock,
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
		createdAt = '2026-07-20',
		expiryDate: string | null = null
	): StockRadarItem => ({
		name,
		qtyNum,
		kind: 'leftover',
		expiryDate,
		createdAt
	});
	const staple = (targetPortions: number | null): StockRadarLink => ({
		isFreezerStaple: true,
		targetPortions
	});

	it('uses expiry, below-target, low-stock, then aging precedence', () => {
		expect(stockAttention(meal('Expires', 1, '2026-06-01', '2026-07-26'), staple(8), todayIso))
			.toEqual({ kind: 'expiry', daysUntil: 1 });
		expect(stockAttention(meal('Target', 4), staple(8), todayIso))
			.toEqual({ kind: 'below_target', portionsBelow: 4 });
		expect(stockAttention(meal('Low', 2), null, todayIso))
			.toEqual({ kind: 'low_stock', portions: 2 });
		expect(stockAttention(meal('Old', 4, '2026-07-01'), null, todayIso))
			.toEqual({ kind: 'aging', daysOld: 24 });
		expect(stockAttention(meal('Settled', 4), null, todayIso)).toBeNull();
	});

	it('groups and sorts positive meals while keeping zero-stock staples recoverable', () => {
		const items = [
			meal('Plenty', 6),
			meal('Later expiry', 2, '2026-07-10', '2026-07-29'),
			meal('Sooner expiry', 2, '2026-07-19', '2026-07-27'),
			meal('Cook again', 0)
		];
		const groups = groupMealStock(
			items,
			(item) => (item.name === 'Cook again' ? staple(6) : null),
			todayIso
		);

		expect(groups.useNext.map(({ item }) => item.name)).toEqual(['Sooner expiry', 'Later expiry']);
		expect(groups.stillPlenty.map((item) => item.name)).toEqual(['Plenty']);
		expect(groups.cookAgain.map((item) => item.name)).toEqual(['Cook again']);
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
				{
					kind: 'ingredient',
					qtyNum: 1,
					section: 'pantry',
					unit: 'pak',
					parTargetQty: 3,
					parTargetUnit: 'pak'
				},
				null,
				'below_target'
			)
		).toBe(true);
		expect(
			matchesInventoryQuickView(
				{
					kind: 'ingredient',
					qtyNum: null,
					section: 'pantry',
					unit: 'pak',
					parTargetQty: 3,
					parTargetUnit: 'pak'
				},
				null,
				'below_target'
			)
		).toBe(false);
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
