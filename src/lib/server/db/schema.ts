import { sqliteTable, text, integer, real, unique, type AnySQLiteColumn } from 'drizzle-orm/sqlite-core';
import type { BenchSheetRating, StoredCookModeRecipe } from '$lib/types';
import type { MachineActor } from '$lib/actors';
import type {
	Ingredient,
	IngredientRole,
	MealSource,
	RecipeScalingMode,
	IngredientPurchaseForm,
	IngredientScale,
	IngredientOrigin,
	IngredientSubstitute,
	TranslatedIngredient
} from '$lib/recipe_ingredient';

export type IngredientSubstituteKind = 'protein' | 'spice' | 'vegetable' | 'other';
export type {
	Ingredient,
	IngredientRole,
	MealSource,
	RecipeScalingMode,
	IngredientPurchaseForm,
	IngredientScale,
	IngredientOrigin,
	IngredientSubstitute,
	TranslatedIngredient
} from '$lib/recipe_ingredient';
export type TranslationStatus = 'pending' | 'ready' | 'error';
export type { CookModeRecipe, CookModeStep } from '$lib/types';

export const users = sqliteTable('users', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	username: text('username').notNull().unique(),
	passwordHash: text('password_hash').notNull(),
	credsVersion: integer('creds_version').notNull().default(1),
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
});

export const sessions = sqliteTable('sessions', {
	id: text('id').primaryKey(),
	userId: integer('user_id')
		.notNull()
		.references(() => users.id),
	expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
});

export const inventoryItems = sqliteTable('inventory_items', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull(),
	qtyText: text('qty_text'),
	qtyNum: real('qty_num'),
	unit: text('unit'),
	section: text('section').notNull().$type<'freezer' | 'pantry'>(),
	// Legacy single-field classifier from ADR 0001, superseded by foodClass for AI
	// filtering — but still actively read/written by inventory writes, merge, and the
	// executor layer, so it stays live rather than a dead column. Retiring it is a
	// separate schema-migration follow-up, not a comment-only fix.
	category: text('category'),
	kind: text('kind').$type<'ingredient' | 'leftover' | 'processed'>(),
	foodClass: text('food_class'),
	madeFromRecipeId: integer('made_from_recipe_id').references(() => recipes.id),
	recipeStatus: text('recipe_status').$type<'linked' | 'plan_to_add' | 'no_recipe'>(),
	recipeStatusAt: integer('recipe_status_at', { mode: 'timestamp' }),
	needsReview: integer('needs_review', { mode: 'boolean' }).notNull().default(false),
	reviewReason: text('review_reason'),
	isStaple: integer('is_staple', { mode: 'boolean' }).notNull().default(false),
	expiryDate: text('expiry_date'),
	tags: text('tags', { mode: 'json' }).$type<string[]>().default([]),
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
	updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
	deletedAt: integer('deleted_at', { mode: 'timestamp' })
});

// Machine actors are reserved; any other value is a username from the users
// table. (string & {}) keeps literal autocomplete while accepting usernames.
export type InventoryActor = MachineActor | (string & {});

export const inventoryOpsLog = sqliteTable('inventory_ops_log', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	// Legacy plumbing: meaningful only for username/ai actors (the chatting user);
	// pipeline ops fall back to the first user and must never be displayed as that user.
	userId: integer('user_id')
		.notNull()
		.references(() => users.id),
	opType: text('op_type').notNull().$type<'add' | 'remove' | 'update'>(),
	// Legacy/provenance blob (merge metadata, warnings); item state lives in before/after.
	itemSnapshot: text('item_snapshot', { mode: 'json' }),
	actor: text('actor').$type<InventoryActor>(),
	itemId: integer('item_id').references(() => inventoryItems.id),
	beforeSnapshot: text('before_snapshot', { mode: 'json' }),
	afterSnapshot: text('after_snapshot', { mode: 'json' }),
	undoOf: integer('undo_of').references((): AnySQLiteColumn => inventoryOpsLog.id),
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
});

