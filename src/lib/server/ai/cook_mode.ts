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
import { recipes } from '$lib/server/db/schema';
import type {
	LocalizedCookModeRecipeV5,
	LocalizedCookModeText,
	CookModeIngredientAllocation
} from '$lib/types';
import {
	hasCookModeLanguage,
	isStaleCookMode,
	isValidCookModeV5,
	violatesActionState
} from '$lib/components/cook-mode/staleness';
import { inaccessibleCookModeTerm } from '$lib/components/cook-mode/plain-language';
import { updateCanonicalRecipe, updateCookModeCache } from '$lib/server/recipe_mutations';

const LocalizedTextSchema = z.object({
	en: z.string().min(1),
	nl: z.string().min(1)
});

const StreamSchema = z.object({
	id: z.string().min(1),
	name: LocalizedTextSchema
});

const AllocationSchema = z.discriminatedUnion('kind', [
	z.object({ kind: z.literal('all') }),
	z.object({
		kind: z.literal('fraction'),
		numerator: z.number().int().positive(),
		denominator: z.number().int().positive()
	}),
	z.object({ kind: z.literal('remaining') }),
	z.object({ kind: z.literal('reference') })
]);

const InstructionSchema = z.object({
	direction_id: z.string().min(1),
	text: LocalizedTextSchema
});

const StepSchema = z.object({
	step_id: z.string().min(1),
	direction_id: z.string().min(1),
	ingredient_uses: z.array(
		z.object({
			ingredient_id: z.string().min(1),
			allocation: AllocationSchema
		})
	),
	timer_seconds: z.number().int().positive().nullable(),
	timer_purpose: LocalizedTextSchema.nullable(),
	timer_action: LocalizedTextSchema.nullable(),
	timer_location: LocalizedTextSchema.nullable(),
	stream_id: z.string().min(1),
	merges_from: z.array(z.string())
});

type GeneratedCookMode = {
	version: 5;
	instructions: Array<{ direction_id: string; text: LocalizedCookModeText }>;
	streams: Array<{ id: string; name: LocalizedCookModeText }>;
	steps: Array<{
		step_id: string;
		direction_id: string;
		ingredient_uses: Array<{
			ingredient_id: string;
			allocation: CookModeIngredientAllocation;
		}>;
		timer_seconds: number | null;
		timer_purpose: LocalizedCookModeText | null;
		timer_action: LocalizedCookModeText | null;
		timer_location: LocalizedCookModeText | null;
		stream_id: string;
		merges_from: string[];
	}>;
};

function localizedValues(value: LocalizedCookModeText): string[] {
	return [value.en, value.nl];
}

function displayedText(data: GeneratedCookMode): string[] {
	return [
		...data.instructions.flatMap((instruction) => localizedValues(instruction.text)),
		...data.streams.flatMap((stream) => localizedValues(stream.name)),
		...data.steps.flatMap((step) => [
			...(step.timer_purpose ? localizedValues(step.timer_purpose) : []),
			...(step.timer_action ? localizedValues(step.timer_action) : []),
			...(step.timer_location ? localizedValues(step.timer_location) : [])
		])
	];
}

export function violatesCookModeBody(value: string): string | null {
	const words = value
		.trim()
		.split(/\s+/u)
		.filter(Boolean).length;
	if (words > 36) return `must be ≤ 36 words (got ${words})`;
	const sentences = value.split(/[.!?]+/u).filter((sentence) => sentence.trim()).length;
	if (sentences > 3) return `must be ≤ 3 sentences (got ${sentences})`;
	return null;
}

