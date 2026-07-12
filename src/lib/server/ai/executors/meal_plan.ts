import { z } from 'zod';
import { eq, isNull, desc } from 'drizzle-orm';
import * as schema from '$lib/server/db/schema';
import type { Ingredient } from '$lib/server/db/schema';
import { namesMatch } from '$lib/match';
import { recordCook } from '$lib/server/cook_log';
import { dateInputValue, daysSinceDate } from '$lib/inventory_dates';
import { isoWeekStart, isoWeekNumber, offsetIsoWeek, todayIso } from '$lib/week';
import type { ExecutorFn } from './shared';

export const mealPlanExecutors: Record<string, ExecutorFn> = {
	async get_meal_plan(raw, db) {
		const input = z
			.object({
				weeks: z.number().optional(),
				week_start_date: z.string().optional()
			})
			.parse(raw);

		if (input.week_start_date) {
			const meals = db
				.select()
				.from(schema.mealPlanMeals)
				.where(eq(schema.mealPlanMeals.weekStartDate, input.week_start_date))
				.orderBy(schema.mealPlanMeals.sortOrder)
				.all();
			return { weeks: [{ week_start: input.week_start_date, meals }] };
		}

		const currentWeekStart = isoWeekStart();
		const numWeeks = input.weeks ?? 2;
		const weeks = [];
		for (let i = 0; i < numWeeks; i++) {
			const weekStart = offsetIsoWeek(currentWeekStart, i);
			const meals = db
				.select()
				.from(schema.mealPlanMeals)
				.where(eq(schema.mealPlanMeals.weekStartDate, weekStart))
				.orderBy(schema.mealPlanMeals.sortOrder)
				.all();
			weeks.push({ week_start: weekStart, week_number: isoWeekNumber(weekStart), meals });
		}
		return { weeks };
	},

	async plan_meal(raw, db) {
		const input = z
			.object({
				week_start_date: z.string(),
				dinner: z.string(),
				recipe_slug: z.string().optional(),
				note: z.string().optional()
			})
			.parse(raw);

		const existing = db
			.select({ sortOrder: schema.mealPlanMeals.sortOrder })
			.from(schema.mealPlanMeals)
			.where(eq(schema.mealPlanMeals.weekStartDate, input.week_start_date))
			.orderBy(desc(schema.mealPlanMeals.sortOrder))
			.get();
		const nextOrder = (existing?.sortOrder ?? -1) + 1;

		const meal = db
			.insert(schema.mealPlanMeals)
			.values({
				weekNumber: isoWeekNumber(input.week_start_date),
				weekStartDate: input.week_start_date,
				dinner: input.dinner,
				recipeSlug: input.recipe_slug ?? null,
				note: input.note ?? null,
				sortOrder: nextOrder,
				createdAt: new Date()
			})
			.returning()
			.get();
		return { ok: true, id: meal.id, week: input.week_start_date, dinner: meal.dinner };
	},

	async remove_meal(raw, db) {
		const input = z.object({ id: z.number() }).parse(raw);
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
			.object({ id: z.number(), cooked_date: z.string().optional() })
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
		return { ok: true, meal: meal.dinner, cooked_date: cookedDate };
	},

	async suggest_meals(raw, db) {
		const input = z
			.object({ week_start_date: z.string().optional(), count: z.number().optional() })
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
			return {
				slug: r.slug,
				title: r.title,
				category: r.category,
				rating: r.rating,
				ingredient_count: ings.length,
				inventory_overlap: matched.length,
				on_hand: matched.map((m) => m.name),
				cooked_count: r.cookedCount ?? 0,
				days_since_cooked: daysSinceCooked,
				last_cooked_date: lastCookedMs ? new Date(lastCookedMs).toISOString().slice(0, 10) : null
			};
		});

		return {
			inventory: inventoryWithAge,
			stale_inventory: staleInventory,
			recent_meals: recentMeals,
			recipes: recipesWithOverlap,
			requested_count: input.count ?? 5,
			target_week: input.week_start_date ?? isoWeekStart()
		};
	},

	async log_meal(raw, db) {
		const input = z
			.object({
				date: z.string().optional(),
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
