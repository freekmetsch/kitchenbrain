import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import * as schema from '$lib/server/db/schema';
import type { Db } from '$lib/server/db/types';
import {
	inventorySnapshotsEqual,
	resolveInventoryTarget,
	toSnapshot,
	type ItemSnapshot,
	type WritePrecondition
} from '$lib/server/domains/inventory/commands';
import type { RecipePatchEvidence } from '$lib/server/ai/recipe_patch';
import {
	ASSISTANT_CAPABILITIES,
	isPersistentCapability
} from '$lib/server/ai/capability_registry';
import { listMealsForWeek } from '$lib/server/domains/meal-plan/queries';
import { getWeekStartDay } from '$lib/server/meal_plan/prefs';
import { weekStartFor } from '$lib/week';

export type ContractErrorCode =
	| 'invalid_input'
	| 'missing_provenance'
	| 'stale_target'
	| 'write_latched'
	| 'prohibited_target';

export class ContractError extends Error {
	constructor(
		public readonly code: ContractErrorCode,
		message: string
	) {
		super(message);
		this.name = 'ContractError';
	}
}

export type RecipeObservation = { id: number; slug: string; revision: number };
export type AhSearchDisplayProduct = {
	evidence_key: string;
	name: string;
	package_size: string | null;
	price: number | null;
	unit_price: string | null;
	bonus: boolean;
	previously_bought: boolean;
	category: string | null;
};
export type AhSearchDisplayResult = {
	query: string;
	available: boolean;
	products: AhSearchDisplayProduct[];
};

export type TurnSafetyState = {
	inventory: Map<number, ItemSnapshot>;
	meals: Map<number, string>;
	mealWeeks: Map<string, string>;
	recipesById: Map<number, RecipeObservation>;
	recipesBySlug: Map<string, RecipeObservation>;
	inventoryOperations: Set<number>;
	ahEvidence: Map<string, RecipePatchEvidence>;
	ahSearchCache: Map<string, AhSearchDisplayResult>;
	recipeChoiceReplacement?: { token: string; groupId: string };
	writeLatched: boolean;
	failedCalls: Map<string, unknown>;
	committedWrites: string[];
};

export function createTurnSafetyState(): TurnSafetyState {
	return {
		inventory: new Map(),
		meals: new Map(),
		mealWeeks: new Map(),
		recipesById: new Map(),
		recipesBySlug: new Map(),
		inventoryOperations: new Set(),
		ahEvidence: new Map(),
		ahSearchCache: new Map(),
		writeLatched: false,
		failedCalls: new Map(),
		committedWrites: []
	};
}

export const PERSISTENT_TOOLS = new Set(
	Object.entries(ASSISTANT_CAPABILITIES)
		.filter(([, capability]) => capability.access === 'write')
		.map(([name]) => name)
);

export function isPersistentTool(name: string): boolean {
	return isPersistentCapability(name);
}

function record(value: unknown): Record<string, unknown> | null {
	return value !== null && typeof value === 'object'
		? (value as Record<string, unknown>)
		: null;
}

function num(value: unknown): number | undefined {
	return typeof value === 'number' && Number.isInteger(value) ? value : undefined;
}