const buildCookModeSchema = (
	directionIds: string[],
	ingredientIds: string[]
): z.ZodType<GeneratedCookMode> =>
	z
		.object({
			version: z.literal(5),
			instructions: z.array(InstructionSchema).length(directionIds.length),
			streams: z.array(StreamSchema).min(1),
			steps: z.array(StepSchema).length(directionIds.length)
		})
		.superRefine((data, ctx) => {
			const expectedDirections = new Set(directionIds);
			const expectedIngredients = new Set(ingredientIds);
			const instructionIds = data.instructions.map((instruction) => instruction.direction_id);
			const stepDirectionIds = data.steps.map((step) => step.direction_id);
			for (const [path, ids] of [
				['instructions', instructionIds],
				['steps', stepDirectionIds]
			] as const) {
				if (
					ids.length !== expectedDirections.size ||
					new Set(ids).size !== ids.length ||
					ids.some((id) => !expectedDirections.has(id))
				) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						path: [path],
						message: 'must reference every supplied direction exactly once'
					});
				}
			}

			const streamIds = new Set(data.streams.map((stream) => stream.id));
			if (streamIds.size !== data.streams.length) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ['streams'],
					message: 'stream IDs must be unique'
				});
			}
			const usedStreamIds = new Set(data.steps.map((step) => step.stream_id));
			data.streams.forEach((stream, index) => {
				if (!usedStreamIds.has(stream.id)) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						path: ['streams', index],
						message: 'stream has no steps'
					});
				}
			});

			data.instructions.forEach((instruction, index) => {
				for (const language of ['en', 'nl'] as const) {
					const issue = violatesCookModeBody(instruction.text[language]);
					if (issue) {
						ctx.addIssue({
							code: z.ZodIssueCode.custom,
							path: ['instructions', index, 'text', language],
							message: issue
						});
					}
				}
			});

			data.steps.forEach((step, index) => {
				if (!streamIds.has(step.stream_id)) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						path: ['steps', index, 'stream_id'],
						message: 'stream is not declared'
					});
				}
				if (step.merges_from.length === 1) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						path: ['steps', index, 'merges_from'],
						message: 'merge must contain at least two incoming streams'
					});
				}
				step.merges_from.forEach((streamId, mergeIndex) => {
					if (
						!streamIds.has(streamId) ||
						streamId === step.stream_id ||
						!data.steps.slice(0, index).some((prior) => prior.stream_id === streamId)
					) {
						ctx.addIssue({
							code: z.ZodIssueCode.custom,
							path: ['steps', index, 'merges_from', mergeIndex],
							message: 'merge source must be a distinct earlier stream'
						});
					}
				});
				step.ingredient_uses.forEach((use, useIndex) => {
					if (!expectedIngredients.has(use.ingredient_id)) {
						ctx.addIssue({
							code: z.ZodIssueCode.custom,
							path: ['steps', index, 'ingredient_uses', useIndex, 'ingredient_id'],
							message: 'ingredient ID is not supplied'
						});
					}
				});
				const timerFields = [step.timer_purpose, step.timer_action, step.timer_location];
				if (step.timer_seconds == null && timerFields.some((value) => value != null)) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						path: ['steps', index, 'timer_seconds'],
						message: 'timer text must be null without a timer'
					});
				}
				if (step.timer_seconds != null && timerFields.some((value) => value == null)) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						path: ['steps', index, 'timer_seconds'],
						message: 'all timer text is required with a timer'
					});
				}
				if (step.timer_purpose) {
					for (const language of ['en', 'nl'] as const) {
						const issue = violatesActionState(step.timer_purpose[language]);
						if (issue) {
							ctx.addIssue({
								code: z.ZodIssueCode.custom,
								path: ['steps', index, 'timer_purpose', language],
								message: issue
							});
						}
					}
				}
			});

			const candidate: LocalizedCookModeRecipeV5 = {
				version: 5,
				generation_id: 'validation',
				baseline_servings: 1,
				content_revision: 1,
				structure_fingerprint: 'validation',
				streams: data.streams,
				steps: data.steps
			};
			if (!isValidCookModeV5(candidate)) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ['steps'],
					message: 'ingredient allocations or semantic graph are inconsistent'
				});
			}
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

export function validateGeneratedCookMode(
	value: unknown,
	directionIds: string[],
	ingredientIds: string[]
) {
	return buildCookModeSchema(directionIds, ingredientIds).safeParse(value);
}

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

export function generationFingerprint(
	recipe: typeof recipes.$inferSelect,
	subRows: Array<typeof recipes.$inferSelect>
): string {
	return JSON.stringify({
		recipe: {
			contentRevision: recipe.contentRevision,
			directionIds: recipe.directionIdsJson,
			ingredients: recipe.ingredients,
			directions: recipe.directions
		},
		subRecipes: subRows.map((subRecipe) => ({
			id: subRecipe.id,
			contentRevision: subRecipe.contentRevision,
			directionIds: subRecipe.directionIdsJson,
			ingredients: subRecipe.ingredients,
			directions: subRecipe.directions
		}))
	});
}

export function structureFingerprint(
	recipe: typeof recipes.$inferSelect,
	subRows: Array<typeof recipes.$inferSelect>
): string {
	return JSON.stringify({
		recipe: {
			directionIds: recipe.directionIdsJson,
			ingredientIds: recipe.ingredients.map((ingredient) => ingredient.id)
		},
		subRecipes: subRows.map((subRecipe) => ({
			id: subRecipe.id,
			directionIds: subRecipe.directionIdsJson,
			ingredientIds: subRecipe.ingredients.map((ingredient) => ingredient.id)
		}))
	});
}

function loadSubRows(recipeId: number) {
	const refs = subRecipesOf(db, recipeId);
	if (refs.length === 0) return [];
	return db
		.select()
		.from(recipes)
		.where(inArray(recipes.id, refs.map((reference) => reference.id)))
		.all()
		.sort(
			(a, b) =>
				refs.findIndex((reference) => reference.id === a.id) -
				refs.findIndex((reference) => reference.id === b.id)
		);
}

