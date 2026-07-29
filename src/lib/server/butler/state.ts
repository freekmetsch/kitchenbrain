import { and, eq, inArray } from 'drizzle-orm';
import * as schema from '$lib/server/db/schema';
import type { Db } from '$lib/server/db/types';
import type { ButlerCandidate } from './brief';

export type ButlerDomain = schema.ButlerInitiativeDomain;
export type ButlerInitiativeLevel = schema.ButlerInitiativeLevel;
export type ButlerCandidateDisposition = schema.ButlerCandidateDisposition;

const DOMAINS = ['shopping', 'planning', 'stock', 'cooking'] as const satisfies ButlerDomain[];
const INITIATIVE_LEVELS = ['quiet', 'notice', 'prepare'] as const satisfies ButlerInitiativeLevel[];
const DEFAULT_INITIATIVE = 'prepare' satisfies ButlerInitiativeLevel;

export type ButlerServiceState = {
	initiative: Record<ButlerDomain, ButlerInitiativeLevel>;
	candidates: Array<{
		candidateKey: string;
		disposition: ButlerCandidateDisposition;
		snoozedUntil: Date | null;
	}>;
	changesSeenThrough: Date | null;
};

export type AppliedButlerServiceState = {
	visible: ButlerCandidate[];
	triaged: Array<{
		candidate: ButlerCandidate;
		disposition: ButlerCandidateDisposition;
		snoozedUntil: Date | null;
	}>;
	quiet: ButlerCandidate[];
};

function validCandidateKey(candidateKey: string): boolean {
	return candidateKey.length >= 3 && candidateKey.length <= 300 && candidateKey.startsWith('brief:');
}

export function applyButlerServiceState(
	candidates: ButlerCandidate[],
	state: ButlerServiceState,
	now = new Date()
): AppliedButlerServiceState {
	const candidateState = new Map(
		state.candidates.map((entry) => [entry.candidateKey, entry] as const)
	);
	const applied: AppliedButlerServiceState = { visible: [], triaged: [], quiet: [] };

	for (const candidate of candidates) {
		if (state.initiative[candidate.domain] === 'quiet') {
			applied.quiet.push(candidate);
			continue;
		}
		const triage = candidateState.get(candidate.id);
		const remainsHidden =
			triage?.disposition === 'dismissed' ||
			(triage?.disposition === 'snoozed' &&
				(triage.snoozedUntil == null || triage.snoozedUntil > now));
		if (triage && remainsHidden) {
			applied.triaged.push({ candidate, ...triage });
		} else {
			applied.visible.push(candidate);
		}
	}

	return applied;
}

export function getButlerServiceState(
	db: Db,
	userId: number,
	candidateKeys: string[],
	_now = new Date()
): ButlerServiceState {
	const initiative: Record<ButlerDomain, ButlerInitiativeLevel> = {
		shopping: DEFAULT_INITIATIVE,
		planning: DEFAULT_INITIATIVE,
		stock: DEFAULT_INITIATIVE,
		cooking: DEFAULT_INITIATIVE
	};
	for (const row of db
		.select()
		.from(schema.butlerInitiativePreferences)
		.where(eq(schema.butlerInitiativePreferences.userId, userId))
		.all()) {
		if (DOMAINS.includes(row.domain) && INITIATIVE_LEVELS.includes(row.level)) {
			initiative[row.domain] = row.level;
		}
	}

	const uniqueKeys = [...new Set(candidateKeys.filter(validCandidateKey))];
	const rows =
		uniqueKeys.length === 0
			? []
			: db
					.select({
						candidateKey: schema.butlerCandidateStates.candidateKey,
						disposition: schema.butlerCandidateStates.disposition,
						snoozedUntil: schema.butlerCandidateStates.snoozedUntil
					})
					.from(schema.butlerCandidateStates)
					.where(
						and(
							eq(schema.butlerCandidateStates.userId, userId),
							inArray(schema.butlerCandidateStates.candidateKey, uniqueKeys)
						)
					)
					.all();
	const rowByKey = new Map(rows.map((row) => [row.candidateKey, row]));
	const marker = db
		.select({ changesSeenThrough: schema.butlerUserStates.changesSeenThrough })
		.from(schema.butlerUserStates)
		.where(eq(schema.butlerUserStates.userId, userId))
		.get();

	return {
		initiative,
		candidates: uniqueKeys.flatMap((candidateKey) => {
			const row = rowByKey.get(candidateKey);
			return row ? [row] : [];
		}),
		changesSeenThrough: marker?.changesSeenThrough ?? null
	};
}

