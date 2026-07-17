// Bootstrap-mode data import for Settings → Data (FEATURE_LIST_SETTINGS_MENU.md
// Phase 3). Only ever inserts into an already-empty set of tables — there is no
// full-replace-over-live-data path (cut post-critique; reset + this compose into
// it). Two-phase by design: validateImportFile() must pass before any DB access
// (Correctness Req #2), then importBootstrap() re-checks emptiness inside the
// same sync transaction that performs the inserts (Correctness Req #3) — the
// eligibility check can never run outside the transaction that acts on it.
import { z } from 'zod';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from '$lib/server/db/schema';
import { rowCount } from '$lib/server/settings/reset';

type DB = BetterSQLite3Database<typeof schema>;

// Export serializes Date columns via JSON.stringify → ISO strings; drizzle's
// `mode: 'timestamp'` insert columns expect real Date objects (verified fact,
// FEATURE_LIST_SETTINGS_MENU.md Phase 3) — every timestamp field must coerce
// through this, which also gives us the "timestamp parseability" validation.
const zTimestamp = z
	.string()
	.refine((s) => !Number.isNaN(Date.parse(s)), { message: 'Invalid timestamp' })
	.transform((s) => new Date(s));
const zTimestampOrNull = z.union([zTimestamp, z.null()]);

const InventoryItemImport = z.object({
	id: z.number().int(),
	name: z.string().min(1),
	qtyText: z.string().nullable(),
	qtyNum: z.number().nullable(),
	unit: z.string().nullable(),
	section: z.enum(['freezer', 'pantry']),
	category: z.string().nullable(),
	kind: z.enum(['ingredient', 'leftover', 'processed']).nullable(),
	foodClass: z.string().nullable(),
	madeFromRecipeId: z.number().int().nullable(),
	recipeStatus: z.enum(['linked', 'plan_to_add', 'no_recipe']).nullable(),
	recipeStatusAt: zTimestampOrNull,
	needsReview: z.boolean(),
	reviewReason: z.string().nullable(),
	isStaple: z.boolean(),
	expiryDate: z.string().nullable(),
	tags: z
		.array(z.string())
		.nullable()
		.transform((v) => v ?? []),
	createdAt: zTimestamp,
	updatedAt: zTimestamp,
	deletedAt: zTimestampOrNull
});

const IngredientImport = z.object({
	name: z.string(),
	amount: z.string(),
	unit: z.string().optional(),
	role: z.enum(['cook_in', 'serve_fresh']).optional()
});

const RecipeImport = z.object({
	id: z.number().int(),
	slug: z.string().min(1),
	title: z.string().min(1),
	category: z.string().nullable(),
	tags: z
		.array(z.string())
		.nullable()
		.transform((v) => v ?? []),
	servings: z.number().int().nullable(),
	totalTimeMin: z.number().int().nullable(),
	sourceUrl: z.string().nullable(),
	imageUrl: z.string().nullable(),
	ingredients: z.array(IngredientImport),
	directions: z.array(z.string()),
	notes: z.string().nullable(),
	rating: z.number().int().nullable(),
	cuisine: z.string().nullable(),
	language: z.string().nullable(),
	titleEn: z.string().nullable(),
	categoryEn: z.string().nullable(),
	cuisineEn: z.string().nullable(),
	notesEn: z.string().nullable(),
	ingredientsEn: z.array(z.object({ name: z.string() })).nullable(),
	directionsEn: z.array(z.string()).nullable(),
	translationStatus: z.enum(['pending', 'ready', 'error']),
	translatedAt: zTimestampOrNull,
	lastCookedAt: zTimestampOrNull,
	cookedCount: z.number().int(),
	cookModeJson: z.any().nullable(),
	cookModeGeneratedAt: zTimestampOrNull,
	isFreezerStaple: z.boolean(),
	targetPortions: z.number().int().nullable(),
	freezerStapleOptOut: z.boolean(),
	needsReview: z.boolean(),
	reviewReason: z.string().nullable(),
	createdAt: zTimestamp,
	updatedAt: zTimestamp
});

const MealPlanMealImport = z.object({
	id: z.number().int(),
	weekNumber: z.number().int(),
	weekStartDate: z.string(),
	dinner: z.string(),
	recipeSlug: z.string().nullable(),
	status: z.enum(['planned', 'cooked']),
	cookedDate: z.string().nullable(),
	// default(null) keeps pre-day-planning export files importable.
	plannedDate: z.string().nullable().default(null),
	note: z.string().nullable(),
	sortOrder: z.number().int(),
	createdAt: zTimestamp
});

const MealLogImport = z.object({
	id: z.number().int(),
	date: z.string(),
	recipeSlug: z.string().nullable(),
	rating: z.number().int().nullable(),
	notes: z.string().nullable(),
	createdAt: zTimestamp
});

const MealSubRecipeImport = z.object({
	id: z.number().int(),
	mealRecipeId: z.number().int(),
	subRecipeId: z.number().int(),
	sortOrder: z.number().int(),
	createdAt: zTimestamp
});

const ImportFileSchema = z.object({
	exported_at: z.string().optional(),
	inventory: z.array(InventoryItemImport).default([]),
	recipes: z.array(RecipeImport).default([]),
	meal_plan: z.array(MealPlanMealImport).default([]),
	meal_log: z.array(MealLogImport).default([]),
	meal_sub_recipes: z.array(MealSubRecipeImport).default([])
});