function directionPayload(
	recipe: typeof recipes.$inferSelect,
	subRows: Array<typeof recipes.$inferSelect>
) {
	return [recipe, ...subRows].flatMap((row) =>
		row.directions.map((text, index) => ({
			direction_id: row.directionIdsJson[index],
			text,
			source_language: row.language,
			component: row.title
		}))
	);
}

function canPromoteImportedDirections(recipe: typeof recipes.$inferSelect, subRows: unknown[]): boolean {
	const snapshot = recipe.sourceSnapshotJson;
	return (
		subRows.length === 0 &&
		recipe.contentRevision === 1 &&
		snapshot?.provenance === 'imported_source' &&
		JSON.stringify(snapshot.directions) === JSON.stringify(recipe.directions)
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
		const subChanged = subRows.some(
			(subRecipe) => (subRecipe.updatedAt?.getTime() ?? 0) > generatedAt
		);
		if (
			!subChanged &&
			hasCookModeLanguage(recipe.cookModeJson, language, targetServings)
		) {
			return { recipe, generated: false };
		}
	}

	const directions = directionPayload(recipe, subRows);
	if (directions.length === 0) {
		return { recipe, generated: false, reason: 'no_directions' as const };
	}
	const cap = checkDailyCap();
	if (cap.exceeded) throw new DailyCapExceeded();

	const baselineIngredients = expandMealIngredientsForServings(db, recipe, sourceServings);
	const ingredientIds = baselineIngredients.flatMap((ingredient) =>
		ingredient.id ? [ingredient.id] : []
	);
	const payloadJson = JSON.stringify({
		title: recipe.title,
		source_servings: sourceServings,
		ingredients: baselineIngredients.map((ingredient) => ({
			id: ingredient.id,
			name: ingredient.name,
			amount: ingredient.amount,
			unit: ingredient.unit,
			preparation: ingredient.preparation,
			component: ingredient.component
		})),
		directions
	});
	const prompt = loadPrompt('cook_mode');
	const schema = buildCookModeSchema(
		directions.map((direction) => direction.direction_id),
		ingredientIds
	);
	const fingerprint = generationFingerprint(recipe, subRows);
	let generated: GeneratedCookMode | null = null;
	let lastError: string | null = null;
	for (let attempt = 0; attempt < 3 && generated == null; attempt += 1) {
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
			if (parsed.success) generated = parsed.data;
			else {
				lastError = parsed.error.issues
					.map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
					.join('; ');
			}
		} catch (error) {
			lastError = `JSON parse error: ${(error as Error).message}`;
		}
	}
	if (!generated) {
		throw new Error(`cook_mode JSON failed validation after 3 attempts: ${lastError}`);
	}

	const currentRecipe = db.select().from(recipes).where(eq(recipes.slug, slug)).get();
	if (!currentRecipe) return null;
	const currentSubRows = loadSubRows(currentRecipe.id);
	if (generationFingerprint(currentRecipe, currentSubRows) !== fingerprint) {
		if (freshnessRetry >= 1) {
			throw new Error('Recipe changed repeatedly during cooking-view generation');
		}
		return generateCookModeUncached(slug, opts, freshnessRetry + 1);
	}

	const promote = canPromoteImportedDirections(currentRecipe, currentSubRows);
	const instructions = new Map(
		generated.instructions.map((instruction) => [instruction.direction_id, instruction.text])
	);
	const nextDirections = currentRecipe.directionIdsJson.map(
		(id) => instructions.get(id)?.[currentRecipe.language === 'en' ? 'en' : 'nl'] ?? ''
	);
	const cookMode: LocalizedCookModeRecipeV5 = {
		version: 5,
		generation_id: randomUUID(),
		baseline_servings: sourceServings,
		content_revision: currentRecipe.contentRevision + (promote ? 1 : 0),
		structure_fingerprint: structureFingerprint(currentRecipe, currentSubRows),
		streams: generated.streams,
		steps: generated.steps
	};

	const updated = promote
		? updateCanonicalRecipe(db, {
				recipeId: currentRecipe.id,
				expectedRevision: currentRecipe.contentRevision,
				changes: {
					directions: nextDirections,
					directionIdsJson: currentRecipe.directionIdsJson,
					directionsEn: currentRecipe.directionIdsJson.map(
						(id) => instructions.get(id)?.en ?? ''
					),
					cookModeJson: cookMode,
					cookModeGeneratedAt: new Date()
				}
			})
		: updateCookModeCache(db, {
				recipeId: currentRecipe.id,
				expectedRevision: currentRecipe.contentRevision,
				cookModeJson: cookMode,
				cookModeGeneratedAt: new Date()
			});
	if (!updated) {
		if (freshnessRetry >= 1) throw new Error('Recipe changed during cooking-view write');
		return generateCookModeUncached(slug, opts, freshnessRetry + 1);
	}
	return { recipe: updated, generated: true };
}
