// Week-needs derivation shared by the shopping page load and the
// generate_shopping_list chat executor: planned meals → the ingredient list
// the household still has to cook/buy for that week.
//
// Freezer-aware (the meal-plan ↔ freezer ↔ shopping seam): a meal planned
// with source 'freezer' is served from frozen leftover portions, so only its
// `serve_fresh`-role ingredients (the naan/rice/limes next to a frozen curry)
// go on the list. A freezer meal with incomplete ingredient roles can't say
// whether its unknown ingredients are fresh sides. Known `serve_fresh` items
// still contribute, and the meal is surfaced in `freezerMealsMissingFreshInfo`
// so the UI can point at the recipe instead of implying the list is complete.
//
// AH-INVARIANT: every name emitted here is the Dutch
// `recipes.ingredients[].name`; sub-recipe expansion (ADR 0003) happens via
// expandMealIngredients before any filtering.
import { inArray } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from '$lib/server/db/schema';
import type { Ingredient, MealSource } from '$lib/server/db/schema';
import { expandMealIngredientSourcesForServings } from '$lib/server/meal_recipes';
import { ingredientRoleCoverage } from '$lib/server/recipe_links';
import { sumCompatibleQuantities } from '$lib/recipe_scale';

type DB = BetterSQLite3Database<typeof schema>;

export type PlannedMealForNeeds = {
	id?: number;
	dinner: string;
	recipeSlug: string | null;
	source: MealSource;
	servings?: number | null;
};

export type ShoppingSourceRef = {
	key: `recipe:${number}:${string}`;
	recipeId: number;
	recipeSlug: string;
	ingredientId: string;
	mealIds: number[];
};

export type ShoppingSourceContribution = {
	ref: ShoppingSourceRef;
	name: string;
	amount: string;
	unit?: string;
	component: string | null;
	forMeals: string[];
	freshSideOnly: boolean;
	optional: boolean;
	suggested: boolean;
	substitutes: string[];
	purchaseForm: Ingredient['purchaseForm'];
	incompatibleQuantities: boolean;
};

export type NeededIngredient = {
	name: string;
	amount: string;
	unit?: string;
	/** Dinner labels of the planned meals that need this item, in plan order. */
	forMeals: string[];
	/** True when only freezer-planned meals need it (it's a fresh side, not a cook-from-scratch ingredient). */
	freshSideOnly: boolean;
	optional: boolean;
	suggested: boolean;
	substitutes: string[];
	purchaseForm: Ingredient['purchaseForm'];
	/** True when matching names used units that cannot safely be summed. */
	incompatibleQuantities: boolean;
	/** Exact leaf-recipe ingredients that make up this final buy row. */
	sources: ShoppingSourceContribution[];
};

export type FreezerMealRef = { dinner: string; recipeSlug: string };

export type WeekNeeds = {
	needed: NeededIngredient[];
	/** Planned dinners with no recipe link (or whose linked recipe no longer exists). */
	mealsWithoutRecipe: string[];
	/** Meals served from the freezer this week (fresh sides only on the list). */
	freezerMeals: FreezerMealRef[];
	/** Freezer meals whose recipe role coverage is incomplete — some fresh sides may be unknown. */
	freezerMealsMissingFreshInfo: FreezerMealRef[];
};