export const recipes = sqliteTable('recipes', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	slug: text('slug').notNull().unique(),
	title: text('title').notNull(),
	category: text('category'),
	tags: text('tags', { mode: 'json' }).$type<string[]>().default([]),
	servings: integer('servings'),
	scalingMode: text('scaling_mode').notNull().default('scalable').$type<RecipeScalingMode>(),
	structureVersion: integer('structure_version').notNull().default(1),
	structureDraft: text('structure_draft', { mode: 'json' }).$type<Ingredient[]>(),
	structureDraftSourceUpdatedAt: integer('structure_draft_source_updated_at', { mode: 'timestamp' }),
	totalTimeMin: integer('total_time_min'),
	sourceUrl: text('source_url'),
	imageUrl: text('image_url'),
	ingredients: text('ingredients', { mode: 'json' }).$type<Ingredient[]>().notNull().default([]),
	directions: text('directions', { mode: 'json' }).$type<string[]>().notNull().default([]),
	notes: text('notes'),
	rating: integer('rating'),
	cuisine: text('cuisine'),
	language: text('language').default('nl'),
	titleEn: text('title_en'),
	categoryEn: text('category_en'),
	cuisineEn: text('cuisine_en'),
	notesEn: text('notes_en'),
	ingredientsEn: text('ingredients_en', { mode: 'json' }).$type<TranslatedIngredient[]>(),
	directionsEn: text('directions_en', { mode: 'json' }).$type<string[]>(),
	translationStatus: text('translation_status').notNull().default('pending').$type<TranslationStatus>(),
	translatedAt: integer('translated_at', { mode: 'timestamp' }),
	lastCookedAt: integer('last_cooked_at', { mode: 'timestamp' }),
	cookedCount: integer('cooked_count').notNull().default(0),
	cookModeJson: text('cook_mode_json', { mode: 'json' }).$type<StoredCookModeRecipe>(),
	cookModeGeneratedAt: integer('cook_mode_generated_at', { mode: 'timestamp' }),
	isFreezerStaple: integer('is_freezer_staple', { mode: 'boolean' }).notNull().default(false),
	targetPortions: integer('target_portions'),
	// Keep-stocked opt-out memory (UX-STOCK-14): linking/freezing a leftover
	// auto-marks its recipe as freezer staple UNLESS this is set. Toggling the
	// staple off anywhere sets it (so the next freeze doesn't silently re-enable,
	// e.g. cooked once and didn't like it); toggling on clears it.
	freezerStapleOptOut: integer('freezer_staple_opt_out', { mode: 'boolean' }).notNull().default(false),
	needsReview: integer('needs_review', { mode: 'boolean' }).notNull().default(false),
	reviewReason: text('review_reason'),
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
	updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
});

// Meal Recipe composition (ADR 0003): a meal recipe is a normal recipes row
// whose parts are live links to standalone sub-recipes. One level deep by
// invariant — a recipe with rows here as mealRecipeId must never appear as a
// subRecipeId (enforced at the write boundary in meal_recipes.ts).
export const mealSubRecipes = sqliteTable(
	'meal_sub_recipes',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		mealRecipeId: integer('meal_recipe_id')
			.notNull()
			.references(() => recipes.id, { onDelete: 'cascade' }),
		subRecipeId: integer('sub_recipe_id')
			.notNull()
			.references(() => recipes.id, { onDelete: 'cascade' }),
		sortOrder: integer('sort_order').notNull().default(0),
		createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
	},
	(t) => [unique().on(t.mealRecipeId, t.subRecipeId)]
);

export const cookLog = sqliteTable('cook_log', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	recipeId: integer('recipe_id').references(() => recipes.id),
	recipeSlug: text('recipe_slug'),
	cookedAt: integer('cooked_at', { mode: 'timestamp' }).notNull(),
	cookedDate: text('cooked_date').notNull(),
	// 'meal' = logged automatically because a Meal Recipe containing this
	// recipe was cooked (ADR 0003 dual bump) — type-level only, no migration.
	source: text('source').notNull().$type<'plan' | 'manual' | 'backfill' | 'meal'>(),
	mealPlanMealId: integer('meal_plan_meal_id').references(() => mealPlanMeals.id),
	benchSheetRating: text('bench_sheet_rating').$type<BenchSheetRating>(),
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
});

export const mealPlanMeals = sqliteTable('meal_plan_meals', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	weekNumber: integer('week_number').notNull(),
	weekStartDate: text('week_start_date').notNull(),
	dinner: text('dinner').notNull(),
	recipeSlug: text('recipe_slug'),
	servings: integer('servings'),
	status: text('status').notNull().default('planned').$type<'planned' | 'cooked'>(),
	// How the meal will be made: cooked fresh from the recipe, or served from
	// frozen leftover portions ('freezer' — only serve_fresh ingredients need
	// buying that week; cooking it consumes linked freezer portions).
	source: text('source').notNull().default('fresh').$type<MealSource>(),
	cookedDate: text('cooked_date'),
	// Day-to-day planning (Settings → Meal planning, off by default): the ISO
	// date within the week this meal is pinned to; null = unpinned pool meal.
	plannedDate: text('planned_date'),
	note: text('note'),
	sortOrder: integer('sort_order').notNull().default(0),
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
});

