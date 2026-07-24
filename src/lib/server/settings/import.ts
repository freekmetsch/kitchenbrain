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
import { ensureIngredientIds, TrustedRestoreIngredientSchema } from '$lib/recipe_ingredient';
import { delHouseholdPref } from '$lib/server/db/household_prefs';
import { K_SHOPPING_SOURCE_MIGRATION } from '$lib/server/shopping_entries';
import {
	RecipeSourceSnapshotSchema,
	captureRecipeSource,
	ensureDirectionIds
} from '$lib/recipe_source_snapshot';

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

const TrustedIngredientArray = z
	.array(TrustedRestoreIngredientSchema)
	.superRefine((ingredients, ctx) => {
		const ids = ingredients.flatMap((ingredient) => (ingredient.id ? [ingredient.id] : []));
		if (new Set(ids).size !== ids.length) {
			ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Ingredient IDs must be unique within a recipe' });
		}
	})
	.transform((ingredients) => ensureIngredientIds(ingredients));

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

const RecipeImport = z.object({
	id: z.number().int(),
	slug: z.string().min(1),
	title: z.string().min(1),
	category: z.string().nullable(),
	servings: z.number().int().nullable(),
	scalingMode: z.enum(['scalable', 'fixed_batch']).default('scalable'),
	structureVersion: z.number().int().min(1).default(1),
	contentRevision: z.number().int().positive().default(1),
	structureDraft: TrustedIngredientArray.nullable().default(null),
	structureDraftSourceUpdatedAt: zTimestampOrNull.default(null),
	totalTimeMin: z.number().int().nullable(),
	sourceUrl: z.string().nullable(),
	imageUrl: z.string().nullable(),
	ingredients: TrustedIngredientArray,
	directions: z.array(z.string()),
	directionIdsJson: z.array(z.string().min(1)).optional().default([]),
	sourceSnapshotJson: RecipeSourceSnapshotSchema.nullable().optional().default(null),
	notes: z.string().nullable(),
	rating: z.number().int().nullable(),
	cuisine: z.string().nullable(),
	language: z.string().nullable(),
	titleEn: z.string().nullable(),
	categoryEn: z.string().nullable(),
	cuisineEn: z.string().nullable(),
	notesEn: z.string().nullable(),
	ingredientsEn: z.array(z.object({
		name: z.string(),
		preparation: z.string().optional(),
		component: z.string().optional(),
		substitutes: z.array(z.object({ name: z.string(), note: z.string().optional() })).optional()
	})).nullable(),
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
}).transform((recipe) => ({
	...recipe,
	directionIdsJson: ensureDirectionIds(recipe.directions, recipe.directionIdsJson),
	sourceSnapshotJson:
		recipe.sourceSnapshotJson ??
		captureRecipeSource(
			{
				title: recipe.title,
				servings: recipe.servings,
				sourceUrl: recipe.sourceUrl,
				ingredients: recipe.ingredients,
				directions: recipe.directions
			},
			{ provenance: 'legacy_baseline', capturedAt: recipe.updatedAt.getTime() }
		)
}));