export function deriveWeekNeeds(db: DB, meals: PlannedMealForNeeds[]): WeekNeeds {
	const slugs = [...new Set(meals.filter((m) => m.recipeSlug).map((m) => m.recipeSlug!))];
	const recipeRows =
		slugs.length > 0
			? db
					.select({
						id: schema.recipes.id,
						slug: schema.recipes.slug,
						title: schema.recipes.title,
						ingredients: schema.recipes.ingredients,
						servings: schema.recipes.servings
					})
					.from(schema.recipes)
					.where(inArray(schema.recipes.slug, slugs))
					.all()
			: [];
	const recipeBySlug = new Map(recipeRows.map((r) => [r.slug, r]));

	const rawContributions: Array<{
		source: ReturnType<typeof expandMealIngredientSourcesForServings>[number];
		meal: PlannedMealForNeeds;
	}> = [];
	const mealsWithoutRecipe: string[] = [];
	const freezerMeals: FreezerMealRef[] = [];
	const freezerMealsMissingFreshInfo: FreezerMealRef[] = [];

	const contribute = (
		source: ReturnType<typeof expandMealIngredientSourcesForServings>[number],
		meal: PlannedMealForNeeds
	) => {
		rawContributions.push({ source, meal });
	};

	for (const meal of meals) {
		const recipe = meal.recipeSlug ? recipeBySlug.get(meal.recipeSlug) : undefined;
		if (!recipe) {
			// A dangling slug (recipe deleted after planning) is as blind as no
			// recipe at all — surface it instead of contributing nothing silently.
			mealsWithoutRecipe.push(meal.dinner);
			continue;
		}

		// The shared projection is the only place a plan occasion changes recipe
		// quantities. Composite children are each projected from their own yield.
		const ingredients = expandMealIngredientSourcesForServings(db, recipe, meal.servings);
		if (meal.source === 'freezer') {
			const ref: FreezerMealRef = { dinner: meal.dinner, recipeSlug: recipe.slug };
			freezerMeals.push(ref);
			const coverage = ingredientRoleCoverage(ingredients.map((row) => row.ingredient));
			if (!coverage.complete) {
				freezerMealsMissingFreshInfo.push(ref);
			}
			for (const source of ingredients) {
				if (source.ingredient.role === 'serve_fresh') contribute(source, meal);
			}
			continue;
		}

		for (const source of ingredients) contribute(source, meal);
	}

	const sourceRows = new Map<string, typeof rawContributions>();
	for (const row of rawContributions) {
		const key = `recipe:${row.source.ownerRecipeId}:${row.source.ingredientId}`;
		const rows = sourceRows.get(key) ?? [];
		rows.push(row);
		sourceRows.set(key, rows);
	}

	const sources: ShoppingSourceContribution[] = [];
	for (const [key, rows] of sourceRows) {
		const first = rows[0].source;
		const ingredients = rows.map((row) => row.source.ingredient);
		const summed = sumCompatibleQuantities(ingredients);
		const incompatibleQuantities = rows.length > 1 && summed == null;
		sources.push({
			ref: {
				key: key as ShoppingSourceRef['key'],
				recipeId: first.ownerRecipeId,
				recipeSlug: first.ownerRecipeSlug,
				ingredientId: first.ingredientId,
				mealIds: [...new Set(rows.flatMap(({ meal }) => (meal.id == null ? [] : [meal.id])))]
			},
			name: first.ingredient.name,
			amount:
				summed?.amount ??
				ingredients
					.map((ingredient) => `${ingredient.amount}${ingredient.unit ? ` ${ingredient.unit}` : ''}`)
					.join(' + '),
			unit: summed?.unit,
			component: first.component,
			forMeals: [...new Set(rows.map(({ meal }) => meal.dinner))],
			freshSideOnly: rows.every(({ meal }) => meal.source === 'freezer'),
			optional: rows.every(({ source }) => source.ingredient.optional === true),
			suggested: rows.every(({ source }) => source.ingredient.origin === 'ai_suggested'),
			substitutes: [
				...new Set(
					rows.flatMap(
						({ source }) => source.ingredient.substitutes?.map((substitute) => substitute.name) ?? []
					)
				)
			],
			purchaseForm: first.ingredient.purchaseForm,
			incompatibleQuantities
		});
	}

	const contributions = new Map<string, ShoppingSourceContribution[]>();
	for (const source of sources) {
		const key = source.name.toLowerCase();
		const rows = contributions.get(key) ?? [];
		rows.push(source);
		contributions.set(key, rows);
	}

	const needed: NeededIngredient[] = [];
	for (const rows of contributions.values()) {
		const first = rows[0];
		const summed = sumCompatibleQuantities(rows);
		const incompatibleQuantities = rows.length > 1 && summed == null;
		const amount =
			summed?.amount ?? rows.map((source) => `${source.amount}${source.unit ? ` ${source.unit}` : ''}`).join(' + ');
		const unit = summed?.unit;
		const forms = new Set(rows.map((source) => source.purchaseForm).filter(Boolean));
		needed.push({
			name: first.name,
			amount,
			unit,
			forMeals: [...new Set(rows.flatMap((source) => source.forMeals))],
			freshSideOnly: rows.every((source) => source.freshSideOnly),
			optional: rows.every((source) => source.optional),
			suggested: rows.every((source) => source.suggested),
			substitutes: [...new Set(rows.flatMap((source) => source.substitutes))],
			purchaseForm: forms.size === 1 ? [...forms][0] : 'any',
			incompatibleQuantities,
			sources: rows
		});
	}

	return {
		needed,
		mealsWithoutRecipe,
		freezerMeals,
		freezerMealsMissingFreshInfo
	};
}
