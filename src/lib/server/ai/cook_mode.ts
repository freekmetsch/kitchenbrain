import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { expandMealIngredientsForServings, subRecipesOf } from '$lib/server/meal_recipes';
import {
	createMessage,
	checkDailyCap,
	DailyCapExceeded,
	loadPrompt,
	logSpend,
	parseModelJson
} from '$lib/server/ai/client';
import { getChatModel, getChatFallbackModel } from '$lib/server/ai/config';
import { db } from '$lib/server/db/index';
import { recipes, type Ingredient } from '$lib/server/db/schema';
import type { LocalizedCookModeRecipeV4, LocalizedCookModeText } from '$lib/types';
import {
	hasCookModeLanguage,
	isStaleCookMode,
	violatesActionState
} from '$lib/components/cook-mode/staleness';
import { inaccessibleCookModeTerm } from '$lib/components/cook-mode/plain-language';

const LocalizedTextSchema = z.object({
	en: z.string().min(1),
	nl: z.string().min(1)
});

const StreamSchema = z.object({
	id: z.string().min(1),
	name: LocalizedTextSchema
});

const StepSchema = z.object({
	title: LocalizedTextSchema,
	goal: LocalizedTextSchema,
	body: LocalizedTextSchema,
	ingredient_indexes: z.array(z.number().int().nonnegative()),
	timer_seconds: z.number().int().nonnegative().nullable(),
	timer_purpose: LocalizedTextSchema.nullable(),
	timer_action: LocalizedTextSchema.nullable(),
	timer_location: LocalizedTextSchema.nullable(),
	stream_id: z.string().min(1),
	merges_from: z.array(z.string())
});

const PrepTaskSchema = z.object({
	text: LocalizedTextSchema,
	ingredient_indexes: z.array(z.number().int().nonnegative())
});

type GeneratedCookMode = Omit<LocalizedCookModeRecipeV4, 'generation_id' | 'baseline_servings'>;

function localizedValues(value: LocalizedCookModeText): string[] {
	return [value.en, value.nl];
}

function displayedText(data: GeneratedCookMode): string[] {
	return [
		...data.prep_tasks.flatMap((task) => localizedValues(task.text)),
		...data.streams.flatMap((stream) => localizedValues(stream.name)),
		...data.steps.flatMap((step) => [
			...localizedValues(step.title),
			...localizedValues(step.goal),
			...localizedValues(step.body),
			...(step.timer_purpose ? localizedValues(step.timer_purpose) : []),
			...(step.timer_action ? localizedValues(step.timer_action) : []),
			...(step.timer_location ? localizedValues(step.timer_location) : [])
		])
	];
}

