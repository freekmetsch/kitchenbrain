import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { z } from 'zod';
import { db } from '$lib/server/db/index';
import { addInventory } from '$lib/server/inventory_writes';
import { parseDateOnly } from '$lib/inventory_dates';
import { readJsonBody } from '$lib/server/api_body';
import { isoDateSchema } from '$lib/date_schema';

const AddSchema = z.object({
	name: z.string().min(1),
	section: z.enum(['freezer', 'pantry']),
	qty_text: z.string().optional(),
	qty_num: z.number().nonnegative().optional(),
	unit: z.string().optional(),
	category: z.string().optional(),
	kind: z.enum(['ingredient', 'leftover', 'processed']).optional(),
	food_class: z.string().optional(),
	made_from_recipe_id: z.number().int().positive().optional(),
	recipe_status: z.enum(['linked', 'plan_to_add', 'no_recipe']).optional(),
	is_staple: z.boolean().optional(),
	expiry_date: isoDateSchema.optional(),
	created_at: isoDateSchema.optional(),
	tags: z.array(z.string()).optional()
});

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const input = await readJsonBody(request, AddSchema);

	const result = addInventory(
		db,
		{
			name: input.name,
			section: input.section,
			qtyText: input.qty_text,
			qtyNum: input.qty_num,
			unit: input.unit,
			category: input.category,
			kind: input.kind,
			foodClass: input.food_class,
			madeFromRecipeId: input.made_from_recipe_id,
			recipeStatus: input.recipe_status,
			isStaple: input.is_staple,
			expiryDate: input.expiry_date,
			createdAt: parseDateOnly(input.created_at),
			tags: input.tags
		},
		{ actor: locals.user.username, userId: locals.user.id }
	);

	return json({ item: result.item, action: result.action, warnings: result.warnings });
};
