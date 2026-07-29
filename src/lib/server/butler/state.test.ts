import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import * as schema from '$lib/server/db/schema';
import { createTestDb } from '$lib/server/test_db';
import {
	applyButlerServiceState,
	clearButlerCandidateState,
	clearButlerInitiative,
	getButlerServiceState,
	markButlerChangesSeen,
	setButlerCandidateState,
	setButlerInitiative,
	type ButlerDomain
} from './state';
import type { ButlerCandidate } from './brief';

function addUser(db: ReturnType<typeof createTestDb>, username: string): number {
	return db
		.insert(schema.users)
		.values({ username, passwordHash: 'test', credsVersion: 1, createdAt: new Date() })
		.returning()
		.get().id;
}

describe('durable Butler service state', () => {
	it('separates active, triaged, and quiet-domain candidates without changing their order', () => {
		const candidate = (
			id: string,
			domain: ButlerCandidate['domain']
		): ButlerCandidate => ({
			id,
			domain,
			kind: domain === 'shopping' ? 'shopping_open' : 'plan_gap',
			priority: 1,
			title: id,
			summary: id,
			whyNow: id,
			evidence: [id],
			confidence: 'high',
			uncertainty: null,
			consequence: id,
			alternatives: [id],
			href: '/',
			actionLabel: id
		});
		const now = new Date('2026-07-29T10:00:00Z');
		const result = applyButlerServiceState(
			[
				candidate('brief:shopping:a', 'shopping'),
				candidate('brief:planning:b', 'planning'),
				candidate('brief:stock:c', 'stock'),
				candidate('brief:cooking:d', 'cooking')
			],
			{
				initiative: {
					shopping: 'prepare',
					planning: 'notice',
					stock: 'prepare',
					cooking: 'quiet'
				},
				candidates: [
					{
						candidateKey: 'brief:planning:b',
						disposition: 'snoozed',
						snoozedUntil: new Date('2026-07-30T10:00:00Z')
					},
					{
						candidateKey: 'brief:stock:c',
						disposition: 'snoozed',
						snoozedUntil: new Date('2026-07-29T09:00:00Z')
					}
				],
				changesSeenThrough: null
			},
			now
		);

		expect(result.visible.map((item) => item.id)).toEqual([
			'brief:shopping:a',
			'brief:stock:c'
		]);
		expect(result.triaged.map((item) => item.candidate.id)).toEqual(['brief:planning:b']);
		expect(result.quiet.map((item) => item.id)).toEqual(['brief:cooking:d']);
	});

	it('defaults every domain to Prepare and reads without writing', () => {
		const db = createTestDb();
		const userId = db.select().from(schema.users).get()!.id;
		const before = db.get<{ total: number }>(sql`select total_changes() as total`)!.total;

		const state = getButlerServiceState(db, userId, [
			'brief:plan-gap:2026-07-29',
			'brief:shopping-open:2026-07-29'
		]);
		const after = db.get<{ total: number }>(sql`select total_changes() as total`)!.total;

		expect(state.initiative).toEqual({
			shopping: 'prepare',
			planning: 'prepare',
			stock: 'prepare',
			cooking: 'prepare'
		});
		expect(state.candidates).toEqual([]);
		expect(state.changesSeenThrough).toBeNull();
		expect(after).toBe(before);
	});

	it('keeps dismissals and snoozes user-scoped and supports an explicit return', () => {
		const db = createTestDb();
		const primaryId = db.select().from(schema.users).get()!.id;
		const secondaryId = addUser(db, 'secondary');
		const now = new Date('2026-07-29T10:00:00Z');
		const tomorrow = new Date('2026-07-30T10:00:00Z');

		setButlerCandidateState(db, {
			userId: primaryId,
			candidateKey: 'brief:stock-expiry:spinach',
			disposition: 'dismissed',
			now
		});
		setButlerCandidateState(db, {
			userId: primaryId,
			candidateKey: 'brief:shopping-open:2026-07-29',
			disposition: 'snoozed',
			snoozedUntil: tomorrow,
			now
		});

		expect(
			getButlerServiceState(
				db,
				primaryId,
				['brief:stock-expiry:spinach', 'brief:shopping-open:2026-07-29'],
				now
			).candidates
		).toEqual([
			expect.objectContaining({
				candidateKey: 'brief:stock-expiry:spinach',
				disposition: 'dismissed'
			}),
			expect.objectContaining({
				candidateKey: 'brief:shopping-open:2026-07-29',
				disposition: 'snoozed',
				snoozedUntil: tomorrow
			})
		]);
		expect(
			getButlerServiceState(
				db,
				secondaryId,
				['brief:stock-expiry:spinach', 'brief:shopping-open:2026-07-29'],
				now
			).candidates
		).toEqual([]);

		clearButlerCandidateState(db, primaryId, 'brief:stock-expiry:spinach');
		expect(
			getButlerServiceState(db, primaryId, ['brief:stock-expiry:spinach'], now).candidates
		).toEqual([]);
	});

	it('saves initiative and the change marker only through explicit commands', () => {
		const db = createTestDb();
		const userId = db.select().from(schema.users).get()!.id;
		const now = new Date('2026-07-29T10:00:00Z');
		const changesSeenThrough = new Date('2026-07-29T09:55:00Z');

		for (const domain of ['shopping', 'planning', 'stock', 'cooking'] satisfies ButlerDomain[]) {
			setButlerInitiative(db, {
				userId,
				domain,
				level: domain === 'cooking' ? 'quiet' : 'notice',
				now
			});
		}
		markButlerChangesSeen(db, { userId, through: changesSeenThrough, now });

		expect(getButlerServiceState(db, userId, [], now)).toMatchObject({
			initiative: {
				shopping: 'notice',
				planning: 'notice',
				stock: 'notice',
				cooking: 'quiet'
			},
			changesSeenThrough
		});

		clearButlerInitiative(db, userId, 'cooking');
		expect(getButlerServiceState(db, userId, [], now).initiative.cooking).toBe('prepare');
	});

	it('rejects an invalid snooze without leaving a partial row', () => {
		const db = createTestDb();
		const userId = db.select().from(schema.users).get()!.id;
		const now = new Date('2026-07-29T10:00:00Z');

		expect(() =>
			setButlerCandidateState(db, {
				userId,
				candidateKey: 'brief:shopping-open:2026-07-29',
				disposition: 'snoozed',
				snoozedUntil: new Date('2026-07-29T09:59:00Z'),
				now
			})
		).toThrow('Snooze must end in the future');
		expect(db.select().from(schema.butlerCandidateStates).all()).toEqual([]);
	});
});