const MealPlanMealImport = z.object({
	id: z.number().int(),
	weekNumber: z.number().int(),
	weekStartDate: z.string(),
	dinner: z.string(),
	recipeSlug: z.string().nullable(),
	servings: z.number().int().positive().nullable().default(null),
	status: z.enum(['planned', 'cooked']),
	source: z.enum(['fresh', 'freezer']).default('fresh'),
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

const ShoppingOverrideImport = z.object({
	id: z.number().int(),
	weekStartDate: z.string(),
	name: z.string().min(1),
	bought: z.boolean(),
	manual: z.boolean(),
	amount: z.string().nullable(),
	unit: z.string().nullable(),
	included: z.boolean().default(true),
	selectedName: z.string().nullable().default(null),
	createdAt: zTimestamp
});

const RecurringShoppingItemImport = z.object({
	id: z.number().int(),
	name: z.string().min(1),
	amount: z.string().nullable(),
	unit: z.string().nullable(),
	startWeek: z.string(),
	endWeek: z.string().nullable(),
	revision: z.number().int().positive(),
	createdAt: zTimestamp,
	updatedAt: zTimestamp
});

const ShoppingWeekEntryImport = z.object({
	id: z.number().int(),
	weekStartDate: z.string(),
	sourceKey: z.string().min(1),
	sourceKind: z.enum(['recipe', 'weekly', 'manual', 'legacy']),
	recipeId: z.number().int().nullable(),
	recipeSlug: z.string().nullable(),
	ingredientId: z.string().nullable(),
	recurringItemId: z.number().int().nullable(),
	legacyOverrideId: z.number().int().nullable(),
	name: z.string().min(1),
	amount: z.string().nullable(),
	unit: z.string().nullable(),
	amountOverride: z.string().nullable().default(null),
	unitOverride: z.string().nullable().default(null),
	component: z.string().nullable(),
	mealIds: z.array(z.number().int()),
	approvedTerms: z.array(z.string().min(1)),
	included: z.boolean(),
	selectedName: z.string().nullable(),
	bought: z.boolean(),
	needsReview: z.boolean(),
	retiredAt: zTimestampOrNull,
	resolvedAt: zTimestampOrNull,
	resolution: z.enum(['attached', 'manual', 'dismissed']).nullable(),
	resolvedSourceKey: z.string().nullable(),
	revision: z.number().int().positive(),
	createdAt: zTimestamp,
	updatedAt: zTimestamp
});

const ImportFileSchema = z.object({
	exported_at: z.string().optional(),
	inventory: z.array(InventoryItemImport).default([]),
	recipes: z.array(RecipeImport).default([]),
	meal_plan: z.array(MealPlanMealImport).default([]),
	meal_log: z.array(MealLogImport).default([]),
	meal_sub_recipes: z.array(MealSubRecipeImport).default([]),
	shopping_overrides: z.array(ShoppingOverrideImport).default([]),
	recurring_shopping_items: z.array(RecurringShoppingItemImport).default([]),
	shopping_week_entries: z.array(ShoppingWeekEntryImport).default([])
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
	const dupOverrideId = firstDuplicate(data.shopping_overrides, (s) => s.id);
	if (dupOverrideId != null) return { ok: false, error: `Duplicate shopping override id ${dupOverrideId}` };
	const dupOverrideKey = firstDuplicate(data.shopping_overrides, (s) => `${s.weekStartDate}\u0000${s.name}`);
	if (dupOverrideKey != null) return { ok: false, error: 'Duplicate shopping override week/name' };
	const dupRecurringId = firstDuplicate(data.recurring_shopping_items, (item) => item.id);
	if (dupRecurringId != null) return { ok: false, error: `Duplicate recurring shopping item id ${dupRecurringId}` };
	const dupWeekEntryId = firstDuplicate(data.shopping_week_entries, (entry) => entry.id);
	if (dupWeekEntryId != null) return { ok: false, error: `Duplicate shopping week entry id ${dupWeekEntryId}` };
	const dupWeekSource = firstDuplicate(
		data.shopping_week_entries,
		(entry) => `${entry.weekStartDate}\u0000${entry.sourceKey}`
	);
	if (dupWeekSource != null) return { ok: false, error: 'Duplicate shopping week/source key' };
	const recurringIds = new Set(data.recurring_shopping_items.map((item) => item.id));
	for (const entry of data.shopping_week_entries) {
		if (entry.recurringItemId != null && !recurringIds.has(entry.recurringItemId)) {
			return { ok: false, error: `Shopping week entry ${entry.id} references missing recurring item` };
		}
	}

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
		rowCount(db, schema.mealSubRecipes) === 0 &&
		rowCount(db, schema.shoppingListOverrides) === 0 &&
		rowCount(db, schema.recurringShoppingItems) === 0 &&
		rowCount(db, schema.shoppingWeekEntries) === 0
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
		if (data.shopping_overrides.length)
			inserted.shopping_list_overrides = tx.insert(schema.shoppingListOverrides).values(data.shopping_overrides).run().changes;
		if (data.recurring_shopping_items.length)
			inserted.recurring_shopping_items = tx
				.insert(schema.recurringShoppingItems)
				.values(data.recurring_shopping_items)
				.run().changes;
		if (data.shopping_week_entries.length)
			inserted.shopping_week_entries = tx
				.insert(schema.shoppingWeekEntries)
				.values(data.shopping_week_entries)
				.run().changes;
		delHouseholdPref(tx as unknown as DB, K_SHOPPING_SOURCE_MIGRATION);

		return { ok: true, inserted };
	});
}
