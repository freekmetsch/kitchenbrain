import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db/index';
import { shoppingListOverrides } from '$lib/server/db/schema';
import { readJsonBody } from '$lib/server/api_body';
import { isoDateSchema } from '$lib/date_schema';
import { addInventory, updateInventory } from '$lib/server/inventory_writes';
import { findExistingItem } from '$lib/server/inventory_merge';
import { sumCompatibleQuantities } from '$lib/recipe_scale';
import { findShoppingOverride } from '$lib/server/shopping_overrides';

// AH-INVARIANT: names/amounts/units are AH-coupled Dutch values — validate shape
// and bounds only, never trim or normalize; write them exactly as received.
const PostSchema = z.discriminatedUnion('action', [
	z.object({
		action: z.literal('toggle_bought'),
		weekStart: isoDateSchema,
		name: z.string().min(1).max(256),
		bought: z.boolean()
	}),
	z.object({
		action: z.literal('add_manual'),
		weekStart: isoDateSchema,
		name: z.string().min(1).max(256),
		amount: z.string().max(64).nullable().optional(),
		unit: z.string().max(64).nullable().optional()
	}),
	z.object({
		action: z.literal('set_included'),
		weekStart: isoDateSchema,
		name: z.string().min(1).max(256),
		included: z.boolean()
	}),
	z.object({
		action: z.literal('set_selected_name'),
		weekStart: isoDateSchema,
		name: z.string().min(1).max(256),
		selectedName: z.string().min(1).max(256)
	}),
	z.object({
		action: z.literal('set_staple'),
		weekStart: isoDateSchema,
		name: z.string().min(1).max(256),
		isStaple: z.boolean().default(true)
	}),
	z.object({
		action: z.literal('remove_manual'),
		weekStart: isoDateSchema,
		name: z.string().min(1).max(256)
	})
]);

const DeleteQuerySchema = z.object({
	week: isoDateSchema,
	name: z.string().min(1).max(256)
});

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) error(401, 'Unauthorized');

	const body = await readJsonBody(request, PostSchema);
	const { weekStart, name } = body;

	const now = new Date();
	const existing = findShoppingOverride(db, weekStart, name);

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
		let amount = body.amount ?? null;
		let unit = body.unit ?? null;
		if (existing?.manual && existing.amount && amount) {
			const sum = sumCompatibleQuantities([
				{ amount: existing.amount, unit: existing.unit ?? undefined },
				{ amount, unit: unit ?? undefined }
			]);
			amount = sum?.amount ?? `${existing.amount}${existing.unit ? ` ${existing.unit}` : ''} + ${amount}${unit ? ` ${unit}` : ''}`;
			unit = sum?.unit ?? null;
		}
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

	if (body.action === 'remove_manual') {
		if (existing) {
			db.update(shoppingListOverrides)
				.set({ manual: false, amount: null, unit: null })
				.where(eq(shoppingListOverrides.id, existing.id))
				.run();
		}
		return json({ ok: true });
	}

	if (body.action === 'set_included' || body.action === 'set_selected_name') {
		const updates = body.action === 'set_included' ? { included: body.included } : { selectedName: body.selectedName };
		if (existing) {
			db.update(shoppingListOverrides).set(updates).where(eq(shoppingListOverrides.id, existing.id)).run();
		} else {
			db.insert(shoppingListOverrides).values({
				weekStartDate: weekStart,
				name,
				bought: false,
				manual: false,
				...updates,
				createdAt: now
			}).run();
		}
		return json({ ok: true });
	}

	if (body.action === 'set_staple') {
		const ctx = { actor: locals.user.username, userId: locals.user.id };
		let opId: number | null = null;
		if (body.isStaple) {
			opId = addInventory(db, {
				name,
				section: 'pantry',
				kind: 'ingredient',
				isStaple: true
			}, ctx).opId;
		} else {
			const match = findExistingItem(db, { name, section: 'pantry', kind: 'ingredient' });
			if (match) {
				const result = updateInventory(db, match.item.id, { isStaple: false }, ctx);
				if (result.ok) opId = result.opId;
			}
		}
		if (existing) {
			db.update(shoppingListOverrides).set({ included: !body.isStaple }).where(eq(shoppingListOverrides.id, existing.id)).run();
		} else {
			db.insert(shoppingListOverrides).values({
				weekStartDate: weekStart, name, bought: false, manual: false, included: !body.isStaple, createdAt: now
			}).run();
		}
		return json({ ok: true, opId });
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

	const existing = findShoppingOverride(db, weekStart, name);
	if (existing) db.delete(shoppingListOverrides).where(eq(shoppingListOverrides.id, existing.id)).run();

	return json({ ok: true });
};
