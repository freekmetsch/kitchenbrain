import { z } from 'zod';
import { and, eq, gte, isNull, lt, desc } from 'drizzle-orm';
import * as schema from '$lib/server/db/schema';
import type { Ingredient } from '$lib/server/db/schema';
import { namesMatch } from '$lib/match';
import { recordCook } from '$lib/server/cook_log';
import { frozenPortionsByRecipe } from '$lib/server/recipe_links';
import { dateInputValue, daysSinceDate } from '$lib/inventory_dates';
import { getMealPlanPrefs, getWeekStartDay } from '$lib/server/meal_plan/prefs';
import { addDays, isoWeekNumber, todayIso, weekKeyRange, weekStartFor } from '$lib/week';
import type { ExecutorFn } from './shared';
import { isoDateSchema } from '$lib/date_schema';

export const mealPlanExecutors: Record<string, ExecutorFn> = {
	async get_meal_plan(raw, db) {
		const input = z
			.object({
				weeks: z.number().int().min(1).max(12).optional(),
				week_start_date: isoDateSchema.optional()
			})
			.parse(raw);

		const weekStartDay = getWeekStartDay(db);
		// weekKeyRange instead of key equality: meals keyed under an older
		// week-start convention still land in the week they overlap most.
		const mealsForWeek = (weekStart: string) => {
			const keyRange = weekKeyRange(weekStart);
			return db
				.select()
				.from(schema.mealPlanMeals)
				.where(
					and(
						gte(schema.mealPlanMeals.weekStartDate, keyRange.from),
						lt(schema.mealPlanMeals.weekStartDate, keyRange.to)
					)
				)
				.orderBy(schema.mealPlanMeals.sortOrder)
				.all();
		};

		if (input.week_start_date) {
			// Snap to the household's planning-week boundary so a mid-week date
			// still returns the whole week it belongs to.
			const weekStart = weekStartFor(input.week_start_date, weekStartDay);
			return { weeks: [{ week_start: weekStart, meals: mealsForWeek(weekStart) }] };
		}

		const currentWeekStart = weekStartFor(todayIso(), weekStartDay);
		const numWeeks = input.weeks ?? 2;
		const weeks = [];
		for (let i = 0; i < numWeeks; i++) {
			const weekStart = addDays(currentWeekStart, i * 7);
			weeks.push({ week_start: weekStart, week_number: isoWeekNumber(weekStart), meals: mealsForWeek(weekStart) });
		}
		return { weeks };
	},

	async plan_meal(raw, db) {
		const input = z
			.object({
				week_start_date: isoDateSchema,
				dinner: z.string(),
				recipe_slug: z.string().optional(),
				source: z.enum(['fresh', 'freezer']).optional(),
				note: z.string().optional()
			})
			.parse(raw);

		// Same rule as POST /api/meal-plan: freezer service needs a recipe link
		// to resolve the frozen portions and the serve_fresh sides.
		if (input.source === 'freezer' && !input.recipe_slug) {
			return { ok: false, error: 'source=freezer requires recipe_slug (frozen portions are linked through the recipe)' };
		}

		// Same normalization as POST /api/meal-plan: any date inside the week
		// files the meal under the household's planning-week start.
		const weekStartDate = weekStartFor(input.week_start_date, getWeekStartDay(db));

		const existing = db
			.select({ sortOrder: schema.mealPlanMeals.sortOrder })
			.from(schema.mealPlanMeals)
			.where(eq(schema.mealPlanMeals.weekStartDate, weekStartDate))
			.orderBy(desc(schema.mealPlanMeals.sortOrder))
			.get();
		const nextOrder = (existing?.sortOrder ?? -1) + 1;

		const meal = db
			.insert(schema.mealPlanMeals)
			.values({
				weekNumber: isoWeekNumber(weekStartDate),
				weekStartDate,
				dinner: input.dinner,
				recipeSlug: input.recipe_slug ?? null,
				source: input.source ?? 'fresh',
				note: input.note ?? null,
				sortOrder: nextOrder,
				createdAt: new Date()
			})
			.returning()
			.get();
		return { ok: true, id: meal.id, week: weekStartDate, dinner: meal.dinner, source: meal.source };
	},

	async remove_meal(raw, db) {
		const input = z.object({ id: z.number().int().positive() }).parse(raw);
		const meal = db
			.select()
			.from(schema.mealPlanMeals)
			.where(eq(schema.mealPlanMeals.id, input.id))
			.get();
		if (!meal) return { ok: false, error: 'Meal not found' };
		db.delete(schema.mealPlanMeals).where(eq(schema.mealPlanMeals.id, input.id)).run();
		return { ok: true, removed: meal.dinner };
	},

	async mark_meal_cooked(raw, db) {
		const input = z
			.object({ id: z.number().int().positive(), cooked_date: isoDateSchema.optional() })
			.parse(raw);
		const cookedDate = input.cooked_date ?? todayIso();
		const meal = db
			.update(schema.mealPlanMeals)
			.set({ status: 'cooked', cookedDate })
			.where(eq(schema.mealPlanMeals.id, input.id))
			.returning()
			.get();
		if (!meal) return { ok: false, error: 'Meal not found' };
		recordCook(db, {
			recipeSlug: meal.recipeSlug,
			cookedDate,
			source: 'plan',
			mealPlanMealId: meal.id
		});
		if (meal.source === 'freezer' && meal.recipeSlug) {
			// Keep the freezer honest: this meal was served from stocked portions.
			return {
				ok: true,
				meal: meal.dinner,
				cooked_date: cookedDate,
				note: `This meal was served from the freezer. Ask how many portions were eaten and deduct them from the leftover linked to recipe '${meal.recipeSlug}' (update_inventory_item, or remove_from_inventory when none are left).`
			};
		}
		return { ok: true, meal: meal.dinner, cooked_date: cookedDate };
	},

	async suggest_meals(raw, db) {
		const input = z
			.object({ week_start_date: isoDateSchema.optional(), count: z.number().int().min(1).max(10).optional() })
			.parse(raw);

		const inventory = db
			.select({
				name: schema.inventoryItems.name,
				qty: schema.inventoryItems.qtyText,
				section: schema.inventoryItems.section,
				category: schema.inventoryItems.category,
				expiryDate: schema.inventoryItems.expiryDate,
				createdAt: schema.inventoryItems.createdAt
			})
			.from(schema.inventoryItems)
			.where(isNull(schema.inventoryItems.deletedAt))
			.all();
		const inventoryWithAge = inventory.map((item) => ({
			...item,
			added_date: dateInputValue(item.createdAt),
			days_in_inventory: daysSinceDate(item.createdAt)
		}));
		const staleInventory = inventoryWithAge
			.filter((item) => (item.days_in_inventory ?? 0) >= 30)
			.sort((a, b) => (b.days_in_inventory ?? 0) - (a.days_in_inventory ?? 0))
			.slice(0, 20);

		const recentMeals = db
			.select({ date: schema.mealLog.date, slug: schema.mealLog.recipeSlug, notes: schema.mealLog.notes })
			.from(schema.mealLog)
			.orderBy(desc(schema.mealLog.date))
			.limit(20)
			.all();

		const recipeList = db
			.select({
				id: schema.recipes.id,
				slug: schema.recipes.slug,
				title: schema.recipes.title,
				category: schema.recipes.category,
				rating: schema.recipes.rating,
				ingredients: schema.recipes.ingredients,
				lastCookedAt: schema.recipes.lastCookedAt,
				cookedCount: schema.recipes.cookedCount
			})
			.from(schema.recipes)
			.orderBy(desc(schema.recipes.rating))
			.limit(60)
			.all();

		// Freezer awareness: frozen portions on hand per recipe, so suggestions
		// can plan "serve from freezer" meals (source=freezer in plan_meal) that
		// only need fresh sides bought.
		const frozenPortions = frozenPortionsByRecipe(db);

		const now = Date.now();
		const DAY_MS = 86_400_000;

		// Annotate each recipe with inventory overlap (less shopping) and rotation
		// signals (days since cooked, total cooked count) so the model can avoid
		// repeats and surface neglected recipes.
		const recipesWithOverlap = recipeList.map((r) => {
			const ings = (r.ingredients as Ingredient[]) ?? [];
			const matched = ings.filter((ing) => inventory.some((inv) => namesMatch(ing.name, inv.name)));
			const lastCookedMs = r.lastCookedAt instanceof Date ? r.lastCookedAt.getTime() : null;
			const daysSinceCooked = lastCookedMs ? Math.floor((now - lastCookedMs) / DAY_MS) : null;
			const roles = ings.filter((ing) => ing.role === 'serve_fresh');
			const hasRoles = ings.some((ing) => ing.role === 'cook_in' || ing.role === 'serve_fresh');
			const frozen = frozenPortions.get(r.id) ?? 0;
			return {
				slug: r.slug,
				title: r.title,
				category: r.category,
				rating: r.rating,
				ingredient_count: ings.length,
				inventory_overlap: matched.length,
				on_hand: matched.map((m) => m.name),
				frozen_portions_on_hand: frozen,
				// What still needs making/buying fresh if served from the freezer;
				// null = the recipe has no roles yet, so the fresh sides are unknown.
				fresh_sides_if_from_freezer: frozen > 0 ? (hasRoles ? roles.map((ing) => ing.name) : null) : undefined,
				cooked_count: r.cookedCount ?? 0,
				days_since_cooked: daysSinceCooked,
				last_cooked_date: lastCookedMs ? new Date(lastCookedMs).toISOString().slice(0, 10) : null
			};
		});

		// Household rotation prefs (Settings → Meal planning): the repeat-cycle
		// window plus an explicit avoid list so the model doesn't have to derive
		// it from days_since_cooked itself.
		const prefs = getMealPlanPrefs(db);
		const avoidRepeats =
			prefs.repeatCycleDays > 0
				? recipesWithOverlap
						.filter((r) => r.days_since_cooked != null && r.days_since_cooked < prefs.repeatCycleDays)
						.map((r) => r.title)
				: [];

		return {
			inventory: inventoryWithAge,
			stale_inventory: staleInventory,
			recent_meals: recentMeals,
			recipes: recipesWithOverlap,
			requested_count: input.count ?? prefs.suggestCount,
			repeat_cycle_days: prefs.repeatCycleDays,
			avoid_recipes_cooked_recently: avoidRepeats,
			target_week: input.week_start_date ?? weekStartFor(todayIso(), prefs.weekStartDay)
		};
	},

	async log_meal(raw, db) {
		const input = z
			.object({
				date: isoDateSchema.optional(),
				recipe_slug: z.string().optional(),
				meal_name: z.string().optional(),
				rating: z.number().min(1).max(5).optional(),
				notes: z.string().optional()
			})
			.parse(raw);

		const entry = db
			.insert(schema.mealLog)
			.values({
				date: input.date ?? todayIso(),
				recipeSlug: input.recipe_slug ?? null,
				notes: input.meal_name
					? `${input.meal_name}${input.notes ? ': ' + input.notes : ''}`
					: (input.notes ?? null),
				rating: input.rating ?? null,
				createdAt: new Date()
			})
			.returning()
			.get();
		return { ok: true, id: entry.id };
	}
};
