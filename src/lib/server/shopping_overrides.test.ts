import { describe, expect, it } from 'vitest';
import * as schema from '$lib/server/db/schema';
import { createTestDb } from './test_db';
import { findShoppingOverride } from './shopping_overrides';

describe('findShoppingOverride', () => {
	it('uses the canonical key across casing and diacritics', () => {
		const db = createTestDb();
		db.insert(schema.shoppingListOverrides).values({
			weekStartDate: '2026-07-22',
			name: 'Crème fraîche',
			bought: false,
			manual: false,
			createdAt: new Date()
		}).run();

		expect(findShoppingOverride(db, '2026-07-22', 'CREME FRAICHE')?.name).toBe('Crème fraîche');
	});

	it('uses the newest normalized-equivalent row just like the page projection', () => {
		const db = createTestDb();
		const now = new Date();
		db.insert(schema.shoppingListOverrides).values([
			{ weekStartDate: '2026-07-22', name: 'Crème fraîche', bought: false, manual: false, createdAt: now },
			{ weekStartDate: '2026-07-22', name: 'CREME FRAICHE', bought: true, manual: false, createdAt: now }
		]).run();

		expect(findShoppingOverride(db, '2026-07-22', 'creme fraiche')?.bought).toBe(true);
	});
});
