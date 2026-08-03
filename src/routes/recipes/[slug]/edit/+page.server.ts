import { fail, redirect, error } from '@sveltejs/kit';
import { z } from 'zod';
import { base } from '$app/paths';
import {
	recipeEditChangesCookingStructure,
	recipeIngredientsEqual
} from '$lib/recipe_edit';
import { getRecipeForEdit, saveRecipeEdit } from '$lib/server/workflows/recipe-edit';
import type { Actions, PageServerLoad } from './$types';
import { LiveIngredientSchema, mergeLiveIngredients } from '$lib/recipe_ingredient';

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
	directions: z.array(z.string().trim().min(1, 'empty direction')).min(1, 'at least one direction'),
	directionIds: z.array(z.string().trim().min(1)).min(1)
}).superRefine((payload, ctx) => {
	if (payload.directionIds.length !== payload.directions.length) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			path: ['directionIds'],
			message: 'direction IDs must match directions'
		});
	}
	if (new Set(payload.directionIds).size !== payload.directionIds.length) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			path: ['directionIds'],
			message: 'direction IDs must be unique'
		});
	}
});

type FormPayload = z.infer<typeof RecipeEditSchema>;

function parseFormPayload(form: FormData): FormPayload {
	// Form posts ingredients/directions as JSON-encoded strings — they're
	// dynamic-length arrays, so a JSON blob is simpler than per-field naming.
	const rawIngredients = String(form.get('ingredients') ?? '[]');
	const rawDirections = String(form.get('directions') ?? '[]');
	const rawDirectionIds = String(form.get('directionIds') ?? '[]');
	const rawServings = form.get('servings');
	const rawContentRevision = form.get('contentRevision');

	const ingredients = JSON.parse(rawIngredients);
	const directions = JSON.parse(rawDirections);
	const directionIds = JSON.parse(rawDirectionIds);

	return RecipeEditSchema.parse({
		title: String(form.get('title') ?? ''),
		language: String(form.get('language') ?? 'nl'),
		notes: form.get('notes') ? String(form.get('notes')).trim() || null : null,
		sourceUrl: form.get('sourceUrl') ? String(form.get('sourceUrl')).trim() || null : null,
		servings: rawServings && String(rawServings).trim() ? Number(rawServings) : null,
		contentRevision: Number(rawContentRevision),
		acceptStructureDraft: form.get('acceptStructureDraft') === '1',
		ingredients,
		directions,
		directionIds
	});
}

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	const recipe = getRecipeForEdit(params.slug);
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

		const current = getRecipeForEdit(params.slug);
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
		const semanticStructureChanged = recipeEditChangesCookingStructure(
			{
				ingredientIds: current.ingredients.map((ingredient) => ingredient.id),
				directionIds: current.directionIdsJson
			},
			{
				ingredientIds: ingredients.map((ingredient) => ingredient.id),
				directionIds: payload.directionIds
			}
		);
		const translationInputsChanged =
			current.title !== payload.title ||
			current.language !== payload.language ||
			current.notes !== payload.notes ||
			ingredientsChanged ||
			!sameJson(current.directions, payload.directions);

		const updated = saveRecipeEdit({
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
				directionIdsJson: payload.directionIds,
				...(semanticStructureChanged ? { cookModeJson: null, cookModeGeneratedAt: null } : {}),
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
			},
			reconcileShopping: ingredientsChanged || current.servings !== payload.servings
		});
		if (!updated) return fail(409, { error: 'This recipe changed while you were editing it. Reload and try again.' });

		redirect(303, `${base}/recipes/${params.slug}`);
	}
};
