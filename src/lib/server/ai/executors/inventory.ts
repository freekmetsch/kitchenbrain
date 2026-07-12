import { z } from 'zod';
import { eq, and, isNull, isNotNull, like, lte } from 'drizzle-orm';
import * as schema from '$lib/server/db/schema';
import { normalizeFoodCategory } from '$lib/food_categories';
import {
	addInventory,
	removeInventory,
	updateInventory,
	setReviewFlag,
	undoOp,
	undoLatestRemoveForItem
} from '$lib/server/inventory_writes';
import { listInventoryHistory } from '$lib/server/inventory_history_query';
import { dateInputValue, daysSinceDate, parseDateOnly } from '$lib/inventory_dates';
import { todayIso, addDays } from '$lib/week';
import type { DB, ExecutorFn } from './shared';

type InventoryItem = typeof schema.inventoryItems.$inferSelect;

function inventoryForAi(item: InventoryItem) {
	const { tags: _tags, ...rest } = item;
	return {
		...rest,
		added_date: dateInputValue(item.createdAt),
		days_in_inventory: daysSinceDate(item.createdAt)
	};
}

// One source of truth for the updatable-item fields, shared by update_inventory_item
// and bulk_update_inventory (bulk omits the recipe-linking fields). AH push is
// unaffected — it sources product search from recipes.ingredients (Dutch) and
// shopping_list_overrides, never from these inventory fields (CLAUDE.md invariant).
const singleUpdateSchema = z.object({
	id: z.number(),
	qty_text: z.string().optional(),
	qty_num: z.number().optional(),
	unit: z.string().optional(),
	section: z.enum(['freezer', 'pantry']).optional(),
	expiry_date: z.string().nullable().optional(),
	created_at: z.string().optional(),
	category: z.string().optional(),
	kind: z.enum(['ingredient', 'leftover', 'processed']).optional(),
	food_class: z.string().optional(),
	made_from_recipe_id: z.number().nullable().optional(),
	recipe_status: z.enum(['linked', 'plan_to_add', 'no_recipe']).nullable().optional(),
	is_staple: z.boolean().optional()
});
type SingleUpdateInput = z.infer<typeof singleUpdateSchema>;

// One item's update + post-state verification, shared so a bulk reclassify runs
// the exact same write path (and per-item undo op) as a single edit. Returns a
// self-contained result row so bulk can report partial success.
function applyInventoryUpdate(db: DB, userId: number, input: SingleUpdateInput) {
	const result = updateInventory(
		db,
		input.id,
		{
			qtyText: input.qty_text,
			qtyNum: input.qty_num,
			unit: input.unit,
			section: input.section,
			expiryDate: input.expiry_date,
			createdAt: input.created_at !== undefined ? (parseDateOnly(input.created_at) ?? undefined) : undefined,
			category: input.category,
			kind: input.kind,
			foodClass: input.food_class,
			madeFromRecipeId: input.made_from_recipe_id,
			recipeStatus: input.recipe_status,
			isStaple: input.is_staple
		},
		{ actor: 'ai', userId }
	);
	if (!result.ok) return { ok: false as const, id: input.id, error: result.error };
	const verified = result.item;
	const mismatches: string[] = [];
	if (input.qty_text !== undefined && verified.qtyText !== input.qty_text) mismatches.push('qty_text');
	if (input.qty_num !== undefined && verified.qtyNum !== input.qty_num) mismatches.push('qty_num');
	if (input.expiry_date !== undefined && verified.expiryDate !== input.expiry_date)
		mismatches.push('expiry_date');
	if (input.created_at !== undefined && dateInputValue(verified.createdAt) !== input.created_at)
		mismatches.push('created_at');
	if (input.category !== undefined && verified.category !== normalizeFoodCategory(input.category))
		mismatches.push('category');
	if (input.section !== undefined && verified.section !== input.section) mismatches.push('section');
	if (mismatches.length) {
		return {
			ok: false as const,
			id: verified.id,
			error: `Updated item but couldn't confirm: ${mismatches.join(', ')}`,
			post_state: verified
		};
	}
	return { ok: true as const, id: verified.id, updated: inventoryForAi(verified), verified: true, opId: result.opId };
}

