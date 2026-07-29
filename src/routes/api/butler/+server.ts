import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import { readJsonBody } from '$lib/server/api_body';
import { db } from '$lib/server/db/index';
import {
	clearButlerCandidateState,
	clearButlerInitiative,
	markButlerChangesSeen,
	setButlerCandidateState,
	setButlerInitiative
} from '$lib/server/butler/state';

const CandidateKey = z.string().min(3).max(300).startsWith('brief:');
const Body = z.discriminatedUnion('action', [
	z.object({ action: z.literal('dismiss'), candidateKey: CandidateKey }),
	z.object({
		action: z.literal('snooze'),
		candidateKey: CandidateKey,
		duration: z.enum(['day', 'week'])
	}),
	z.object({ action: z.literal('return'), candidateKey: CandidateKey }),
	z.object({
		action: z.literal('save_initiative'),
		domain: z.enum(['shopping', 'planning', 'stock', 'cooking']),
		level: z.enum(['quiet', 'notice', 'prepare'])
	}),
	z.object({
		action: z.literal('forget_initiative'),
		domain: z.enum(['shopping', 'planning', 'stock', 'cooking'])
	}),
	z.object({ action: z.literal('mark_changes_seen') })
]);

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) error(401, 'Unauthorized');
	const body = await readJsonBody(request, Body);
	const now = new Date();

	if (body.action === 'dismiss') {
		setButlerCandidateState(db, {
			userId: locals.user.id,
			candidateKey: body.candidateKey,
			disposition: 'dismissed',
			now
		});
	} else if (body.action === 'snooze') {
		setButlerCandidateState(db, {
			userId: locals.user.id,
			candidateKey: body.candidateKey,
			disposition: 'snoozed',
			snoozedUntil: new Date(now.getTime() + (body.duration === 'day' ? 1 : 7) * 86_400_000),
			now
		});
	} else if (body.action === 'return') {
		clearButlerCandidateState(db, locals.user.id, body.candidateKey);
	} else if (body.action === 'save_initiative') {
		setButlerInitiative(db, {
			userId: locals.user.id,
			domain: body.domain,
			level: body.level,
			now
		});
	} else if (body.action === 'forget_initiative') {
		clearButlerInitiative(db, locals.user.id, body.domain);
	} else {
		markButlerChangesSeen(db, {
			userId: locals.user.id,
			through: now,
			now
		});
	}

	return json({ ok: true });
};