const buildCookModeSchema = (maxSteps: number, ingredientCount: number): z.ZodType<GeneratedCookMode> =>
	z
		.object({
			version: z.literal(4),
			prep_tasks: z.array(PrepTaskSchema),
			streams: z.array(StreamSchema).min(1),
			steps: z.array(StepSchema).min(2).max(maxSteps)
		})
		.superRefine((data, ctx) => {
			const streamIds = new Set(data.streams.map((stream) => stream.id));
			const usedStreamIds = new Set(data.steps.map((step) => step.stream_id));

			data.streams.forEach((stream, index) => {
				if (!usedStreamIds.has(stream.id)) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						path: ['streams', index, 'id'],
						message: `stream "${stream.id}" has no steps`
					});
				}
			});

			data.steps.forEach((step, index) => {
				step.ingredient_indexes.forEach((ingredientIndex, refIndex) => {
					if (ingredientIndex >= ingredientCount) ctx.addIssue({
						code: z.ZodIssueCode.custom,
						path: ['steps', index, 'ingredient_indexes', refIndex],
						message: `ingredient index ${ingredientIndex} is out of range`
					});
				});
				if (!streamIds.has(step.stream_id)) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						path: ['steps', index, 'stream_id'],
						message: `stream_id "${step.stream_id}" is not declared`
					});
				}
				if (step.merges_from.length === 1) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						path: ['steps', index, 'merges_from'],
						message: 'merges_from must be empty or contain at least two stream IDs'
					});
				}
				step.merges_from.forEach((streamId, mergeIndex) => {
					if (!streamIds.has(streamId)) {
						ctx.addIssue({
							code: z.ZodIssueCode.custom,
							path: ['steps', index, 'merges_from', mergeIndex],
							message: `merge stream "${streamId}" is not declared`
						});
					} else if (!data.steps.slice(0, index).some((prior) => prior.stream_id === streamId)) {
						ctx.addIssue({
							code: z.ZodIssueCode.custom,
							path: ['steps', index, 'merges_from', mergeIndex],
							message: `merge stream "${streamId}" has no earlier step`
						});
					}
				});

				for (const language of ['en', 'nl'] as const) {
					const goalIssue = violatesActionState(step.goal[language]);
					if (goalIssue) {
						ctx.addIssue({
							code: z.ZodIssueCode.custom,
							path: ['steps', index, 'goal', language],
							message: `goal ${goalIssue}`
						});
					}
					if (step.timer_purpose) {
						const timerIssue = violatesActionState(step.timer_purpose[language]);
						if (timerIssue) {
							ctx.addIssue({
								code: z.ZodIssueCode.custom,
								path: ['steps', index, 'timer_purpose', language],
								message: `timer_purpose ${timerIssue}`
							});
						}
					}
				}

				const timerFields = [step.timer_purpose, step.timer_action, step.timer_location];
				if (step.timer_seconds == null && timerFields.some((value) => value != null)) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						path: ['steps', index, 'timer_seconds'],
						message: 'timer text must be null when timer_seconds is null'
					});
				}
				if (step.timer_seconds != null && timerFields.some((value) => value == null)) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						path: ['steps', index, 'timer_seconds'],
						message: 'all timer text is required when timer_seconds is set'
					});
				}
			});
			data.prep_tasks.forEach((task, taskIndex) => task.ingredient_indexes.forEach((ingredientIndex, refIndex) => {
				if (ingredientIndex >= ingredientCount) ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ['prep_tasks', taskIndex, 'ingredient_indexes', refIndex],
					message: `ingredient index ${ingredientIndex} is out of range`
				});
			}));

			displayedText(data).forEach((value, index) => {
				const inaccessibleTerm = inaccessibleCookModeTerm(value);
				if (inaccessibleTerm) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						path: ['display_text', index],
						message: `use plain home-cook wording instead of "${inaccessibleTerm}"`
					});
				}
			});
		});

type GenerateOptions = {
	force?: boolean;
	language?: 'en' | 'nl';
	servings?: number;
};

type GenerateResult = Awaited<ReturnType<typeof generateCookModeUncached>>;

const inflight = new Map<string, { requestKey: string; promise: Promise<GenerateResult> }>();

function normalizedServings(value: number | undefined, fallback: number): number {
	if (!Number.isInteger(value)) return fallback;
	return Math.max(1, Math.min(99, value as number));
}

export async function generateCookMode(slug: string, opts: GenerateOptions = {}) {
	const requestKey = `${opts.language ?? 'en'}:${opts.servings ?? 'default'}:${opts.force === true}`;
	const running = inflight.get(slug);
	if (running) {
		if (running.requestKey === requestKey) return running.promise;
		await running.promise.catch(() => undefined);
		return generateCookMode(slug, opts);
	}

	const promise = generateCookModeUncached(slug, opts).finally(() => {
		if (inflight.get(slug)?.promise === promise) inflight.delete(slug);
	});
	inflight.set(slug, { requestKey, promise });
	return promise;
}

export function kickCookModeGeneration(slug: string) {
	generateCookMode(slug).catch((error) => {
		console.warn(
			`[cook-mode] background pre-generation failed for ${slug}: ${error instanceof Error ? error.message : error}`
		);
	});
}

function generationFingerprint(
	recipe: typeof recipes.$inferSelect,
	subRows: Array<typeof recipes.$inferSelect>
): string {
	return JSON.stringify({
		recipe: {
			title: recipe.title,
			language: recipe.language,
			servings: recipe.servings,
			totalTimeMin: recipe.totalTimeMin,
			ingredients: recipe.ingredients,
			directions: recipe.directions
		},
		subRecipes: subRows.map((subRecipe) => ({
			id: subRecipe.id,
			title: subRecipe.title,
			language: subRecipe.language,
			servings: subRecipe.servings,
			totalTimeMin: subRecipe.totalTimeMin,
			ingredients: subRecipe.ingredients,
			directions: subRecipe.directions
		}))
	});
}

function loadSubRows(recipeId: number) {
	const refs = subRecipesOf(db, recipeId);
	if (refs.length === 0) return [];
	return db
		.select()
		.from(recipes)
		.where(
			inArray(
				recipes.id,
				refs.map((reference) => reference.id)
			)
		)
		.all()
		.sort(
			(a, b) => refs.findIndex((reference) => reference.id === a.id) - refs.findIndex((reference) => reference.id === b.id)
		);
}

