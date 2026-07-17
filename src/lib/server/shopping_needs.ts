// Week-needs derivation shared by the shopping page load and the
// generate_shopping_list chat executor: planned meals → the ingredient list
// the household still has to cook/buy for that week.
//
// Freezer-aware (the meal-plan ↔ freezer ↔ shopping seam): a meal planned
// with source 'freezer' is served from frozen leftover portions, so only its
// `serve_fresh`-role ingredients (the naan/rice/limes next to a frozen curry)
// go on the list. A freezer meal whose recipe has no ingredient roles at all
// can't say what needs buying fresh — it contributes nothing and is surfaced
// in `freezerMealsMissingFreshInfo` so the UI can point at the recipe instead
// of silently showing an empty (or fully duplicated) list.
//
// AH-INVARIANT: every name emitted here is the Dutch
// `recipes.ingredients[].name`; sub-recipe expansion (ADR 0003) happens via
// expandMealIngredients before any filtering.
import { inArray } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from '$lib/server/db/schema';
import type { Ingredient, MealSource } from '$lib/server/db/schema';
import { expandMealIngredients } from '$lib/server/meal_recipes';

type DB = BetterSQLite3Database<typeof schema>;

export type PlannedMealForNeeds = {
	dinner: string;
	recipeSlug: string | null;
	source: MealSource;
};

export type NeededIngredient = {
	name: string;
	amount: string;
	unit?: string;
	/** Dinner labels of the planned meals that need this item, in plan order. */
	forMeals: string[];
	/** True when only freezer-planned meals need it (it's a fresh side, not a cook-from-scratch ingredient). */
	freshSideOnly: boolean;
};

export type FreezerMealRef = { dinner: string; recipeSlug: string };

export type WeekNeeds = {
	needed: NeededIngredient[];
	/** Planned dinners with no recipe link (or whose linked recipe no longer exists). */
	mealsWithoutRecipe: string[];
	/** Meals served from the freezer this week (fresh sides only on the list). */
	freezerMeals: FreezerMealRef[];
	/** Freezer meals whose recipe has no cook_in/serve_fresh roles — the fresh sides are unknown. */
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
						ingredients: schema.recipes.ingredients
					})
					.from(schema.recipes)
					.where(inArray(schema.recipes.slug, slugs))
					.all()
			: [];
	const recipeBySlug = new Map(recipeRows.map((r) => [r.slug, r]));

	const needed = new Map<string, NeededIngredient>();
	const mealsWithoutRecipe: string[] = [];
	const freezerMeals: FreezerMealRef[] = [];
	const freezerMealsMissingFreshInfo: FreezerMealRef[] = [];

	const contribute = (ing: Ingredient, meal: PlannedMealForNeeds) => {
		const key = ing.name.toLowerCase();
		const existing = needed.get(key);
		if (existing) {
			if (!existing.forMeals.includes(meal.dinner)) existing.forMeals.push(meal.dinner);
			if (meal.source !== 'freezer') existing.freshSideOnly = false;
			return;
		}
		needed.set(key, {
			name: ing.name,
			amount: ing.amount,
			unit: ing.unit,
			forMeals: [meal.dinner],
			freshSideOnly: meal.source === 'freezer'
		});
	};

	for (const meal of meals) {
		const recipe = meal.recipeSlug ? recipeBySlug.get(meal.recipeSlug) : undefined;
		if (!recipe) {
			// A dangling slug (recipe deleted after planning) is as blind as no
			// recipe at all — surface it instead of contributing nothing silently.
			mealsWithoutRecipe.push(meal.dinner);
			continue;
		}

		const ingredients = expandMealIngredients(db, recipe);
		if (meal.source === 'freezer') {
			const ref: FreezerMealRef = { dinner: meal.dinner, recipeSlug: recipe.slug };
			freezerMeals.push(ref);
			const hasRoles = ingredients.some((ing) => ing.role === 'cook_in' || ing.role === 'serve_fresh');
			if (!hasRoles) {
				freezerMealsMissingFreshInfo.push(ref);
				continue;
			}
			for (const ing of ingredients) {
				if (ing.role === 'serve_fresh') contribute(ing, meal);
			}
			continue;
		}

		for (const ing of ingredients) contribute(ing, meal);
	}

	return {
		needed: [...needed.values()],
		mealsWithoutRecipe,
		freezerMeals,
		freezerMealsMissingFreshInfo
	};
}