export const mealLog = sqliteTable('meal_log', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	date: text('date').notNull(),
	recipeSlug: text('recipe_slug'),
	rating: integer('rating'),
	notes: text('notes'),
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
});

export const chatMessages = sqliteTable('chat_messages', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	userId: integer('user_id')
		.notNull()
		.references(() => users.id),
	role: text('role').notNull().$type<'user' | 'assistant'>(),
	content: text('content').notNull(),
	toolCalls: text('tool_calls', { mode: 'json' }),
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
});

export const spending = sqliteTable('spending', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	date: text('date').notNull(),
	model: text('model').notNull(),
	inputTokens: integer('input_tokens').notNull(),
	outputTokens: integer('output_tokens').notNull(),
	cacheReadTokens: integer('cache_read_tokens').notNull().default(0),
	cacheWriteTokens: integer('cache_write_tokens').notNull().default(0),
	costEur: real('cost_eur').notNull(),
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
});

export const prefs = sqliteTable(
	'prefs',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: integer('user_id')
			.notNull()
			.references(() => users.id),
		key: text('key').notNull(),
		value: text('value').notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
	},
	(t) => [unique().on(t.userId, t.key)]
);

// Household-level (not per-user) key-value store; `prefs` is per-user by design.
// Keys: chat.reasoning_effort, chat.provider_sort, ai.temperature (tuning.ts);
// ai.chat_model, ai.chat_fallback_model, ai.vision_model, ai.background_model,
// ai.chat_daily_cap, ai.background_daily_cap (config.ts); recipes.auto_translate_on_import,
// recipes.cook_mode_pregeneration (recipes/prefs.ts).
export const householdPrefs = sqliteTable('household_prefs', {
	key: text('key').primaryKey(),
	value: text('value').notNull(),
	updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
});

export const shoppingListOverrides = sqliteTable(
	'shopping_list_overrides',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		weekStartDate: text('week_start_date').notNull(),
		name: text('name').notNull(),
		bought: integer('bought', { mode: 'boolean' }).notNull().default(false),
		manual: integer('manual', { mode: 'boolean' }).notNull().default(false),
		amount: text('amount'),
		unit: text('unit'),
		included: integer('included', { mode: 'boolean' }).notNull().default(true),
		selectedName: text('selected_name'),
		createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
	},
	(t) => [unique().on(t.weekStartDate, t.name)]
);

// Household-level favorite AH product per ingredient name ("knoflook" always
// means Go-Tan gehakte knoflook here). Keyed on the normalized Dutch shopping
// item name (AH-INVARIANT); pinned above ranking and the AI archetype pick.
export const ahFavorites = sqliteTable('ah_favorites', {
	nameKey: text('name_key').primaryKey(),
	productId: text('product_id').notNull(),
	productName: text('product_name').notNull(),
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
});

export type ShoppingPushDestination = 'order' | 'list';
export type ShoppingPushItemMode = 'product' | 'freetext' | 'skip';
export type ShoppingPushItemStatus = 'success' | 'failed' | 'skipped';

export const shoppingPushHistory = sqliteTable('shopping_push_history', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	weekStartDate: text('week_start_date').notNull(),
	userId: integer('user_id').references(() => users.id),
	destination: text('destination').notNull().$type<ShoppingPushDestination>(),
	accountName: text('account_name'),
	productsPushed: integer('products_pushed').notNull().default(0),
	freetextPushed: integer('freetext_pushed').notNull().default(0),
	failedCount: integer('failed_count').notNull().default(0),
	skippedCount: integer('skipped_count').notNull().default(0),
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
});

export const shoppingPushItems = sqliteTable('shopping_push_items', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	pushId: integer('push_id')
		.notNull()
		.references(() => shoppingPushHistory.id, { onDelete: 'cascade' }),
	sourceRef: text('source_ref').notNull(),
	sourceName: text('source_name').notNull(),
	amount: text('amount'),
	unit: text('unit'),
	mode: text('mode').notNull().$type<ShoppingPushItemMode>(),
	ahProductId: text('ah_product_id'),
	ahProductName: text('ah_product_name'),
	quantity: integer('quantity'),
	destination: text('destination').notNull().$type<ShoppingPushDestination>(),
	status: text('status').notNull().$type<ShoppingPushItemStatus>(),
	failureReason: text('failure_reason'),
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
});
