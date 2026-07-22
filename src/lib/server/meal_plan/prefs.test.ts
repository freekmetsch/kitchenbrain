import { describe, expect, it } from 'vitest';
import { createTestDb } from '$lib/server/test_db';
import { getWeekStartDay, setWeekStartDay } from './prefs';

describe('planning week fallback', () => {
	it('uses Wednesday only when no preference is saved', () => {
		const db = createTestDb();
		expect(getWeekStartDay(db)).toBe(2);
		setWeekStartDay(0, db);
		expect(getWeekStartDay(db)).toBe(0);
	});
});
