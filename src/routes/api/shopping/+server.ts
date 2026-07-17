import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { db } from '$lib/server/db/index';
import { shoppingListOverrides } from '$lib/server/db/schema';
import { readJsonBody } from '$lib/server/api_body';

// AH-INVARIANT: names/amounts/units are AH-coupled Dutch values — validate shape
// and bounds only, never trim or normalize; write them exactly as received.
const PostSchema = z.discriminatedUnion('action', [
	z.object({
		action: z.literal('toggle_bought'),
		weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
		name: z.string().min(1).max(256),
		bought: z.boolean()
	}),
	z.object({
		action: z.literal('add_manual'),
		weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
		name: z.string().min(1).max(256),
		amount: z.string().max(64).nullable().optional(),
		unit: z.string().max(64).nullable().optional()
	})
]);

const DeleteQuerySchema = z.object({
	week: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
	name: z.string().min(1).max(256)
});

// Overrides are keyed by (week, name) — the same filter drives both POST
// actions' upsert lookup and DELETE.
const overrideFilter = (weekStart: string, name: string) =>
	and(eq(shoppingListOverrides.weekStartDate, weekStart), eq(shoppingListOverrides.name, name));

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) error(401, 'Unauthorized');

	const body = await readJsonBody(request, PostSchema);
	const { weekStart, name } = body;

	const now = new Date();
	const existing = db.select().from(shoppingListOverrides).where(overrideFilter(weekStart, name)).get();

	if (body.action === 'toggle_bought') {
		const bought = body.bought;
		if (existing) {
			db.update(shoppingListOverrides)
				.set({ bought })
				.where(eq(shoppingListOverrides.id, existing.id))
				.run();
		} else {
			db.insert(shoppingListOverrides)
				.values({ weekStartDate: weekStart, name, bought, manual: false, createdAt: now })
				.run();
		}
		return json({ ok: true });
	}

	if (body.action === 'add_manual') {
		// AH-INVARIANT: manual shopping override names are AH-coupled and should stay Dutch.
		const amount = body.amount ?? null;
		const unit = body.unit ?? null;
		if (existing) {
			db.update(shoppingListOverrides)
				.set({ manual: true, amount, unit })
				.where(eq(shoppingListOverrides.id, existing.id))
				.run();
		} else {
			db.insert(shoppingListOverrides)
				.values({ weekStartDate: weekStart, name, bought: false, manual: true, amount, unit, createdAt: now })
				.run();
		}
		return json({ ok: true });
	}

	error(400, 'Unknown action');
};

export const DELETE: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) error(401, 'Unauthorized');

	const parsed = DeleteQuerySchema.safeParse({
		week: url.searchParams.get('week'),
		name: url.searchParams.get('name')
	});
	if (!parsed.success) error(400, parsed.error.message);
	const { week: weekStart, name } = parsed.data;

	db.delete(shoppingListOverrides).where(overrideFilter(weekStart, name)).run();

	return json({ ok: true });
};
