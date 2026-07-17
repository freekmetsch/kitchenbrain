// Household-wide meal-planning settings: where the planning week starts
// ("plan from delivery to delivery"), which day groceries arrive, how far
// ahead the plan looks, whether meals get pinned to specific days, and how
// AI suggestions rotate recipes. Same household_prefs resolution as
// recipes/prefs.ts — none of these knobs has a Railway env-var layer, so
// precedence collapses to household_prefs → hardcoded default.
import { db as appDb } from '$lib/server/db/index';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from '$lib/server/db/schema';
import { getHouseholdPref, setHouseholdPref } from '$lib/server/db/household_prefs';

type DB = BetterSQLite3Database<typeof schema>;

export const K_WEEK_START_DAY = 'mealplan.week_start_day';
export const K_GROCERY_DAY = 'mealplan.grocery_day';
export const K_PLAN_AHEAD_WEEKS = 'mealplan.plan_ahead_weeks';
export const K_DAY_PLANNING = 'mealplan.day_planning';
export const K_REPEAT_CYCLE_DAYS = 'mealplan.repeat_cycle_days';
export const K_SUGGEST_COUNT = 'mealplan.suggest_count';

export type MealPlanPrefs = {
	/** 0 = Monday … 6 = Sunday; first day of the planning week. */
	weekStartDay: number;
	/** 0 = Monday … 6 = Sunday, or null when no delivery day is set. */
	groceryDay: number | null;
	/** How many week cards the meal plan shows ahead (incl. the current one). */
	planAheadWeeks: number;
	/** Pin meals to specific days of the week (off = a per-week pool). */
	dayPlanning: boolean;
	/** Suggestions avoid recipes cooked within this many days; 0 = no limit. */
	repeatCycleDays: number;
	/** How many meals one "Suggest" round asks for. */
	suggestCount: number;
};

export const MEAL_PLAN_PREF_DEFAULTS: MealPlanPrefs = {
	weekStartDay: 0,
	groceryDay: null,
	planAheadWeeks: 4,
	dayPlanning: false,
	repeatCycleDays: 14,
	suggestCount: 5
};

// Every accessor clamps to a known-good value: a malformed household_prefs row
// must never crash Settings or a page load (same contract as recipes/prefs.ts).
function intInRange(raw: string | null, min: number, max: number, fallback: number): number {
	if (raw == null) return fallback;
	const n = Number.parseInt(raw, 10);
	return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
}

// Executors receive their own db handle (test dbs in vitest), so every getter
// takes an optional db and defaults to the app database.
export function getWeekStartDay(db: DB = appDb): number {
	return intInRange(getHouseholdPref(db, K_WEEK_START_DAY), 0, 6, MEAL_PLAN_PREF_DEFAULTS.weekStartDay);
}

export function getGroceryDay(db: DB = appDb): number | null {
	const raw = getHouseholdPref(db, K_GROCERY_DAY);
	if (raw == null || raw === 'none') return null;
	const n = Number.parseInt(raw, 10);
	return Number.isInteger(n) && n >= 0 && n <= 6 ? n : null;
}

export function getPlanAheadWeeks(db: DB = appDb): number {
	return intInRange(getHouseholdPref(db, K_PLAN_AHEAD_WEEKS), 1, 8, MEAL_PLAN_PREF_DEFAULTS.planAheadWeeks);
}

export function getDayPlanning(db: DB = appDb): boolean {
	const raw = getHouseholdPref(db, K_DAY_PLANNING);
	if (raw === 'true') return true;
	if (raw === 'false') return false;
	return MEAL_PLAN_PREF_DEFAULTS.dayPlanning;
}

export function getRepeatCycleDays(db: DB = appDb): number {
	return intInRange(getHouseholdPref(db, K_REPEAT_CYCLE_DAYS), 0, 365, MEAL_PLAN_PREF_DEFAULTS.repeatCycleDays);
}

export function getSuggestCount(db: DB = appDb): number {
	return intInRange(getHouseholdPref(db, K_SUGGEST_COUNT), 1, 10, MEAL_PLAN_PREF_DEFAULTS.suggestCount);
}

export function getMealPlanPrefs(db: DB = appDb): MealPlanPrefs {
	return {
		weekStartDay: getWeekStartDay(db),
		groceryDay: getGroceryDay(db),
		planAheadWeeks: getPlanAheadWeeks(db),
		dayPlanning: getDayPlanning(db),
		repeatCycleDays: getRepeatCycleDays(db),
		suggestCount: getSuggestCount(db)
	};
}

export function setWeekStartDay(day: number, db: DB = appDb): void {
	setHouseholdPref(db, K_WEEK_START_DAY, String(day));
}

// 'none' (not a deleted row) so clearing the delivery day is an explicit,
// exportable choice rather than indistinguishable from "never configured".
export function setGroceryDay(day: number | null, db: DB = appDb): void {
	setHouseholdPref(db, K_GROCERY_DAY, day == null ? 'none' : String(day));
}

export function setPlanAheadWeeks(weeks: number, db: DB = appDb): void {
	setHouseholdPref(db, K_PLAN_AHEAD_WEEKS, String(weeks));
}

export function setDayPlanning(enabled: boolean, db: DB = appDb): void {
	setHouseholdPref(db, K_DAY_PLANNING, String(enabled));
}

export function setRepeatCycleDays(days: number, db: DB = appDb): void {
	setHouseholdPref(db, K_REPEAT_CYCLE_DAYS, String(days));
}

export function setSuggestCount(count: number, db: DB = appDb): void {
	setHouseholdPref(db, K_SUGGEST_COUNT, String(count));
}
