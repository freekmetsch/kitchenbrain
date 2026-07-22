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
import { expandMealIngredientsForServings } from '$lib/server/meal_recipes';
import { ingredientRoleCoverage } from '$lib/server/recipe_links';
import { sumCompatibleQuantities } from '$lib/recipe_scale';

type DB = BetterSQLite3Database<typeof schema>;

export type PlannedMealForNeeds = {
	dinner: string;
	recipeSlug: string | null;
	source: MealSource;
	servings?: number | null;
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
					ingredients: schema.recipes.ingredients,
					servings: schema.recipes.servings
					})
					.from(schema.recipes)
					.where(inArray(schema.recipes.slug, slugs))
					.all()
			: [];
	const recipeBySlug = new Map(recipeRows.map((r) => [r.slug, r]));

	const contributions = new Map<string, Array<{ ingredient: Ingredient; meal: PlannedMealForNeeds }>>();
	const mealsWithoutRecipe: string[] = [];
	const freezerMeals: FreezerMealRef[] = [];
	const freezerMealsMissingFreshInfo: FreezerMealRef[] = [];

	const contribute = (ing: Ingredient, meal: PlannedMealForNeeds) => {
		const key = ing.name.toLowerCase();
		const rows = contributions.get(key) ?? [];
		rows.push({ ingredient: ing, meal });
		contributions.set(key, rows);
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
		const ingredients = expandMealIngredientsForServings(db, recipe, meal.servings);
		if (meal.source === 'freezer') {
			const ref: FreezerMealRef = { dinner: meal.dinner, recipeSlug: recipe.slug };
			freezerMeals.push(ref);
			const coverage = ingredientRoleCoverage(ingredients);
			if (!coverage.complete) {
				freezerMealsMissingFreshInfo.push(ref);
			}
			for (const ing of ingredients) {
				if (ing.role === 'serve_fresh') contribute(ing, meal);
			}
			continue;
		}

		for (const ing of ingredients) contribute(ing, meal);
	}

	const needed: NeededIngredient[] = [];
	for (const rows of contributions.values()) {
		const first = rows[0].ingredient;
		const summed = sumCompatibleQuantities(rows.map(({ ingredient }) => ingredient));
		const incompatibleQuantities = rows.length > 1 && summed == null;
		const amount = summed?.amount ?? rows.map(({ ingredient }) => `${ingredient.amount}${ingredient.unit ? ` ${ingredient.unit}` : ''}`).join(' + ');
		const unit = summed?.unit;
		const forms = new Set(rows.map(({ ingredient }) => ingredient.purchaseForm).filter(Boolean));
		needed.push({
			name: first.name,
			amount,
			unit,
			forMeals: [...new Set(rows.map(({ meal }) => meal.dinner))],
			freshSideOnly: rows.every(({ meal }) => meal.source === 'freezer'),
			optional: rows.every(({ ingredient }) => ingredient.optional === true),
			suggested: rows.every(({ ingredient }) => ingredient.origin === 'ai_suggested'),
			substitutes: [...new Set(rows.flatMap(({ ingredient }) => ingredient.substitutes?.map((sub) => sub.name) ?? []))],
			purchaseForm: forms.size === 1 ? [...forms][0] : 'any',
			incompatibleQuantities
		});
	}

	return {
		needed,
		mealsWithoutRecipe,
		freezerMeals,
		freezerMealsMissingFreshInfo
	};
}
