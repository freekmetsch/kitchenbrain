import { z } from 'zod';
import type { Ingredient } from '$lib/recipe_ingredient';
import { foodCategoryMatches } from '$lib/food_categories';
import {
	scrapeRecipeFromUrl,
	insertScrapedRecipe,
	RecipeIngestError
} from '$lib/server/ai/recipe_ingest';
import {
	listFreezerStaples,
	setFreezerStaple
} from '$lib/server/domains/inventory/freezer';
import {
	createCanonicalRecipe,
	createMealRecipe,
	findRecipeByTitle,
	getRecipeBySlug,
	getRecipesBySlugs,
	ingredientStructureVersion,
	listRecipes,
	MealCompositionError,
	reviewFields,
	updateCanonicalRecipe,
} from '$lib/server/domains/recipes';
import { getAutoTranslateOnImport } from '$lib/server/recipes/prefs';
import type { DB, ExecutorFn } from './shared';
import { NewIngredientSchema } from '$lib/recipe_ingredient';
import { reconcileShoppingAfterWrite } from '$lib/server/workflows/reconcile-shopping';
import { kickTranslationForDb } from '$lib/server/workflows/recipe-background';
import {
	RecipePatchContractError,
	stageRecipePatch
} from '$lib/server/ai/recipe_patch';
import { PreconditionConflictError } from '$lib/server/domains/inventory/commands';
import { ContractError } from '$lib/server/ai/turn_safety';

// Same app-db guard, for the auto-translate-on-import toggle (Phase 4) —
// translateRecipe also reads the module-level app DB.
function kickTranslateIfAppDb(db: DB, slug: string) {
	kickTranslationForDb(db, slug);
}