function str(value: unknown): string | undefined {
	return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function fingerprint(value: unknown): string {
	return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function stableValue(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(stableValue);
	if (value && typeof value === 'object') {
		return Object.fromEntries(
			Object.entries(value as Record<string, unknown>)
				.sort(([a], [b]) => a.localeCompare(b))
				.map(([key, nested]) => [key, stableValue(nested)])
		);
	}
	return value;
}

export function failedCallKey(name: string, input: unknown): string {
	return `${name}:${JSON.stringify(stableValue(input))}`;
}

function observeInventoryIds(db: Db, state: TurnSafetyState, ids: number[]): void {
	for (const id of ids) {
		const item = db
			.select()
			.from(schema.inventoryItems)
			.where(eq(schema.inventoryItems.id, id))
			.get();
		if (item && !item.deletedAt) state.inventory.set(id, toSnapshot(item));
	}
}

function observeRecipeSlugs(db: Db, state: TurnSafetyState, slugs: string[]): void {
	for (const slug of slugs) {
		const recipe = db
			.select({
				id: schema.recipes.id,
				slug: schema.recipes.slug,
				revision: schema.recipes.contentRevision
			})
			.from(schema.recipes)
			.where(eq(schema.recipes.slug, slug))
			.get();
		if (!recipe) continue;
		state.recipesById.set(recipe.id, recipe);
		state.recipesBySlug.set(recipe.slug, recipe);
	}
}

function nestedRecords(raw: unknown, key: string): Record<string, unknown>[] {
	const value = record(raw)?.[key];
	return Array.isArray(value)
		? value.filter((item): item is Record<string, unknown> => record(item) !== null)
		: [];
}

/** Capture server-side snapshots that correspond to data returned by a read tool. */
export function observeToolResult(
	name: string,
	rawResult: unknown,
	db: Db,
	state: TurnSafetyState
): void {
	const result = record(rawResult);
	if (!result) return;
	const resultOperationId = num(result.opId) ?? num(result.op_id);
	if (resultOperationId !== undefined) state.inventoryOperations.add(resultOperationId);
	if (Array.isArray(result.op_ids)) {
		for (const value of result.op_ids) {
			const operationId = num(value);
			if (operationId !== undefined) state.inventoryOperations.add(operationId);
		}
	}
	if (
		[
			'add_to_inventory',
			'update_inventory_item',
			'link_leftover_recipe',
			'set_staple',
			'set_review_flag',
			'undo_op'
		].includes(name)
	) {
		const item = record(result.item) ?? record(result.updated);
		const id = num(item?.id) ?? num(result.id);
		if (id !== undefined) observeInventoryIds(db, state, [id]);
		return;
	}
	if (name === 'remove_from_inventory') {
		const id = num(result.id);
		if (id !== undefined) state.inventory.delete(id);
		return;
	}
	if (name === 'get_inventory') {
		observeInventoryIds(
			db,
			state,
			nestedRecords(result, 'items').map((item) => num(item.id)).filter((id): id is number => id !== undefined)
		);
		return;
	}
	if (name === 'get_inventory_history') {
		for (const event of nestedRecords(result, 'events')) {
			const operationId = num(event.id) ?? num(event.opId) ?? num(event.op_id);
			if (operationId !== undefined) state.inventoryOperations.add(operationId);
		}
		return;
	}
	if (name === 'get_recipe') {
		const recipe = record(result.recipe);
		const slug = str(recipe?.slug);
		if (slug) observeRecipeSlugs(db, state, [slug]);
		return;
	}
	if (name === 'search_recipes') {
		observeRecipeSlugs(
			db,
			state,
			nestedRecords(result, 'recipes').map((recipe) => str(recipe.slug)).filter((slug): slug is string => Boolean(slug))
		);
		return;
	}
	if (name === 'suggest_meals') {
		observeRecipeSlugs(
			db,
			state,
			nestedRecords(result, 'recipes')
				.map((recipe) => str(recipe.slug))
				.filter((slug): slug is string => Boolean(slug))
		);
		return;
	}
	if (name === 'get_freezer_staples') {
		const rows = Array.isArray(result.freezer_staples)
			? result.freezer_staples
			: Array.isArray(result.recipes)
				? result.recipes
				: [];
		observeRecipeSlugs(
			db,
			state,
			rows.map((row) => str(record(row)?.slug)).filter((slug): slug is string => Boolean(slug))
		);
		return;
	}
	if (name === 'get_meal_plan') {
		const weeks = nestedRecords(result, 'weeks');
		for (const week of weeks) {
			const observedWeek = str(week.week_start);
			if (observedWeek) {
				state.mealWeeks.set(
					observedWeek,
					fingerprint(listMealsForWeek(db, observedWeek))
				);
			}
			for (const meal of nestedRecords(week, 'meals')) {
				const id = num(meal.id);
				if (id === undefined) continue;
				const current = db
					.select()
					.from(schema.mealPlanMeals)
					.where(eq(schema.mealPlanMeals.id, id))
					.get();
				if (current) state.meals.set(id, fingerprint(current));
			}
		}
		for (const meal of nestedRecords(result, 'missed_meals')) {
			const id = num(meal.id);
			const weekStart = str(meal.weekStartDate);
			if (weekStart && !state.mealWeeks.has(weekStart)) {
				state.mealWeeks.set(weekStart, fingerprint(listMealsForWeek(db, weekStart)));
			}
			if (id === undefined) continue;
			const current = db
				.select()
				.from(schema.mealPlanMeals)
				.where(eq(schema.mealPlanMeals.id, id))
				.get();
			if (current) state.meals.set(id, fingerprint(current));
		}
		return;
	}
}

function requireMealWeek(db: Db, state: TurnSafetyState, date: string): string {
	const week = weekStartFor(date, getWeekStartDay(db));
	const observed = state.mealWeeks.get(week);
	if (!observed) {
		throw new ContractError(
			'missing_provenance',
			`Meal-plan week ${week} was not read in this turn. Read the week before proposing changes.`
		);
	}
	if (fingerprint(listMealsForWeek(db, week)) !== observed) {
		throw new ContractError(
			'stale_target',
			`Meal-plan week ${week} changed after it was read. Read it again before proposing changes.`
		);
	}
	return week;
}

function requireInventory(
	db: Db,
	state: TurnSafetyState,
	itemId: number
): WritePrecondition {
	const observed = state.inventory.get(itemId);
	if (!observed) {
		throw new ContractError(
			'missing_provenance',
			`Inventory item ${itemId} was not read in this turn. Read inventory again before changing it.`
		);
	}
	const current = db
		.select()
		.from(schema.inventoryItems)
		.where(eq(schema.inventoryItems.id, itemId))
		.get();
	if (
		!current ||
		current.deletedAt ||
		!inventorySnapshotsEqual(toSnapshot(current), observed)
	) {
		throw new ContractError(
			'stale_target',
			`Inventory item ${itemId} changed after it was read. Read inventory again before changing it.`
		);
	}
	return { itemId, expectedSnapshot: observed };
}

function requireRecipe(
	db: Db,
	state: TurnSafetyState,
	target: { id?: number; slug?: string }
): RecipeObservation {
	const observed =
		target.id !== undefined
			? state.recipesById.get(target.id)
			: target.slug
				? state.recipesBySlug.get(target.slug)
				: undefined;
	const label = target.slug ?? target.id ?? 'unknown';
	if (!observed) {
		throw new ContractError(
			'missing_provenance',
			`Recipe ${label} was not read in this turn. Read the recipe again before changing it.`
		);
	}
	const current = db
		.select({ revision: schema.recipes.contentRevision })
		.from(schema.recipes)
		.where(eq(schema.recipes.id, observed.id))
		.get();
	if (!current || current.revision !== observed.revision) {
		throw new ContractError(
			'stale_target',
			`Recipe ${observed.slug} changed after it was read. Read it again before changing it.`
		);
	}
	return observed;
}

function requireMeal(db: Db, state: TurnSafetyState, mealId: number): void {
	const observed = state.meals.get(mealId);
	if (!observed) {
		throw new ContractError(
			'missing_provenance',
			`Meal ${mealId} was not read in this turn. Read the meal plan again before changing it.`
		);
	}
	const current = db
		.select()
		.from(schema.mealPlanMeals)
		.where(eq(schema.mealPlanMeals.id, mealId))
		.get();
	if (!current || fingerprint(current) !== observed) {
		throw new ContractError(
			'stale_target',
			`Meal ${mealId} changed after it was read. Read the meal plan again before changing it.`
		);
	}
}

/**
 * Authorize an existing-target write and mint server-owned inventory
 * preconditions. Invalid shapes are left to the executor's Zod contract.
 */
export function authorizeToolCall(
	name: string,
	rawInput: unknown,
	db: Db,
	state: TurnSafetyState
): WritePrecondition | WritePrecondition[] | undefined {
	const input = record(rawInput);
	if (name === 'propose_meal_plan' && input) {
		const weekStartDate = str(input.week_start_date);
		if (weekStartDate) requireMealWeek(db, state, weekStartDate);
		if (Array.isArray(input.operations)) {
			for (const rawOperation of input.operations) {
				const operation = record(rawOperation);
				if (!operation) continue;
				const mealId = num(operation.meal_id);
				if (mealId !== undefined) requireMeal(db, state, mealId);
				const changes = record(operation.changes);
				const recipeSlug =
					str(operation.recipe_slug) ?? str(changes?.recipe_slug);
				if (recipeSlug) requireRecipe(db, state, { slug: recipeSlug });
			}
		}
		return undefined;
	}
	if (name === 'propose_recipe_patch' && input) {
		const slug = str(input.slug);
		if (slug) requireRecipe(db, state, { slug });
		if (Array.isArray(input.operations)) {
			for (const operation of input.operations) {
				const key = str(record(record(operation)?.evidence)?.evidence_key);
				if (key && !state.ahEvidence.has(key)) {
					throw new ContractError(
						'missing_provenance',
						'Retailer evidence must come from search_ah_products in this turn.'
					);
				}
			}
		}
		if (Array.isArray(input.product_choices)) {
			for (const group of input.product_choices) {
				const candidates = record(group)?.candidates;
				if (!Array.isArray(candidates)) continue;
				for (const candidate of candidates) {
					const key = str(record(candidate)?.evidence_key);
					if (key && !state.ahEvidence.has(key)) {
						throw new ContractError(
							'missing_provenance',
							'Retailer evidence must come from search_ah_products in this turn.'
						);
					}
				}
			}
		}
		return undefined;
	}
	if (name === 'prepare_cooking_action' && input) {
		const action = str(input.action);
		if (action === 'after_cook') {
			const mealId = num(input.meal_id);
			if (mealId !== undefined) requireMeal(db, state, mealId);
		} else if (action === 'rescue') {
			const slug = str(input.recipe_slug);
			if (slug) requireRecipe(db, state, { slug });
		} else if (action === 'defrost') {
			const itemId = num(input.inventory_id);
			if (itemId !== undefined) requireInventory(db, state, itemId);
		}
		return undefined;
	}
	if (!isPersistentTool(name)) return undefined;
	if (state.writeLatched) {
		throw new ContractError(
			'write_latched',
			'Persistent writes are disabled for the rest of this turn after an earlier contract error.'
		);
	}
	if (!input) return undefined;

	if (name === 'update_inventory_item') {
		const id = num(input.id);
		const recipeId = num(input.made_from_recipe_id);
		if (recipeId !== undefined) requireRecipe(db, state, { id: recipeId });
		return id === undefined ? undefined : requireInventory(db, state, id);
	}
	if (name === 'bulk_update_inventory') {
		if (!Array.isArray(input.updates)) return undefined;
		const ids = input.updates
			.map((update) => num(record(update)?.id))
			.filter((id): id is number => id !== undefined);
		if (ids.length !== input.updates.length) return undefined;
		if (new Set(ids).size !== ids.length) {
			throw new ContractError('prohibited_target', 'A batch cannot target the same inventory item twice.');
		}
		return ids.map((id) => requireInventory(db, state, id));
	}
	if (name === 'remove_from_inventory') {
		const id = num(input.id);
		if (id !== undefined) return requireInventory(db, state, id);
		const target = resolveInventoryTarget(db, {
			name: str(input.name),
			section:
				input.section === 'freezer' || input.section === 'pantry'
					? input.section
					: undefined
		});
		return target ? requireInventory(db, state, target.id) : undefined;
	}
	if (name === 'add_to_inventory') {
		const recipeId = num(input.made_from_recipe_id);
		if (recipeId !== undefined) requireRecipe(db, state, { id: recipeId });
		return undefined;
	}
	if (name === 'link_leftover_recipe' || name === 'set_staple' || name === 'set_review_flag') {
		const id = num(input.item_id);
		const precondition = id === undefined ? undefined : requireInventory(db, state, id);
		if (name === 'link_leftover_recipe') {
			const recipeId = num(input.recipe_id);
			const recipeSlug = str(input.recipe_slug);
			if (recipeId !== undefined || recipeSlug) {
				requireRecipe(db, state, { id: recipeId, slug: recipeSlug });
			}
		}
		return precondition;
	}
	if (name === 'undo_op') {
		const operationId = num(input.op_id);
		if (operationId !== undefined && !state.inventoryOperations.has(operationId)) {
			throw new ContractError(
				'missing_provenance',
				`Inventory operation ${operationId} was not read in this turn. Read inventory history again before undoing it.`
			);
		}
		if (Array.isArray(input.op_ids)) {
			for (const value of input.op_ids) {
				const id = num(value);
				if (id !== undefined && !state.inventoryOperations.has(id)) {
					throw new ContractError(
						'missing_provenance',
						`Inventory operation ${id} was not read in this turn. Read inventory history again before undoing it.`
					);
				}
			}
		}
		const itemId = num(input.item_id);
		if (itemId !== undefined) requireInventory(db, state, itemId);
		return undefined;
	}
	if (name === 'remove_meal' || name === 'mark_meal_cooked') {
		const id = num(input.id);
		if (id !== undefined) requireMeal(db, state, id);
		return undefined;
	}
	if (name === 'edit_recipe' || name === 'set_freezer_staple') {
		const slug = str(input.slug);
		if (slug) requireRecipe(db, state, { slug });
		return undefined;
	}
	if (name === 'create_meal_recipe' && Array.isArray(input.sub_recipe_slugs)) {
		for (const slug of input.sub_recipe_slugs) {
			if (typeof slug === 'string') requireRecipe(db, state, { slug });
		}
		return undefined;
	}
	if (name === 'plan_meal' || name === 'log_meal') {
		const slug = str(input.recipe_slug);
		if (slug) requireRecipe(db, state, { slug });
	}
	return undefined;
}
