import { z } from 'zod';
import { eq, like, inArray } from 'drizzle-orm';
import * as schema from '$lib/server/db/schema';
import type { Ingredient } from '$lib/server/db/schema';
import { namesMatch } from '$lib/match';
import { foodCategoryMatches, normalizeFoodCategory } from '$lib/food_categories';
import {
	scrapeRecipeFromUrl,
	insertScrapedRecipe,
	reviewFields,
	RecipeIngestError
} from '$lib/server/ai/recipe_ingest';
import { frozenPortionsByRecipe } from '$lib/server/recipe_links';
import { setFreezerStaple } from '$lib/server/freezer_staple';
import { createMealRecipe, MealCompositionError, subRecipesOf } from '$lib/server/meal_recipes';
import { kickCookModeGeneration } from '$lib/server/ai/cook_mode';
import { kickTranslateOnImport } from '$lib/server/ai/translate_recipe';
import { getAutoTranslateOnImport } from '$lib/server/recipes/prefs';
import { db as appDb } from '$lib/server/db/index';
import { updateCanonicalRecipe, type CanonicalRecipeUpdate } from '$lib/server/recipe_mutations';
import type { DB, ExecutorFn } from './shared';
import { NewIngredientSchema } from '$lib/recipe_ingredient';
import { reconcileShoppingAfterWrite } from '$lib/server/shopping_entries';
import { generateRecipeEnhancement } from '$lib/server/ai/recipe_enhancement';
import { captureRecipeSource, ensureDirectionIds } from '$lib/recipe_source_snapshot';

// Pre-generate a bench sheet after a chat-side recipe write, so the recipe is
// ready by the time it's opened. generateCookMode reads the module-level app
// DB — skip when the executor runs against a different (test) database.
function kickCookModeIfAppDb(db: DB, slug: string) {
	if (db === appDb) kickCookModeGeneration(slug);
}

// Same app-db guard, for the auto-translate-on-import toggle (Phase 4) —
// translateRecipe also reads the module-level app DB.
function kickTranslateIfAppDb(db: DB, slug: string) {
	if (db === appDb) kickTranslateOnImport(slug);
}

function ingredientStructureVersion(ingredients: Ingredient[]): 1 | 2 {
	return ingredients.length > 0 && ingredients.every((ingredient) =>
		(ingredient.role === 'cook_in' || ingredient.role === 'serve_fresh') &&
		typeof ingredient.optional === 'boolean' &&
		Boolean(ingredient.purchaseForm) &&
		Boolean(ingredient.scale) &&
		Boolean(ingredient.origin)
	) ? 2 : 1;
}