export const inventoryExecutors: Record<string, ExecutorFn> = {
	async get_inventory(raw, db) {
		const input = z
			.object({
				section: z.enum(['freezer', 'pantry']).optional(),
				category: z.string().optional(),
				expiring_within_days: z.number().optional(),
				added_before_days: z.number().optional(),
				sort: z.enum(['name', 'oldest_added', 'newest_added']).optional()
			})
			.parse(raw);
		const categoryFilter = normalizeFoodCategory(input.category);

		let items = db
			.select()
			.from(schema.inventoryItems)
			.where(
				and(
					isNull(schema.inventoryItems.deletedAt),
					input.section ? eq(schema.inventoryItems.section, input.section) : undefined,
					categoryFilter ? like(schema.inventoryItems.category, `%${categoryFilter}%`) : undefined,
					input.expiring_within_days !== undefined
						? and(
								isNotNull(schema.inventoryItems.expiryDate),
								lte(
									schema.inventoryItems.expiryDate,
									addDays(todayIso(), input.expiring_within_days!)
								)
							)
						: undefined
				)
			)
			.all();

		if (input.added_before_days !== undefined) {
			items = items.filter((item) => {
				const days = daysSinceDate(item.createdAt);
				return days !== null && days >= input.added_before_days!;
			});
		}
		if (input.sort === 'oldest_added') {
			items = items.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
		} else if (input.sort === 'newest_added') {
			items = items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
		} else {
			items = items.sort((a, b) => a.name.localeCompare(b.name, 'nl'));
		}
		return { count: items.length, items: items.map(inventoryForAi) };
	},

	async add_to_inventory(raw, db, userId, precondition) {
		const input = z
			.object({
				name: z.string(),
				section: z.enum(['freezer', 'pantry']),
				qty_text: z.string().optional(),
				qty_num: z.number().optional(),
				unit: z.string().optional(),
				category: z.string().optional(),
				kind: z.enum(['ingredient', 'leftover', 'processed']).optional(),
				food_class: z.string().optional(),
				made_from_recipe_id: z.number().optional(),
				is_staple: z.boolean().optional(),
				expiry_date: z.string().optional(),
				created_at: z.string().optional()
			})
			.parse(raw);

		const result = addInventory(
			db,
			{
				name: input.name,
				section: input.section,
				qtyText: input.qty_text,
				qtyNum: input.qty_num,
				unit: input.unit,
				category: normalizeFoodCategory(input.category),
				kind: input.kind,
				foodClass: input.food_class,
				madeFromRecipeId: input.made_from_recipe_id,
				recipeStatus: input.made_from_recipe_id != null ? 'linked' : undefined,
				isStaple: input.is_staple,
				expiryDate: input.expiry_date,
				createdAt: parseDateOnly(input.created_at)
			},
			{ actor: 'ai', userId },
			precondition
		);
		if (!result.verified) {
			return {
				ok: false,
				error: "Inventory write completed but couldn't confirm the post-state",
				id: result.item.id
			};
		}
		return {
			ok: true,
			action: result.action,
			id: result.item.id,
			name: result.item.name,
			section: result.item.section,
			item: inventoryForAi(result.item),
			warnings: result.warnings,
				opId: result.opId
		};
	},

	async remove_from_inventory(raw, db, userId, precondition) {
		const input = z
			.object({
				id: z.number().optional(),
				name: z.string().optional(),
				section: z.enum(['freezer', 'pantry']).optional()
			})
			.parse(raw);

		const result = removeInventory(
			db,
			{ id: input.id, name: input.name, section: input.section },
			{ actor: 'ai', userId },
			precondition
		);
		if (!result.ok) return { ok: false, error: result.error };
		if (!result.verified) {
			return {
				ok: false,
				error: "Removed item but couldn't confirm the deletion",
				id: result.item.id
			};
		}
		return { ok: true, removed: result.item.name, id: result.item.id, verified: true, opId: result.opId };
	},

	async update_inventory_item(raw, db, userId) {
		return applyInventoryUpdate(db, userId, singleUpdateSchema.parse(raw));
	},

	async bulk_update_inventory(raw, db, userId) {
		// Same fields as a single update, minus the recipe-linking pair.
		const ItemSchema = singleUpdateSchema.omit({ made_from_recipe_id: true, recipe_status: true });
		const input = z.object({ updates: z.array(ItemSchema).min(1).max(100) }).parse(raw);

		// Each item runs the same verified write + its own undo op, so a partial
		// failure leaves the successes committed and individually reversible.
		const results = input.updates.map((u) => applyInventoryUpdate(db, userId, u));
		const okResults = results.filter((r) => r.ok);
		return {
			ok: results.every((r) => r.ok),
			updated_count: okResults.length,
			failed_count: results.length - okResults.length,
			op_ids: okResults.map((r) => r.opId).filter((x): x is number => x != null),
			results
		};
	},

	async link_leftover_recipe(raw, db, userId) {
		const input = z
			.object({
				item_id: z.number(),
				recipe_slug: z.string().optional(),
				recipe_id: z.number().optional(),
				status: z.enum(['linked', 'plan_to_add', 'no_recipe']).optional()
			})
			.parse(raw);

		let recipeId: number | null = input.recipe_id ?? null;
		if (recipeId == null && input.recipe_slug) {
			const recipe = db
				.select({ id: schema.recipes.id })
				.from(schema.recipes)
				.where(eq(schema.recipes.slug, input.recipe_slug))
				.get();
			if (!recipe) return { ok: false, error: `Recipe not found: ${input.recipe_slug}` };
			recipeId = recipe.id;
		}

		const status = input.status ?? (recipeId != null ? 'linked' : undefined);
		if (recipeId == null && status !== 'plan_to_add' && status !== 'no_recipe') {
			return {
				ok: false,
				error: 'Provide a recipe (slug or id) to link, or a status of plan_to_add / no_recipe'
			};
		}

		const result = updateInventory(
			db,
			input.item_id,
			{ kind: 'leftover', madeFromRecipeId: recipeId, recipeStatus: status },
			{ actor: 'ai', userId }
		);
		if (!result.ok) return { ok: false, error: result.error };
		return { ok: true, item: inventoryForAi(result.item), opId: result.opId };
	},

	async set_staple(raw, db, userId) {
		const input = z.object({ item_id: z.number(), is_staple: z.boolean() }).parse(raw);
		const result = updateInventory(
			db,
			input.item_id,
			{ isStaple: input.is_staple },
			{ actor: 'ai', userId }
		);
		if (!result.ok) return { ok: false, error: result.error };
		return { ok: true, item: inventoryForAi(result.item), opId: result.opId };
	},

	async set_review_flag(raw, db, userId) {
		const input = z
			.object({
				item_id: z.number(),
				flagged: z.boolean(),
				reason: z.string().optional()
			})
			.parse(raw);
		const result = setReviewFlag(
			db,
			input.item_id,
			input.flagged ? (input.reason ?? 'flagged_by_ai') : null,
			{ actor: 'ai', userId }
		);
		if (!result.ok) return { ok: false, error: result.error };
		return { ok: true, item: inventoryForAi(result.item), opId: result.opId };
	},

	async undo_op(raw, db, userId) {
		const input = z
			.object({ op_id: z.number().optional(), item_id: z.number().optional() })
			.parse(raw);
		if (input.op_id === undefined && input.item_id === undefined) {
			return { ok: false, error: 'Provide op_id (from get_inventory_history) or item_id' };
		}
		const ctx = { actor: 'ai' as const, userId };
		const result =
			input.op_id !== undefined
				? undoOp(db, input.op_id, ctx)
				: undoLatestRemoveForItem(db, input.item_id!, ctx);
		// A conflict (item drifted since the op) is not a hard failure: the boundary
		// flags the item for review instead of overwriting. The failure variant is
		// already { ok:false, error, conflict? } — pass it straight through.
		if (!result.ok) return result;
		return { ok: true, item: inventoryForAi(result.item), opId: result.opId };
	},

	async get_inventory_history(raw, db) {
		const input = z
			.object({ item_id: z.number().optional(), limit: z.number().optional() })
			.parse(raw);
		// Chat wants a leaner page than the UI history list (whose default is 40);
		// 20 recent ops covers "what changed" / "undo that" without bloating context.
		const events = listInventoryHistory(db, { itemId: input.item_id, limit: input.limit ?? 20 });
		return { count: events.length, events };
	}
};
