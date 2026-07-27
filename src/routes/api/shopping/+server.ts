import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { z } from 'zod';
import { readJsonBody } from '$lib/server/api_body';
import { isoDateSchema } from '$lib/date_schema';
import {
	ShoppingMutationError
} from '$lib/server/domains/shopping';
import {
	shoppingService,
	shoppingWeekStartDay
} from '$lib/server/workflows/reconcile-shopping';

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
		expectedLegacyRevision: z.number().int().positive(),
		resolution: z.enum(['attach', 'manual', 'dismiss']),
		targetEntryId: z.number().int().positive().optional(),
		expectedTargetRevision: z.number().int().positive().optional()
	})
]);

function throwShoppingMutation(errorValue: unknown): never {
	if (!(errorValue instanceof ShoppingMutationError)) throw errorValue;
	const status = errorValue.code === 'not_found' ? 404 : errorValue.code === 'stale' ? 409 : 400;
	error(status, errorValue.message);
}

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) error(401, 'Unauthorized');

	const body = await readJsonBody(request, PostSchema);
	const weekStartDay = shoppingWeekStartDay();

	try {
		if (body.action === 'add_recurring') {
			const item = shoppingService.addRecurring({
					name: body.name,
					amount: body.amount,
					unit: body.unit,
					startWeek: body.startWeek,
					weekStartDay
				});
			return json(item);
		}
		if (body.action === 'edit_recurring') {
			const item = shoppingService.editRecurring({ ...body, id: body.itemId, weekStartDay });
			return json(item);
		}
		if (body.action === 'disable_recurring' || body.action === 'remove_recurring') {
			shoppingService.disableRecurring({ id: body.itemId, ...body, weekStartDay });
			return json({ ok: true });
		}
		if (body.action === 'skip_recurring') {
			return json(shoppingService.skip({ ...body, weekStartDay }));
		}
		if (body.action === 'add_source_manual') {
			return json(shoppingService.addManual({ ...body, weekStartDay }));
		}
		if (body.action === 'remove_source_manual') {
			shoppingService.removeManual({ ...body, weekStartDay });
			return json({ ok: true });
		}
		if (body.action === 'update_source') {
			return json(shoppingService.updateSource({ ...body, weekStartDay }));
		}
		if (body.action === 'set_bought_entries') {
			shoppingService.setBought({ ...body, weekStartDay });
			return json({ ok: true });
		}
		if (body.action === 'resolve_legacy') {
			return json(
				shoppingService.resolveLegacy({
					legacyEntryId: body.legacyEntryId,
					expectedLegacyRevision: body.expectedLegacyRevision,
					action: body.resolution,
					targetEntryId: body.targetEntryId,
					expectedTargetRevision: body.expectedTargetRevision,
					weekStartDay
				})
			);
		}
	} catch (errorValue) {
		throwShoppingMutation(errorValue);
	}
	error(400, 'Unknown action');
};
