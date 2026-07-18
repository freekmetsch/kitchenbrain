import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { z } from 'zod';
import { db } from '$lib/server/db/index';
import { removeInventory, updateInventory } from '$lib/server/inventory_writes';
import { readInventoryItem } from '$lib/server/inventory_merge';
import { parseDateOnly } from '$lib/inventory_dates';
import { readJsonBody, readPositiveIntParam } from '$lib/server/api_body';
import { isoDateSchema } from '$lib/date_schema';

const PatchSchema = z.object({
	name: z.string().min(1).optional(),
	qty_text: z.string().nullable().optional(),
	qty_num: z.number().nonnegative().nullable().optional(),
	unit: z.string().nullable().optional(),
	expiry_date: isoDateSchema.nullable().optional(),
	created_at: isoDateSchema.optional(),
	section: z.enum(['freezer', 'pantry']).optional(),
	category: z.string().nullable().optional(),
	kind: z.enum(['ingredient', 'leftover', 'processed']).nullable().optional(),
	food_class: z.string().nullable().optional(),
	made_from_recipe_id: z.number().int().positive().nullable().optional(),
	recipe_status: z.enum(['linked', 'plan_to_add', 'no_recipe']).nullable().optional(),
	is_staple: z.boolean().optional(),
	needs_review: z.boolean().optional(),
	review_reason: z.string().nullable().optional(),
	tags: z.array(z.string()).optional()
}).refine((input) => Object.values(input).some((value) => value !== undefined), 'No fields to update');

export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	const item = readInventoryItem(db, readPositiveIntParam(params.id));
	if (!item) throw error(404, 'Not found');
	return json({ item });
};

export const PATCH: RequestHandler = async ({ request, params, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const id = readPositiveIntParam(params.id);

	const input = await readJsonBody(request, PatchSchema);

	const result = updateInventory(
		db,
		id,
		{
			name: input.name,
			qtyText: input.qty_text,
			qtyNum: input.qty_num,
			unit: input.unit,
			expiryDate: input.expiry_date,
			createdAt: input.created_at !== undefined ? (parseDateOnly(input.created_at) ?? undefined) : undefined,
			section: input.section,
			category: input.category,
			kind: input.kind,
			foodClass: input.food_class,
			madeFromRecipeId: input.made_from_recipe_id,
			recipeStatus: input.recipe_status,
			isStaple: input.is_staple,
			needsReview: input.needs_review,
			reviewReason: input.review_reason,
			tags: input.tags
		},
		{ actor: locals.user.username, userId: locals.user.id }
	);
	if (!result.ok) throw error(404, 'Not found');

	return json({ item: result.item });
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const id = readPositiveIntParam(params.id);

	const result = removeInventory(
		db,
		{ id },
		{ actor: locals.user.username, userId: locals.user.id }
	);
	if (!result.ok) throw error(404, 'Not found');

	return json({ ok: true });
};
