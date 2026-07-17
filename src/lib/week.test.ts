import { describe, expect, it } from 'vitest';
import {
	dateOfWeekday,
	isoWeekNumber,
	isoWeekStart,
	nearestWeekBucket,
	offsetIsoWeek,
	todayIso,
	weekKeyRange,
	weekStartFor
} from './week';

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

	it('computes week starts for custom start days', () => {
		// 2026-07-16 is a Thursday. Monday start → Mon 13; Wednesday start (2) →
		// Wed 15; Friday start (4) → most recent Friday, the 10th.
		expect(weekStartFor('2026-07-16', 0)).toBe('2026-07-13');
		expect(weekStartFor('2026-07-16', 2)).toBe('2026-07-15');
		expect(weekStartFor('2026-07-16', 4)).toBe('2026-07-10');
		// A date already on the start day is its own week start.
		expect(weekStartFor('2026-07-15', 2)).toBe('2026-07-15');
		// Sunday start (6) on a Sunday.
		expect(weekStartFor('2026-07-12', 6)).toBe('2026-07-12');
		// startDay 0 matches the ISO Monday helper.
		expect(weekStartFor('2026-07-12', 0)).toBe(isoWeekStart('2026-07-12'));
	});

	it('places a Monday-offset weekday inside a custom planning week', () => {
		// Week starting Wed 2026-07-15 (weekStartDay 2): Wednesday (2) is day 0,
		// Friday (4) is +2, Monday (0) wraps to +5.
		expect(dateOfWeekday('2026-07-15', 2, 2)).toBe('2026-07-15');
		expect(dateOfWeekday('2026-07-15', 4, 2)).toBe('2026-07-17');
		expect(dateOfWeekday('2026-07-15', 0, 2)).toBe('2026-07-20');
		// Classic Monday week: Sunday (6) is the last day.
		expect(dateOfWeekday('2026-07-13', 6, 0)).toBe('2026-07-19');
	});

	it('buckets legacy week keys into the most-overlapping planning week', () => {
		// Monday key 2026-07-13 vs Wednesday-start buckets (Wed 8 / Wed 15): the
		// Mon-Sun span shares 5 of 7 days with the Wed-15 week — bucket there.
		expect(nearestWeekBucket('2026-07-13', 2)).toBe('2026-07-15');
		// A key that already is a bucket start maps to itself.
		expect(nearestWeekBucket('2026-07-15', 2)).toBe('2026-07-15');
		expect(nearestWeekBucket('2026-07-13', 0)).toBe('2026-07-13');
	});

	it('weekKeyRange agrees with nearestWeekBucket', () => {
		const weekStart = '2026-07-15'; // Wednesday-start bucket
		const { from, to } = weekKeyRange(weekStart);
		expect(from).toBe('2026-07-12');
		expect(to).toBe('2026-07-19');
		// Every key inside [from, to) buckets to weekStart; keys outside don't.
		for (const key of ['2026-07-12', '2026-07-13', '2026-07-15', '2026-07-18']) {
			expect(nearestWeekBucket(key, 2)).toBe(weekStart);
		}
		for (const key of ['2026-07-11', '2026-07-19']) {
			expect(nearestWeekBucket(key, 2)).not.toBe(weekStart);
		}
	});

	it('returns a well-formed ISO date whose week start is not in the future', () => {
		const today = todayIso();
		expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		expect(isoWeekStart(today) <= today).toBe(true);
	});
});
