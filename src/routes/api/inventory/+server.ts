import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { z } from 'zod';
import { db } from '$lib/server/db/index';
import { addInventory } from '$lib/server/inventory_writes';
import { parseDateOnly } from '$lib/inventory_dates';

const AddSchema = z.object({
	name: z.string().min(1),
	section: z.enum(['freezer', 'pantry']),
	qty_text: z.string().optional(),
	qty_num: z.number().optional(),
	unit: z.string().optional(),
	category: z.string().optional(),
	kind: z.enum(['ingredient', 'leftover', 'processed']).optional(),
	food_class: z.string().optional(),
	made_from_recipe_id: z.number().optional(),
	recipe_status: z.enum(['linked', 'plan_to_add', 'no_recipe']).optional(),
	is_staple: z.boolean().optional(),
	expiry_date: z.string().optional(),
	created_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
	tags: z.array(z.string()).optional()
});

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Invalid JSON');
	}

	const parsed = AddSchema.safeParse(body);
	if (!parsed.success) throw error(400, parsed.error.message);
	const input = parsed.data;

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