export const recipeExecutors: Record<string, ExecutorFn> = {
	async propose_recipe_patch(raw, db, userId, _precondition, turnSafety) {
		const input = z
			.object({
				slug: z.string(),
				operations: z.array(z.unknown()).max(30).optional().default([]),
				product_choices: z.array(z.unknown()).max(10).optional().default([])
			})
			.strict()
			.refine(
				(value) => value.operations.length > 0 || value.product_choices.length > 0,
				'Provide recipe operations and/or product choices'
			)
			.parse(raw);
		const recipe = getRecipeBySlug(db, input.slug);
		if (!recipe) return { ok: false, error: 'Recipe not found' };
		let proposal;
		try {
			proposal = stageRecipePatch(recipe, {
				userId,
				operations: input.operations,
				productChoices: input.product_choices,
				evidence: (key) => turnSafety?.ahEvidence.get(key),
				replacement: turnSafety?.recipeChoiceReplacement
			});
		} catch (error) {
			if (error instanceof RecipePatchContractError) {
				throw new ContractError(error.code, error.message);
			}
			throw error;
		}
		return { ok: true, kind: 'recipe_patch', ...proposal };
	},
	async get_recipe(raw, db) {
		const input = z
			.object({ slug: z.string().optional(), name: z.string().optional() })
			.parse(raw);

		const recipe = input.slug
			? getRecipeBySlug(db, input.slug)
			: input.name
				? findRecipeByTitle(db, input.name)
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

		let results = listRecipes(db);
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
		const subs = getRecipesBySlugs(db, input.sub_recipe_slugs);
		const missing = input.sub_recipe_slugs.filter((s) => !subs.some((r) => r.slug === s));
		if (missing.length) {
			return { created: false, error: `Recipes not found: ${missing.join(', ')}` };
		}
		try {
			const meal = createMealRecipe(db, {
				title: input.title,
				subRecipeIds: subs.map((s) => s.id)
			});
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

		// Policy: an explicit needs_review from the agent carries its reason (or a
		// sentinel when none is given); reviewFields encodes the column pairing.
		const review = reviewFields(
			input.needs_review ? (input.review_reason ?? 'flagged_by_ai') : null
		);
		const recipe = createCanonicalRecipe(db, {
			title: input.title,
			slug: input.slug,
			category: input.category,
			servings: input.servings,
			totalTimeMin: input.total_time_min,
			ingredients: input.ingredients,
			directions: input.directions,
			notes: input.notes,
			sourceUrl: input.source_url,
			reviewReason: review.reviewReason
		});
		// Ordinary cooking steps are projected directly from the saved directions.
		// Translation remains an optional non-blocking cache; cooking details are explicit.
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

	async edit_recipe(raw, db, _userId, _precondition, turnSafety) {
		const input = z
			.object({
				slug: z.string(),
				set_ingredient_roles: z
					.array(
						z.object({
							ingredient_id: z.string().trim().min(1),
							role: z.enum(['cook_in', 'serve_fresh'])
						})
					)
					.min(1)
					.max(50)
			})
			.strict()
			.parse(raw);

		const recipe = getRecipeBySlug(db, input.slug);
		if (!recipe) return { ok: false, error: 'Recipe not found' };
		const observedRevision =
			turnSafety?.recipesBySlug.get(input.slug)?.revision ?? recipe.contentRevision;
		if (recipe.contentRevision !== observedRevision) {
			throw new PreconditionConflictError('Recipe changed after it was read.');
		}

		const ingredients = [...(recipe.ingredients as Ingredient[])];

		// Role writes target migration-backed stable IDs. Names are display data
		// and can be duplicated, translated, or edited without changing identity.
		const rolesApplied: string[] = [];
		const rolesUnmatched: string[] = [];
		const rolesUnchanged: string[] = [];
		for (const { ingredient_id, role } of input.set_ingredient_roles) {
			const index = ingredients.findIndex((ingredient) => ingredient.id === ingredient_id);
			if (index < 0) {
				rolesUnmatched.push(ingredient_id);
				continue;
			}
			const ingredient = ingredients[index];
			if (ingredient.role === role) {
				rolesUnchanged.push(ingredient.name);
				continue;
			}
			ingredients[index] = { ...ingredient, role };
			rolesApplied.push(ingredient.name);
		}

		if (rolesApplied.length === 0) {
			return {
				ok: false,
				unchanged: true,
				error:
					rolesUnmatched.length > 0
						? 'No ingredient role changed because none of the supplied IDs belong to this recipe.'
						: 'No ingredient role changed; the selected roles were already set.',
				...(rolesUnmatched.length ? { roles_unmatched: rolesUnmatched } : {}),
				...(rolesUnchanged.length ? { roles_unchanged: rolesUnchanged } : {})
			};
		}

		const updated = db.transaction((tx) => {
			const changed = updateCanonicalRecipe(tx, {
				recipeId: recipe.id,
				expectedRevision: observedRevision,
				changes: {
					ingredients,
					structureVersion: ingredientStructureVersion(ingredients)
				}
			});
			if (changed) reconcileShoppingAfterWrite(tx);
			return changed;
		});
		if (!updated) throw new PreconditionConflictError('Recipe changed during the edit.');
		return {
			ok: true,
			slug: input.slug,
			...(rolesApplied.length ? { roles_applied: rolesApplied } : {}),
			...(rolesUnmatched.length ? { roles_unmatched: rolesUnmatched } : {}),
			...(rolesUnchanged.length ? { roles_unchanged: rolesUnchanged } : {})
		};
	},

	async set_freezer_staple(raw, db, _userId, _precondition, turnSafety) {
		const input = z
			.object({
				slug: z.string(),
				is_freezer_staple: z.boolean(),
				target_portions: z.number().int().min(1).max(99).optional()
			})
			.parse(raw);
		const recipe = getRecipeBySlug(db, input.slug);
		if (!recipe) return { ok: false, error: 'Recipe not found' };
		const observedRevision =
			turnSafety?.recipesBySlug.get(input.slug)?.revision ?? recipe.contentRevision;

		// Through the keep-stocked seam: off records the opt-out so the next
		// freeze doesn't silently re-staple; on clears it (UX-STOCK-14).
		db.transaction((tx) => {
			const current = getRecipeBySlug(tx, input.slug);
			if (!current || current.contentRevision !== observedRevision) {
				throw new PreconditionConflictError('Recipe changed after it was read.');
			}
			setFreezerStaple(
				tx,
				recipe.id,
				input.is_freezer_staple,
				input.target_portions
			);
		});
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
		return { freezer_staples: listFreezerStaples(db) };
	}
};
