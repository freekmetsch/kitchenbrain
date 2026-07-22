import { fail, redirect, error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { base } from '$app/paths';
import { db } from '$lib/server/db/index';
import { recipes } from '$lib/server/db/schema';
import { kickCookModeGeneration } from '$lib/server/ai/cook_mode';
import { recipeIngredientsEqual } from '$lib/recipe_edit';
import { updateCanonicalRecipe } from '$lib/server/recipe_mutations';
import type { Actions, PageServerLoad } from './$types';
import { LiveIngredientSchema, mergeLiveIngredients } from '$lib/recipe_ingredient';
import { reconcileShoppingAfterWrite } from '$lib/server/shopping_entries';

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
	contentRevision: z.number().int().positive(),
	acceptStructureDraft: z.boolean().default(false),
	ingredients: z.array(LiveIngredientSchema).min(1, 'at least one ingredient'),
	directions: z.array(z.string().trim().min(1, 'empty direction')).min(1, 'at least one direction')
});

type FormPayload = z.infer<typeof RecipeEditSchema>;

function parseFormPayload(form: FormData): FormPayload {
	// Form posts ingredients/directions as JSON-encoded strings — they're
	// dynamic-length arrays, so a JSON blob is simpler than per-field naming.
	const rawIngredients = String(form.get('ingredients') ?? '[]');
	const rawDirections = String(form.get('directions') ?? '[]');
	const rawServings = form.get('servings');
	const rawContentRevision = form.get('contentRevision');

	const ingredients = JSON.parse(rawIngredients);
	const directions = JSON.parse(rawDirections);

	return RecipeEditSchema.parse({
		title: String(form.get('title') ?? ''),
		language: String(form.get('language') ?? 'nl'),
		notes: form.get('notes') ? String(form.get('notes')).trim() || null : null,
		sourceUrl: form.get('sourceUrl') ? String(form.get('sourceUrl')).trim() || null : null,
		servings: rawServings && String(rawServings).trim() ? Number(rawServings) : null,
		contentRevision: Number(rawContentRevision),
		acceptStructureDraft: form.get('acceptStructureDraft') === '1',
		ingredients,
		directions
	});
}

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	const recipe = db.select().from(recipes).where(eq(recipes.slug, params.slug)).get();
	if (!recipe) throw error(404, 'Recipe not found');
	const reviewingStructureDraft =
		recipe.structureDraft != null &&
		recipe.structureDraftSourceUpdatedAt?.getTime() === recipe.updatedAt.getTime();
	return {
		recipe: reviewingStructureDraft ? { ...recipe, ingredients: recipe.structureDraft } : recipe,
		reviewingStructureDraft
	};
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
		if (current.contentRevision !== payload.contentRevision) {
			return fail(409, { error: 'This recipe changed while you were editing it. Reload and try again.' });
		}
		if (
			payload.acceptStructureDraft &&
			(current.structureDraft == null ||
				current.structureDraftSourceUpdatedAt?.getTime() !== current.updatedAt.getTime())
		) {
			return fail(409, { error: 'This recipe changed after the suggestion was created. Run the improvement again.' });
		}
		let ingredients;
		try {
			const mergeBase = payload.acceptStructureDraft ? current.structureDraft : current.ingredients;
			ingredients = mergeLiveIngredients(mergeBase, payload.ingredients);
		} catch (e) {
			return fail(400, { error: e instanceof Error ? e.message : 'Invalid ingredients' });
		}
		const sameJson = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
		const ingredientsChanged = !recipeIngredientsEqual(current.ingredients, ingredients);
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

		const updated = updateCanonicalRecipe(db, {
			recipeId: current.id,
			expectedRevision: payload.contentRevision,
			changes: {
				title: payload.title,
				language: payload.language,
				notes: payload.notes,
				sourceUrl: payload.sourceUrl,
				servings: payload.servings,
				...(payload.acceptStructureDraft
					? { structureVersion: 2, structureDraft: null, structureDraftSourceUpdatedAt: null }
					: {}),
				ingredients,
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
			}
		});
		if (!updated) return fail(409, { error: 'This recipe changed while you were editing it. Reload and try again.' });
		if (ingredientsChanged || current.servings !== payload.servings) reconcileShoppingAfterWrite(db);

		// Start the rewrite now; the recipe page the redirect lands on joins
		// this same in-flight generation instead of starting its own.
		if (cookingInputsChanged) kickCookModeGeneration(params.slug);

		redirect(303, `${base}/recipes/${params.slug}`);
	}
};