async function generateCookModeUncached(
	slug: string,
	opts: GenerateOptions = {},
	freshnessRetry = 0
) {
	const recipe = db.select().from(recipes).where(eq(recipes.slug, slug)).get();
	if (!recipe) return null;

	const language = opts.language ?? 'en';
	const sourceServings = recipe.servings ?? 4;
	const targetServings = normalizedServings(opts.servings, sourceServings);
	const subRows = loadSubRows(recipe.id);

	if (!opts.force && recipe.cookModeJson && !isStaleCookMode(recipe.cookModeJson)) {
		const generatedAt = recipe.cookModeGeneratedAt?.getTime() ?? 0;
		const subChanged = subRows.some((subRecipe) => (subRecipe.updatedAt?.getTime() ?? 0) > generatedAt);
		const servesTarget =
			recipe.cookModeJson.version === 4
				? true
				: recipe.cookModeJson.version === 3
				? recipe.cookModeJson.servings === targetServings
				: targetServings === sourceServings;
		if (
			!subChanged &&
			servesTarget &&
			hasCookModeLanguage(recipe.cookModeJson, language, targetServings)
		) {
			return { recipe, generated: false };
		}
	}

	const ownDirections = recipe.directions as string[];
	const totalDirections =
		ownDirections.length + subRows.reduce((count, subRecipe) => count + (subRecipe.directions as string[]).length, 0);
	if (totalDirections === 0) {
		return { recipe, generated: false, reason: 'no_directions' as const };
	}

	const cap = checkDailyCap();
	if (cap.exceeded) throw new DailyCapExceeded();

	const baselineIngredients = expandMealIngredientsForServings(db, recipe, sourceServings);
	const prompt = loadPrompt('cook_mode');
	const payload = {
		title: recipe.title,
		source_language: recipe.language,
		source_servings: sourceServings,
		ingredients: baselineIngredients.map((ingredient, index) => ({ index, ...ingredient })),
		directions: ownDirections,
		totalTimeMin: recipe.totalTimeMin,
		...(subRows.length > 0
			? {
					sub_recipes: subRows.map((subRecipe) => ({
						title: subRecipe.title,
						source_language: subRecipe.language,
						directions: subRecipe.directions as string[],
						totalTimeMin: subRecipe.totalTimeMin
					}))
				}
			: {})
	};
	const payloadJson = JSON.stringify(payload);
	const schema = buildCookModeSchema(subRows.length > 0 ? 30 : 20, baselineIngredients.length);
	const fingerprint = generationFingerprint(recipe, subRows);

	let generated: GeneratedCookMode | null = null;
	let lastError: string | null = null;
	for (let attempt = 0; attempt < 3 && generated == null; attempt++) {
		const userContent = lastError
			? `${payloadJson}\n\nYour previous response failed schema validation:\n${lastError}\n\nReturn only corrected JSON.`
			: payloadJson;
		const message = await createMessage({
			model: attempt < 2 ? getChatModel().value : getChatFallbackModel().value,
			system: prompt,
			messages: [{ role: 'user', content: userContent }]
		});
		logSpend(message.model, message.usage, message.costUsd);
		try {
			const parsed = schema.safeParse(parseModelJson(message.text));
			if (parsed.success) {
				generated = parsed.data;
				break;
			}
			lastError = parsed.error.issues
				.map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
				.join('; ');
		} catch (error) {
			lastError = `JSON parse error: ${(error as Error).message}`;
		}
	}
	if (generated == null) {
		throw new Error(`cook_mode JSON failed validation after 3 attempts: ${lastError}`);
	}

	const currentRecipe = db.select().from(recipes).where(eq(recipes.slug, slug)).get();
	if (!currentRecipe) return null;
	const currentSubRows = loadSubRows(currentRecipe.id);
	if (generationFingerprint(currentRecipe, currentSubRows) !== fingerprint) {
		if (freshnessRetry >= 1) throw new Error('Recipe changed repeatedly during cooking-view generation');
		return generateCookModeUncached(slug, opts, freshnessRetry + 1);
	}

	const cookMode: LocalizedCookModeRecipeV4 = {
		...generated,
		generation_id: randomUUID(),
		baseline_servings: sourceServings
	};
	const updated = db
		.update(recipes)
		.set({ cookModeJson: cookMode, cookModeGeneratedAt: new Date() })
		.where(eq(recipes.slug, slug))
		.returning()
		.get();

	return { recipe: updated, generated: true };
}
