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
import { getWeekStartDay } from '$lib/server/meal_plan/prefs';
import {
	addManualShoppingEntry,
	addRecurringShoppingItem,
	disableRecurringShoppingItem,
	editRecurringShoppingItem,
	removeManualShoppingEntry,
	resolveLegacyShoppingEntry,
	setBoughtForEntries,
	skipShoppingEntry,
	ShoppingMutationError,
	updateShoppingEntry
} from '$lib/server/shopping_mutations';
import {
	initializeShoppingSourceData,
	isShoppingSourceMigrationComplete,
	reconcileShoppingAfterWrite
} from '$lib/server/shopping_entries';

// AH-INVARIANT: names/amounts/units are AH-coupled Dutch values — validate shape
// and bounds only, never trim or normalize; write them exactly as received.
const PostSchema = z.discriminatedUnion('action', [
	z.object({
		action: z.literal('add_recurring'),
		startWeek: isoDateSchema,
		name: z.string().min(1).max(256),
		amount: z.string().max(64).nullable().optional(),
		unit: z.string().max(64).nullable().optional()
	}),
	z.object({
		action: z.literal('edit_recurring'),
		itemId: z.number().int().positive(),
		expectedRevision: z.number().int().positive(),
		effectiveWeek: isoDateSchema,
		name: z.string().min(1).max(256),
		amount: z.string().max(64).nullable().optional(),
		unit: z.string().max(64).nullable().optional()
	}),
	z.object({
		action: z.enum(['disable_recurring', 'remove_recurring']),
		itemId: z.number().int().positive(),
		expectedRevision: z.number().int().positive(),
		effectiveWeek: isoDateSchema
	}),
	z.object({
		action: z.literal('skip_recurring'),
		entryId: z.number().int().positive(),
		expectedRevision: z.number().int().positive()
	}),
	z.object({
		action: z.literal('add_source_manual'),
		weekStart: isoDateSchema,
		name: z.string().min(1).max(256),
		amount: z.string().max(64).nullable().optional(),
		unit: z.string().max(64).nullable().optional()
	}),
	z.object({
		action: z.literal('remove_source_manual'),
		entryId: z.number().int().positive(),
		expectedRevision: z.number().int().positive()
	}),
	z.object({
		action: z.literal('update_source'),
		entryId: z.number().int().positive(),
		expectedRevision: z.number().int().positive(),
		included: z.boolean().optional(),
		selectedName: z.string().min(1).max(256).nullable().optional(),
		bought: z.boolean().optional(),
		amountOverride: z.string().max(64).nullable().optional(),
		unitOverride: z.string().max(64).nullable().optional()
	}),
	z.object({
		action: z.literal('set_bought_entries'),
		entryIds: z.array(z.number().int().positive()).min(1).max(200),
		weekStart: isoDateSchema,
		bought: z.boolean()
	}),
	z.object({
		action: z.literal('resolve_legacy'),
		legacyEntryId: z.number().int().positive(),
		resolution: z.enum(['attach', 'manual', 'dismiss']),
		targetEntryId: z.number().int().positive().optional()
	}),
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

function throwShoppingMutation(errorValue: unknown): never {
	if (!(errorValue instanceof ShoppingMutationError)) throw errorValue;
	const status = errorValue.code === 'not_found' ? 404 : errorValue.code === 'stale' ? 409 : 400;
	error(status, errorValue.message);
}

const DeleteQuerySchema = z.object({
	week: isoDateSchema,
	name: z.string().min(1).max(256)
});

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) error(401, 'Unauthorized');
	initializeShoppingSourceData(db);

	const body = await readJsonBody(request, PostSchema);
	const weekStartDay = getWeekStartDay(db);
	const legacyAction = [
		'toggle_bought',
		'add_manual',
		'set_included',
		'set_selected_name',
		'set_staple',
		'remove_manual'
	].includes(body.action);
	if (legacyAction && isShoppingSourceMigrationComplete(db)) {
		error(409, 'Shopping changes are paused until the source-aware screen is enabled');
	}

	try {
		if (body.action === 'add_recurring') {
			const item = addRecurringShoppingItem(db, {
					name: body.name,
					amount: body.amount,
					unit: body.unit,
					startWeek: body.startWeek,
					weekStartDay
				});
			reconcileShoppingAfterWrite(db, [body.startWeek]);
			return json(item);
		}
		if (body.action === 'edit_recurring') {
			const item = editRecurringShoppingItem(db, { ...body, id: body.itemId, weekStartDay });
			reconcileShoppingAfterWrite(db, [body.effectiveWeek]);
			return json(item);
		}
		if (body.action === 'disable_recurring' || body.action === 'remove_recurring') {
			disableRecurringShoppingItem(db, { id: body.itemId, ...body, weekStartDay });
			reconcileShoppingAfterWrite(db, [body.effectiveWeek]);
			return json({ ok: true });
		}
		if (body.action === 'skip_recurring') {
			return json(skipShoppingEntry(db, { ...body, weekStartDay }));
		}
		if (body.action === 'add_source_manual') {
			return json(addManualShoppingEntry(db, { ...body, weekStartDay }));
		}
		if (body.action === 'remove_source_manual') {
			removeManualShoppingEntry(db, { ...body, weekStartDay });
			return json({ ok: true });
		}
		if (body.action === 'update_source') {
			return json(updateShoppingEntry(db, { ...body, weekStartDay }));
		}
		if (body.action === 'set_bought_entries') {
			setBoughtForEntries(db, { ...body, weekStartDay });
			return json({ ok: true });
		}
		if (body.action === 'resolve_legacy') {
			return json(
				resolveLegacyShoppingEntry(db, {
					legacyEntryId: body.legacyEntryId,
					action: body.resolution,
					targetEntryId: body.targetEntryId,
					weekStartDay
				})
			);
		}
	} catch (errorValue) {
		throwShoppingMutation(errorValue);
	}

	if (!('weekStart' in body) || !('name' in body)) error(400, 'Unknown action');
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
	initializeShoppingSourceData(db);
	if (isShoppingSourceMigrationComplete(db)) {
		error(409, 'Shopping changes are paused until the source-aware screen is enabled');
	}

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
