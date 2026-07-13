import { readFileSync } from 'fs';
import { join } from 'path';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { createMessage, checkDailyCap, DailyCapExceeded, logSpend, parseModelJson } from '$lib/server/ai/client';
import { getBackgroundModel, DEFAULT_MAX_OUTPUT_TOKENS } from '$lib/server/ai/config';
import { db } from '$lib/server/db/index';
import { recipes, type Ingredient } from '$lib/server/db/schema';

const TranslationSchema = z.object({
	title_en: z.string().min(1),
	category_en: z.string().nullable(),
	cuisine_en: z.string().nullable(),
	notes_en: z.string().nullable(),
	ingredients_en: z.array(z.object({ name: z.string().min(1) })),
	directions_en: z.array(z.string())
});

let translatePrompt: string | null = null;

function loadTranslatePrompt(): string {
	if (!translatePrompt) {
		translatePrompt = readFileSync(
			join(process.cwd(), 'src/lib/server/ai/prompts/recipe_translate.md'),
			'utf-8'
		);
	}
	return translatePrompt;
}

function fallbackRecipe(slug: string) {
	const recipe = db.select().from(recipes).where(eq(recipes.slug, slug)).get();
	if (!recipe) return null;
	return recipe;
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
		const prompt = loadTranslatePrompt();
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
			maxTokens: DEFAULT_MAX_OUTPUT_TOKENS,
			system: prompt,
			messages: [{ role: 'user', content: JSON.stringify(payload) }]
		});

		logSpend(msg.model, msg.usage, msg.costUsd);

		const text = msg.text;
		const translated = TranslationSchema.parse(parseModelJson(text));

		if (translated.ingredients_en.length !== recipe.ingredients.length) {
			throw new Error('Translated ingredient count does not match source');
		}
		if (translated.directions_en.length !== recipe.directions.length) {
			throw new Error('Translated direction count does not match source');
		}

		return db
			.update(recipes)
			.set({
				titleEn: translated.title_en,
				categoryEn: translated.category_en,
				cuisineEn: translated.cuisine_en,
				notesEn: translated.notes_en,
				ingredientsEn: translated.ingredients_en,
				directionsEn: translated.directions_en,
				translationStatus: 'ready',
				translatedAt: new Date(),
				updatedAt: new Date()
			})
			.where(eq(recipes.slug, slug))
			.returning()
			.get();
	} catch (err) {
		console.error('[translate_recipe] failed', slug, err);
		db.update(recipes)
			.set({ translationStatus: 'error', translatedAt: new Date(), updatedAt: new Date() })
			.where(eq(recipes.slug, slug))
			.run();
		return fallbackRecipe(slug);
	}
}

// Fire-and-forget translation for import paths, gated on the auto-translate
// household pref (default off). Same non-fatal pattern as cook_mode.ts's
// kickCookModeGeneration: translateRecipe can reject (DailyCapExceeded is
// thrown before its own try/catch), so this must swallow that rejection
// itself — an import must never fail because the translation didn't fit
// under the background cap.
export function kickTranslateOnImport(slug: string) {
	translateRecipe(slug).catch((err) => {
		console.warn(
			`[translate-recipe] auto-translate-on-import failed for ${slug}: ${err instanceof Error ? err.message : err}`
		);
	});
}