export function setButlerCandidateState(
	db: Db,
	input: {
		userId: number;
		candidateKey: string;
		disposition: ButlerCandidateDisposition;
		snoozedUntil?: Date | null;
		now?: Date;
	}
): void {
	const now = input.now ?? new Date();
	if (!validCandidateKey(input.candidateKey)) throw new Error('Invalid Butler candidate key');
	if (!['dismissed', 'snoozed'].includes(input.disposition)) {
		throw new Error('Invalid Butler candidate disposition');
	}
	const snoozedUntil = input.disposition === 'snoozed' ? input.snoozedUntil ?? null : null;
	if (input.disposition === 'snoozed' && (!snoozedUntil || snoozedUntil <= now)) {
		throw new Error('Snooze must end in the future');
	}

	db.insert(schema.butlerCandidateStates)
		.values({
			userId: input.userId,
			candidateKey: input.candidateKey,
			disposition: input.disposition,
			snoozedUntil,
			createdAt: now,
			updatedAt: now
		})
		.onConflictDoUpdate({
			target: [
				schema.butlerCandidateStates.userId,
				schema.butlerCandidateStates.candidateKey
			],
			set: {
				disposition: input.disposition,
				snoozedUntil,
				updatedAt: now
			}
		})
		.run();
}

export function clearButlerCandidateState(
	db: Db,
	userId: number,
	candidateKey: string
): void {
	if (!validCandidateKey(candidateKey)) throw new Error('Invalid Butler candidate key');
	db.delete(schema.butlerCandidateStates)
		.where(
			and(
				eq(schema.butlerCandidateStates.userId, userId),
				eq(schema.butlerCandidateStates.candidateKey, candidateKey)
			)
		)
		.run();
}

export function setButlerInitiative(
	db: Db,
	input: {
		userId: number;
		domain: ButlerDomain;
		level: ButlerInitiativeLevel;
		now?: Date;
	}
): void {
	if (!DOMAINS.includes(input.domain)) throw new Error('Invalid Butler initiative domain');
	if (!INITIATIVE_LEVELS.includes(input.level)) throw new Error('Invalid Butler initiative level');
	const now = input.now ?? new Date();
	db.insert(schema.butlerInitiativePreferences)
		.values({
			userId: input.userId,
			domain: input.domain,
			level: input.level,
			createdAt: now,
			updatedAt: now
		})
		.onConflictDoUpdate({
			target: [
				schema.butlerInitiativePreferences.userId,
				schema.butlerInitiativePreferences.domain
			],
			set: { level: input.level, updatedAt: now }
		})
		.run();
}

export function clearButlerInitiative(
	db: Db,
	userId: number,
	domain: ButlerDomain
): void {
	if (!DOMAINS.includes(domain)) throw new Error('Invalid Butler initiative domain');
	db.delete(schema.butlerInitiativePreferences)
		.where(
			and(
				eq(schema.butlerInitiativePreferences.userId, userId),
				eq(schema.butlerInitiativePreferences.domain, domain)
			)
		)
		.run();
}

export function markButlerChangesSeen(
	db: Db,
	input: { userId: number; through: Date; now?: Date }
): void {
	const now = input.now ?? new Date();
	if (!Number.isFinite(input.through.getTime()) || input.through > now) {
		throw new Error('Invalid Butler change marker');
	}
	db.insert(schema.butlerUserStates)
		.values({
			userId: input.userId,
			changesSeenThrough: input.through,
			createdAt: now,
			updatedAt: now
		})
		.onConflictDoUpdate({
			target: schema.butlerUserStates.userId,
			set: { changesSeenThrough: input.through, updatedAt: now }
		})
		.run();
}
