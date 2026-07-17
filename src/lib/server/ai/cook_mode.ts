import { eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { subRecipesOf } from '$lib/server/meal_recipes';
import {
	createMessage,
	checkDailyCap,
	DailyCapExceeded,
	loadPrompt,
	logSpend,
	parseModelJson
} from '$lib/server/ai/client';
import { getChatModel } from '$lib/server/ai/config';
import { db } from '$lib/server/db/index';
import { recipes, type Ingredient } from '$lib/server/db/schema';
import type { CookModeRecipe } from '$lib/types';
import { violatesActionState } from '$lib/components/cook-mode/staleness';

const StreamSchema = z.object({
	id: z.string().min(1),
	name: z.string().min(1).max(32)
});

// Dev-mode prompt/regex drift catcher. If a future prompt rewrite or regex
// tweak desyncs from these expectations, the import-time check throws so we
// notice before the next AI call rather than after a bad regen.
const GOOD_GOAL_FIXTURES: string[] = [
	'Rub butter into flour — sandy',
	'Reduce sauce — coats spoon',
	'Brown crust — deep gold',
	'Whisk batter — pale ribbon',
	'Fold mixture — just combined',
	'Roast chicken — 74°C in thigh',
	'Bake top — set with crackle',
	'Sweat shallots — translucent'
];
const BAD_GOAL_FIXTURES: string[] = [
	'Stir occasionally', // no em-dash, no state
	'Onions - translucent', // hyphen-minus, not em-dash
	'dough — sandy', // lowercase start
	'Bake at 180°C until skewer comes out clean and a moist crumb sticks — done', // > 8 words
	'', // empty
	'Mix', // no em-dash
	'Dough — sandy', // old noun-state form (1 word before em-dash)
	'Whisk eggs and add sugar gradually folding in flour — combined' // > 8 words
];
if (import.meta.env.DEV) {
	for (const g of GOOD_GOAL_FIXTURES) {
		const issue = violatesActionState(g);
		if (issue) {
			throw new Error(`cook_mode goal fixture regression: GOOD "${g}" was rejected — ${issue}`);
		}
	}
	for (const b of BAD_GOAL_FIXTURES) {
		if (!violatesActionState(b)) {
			throw new Error(`cook_mode goal fixture regression: BAD "${b}" was accepted`);
		}
	}
}

const StepSchema = z.object({
	title: z.string().min(1),
	goal: z.string().min(1).max(64),
	body: z.string().min(1),
	ingredients: z.array(z.string()),
	timer_seconds: z.number().int().nonnegative().nullable(),
	timer_purpose: z.string().max(64).nullable(),
	timer_action: z.string().min(1).max(20).nullable(),
	timer_location: z.string().min(1).max(16).nullable(),
	stream_id: z.string().min(1),
	merges_from: z.array(z.string())
});

// Factory: meal recipes (sub-recipe composition, ADR 0003) get a higher step
// budget — one combined bench sheet over 3-4 sub-recipes doesn't fit in 20.
const buildCookModeSchema = (maxSteps: number): z.ZodType<CookModeRecipe> =>
	z
	.object({
		mise_en_place: z.array(z.string()),
		streams: z.array(StreamSchema).min(1),
		steps: z.array(StepSchema).min(2).max(maxSteps)
	})
	.superRefine((data, ctx) => {
		const streamIds = new Set(data.streams.map((s) => s.id));
		// Every declared stream must own at least one step — an unused stream
		// renders as a phantom lane (color reserved, divider never emitted).
		const usedStreamIds = new Set(data.steps.map((s) => s.stream_id));
		data.streams.forEach((s, si) => {
			if (!usedStreamIds.has(s.id)) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ['streams', si, 'id'],
					message: `stream "${s.id}" has no steps — remove it or assign it steps`
				});
			}
		});
		data.steps.forEach((step, i) => {
			if (!streamIds.has(step.stream_id)) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ['steps', i, 'stream_id'],
					message: `stream_id "${step.stream_id}" is not declared in streams[]`
				});
			}
			if (step.merges_from.length === 1) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ['steps', i, 'merges_from'],
					message: 'merges_from must be empty or contain ≥ 2 stream_ids (single-source merges have no visual signal)'
				});
			}
			step.merges_from.forEach((m, mi) => {
				if (!streamIds.has(m)) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						path: ['steps', i, 'merges_from', mi],
						message: `merges_from entry "${m}" is not declared in streams[]`
					});
					return;
				}
				// A merge must come after the work it merges: every source stream
				// needs ≥ 1 earlier step, or the convergence points at nothing and
				// the flat list reads out of cook order on complex recipes.
				const hasEarlierStep = data.steps.slice(0, i).some((p) => p.stream_id === m);
				if (!hasEarlierStep) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						path: ['steps', i, 'merges_from', mi],
						message: `merges_from entry "${m}" has no earlier step — a merge step must appear after at least one step of every stream it merges`
					});
				}
			});
			const goalIssue = violatesActionState(step.goal);
			if (goalIssue) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ['steps', i, 'goal'],
					message: `goal ${goalIssue}. Examples: "Sweat shallots — translucent", "Reduce sauce — coats spoon", "Bake top — set with crackle".`
				});
			}
			// Timer companion fields share a contract: required (non-empty)
			// when timer_seconds is set; null when timer_seconds is null.
			const timerFields: { name: 'timer_purpose' | 'timer_action' | 'timer_location'; requiredHint: string }[] = [
				{ name: 'timer_purpose', requiredHint: 'action-led, ≤ 8 words (e.g. "Bake top — crackled, set").' },
				{ name: 'timer_action', requiredHint: '1–2 words, lowercase gerund (e.g. "baking", "simmering", "resting").' },
				{ name: 'timer_location', requiredHint: 'free text ≤ 16 chars (e.g. "oven", "stove", "fridge", "counter", "sous-vide").' }
			];
			for (const { name, requiredHint } of timerFields) {
				const value = step[name];
				if (step.timer_seconds != null && (value == null || value.trim() === '')) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						path: ['steps', i, name],
						message: `${name} is required (non-empty) when timer_seconds is set. ${requiredHint}`
					});
				}
				if (step.timer_seconds == null && value != null) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						path: ['steps', i, name],
						message: `${name} must be null when timer_seconds is null`
					});
				}
			}
			if (step.timer_purpose != null) {
				const tpIssue = violatesActionState(step.timer_purpose);
				if (tpIssue) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						path: ['steps', i, 'timer_purpose'],
						message: `timer_purpose ${tpIssue}. Often identical to goal; refine only when active-wait state is more specific.`
					});
				}
			}
		});
	});