export const recipeExecutors: Record<string, ExecutorFn> = {
	async propose_recipe_enhancement(raw, db, userId) {
		const input = z.object({ slug: z.string() }).parse(raw);
		const proposal = await generateRecipeEnhancement(db, { recipeSlug: input.slug, userId });
		return { ok: true, kind: 'recipe_enhancement', ...proposal };
	},
	async get_recipe(raw, db) {
		const input = z
			.object({ slug: z.string().optional(), name: z.string().optional() })
			.parse(raw);

		const recipe = input.slug
			? db.select().from(schema.recipes).where(eq(schema.recipes.slug, input.slug)).get()
			: input.name
				? db
						.select()
						.from(schema.recipes)
						.where(like(schema.recipes.title, `%${input.name}%`))
						.get()
				: undefined;
		if (!recipe) return { found: false };
		return { found: true, recipe };
	},

	async search_recipes(raw, db) {
		const input = z
			.object({
				query: z.string().optional(),
				category: z.string().optional(),
				ingredient: z.string().optional()
			})
			.parse(raw);

		let results = db.select().from(schema.recipes).all();
		if (input.query) {
			const q = input.query.toLowerCase();
			results = results.filter((r) => r.title.toLowerCase().includes(q));
		}
		if (input.category) {
			results = results.filter((r) => foodCategoryMatches(r.category, input.category));
		}
		if (input.ingredient) {
			const ing = input.ingredient.toLowerCase();
			results = results.filter((r) =>
				(r.ingredients as Ingredient[]).some((i) => i.name.toLowerCase().includes(ing))
			);
		}
		return {
			count: results.length,
			recipes: results.slice(0, 20).map((r) => ({
				slug: r.slug,
				title: r.title,
				category: r.category,
				rating: r.rating
			}))
		};
	},

	async create_meal_recipe(raw, db) {
		const input = z
			.object({
				title: z.string().trim().min(1).max(120),
				sub_recipe_slugs: z.array(z.string().min(1)).min(2).max(12)
			})
			.parse(raw);
		const subs = db
			.select({ id: schema.recipes.id, slug: schema.recipes.slug, title: schema.recipes.title })
			.from(schema.recipes)
			.where(inArray(schema.recipes.slug, input.sub_recipe_slugs))
			.all();
		const missing = input.sub_recipe_slugs.filter((s) => !subs.some((r) => r.slug === s));
		if (missing.length) {
			return { created: false, error: `Recipes not found: ${missing.join(', ')}` };
		}
		try {
			const meal = createMealRecipe(db, {
				title: input.title,
				subRecipeIds: subs.map((s) => s.id)
			});
			kickCookModeIfAppDb(db, meal.slug);
			return {
				created: true,
				slug: meal.slug,
				title: meal.title,
				combines: subs.map((s) => s.title)
			};
		} catch (e) {
			if (e instanceof MealCompositionError) return { created: false, error: e.message };
			throw e;
		}
	},

	async add_recipe(raw, db) {
		const input = z
			.object({
				title: z.string(),
				slug: z.string(),
				category: z.string().optional(),
				servings: z.number().optional(),
				total_time_min: z.number().optional(),
				ingredients: z.array(NewIngredientSchema),
				directions: z.array(z.string()),
				notes: z.string().optional(),
				source_url: z.string().optional(),
				needs_review: z.boolean().optional(),
				review_reason: z.string().optional()
			})
			.parse(raw);

		const now = new Date();
		// Policy: an explicit needs_review from the agent carries its reason (or a
		// sentinel when none is given); reviewFields encodes the column pairing.
		const review = reviewFields(
			input.needs_review ? (input.review_reason ?? 'flagged_by_ai') : null
		);
		const directionIdsJson = ensureDirectionIds(input.directions);
		const sourceSnapshotJson = captureRecipeSource(
			{
				title: input.title,
				servings: input.servings ?? null,
				sourceUrl: input.source_url ?? null,
				ingredients: input.ingredients,
				directions: input.directions
			},
			{ capturedAt: now.getTime() }
		);
		const recipe = db
			.insert(schema.recipes)
			.values({
				title: input.title,
				slug: input.slug,
				category: normalizeFoodCategory(input.category),
				servings: input.servings ?? null,
				structureVersion: ingredientStructureVersion(input.ingredients),
				totalTimeMin: input.total_time_min ?? null,
				ingredients: input.ingredients,
				directions: input.directions,
				directionIdsJson,
				sourceSnapshotJson,
				notes: input.notes ?? null,
				sourceUrl: input.source_url ?? null,
				...review,
				createdAt: now,
				updatedAt: now
			})
			.returning()
			.get();
		// Ordinary cooking steps are projected directly from the saved directions.
		// Semantic planning and translation are both non-blocking caches.
		kickCookModeIfAppDb(db, recipe.slug);
		if (getAutoTranslateOnImport()) kickTranslateIfAppDb(db, recipe.slug);
		return { ok: true, slug: recipe.slug, title: recipe.title, needs_review: review.needsReview };
	},

	async add_recipe_from_url(raw, db) {
		const input = z.object({ url: z.string().url() }).parse(raw);
		let scraped;
		try {
			// Default global fetch (external URL); the scrape route passes its own.
			scraped = await scrapeRecipeFromUrl(input.url);
		} catch (err) {
			if (err instanceof RecipeIngestError) return { ok: false, error: err.message };
			return { ok: false, error: err instanceof Error ? err.message : 'Recipe ingestion failed' };
		}
		const saved = insertScrapedRecipe(db, scraped);
		return {
			ok: true,
			slug: saved.slug,
			title: saved.title,
			ingredient_count: scraped.ingredients.length,
			needs_review: saved.needsReview,
			review_reason: saved.reviewReason
		};
	},

	async edit_recipe(raw, db) {
		const input = z
			.object({
				slug: z.string(),
				servings: z.number().optional(),
				set_ingredient_roles: z
					.array(z.object({ name: z.string(), role: z.enum(['cook_in', 'serve_fresh']) }))
					.optional(),
				directions: z.array(z.string()).optional(),
				notes: z.string().optional()
			})
			.strict()
			.parse(raw);

		const recipe = db
			.select()
			.from(schema.recipes)
			.where(eq(schema.recipes.slug, input.slug))
			.get();
		if (!recipe) return { ok: false, error: 'Recipe not found' };

		const ingredients = [...(recipe.ingredients as Ingredient[])];

		// Deterministic role assignment: a name that matches exactly one ingredient sets
		// its role; a name that matches several is ambiguous → flag the recipe for review
		// instead of silently picking one (per the Codex critique). Unmatched names are
		// reported so the agent can relay rather than assume success.
		const rolesApplied: string[] = [];
		const rolesAmbiguous: string[] = [];
		const rolesUnmatched: string[] = [];
		if (input.set_ingredient_roles?.length) {
			for (const { name, role } of input.set_ingredient_roles) {
				const matchIdxs = ingredients
					.map((ing, i) => (namesMatch(name, ing.name) ? i : -1))
					.filter((i) => i >= 0);
				if (matchIdxs.length === 1) {
					ingredients[matchIdxs[0]] = { ...ingredients[matchIdxs[0]], role };
					rolesApplied.push(name);
				} else if (matchIdxs.length > 1) {
					rolesAmbiguous.push(name);
				} else {
					rolesUnmatched.push(name);
				}
			}
		}

		const updates: CanonicalRecipeUpdate = {
			ingredients,
			structureVersion: ingredientStructureVersion(ingredients)
		};
		if (input.servings !== undefined) updates.servings = input.servings;
		if (input.directions !== undefined) updates.directions = input.directions;
		if (input.notes !== undefined) updates.notes = input.notes;
		// Only flag on ambiguity — a normal edit must never clear an existing review flag.
		const ambiguousNames = [...new Set(rolesAmbiguous)];
		if (ambiguousNames.length) {
			Object.assign(
				updates,
				reviewFields(`Ambiguous ingredient match — edit manually: ${ambiguousNames.join(', ')}`)
			);
		}
		// Direction or ingredient-set changes make the cached bench sheet lie —
		// clear it and pre-generate a fresh one. Role-only edits keep the cache
		// (roles don't appear on the sheet; no need to spend a rewrite).
		const sheetStale = input.directions !== undefined;
		if (sheetStale) {
			updates.cookModeJson = null;
			updates.cookModeGeneratedAt = null;
		}
		// English fields are one cache over the complete canonical recipe. Any
		// content edit (including substitutes) invalidates the whole cache; keeping
		// a few old EN arrays beside new Dutch fields is how mixed-language recipes
		// escaped the previous agent edit path. Role-only edits are metadata and do
		// not affect translation.
		const translationStale =
			input.directions !== undefined ||
			input.notes !== undefined;
		if (translationStale) {
			updates.titleEn = null;
			updates.categoryEn = null;
			updates.cuisineEn = null;
			updates.notesEn = null;
			updates.ingredientsEn = null;
			updates.directionsEn = null;
			updates.translationStatus = recipe.language === 'en' ? 'ready' : 'pending';
			updates.translatedAt = null;
		}

		const updated = updateCanonicalRecipe(db, {
			recipeId: recipe.id,
			expectedRevision: recipe.contentRevision,
			changes: updates
		});
		if (!updated) return { ok: false, error: 'Recipe changed during the edit' };
		if ('ingredients' in updates || 'servings' in updates) reconcileShoppingAfterWrite(db);
		if (sheetStale && subRecipesOf(db, recipe.id).length > 0) {
			kickCookModeIfAppDb(db, input.slug);
		}
		return {
			ok: true,
			slug: input.slug,
			...(rolesApplied.length ? { roles_applied: rolesApplied } : {}),
			...(rolesAmbiguous.length ? { roles_ambiguous: rolesAmbiguous } : {}),
			...(rolesUnmatched.length ? { roles_unmatched: rolesUnmatched } : {}),
			...(ambiguousNames.length ? { needs_review: true } : {})
		};
	},

	async set_freezer_staple(raw, db) {
		const input = z
			.object({
				slug: z.string(),
				is_freezer_staple: z.boolean(),
				target_portions: z.number().int().min(1).max(99).optional()
			})
			.parse(raw);
		const recipe = db
			.select()
			.from(schema.recipes)
			.where(eq(schema.recipes.slug, input.slug))
			.get();
		if (!recipe) return { ok: false, error: 'Recipe not found' };

		// Through the keep-stocked seam: off records the opt-out so the next
		// freeze doesn't silently re-staple; on clears it (UX-STOCK-14).
		setFreezerStaple(db, recipe.id, input.is_freezer_staple, input.target_portions);
		return {
			ok: true,
			slug: input.slug,
			is_freezer_staple: input.is_freezer_staple,
			// Mirrors setFreezerStaple: off drops the target; on keeps the old one
			// unless a new target was sent.
			target_portions: !input.is_freezer_staple
				? null
				: (input.target_portions ?? recipe.targetPortions)
		};
	},

	async get_freezer_staples(_raw, db) {
		const onHand = frozenPortionsByRecipe(db);
		const rows = db
			.select({
				id: schema.recipes.id,
				slug: schema.recipes.slug,
				title: schema.recipes.title,
				targetPortions: schema.recipes.targetPortions
			})
			.from(schema.recipes)
			.where(eq(schema.recipes.isFreezerStaple, true))
			.all();
		return {
			freezer_staples: rows.map((r) => {
				const current = onHand.get(r.id) ?? 0;
				return {
					slug: r.slug,
					title: r.title,
					target_portions: r.targetPortions,
					on_hand_portions: current,
					below_target: r.targetPortions != null && current < r.targetPortions
				};
			})
		};
	}
};
