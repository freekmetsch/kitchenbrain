import { describe, expect, it } from 'vitest';
import { evaluateRotation, normalizeRotationSettings } from './meal_rotation';

describe('evaluateRotation', () => {
	it('makes a weekly recipe due exactly seven local calendar days after cooking', () => {
		const result = evaluateRotation({
			policy: 'weekly',
			seasons: [],
			lastCookedAt: new Date('2026-07-27T22:30:00.000Z'),
			targetWeekStart: '2026-08-04',
			currentWeekStart: '2026-07-29',
			reservedWeekStarts: []
		});

		expect(result).toMatchObject({ status: 'due', reason: { code: 'cadence_due' } });
	});

	it('makes a fortnightly recipe due in the week containing its fourteenth day', () => {
		const due = evaluateRotation({
			policy: 'fortnightly',
			seasons: [],
			lastCookedAt: new Date('2026-07-27T22:30:00.000Z'),
			targetWeekStart: '2026-08-10',
			currentWeekStart: '2026-07-29',
			reservedWeekStarts: []
		});

		expect(due).toMatchObject({ status: 'due', reason: { dueDate: '2026-08-11' } });
	});

	it('keeps a cadence waiting when its due date falls after the target week', () => {
		const waiting = evaluateRotation({
			policy: 'fortnightly',
			seasons: [],
			lastCookedAt: new Date('2026-07-27T22:30:00.000Z'),
			targetWeekStart: '2026-08-03',
			currentWeekStart: '2026-07-29',
			reservedWeekStarts: []
		});

		expect(waiting).toMatchObject({ status: 'not_due', reason: { dueDate: '2026-08-11' } });
	});

	it('clamps a monthly cadence to the last day of a shorter month', () => {
		const result = evaluateRotation({
			policy: 'monthly',
			seasons: [],
			lastCookedAt: new Date('2027-01-31T12:00:00.000Z'),
			targetWeekStart: '2027-02-22',
			currentWeekStart: '2027-02-01',
			reservedWeekStarts: []
		});

		expect(result).toMatchObject({ status: 'due', reason: { dueDate: '2027-02-28' } });
	});

	it('offers a seasonal recipe only once in the active winter instance', () => {
		const result = evaluateRotation({
			policy: 'seasonal',
			seasons: ['winter'],
			lastCookedAt: new Date('2026-12-15T12:00:00.000Z'),
			targetWeekStart: '2027-01-11',
			currentWeekStart: '2027-01-04',
			reservedWeekStarts: []
		});

		expect(result).toMatchObject({ status: 'not_due', reason: { code: 'season_complete' } });
	});

	it('keeps unconfigured and never recipes out of the due shortlist', () => {
		const base = {
			seasons: [] as const,
			lastCookedAt: null,
			targetWeekStart: '2026-08-03',
			currentWeekStart: '2026-08-03',
			reservedWeekStarts: [] as string[]
		};

		expect(evaluateRotation({ ...base, policy: null })).toMatchObject({
			status: 'excluded',
			reason: { code: 'unconfigured' }
		});
		expect(evaluateRotation({ ...base, policy: 'never' })).toMatchObject({
			status: 'excluded',
			reason: { code: 'never' }
		});
	});

	it('reveals special recipes only when the occasion shelf is opened', () => {
		const base = {
			policy: 'special' as const,
			seasons: [],
			lastCookedAt: null,
			targetWeekStart: '2026-12-21',
			currentWeekStart: '2026-12-21',
			reservedWeekStarts: []
		};

		expect(evaluateRotation(base)).toMatchObject({ status: 'excluded' });
		expect(evaluateRotation({ ...base, includeSpecial: true })).toMatchObject({
			status: 'special',
			reason: { code: 'special' }
		});
	});

	it('honors season filters on calendar cadences', () => {
		const result = evaluateRotation({
			policy: 'weekly',
			seasons: ['winter'],
			lastCookedAt: null,
			targetWeekStart: '2026-07-06',
			currentWeekStart: '2026-07-06',
			reservedWeekStarts: []
		});

		expect(result).toMatchObject({ status: 'not_due', reason: { code: 'season_inactive' } });
	});

	it('suppresses a weekly recipe reserved by an uncooked plan in the previous week', () => {
		const result = evaluateRotation({
			policy: 'weekly',
			seasons: [],
			lastCookedAt: null,
			targetWeekStart: '2026-08-10',
			currentWeekStart: '2026-08-10',
			reservedWeekStarts: ['2026-08-03']
		});

		expect(result).toMatchObject({ status: 'reserved', reason: { code: 'reserved' } });
	});

	it('does not project rotation truth onto past weeks', () => {
		const result = evaluateRotation({
			policy: 'weekly',
			seasons: [],
			lastCookedAt: null,
			targetWeekStart: '2026-07-27',
			currentWeekStart: '2026-08-03',
			reservedWeekStarts: []
		});

		expect(result).toMatchObject({ status: 'excluded', reason: { code: 'past_week' } });
	});
});

describe('normalizeRotationSettings', () => {
	it('rejects seasonal without a season and clears seasons for non-seasonal opt-outs', () => {
		expect(() => normalizeRotationSettings('seasonal', [])).toThrow(/season/i);
		expect(normalizeRotationSettings('never', ['winter'])).toEqual({
			policy: 'never',
			seasons: []
		});
		expect(normalizeRotationSettings(null, ['winter'])).toEqual({
			policy: null,
			seasons: ['winter']
		});
	});
});
