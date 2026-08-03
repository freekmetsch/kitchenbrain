import { z } from 'zod';
import {
	createMessage,
	checkDailyCap,
	DailyCapExceeded,
	loadPrompt,
	logSpend,
	parseModelJson
} from '$lib/server/ai/client';
import { getBackgroundModel } from '$lib/server/ai/config';
import { db } from '$lib/server/db/index';
import type { Ingredient } from '$lib/server/db/schema';
import {
	getRecipeBySlug,
	updateRecipeTranslationCache
} from '$lib/server/domains/recipes';

const TranslationSchema = z.object({
	title_en: z.string().min(1),
	category_en: z.string().nullable(),
	cuisine_en: z.string().nullable(),
	notes_en: z.string().nullable(),
	ingredients_en: z.array(
		z.object({
			name: z.string().min(1),
			amount: z.string(),
			unit: z.string().min(1).optional(),
			preparation: z.string().min(1).optional(),
			component: z.string().min(1).optional(),
			substitutes: z
				.array(
					z.object({
						name: z.string().min(1),
						note: z.string().min(1).optional()
					})
				)
				.optional()
				.default([])
		})
	),
	directions_en: z.array(z.string())
});

function fallbackRecipe(slug: string) {
	return getRecipeBySlug(db, slug) ?? null;
}

export function numericTokens(value: string): string[] {
	return value.match(/\d+(?:[.,]\d+)?(?:\s*[–-]\s*\d+(?:[.,]\d+)?)?|\d+\s+\d+\/\d+|\d+\/\d+|[¼½¾⅓⅔⅛⅜⅝⅞]/g) ?? [];
}

export function validateTranslatedIngredients(source: Ingredient[], translated: z.infer<typeof TranslationSchema>['ingredients_en']): void {
	if (translated.length !== source.length) throw new Error('Translated ingredient count does not match source');
	for (const [index, ingredient] of source.entries()) {
		const result = translated[index];
		if (numericTokens(result.amount).join('|') !== numericTokens(ingredient.amount).join('|')) {
			throw new Error(`Translated amount changed numeric tokens for ingredient ${index}`);
		}
		for (const field of ['unit', 'preparation', 'component'] as const) {
			if (Boolean(ingredient[field]?.trim()) !== Boolean(result[field]?.trim())) {
				throw new Error(`Translated ${field} completeness does not match source ingredient ${index}`);
			}
		}
		if (result.substitutes.length !== (ingredient.substitutes?.length ?? 0)) {
			throw new Error(`Translated substitute count does not match source ingredient ${index}`);
		}
		for (const [substituteIndex, substitute] of (ingredient.substitutes ?? []).entries()) {
			if (Boolean(substitute.note?.trim()) !== Boolean(result.substitutes[substituteIndex]?.note?.trim())) {
				throw new Error(`Translated substitute note completeness does not match source ingredient ${index}`);
			}
		}
	}
}

export async function translateRecipe(slug: string, opts: { force?: boolean } = {}) {
	const recipe = fallbackRecipe(slug);
	if (!recipe) return null;

	if (!opts.force && recipe.translationStatus === 'ready') {
		return recipe;
	}

	const cap = checkDailyCap('background');
	if (cap.exceeded) {
		throw new DailyCapExceeded();
	}

	try {
		const prompt = loadPrompt('recipe_translate');
		const payload = {
			title: recipe.title,
			category: recipe.category,
			cuisine: recipe.cuisine,
			notes: recipe.notes,
			ingredients: recipe.ingredients as Ingredient[],
			directions: recipe.directions as string[]
		};

		const msg = await createMessage({
			model: getBackgroundModel().value,
			system: prompt,
			messages: [{ role: 'user', content: JSON.stringify(payload) }]
		});

		logSpend(msg.model, msg.usage, msg.costUsd);

		const text = msg.text;
		const translated = TranslationSchema.parse(parseModelJson(text));

		const sourceIngredients = recipe.ingredients as Ingredient[];
		validateTranslatedIngredients(sourceIngredients, translated.ingredients_en);
		if (translated.directions_en.length !== recipe.directions.length) {
			throw new Error('Translated direction count does not match source');
		}
		// An English view is atomic: optional source copy is either translated or
		// omitted only when the source is omitted. Accepting null here produced a
		// field-by-field Dutch/English mixture in otherwise "ready" recipes.
		for (const [source, value, field] of [
			[recipe.category, translated.category_en, 'category'],
			[recipe.cuisine, translated.cuisine_en, 'cuisine'],
			[recipe.notes, translated.notes_en, 'notes']
		] as const) {
			if (source?.trim() && !value?.trim()) {
				throw new Error(`Translated ${field} is missing`);
			}
		}

		const updated = updateRecipeTranslationCache(db, {
			recipeId: recipe.id,
			expectedRevision: recipe.contentRevision,
			changes: {
				titleEn: translated.title_en,
				categoryEn: translated.category_en,
				cuisineEn: translated.cuisine_en,
				notesEn: translated.notes_en,
				ingredientsEn: translated.ingredients_en,
				directionsEn: translated.directions_en,
				translationStatus: 'ready',
				translatedAt: new Date(),
			}
		});
		return updated ?? fallbackRecipe(slug);
	} catch (err) {
		console.error('[translate_recipe] failed', slug, err);
		updateRecipeTranslationCache(db, {
			recipeId: recipe.id,
			expectedRevision: recipe.contentRevision,
			changes: {
				titleEn: recipe.titleEn,
				categoryEn: recipe.categoryEn,
				cuisineEn: recipe.cuisineEn,
				notesEn: recipe.notesEn,
				ingredientsEn: recipe.ingredientsEn,
				directionsEn: recipe.directionsEn,
				translationStatus: 'error',
				translatedAt: new Date()
			}
		});
		return fallbackRecipe(slug);
	}
}

// Fire-and-forget translation for import paths, gated on the auto-translate
// household pref (default off). translateRecipe can reject before its own
// try/catch, so this must swallow that rejection itself — an import must never
// fail because the translation did not fit under the background cap.
export function kickTranslateOnImport(slug: string) {
	translateRecipe(slug).catch((err) => {
		console.warn(
			`[translate-recipe] auto-translate-on-import failed for ${slug}: ${err instanceof Error ? err.message : err}`
		);
	});
}