export type ImportFileData = z.infer<typeof ImportFileSchema>;

export type ImportValidation = { ok: true; data: ImportFileData } | { ok: false; error: string };

function firstDuplicate<T>(items: T[], keyOf: (item: T) => string | number): string | number | null {
	const seen = new Set<string | number>();
	for (const item of items) {
		const key = keyOf(item);
		if (seen.has(key)) return key;
		seen.add(key);
	}
	return null;
}

/**
 * Shape + intra-file uniqueness + referential-integrity checks — everything
 * that must hold before a single row is written (Correctness Req #2). Zero DB
 * access here by design, so a rejection is guaranteed to have touched nothing.
 */
export function validateImportFile(raw: unknown): ImportValidation {
	const parsed = ImportFileSchema.safeParse(raw);
	if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => i.message).join('; ') };
	const data = parsed.data;

	const dupRecipeId = firstDuplicate(data.recipes, (r) => r.id);
	if (dupRecipeId != null) return { ok: false, error: `Duplicate recipe id ${dupRecipeId}` };
	const dupSlug = firstDuplicate(data.recipes, (r) => r.slug);
	if (dupSlug != null) return { ok: false, error: `Duplicate recipe slug "${dupSlug}"` };

	const dupInvId = firstDuplicate(data.inventory, (i) => i.id);
	if (dupInvId != null) return { ok: false, error: `Duplicate inventory item id ${dupInvId}` };
	const dupMealPlanId = firstDuplicate(data.meal_plan, (m) => m.id);
	if (dupMealPlanId != null) return { ok: false, error: `Duplicate meal_plan_meals id ${dupMealPlanId}` };
	const dupMealLogId = firstDuplicate(data.meal_log, (m) => m.id);
	if (dupMealLogId != null) return { ok: false, error: `Duplicate meal_log id ${dupMealLogId}` };
	const dupSubId = firstDuplicate(data.meal_sub_recipes, (s) => s.id);
	if (dupSubId != null) return { ok: false, error: `Duplicate meal_sub_recipes id ${dupSubId}` };

	const recipeIds = new Set(data.recipes.map((r) => r.id));
	for (const item of data.inventory) {
		if (item.madeFromRecipeId != null && !recipeIds.has(item.madeFromRecipeId)) {
			return {
				ok: false,
				error: `Inventory item ${item.id} references missing recipe id ${item.madeFromRecipeId}`
			};
		}
	}
	for (const sub of data.meal_sub_recipes) {
		if (!recipeIds.has(sub.mealRecipeId)) {
			return { ok: false, error: `meal_sub_recipes ${sub.id} references missing meal recipe id ${sub.mealRecipeId}` };
		}
		if (!recipeIds.has(sub.subRecipeId)) {
			return { ok: false, error: `meal_sub_recipes ${sub.id} references missing sub recipe id ${sub.subRecipeId}` };
		}
	}

	return { ok: true, data };
}

/**
 * Bootstrap eligibility: every table this import writes to must be empty.
 * Callers MUST run this inside the same transaction that performs the insert
 * (Correctness Req #3) — checking it beforehand would let a concurrent write
 * race between the check and the insert.
 */
export function isBootstrapEligible(db: DB): boolean {
	return (
		rowCount(db, schema.recipes) === 0 &&
		rowCount(db, schema.inventoryItems) === 0 &&
		rowCount(db, schema.mealPlanMeals) === 0 &&
		rowCount(db, schema.mealLog) === 0 &&
		rowCount(db, schema.mealSubRecipes) === 0
	);
}

export type ImportOutcome = { ok: true; inserted: Record<string, number> } | { ok: false; error: string };

// Exported so the Settings > Data panel can show the same sentence instead of
// hand-copying a second one that could drift from this actual eligibility rule.
export const NOT_EMPTY_ERROR =
	'Import is only allowed when recipes, inventory, meal plan, meal log, and meal sub-recipes are all empty. Reset those groups first.';

/** Insert order satisfies FK dependencies: recipes → meal_sub_recipes (FK to
 * recipes) → inventory (optional FK to recipes) → meal_plan_meals → meal_log
 * (neither has an FK to recipes; they key by slug text). */
export function importBootstrap(db: DB, data: ImportFileData): ImportOutcome {
	return db.transaction((tx): ImportOutcome => {
		if (!isBootstrapEligible(tx)) return { ok: false, error: NOT_EMPTY_ERROR };

		const inserted: Record<string, number> = {};
		if (data.recipes.length) inserted.recipes = tx.insert(schema.recipes).values(data.recipes).run().changes;
		if (data.meal_sub_recipes.length)
			inserted.meal_sub_recipes = tx.insert(schema.mealSubRecipes).values(data.meal_sub_recipes).run().changes;
		if (data.inventory.length)
			inserted.inventory_items = tx.insert(schema.inventoryItems).values(data.inventory).run().changes;
		if (data.meal_plan.length)
			inserted.meal_plan_meals = tx.insert(schema.mealPlanMeals).values(data.meal_plan).run().changes;
		if (data.meal_log.length) inserted.meal_log = tx.insert(schema.mealLog).values(data.meal_log).run().changes;

		return { ok: true, inserted };
	});
}
