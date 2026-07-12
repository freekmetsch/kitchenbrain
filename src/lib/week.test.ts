import { describe, expect, it } from 'vitest';
import { isoWeekNumber, isoWeekStart, offsetIsoWeek, todayIso } from './week';

describe('week helpers', () => {
	it('offsets ISO week keys without timezone drift', () => {
		expect(offsetIsoWeek('2026-07-06', 1)).toBe('2026-07-13');
		expect(offsetIsoWeek('2026-07-13', -1)).toBe('2026-07-06');
	});

	it('normalizes Sundays back to the Monday week key', () => {
		expect(isoWeekStart('2026-07-12')).toBe('2026-07-06');
		expect(isoWeekStart('2026-07-13')).toBe('2026-07-13');
	});

	it('computes ISO week numbers from date strings', () => {
		expect(isoWeekNumber('2026-07-06')).toBe(28);
		expect(isoWeekNumber('2026-12-31')).toBe(53);
	});

	it('returns a well-formed ISO date whose week start is not in the future', () => {
		const today = todayIso();
		expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		expect(isoWeekStart(today) <= today).toBe(true);
	});
});