type GenerateResult = Awaited<ReturnType<typeof generateCookModeUncached>>;

// One generation per slug at a time. A cook who opens the recipe, leaves, and
// comes back would otherwise fire a second AI call while the first is still
// running (double spend, and the loser's write clobbers the winner's). Joiners
// get the running generation's promise instead.
const inflight = new Map<string, Promise<GenerateResult>>();

export async function generateCookMode(slug: string, opts: { force?: boolean } = {}) {
	const running = inflight.get(slug);
	if (running) return running;
	const p = generateCookModeUncached(slug, opts).finally(() => inflight.delete(slug));
	inflight.set(slug, p);
	return p;
}

// Fire-and-forget pre-generation for write paths (import, AI edit, meal
// composition): by the time the recipe is opened the bench sheet is cached.
// Failures are non-fatal — the recipe page's own load path retries and has
// the raw-directions fallback.
export function kickCookModeGeneration(slug: string) {
	generateCookMode(slug).catch((err) => {
		console.warn(
			`[cook-mode] background pre-generation failed for ${slug}: ${err instanceof Error ? err.message : err}`
		);
	});
}

async function generateCookModeUncached(slug: string, opts: { force?: boolean } = {}) {
	const recipe = db.select().from(recipes).where(eq(recipes.slug, slug)).get();
	if (!recipe) return null;

	// Meal recipe (ADR 0003): pull full sub-recipe rows for the combined
	// bench sheet — each sub-recipe becomes its own stream(s), the meal's own
	// directions form the assembly/plating steps.
	const subRefs = subRecipesOf(db, recipe.id);
	const subRows = subRefs.length
		? db
				.select()
				.from(recipes)
				.where(
					inArray(
						recipes.id,
						subRefs.map((s) => s.id)
					)
				)
				.all()
				.sort(
					(a, b) =>
						subRefs.findIndex((r) => r.id === a.id) - subRefs.findIndex((r) => r.id === b.id)
				)
		: [];

	if (!opts.force && recipe.cookModeJson) {
		// A meal's cached sheet is stale when any sub-recipe's content changed
		// after generation (live links, not copies).
		const genAt = recipe.cookModeGeneratedAt?.getTime() ?? 0;
		const subChanged = subRows.some((s) => (s.updatedAt?.getTime() ?? 0) > genAt);
		if (!subChanged) return { recipe, generated: false };
	}

	const ownDirections = recipe.directions as string[];
	const totalDirections =
		ownDirections.length + subRows.reduce((n, s) => n + (s.directions as string[]).length, 0);
	if (totalDirections === 0) {
		return { recipe, generated: false, reason: 'no_directions' as const };
	}

	const cap = checkDailyCap();
	if (cap.exceeded) throw new DailyCapExceeded();

	const prompt = loadPrompt('cook_mode');
	const payload = {
		title: recipe.title,
		ingredients: recipe.ingredients as Ingredient[],
		directions: ownDirections,
		totalTimeMin: recipe.totalTimeMin,
		...(subRows.length > 0
			? {
					sub_recipes: subRows.map((s) => ({
						title: s.title,
						ingredients: s.ingredients as Ingredient[],
						directions: s.directions as string[],
						totalTimeMin: s.totalTimeMin
					}))
				}
			: {})
	};
	const payloadJson = JSON.stringify(payload);
	const CookModeSchema = buildCookModeSchema(subRows.length > 0 ? 30 : 20);

	let cookMode: CookModeRecipe | null = null;
	let lastError: string | null = null;
	for (let attempt = 0; attempt < 2 && cookMode == null; attempt++) {
		const userContent = lastError
			? `${payloadJson}\n\nYour previous response failed schema validation:\n${lastError}\n\nReturn ONLY corrected JSON conforming to the schema.`
			: payloadJson;
		const msg = await createMessage({
			model: getChatModel().value,
			system: prompt,
			messages: [{ role: 'user', content: userContent }]
		});
		logSpend(msg.model, msg.usage, msg.costUsd);
		const text = msg.text;
		try {
			const parsed = CookModeSchema.safeParse(parseModelJson(text));
			if (parsed.success) {
				cookMode = parsed.data;
				break;
			}
			lastError = parsed.error.issues
				.map((iss) => `${iss.path.join('.') || '<root>'}: ${iss.message}`)
				.join('; ');
		} catch (e) {
			lastError = `JSON parse error: ${(e as Error).message}`;
		}
	}
	if (cookMode == null) {
		throw new Error(`cook_mode JSON failed validation after retry: ${lastError}`);
	}

	const updated = db
		.update(recipes)
		.set({
			cookModeJson: cookMode,
			cookModeGeneratedAt: new Date(),
			updatedAt: new Date()
		})
		.where(eq(recipes.slug, slug))
		.returning()
		.get();

	return { recipe: updated, generated: true };
}
