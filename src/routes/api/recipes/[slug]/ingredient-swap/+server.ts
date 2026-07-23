import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import { db } from '$lib/server/db/index';
import { saveRecipeIngredientDefault } from '$lib/server/shopping_recipe_choice';
import { ShoppingMutationError } from '$lib/server/shopping_mutations';
import type { RequestHandler } from './$types';

const InputSchema = z.object({
	ingredientId: z.string().min(1),
	substituteIndex: z.number().int().nonnegative(),
	expectedRecipeRevision: z.number().int().positive()
});

export const POST: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	const parsed = InputSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) {
		return json({ status: 'error', message: 'Invalid ingredient swap' }, { status: 400 });
	}
	try {
		const recipe = saveRecipeIngredientDefault(db, {
			recipeSlug: params.slug,
			...parsed.data
		});
		return json({
			status: 'saved',
			recipeRevision: recipe.contentRevision,
			ingredient: recipe.ingredients.find(
				(ingredient) => ingredient.id === parsed.data.ingredientId
			)
		});
	} catch (cause) {
		if (cause instanceof ShoppingMutationError) {
			const status = cause.code === 'stale' ? 409 : 400;
			return json({ status: 'error', message: cause.message }, { status });
		}
		throw cause;
	}
};
