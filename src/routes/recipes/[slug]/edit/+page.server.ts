import { fail, redirect, error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { base } from '$app/paths';
import { db } from '$lib/server/db/index';
import { recipes } from '$lib/server/db/schema';
import { kickCookModeGeneration } from '$lib/server/ai/cook_mode';
import { recipeIngredientsEqual } from '$lib/recipe_edit';
import type { Actions, PageServerLoad } from './$types';

const SubstituteSchema = z.object({
	name: z.string().trim().min(1, 'substitute name required'),
	kind: z.enum(['protein', 'spice', 'vegetable', 'other']).optional(),
	note: z.string().trim().max(500).optional()
});

const IngredientSchema = z.object({
	name: z.string().trim().min(1, 'name required'),
	amount: z.string().trim().default(''),
	unit: z.string().trim().optional(),
	// Set via the AI chat; z.object strips unknown keys, so without this a
	// manual save silently wipes every role (kills serve-from-freezer).
	role: z.enum(['cook_in', 'serve_fresh']).optional(),
	substitutes: z.array(SubstituteSchema).max(12).optional()
});

const RecipeEditSchema = z.object({
	title: z.string().trim().min(1, 'title required').max(200),
	language: z.enum(['nl', 'en']),
	notes: z.string().trim().max(4000).nullable(),
	sourceUrl: z
		.string()
		.trim()
		.url('invalid source URL')
		.refine((value) => value.startsWith('https://') || value.startsWith('http://'), 'source URL must use http or https')
		.nullable(),
	servings: z.number().int().positive().max(99).nullable(),
	ingredients: z.array(IngredientSchema).min(1, 'at least one ingredient'),
	directions: z.array(z.string().trim().min(1, 'empty direction')).min(1, 'at least one direction')
});

type FormPayload = z.infer<typeof RecipeEditSchema>;

function parseFormPayload(form: FormData): FormPayload {
	// Form posts ingredients/directions as JSON-encoded strings — they're
	// dynamic-length arrays, so a JSON blob is simpler than per-field naming.
	const rawIngredients = String(form.get('ingredients') ?? '[]');
	const rawDirections = String(form.get('directions') ?? '[]');
	const rawServings = form.get('servings');

	const ingredients = JSON.parse(rawIngredients);
	const directions = JSON.parse(rawDirections);

	return RecipeEditSchema.parse({
		title: String(form.get('title') ?? ''),
		language: String(form.get('language') ?? 'nl'),
		notes: form.get('notes') ? String(form.get('notes')).trim() || null : null,
		sourceUrl: form.get('sourceUrl') ? String(form.get('sourceUrl')).trim() || null : null,
		servings: rawServings && String(rawServings).trim() ? Number(rawServings) : null,
		ingredients,
		directions
	});
}

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	const recipe = db.select().from(recipes).where(eq(recipes.slug, params.slug)).get();
	if (!recipe) throw error(404, 'Recipe not found');
	return { recipe };
};

export const actions: Actions = {
	default: async ({ request, params, locals }) => {
		if (!locals.user) return fail(401, { error: 'Unauthorized' });

		const form = await request.formData();
		let payload: FormPayload;
		try {
			payload = parseFormPayload(form);
		} catch (e) {
			const message =
				e instanceof z.ZodError
					? e.issues.map((i) => `${i.path.join('.') || '?'}: ${i.message}`).join('; ')
					: e instanceof SyntaxError
						? 'Bad form payload'
						: (e as Error).message;
			return fail(400, { error: message });
		}

		const current = db.select().from(recipes).where(eq(recipes.slug, params.slug)).get();
		if (!current) return fail(404, { error: 'Recipe not found' });
		const sameJson = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
		const ingredientsChanged = !recipeIngredientsEqual(current.ingredients, payload.ingredients);
		const cookingInputsChanged =
			current.title !== payload.title ||
			current.language !== payload.language ||
			current.servings !== payload.servings ||
			ingredientsChanged ||
			!sameJson(current.directions, payload.directions);
		const translationInputsChanged =
			current.title !== payload.title ||
			current.language !== payload.language ||
			current.notes !== payload.notes ||
			ingredientsChanged ||
			!sameJson(current.directions, payload.directions);

		const updated = db
			.update(recipes)
			.set({
				title: payload.title,
				language: payload.language,
				notes: payload.notes,
				sourceUrl: payload.sourceUrl,
				servings: payload.servings,
				ingredients: payload.ingredients,
				directions: payload.directions,
				...(cookingInputsChanged ? { cookModeJson: null, cookModeGeneratedAt: null } : {}),
				...(translationInputsChanged
					? {
							titleEn: null,
							categoryEn: null,
							cuisineEn: null,
							notesEn: null,
							ingredientsEn: null,
							directionsEn: null,
							translationStatus: payload.language === 'en' ? ('ready' as const) : ('pending' as const),
							translatedAt: null
						}
					: {}),
				// A manual save IS the human review — clear any import review flag.
				needsReview: false,
				reviewReason: null,
				updatedAt: new Date()
			})
			.where(eq(recipes.slug, params.slug))
			.returning({ id: recipes.id })
			.all();
		if (updated.length === 0) return fail(404, { error: 'Recipe not found' });

		// Start the rewrite now; the recipe page the redirect lands on joins
		// this same in-flight generation instead of starting its own.
		if (cookingInputsChanged) kickCookModeGeneration(params.slug);

		redirect(303, `${base}/recipes/${params.slug}`);
	}
};
