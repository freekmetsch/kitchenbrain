import { z } from 'zod';
import { isoDateSchema } from '$lib/date_schema';
import { generateShoppingList } from '$lib/server/workflows/reconcile-shopping';
import type { ExecutorFn } from './shared';
import { stageStockActionProposal } from '$lib/server/ai/stock_action_proposal';

const IntakeSchema = z.object({
	name: z.string(),
	section: z.enum(['freezer', 'fridge', 'pantry']),
	qty_num: z.number().nonnegative().nullable().optional(),
	unit: z.string().nullable().optional(),
	expiry_date: isoDateSchema.nullable().optional()
});

const PreparedOperationSchema = z.object({
	kind: z.enum([
		'stock_replace',
		'par_refill',
		'shopping_add',
		'shopping_change',
		'bought_intake',
		'inventory_intake'
	]),
	item_id: z.number().int().positive().optional(),
	item_ids: z.array(z.number().int().positive()).max(30).optional(),
	name: z.string().optional(),
	replacement_name: z.string().optional(),
	shopping_name: z.string().optional(),
	change: z.enum(['remove', 'mark_bought', 'set_quantity']).optional(),
	amount: z.string().nullable().optional(),
	unit: z.string().nullable().optional(),
	section: z.enum(['freezer', 'fridge', 'pantry']).optional(),
	qty_num: z.number().nonnegative().nullable().optional(),
	expiry_date: isoDateSchema.nullable().optional(),
	items: z.array(IntakeSchema).max(30).optional(),
	reason: z.string()
});

function requiredString(value: string | undefined, field: string): string {
	if (!value?.trim()) throw new Error(`${field} is required for this Stock proposal operation`);
	return value;
}

function requiredNumber(value: number | undefined, field: string): number {
	if (value === undefined) throw new Error(`${field} is required for this Stock proposal operation`);
	return value;
}

export const shoppingExecutors: Record<string, ExecutorFn> = {
	async generate_shopping_list(raw, db) {
		const input = z.object({ week_start_date: isoDateSchema.optional() }).parse(raw);
		return generateShoppingList(db, input.week_start_date);
	},

	async prepare_stock_action(raw, db, userId) {
		const input = z
			.object({
				title: z.string(),
				reason: z.string(),
				operations: z.array(PreparedOperationSchema).min(1).max(30)
			})
			.parse(raw);
		const operations = input.operations.map((operation) => {
			if (operation.kind === 'stock_replace') {
				return {
					kind: operation.kind,
					itemId: requiredNumber(operation.item_id, 'item_id'),
					replacementName: requiredString(operation.replacement_name, 'replacement_name'),
					amount: operation.amount,
					unit: operation.unit,
					reason: operation.reason
				};
			}
			if (operation.kind === 'par_refill') {
				return {
					kind: operation.kind,
					itemIds: operation.item_ids,
					reason: operation.reason
				};
			}
			if (operation.kind === 'shopping_add') {
				return {
					kind: operation.kind,
					name: requiredString(operation.name, 'name'),
					amount: operation.amount,
					unit: operation.unit,
					reason: operation.reason
				};
			}
			if (operation.kind === 'shopping_change') {
				return {
					kind: operation.kind,
					name: requiredString(operation.name, 'name'),
					change:
						operation.change ??
						(() => {
							throw new Error('change is required for a Shopping change');
						})(),
					amount: operation.amount,
					unit: operation.unit,
					reason: operation.reason
				};
			}
			if (operation.kind === 'bought_intake') {
				return {
					kind: operation.kind,
					shoppingName: requiredString(operation.shopping_name, 'shopping_name'),
					item: {
						name: requiredString(operation.name, 'name'),
						section:
							operation.section ??
							(() => {
								throw new Error('section is required for bought intake');
							})(),
						qtyNum: operation.qty_num,
						unit: operation.unit,
						expiryDate: operation.expiry_date
					},
					reason: operation.reason
				};
			}
			return {
				kind: operation.kind,
				items: (operation.items ?? []).map((item) => ({
					name: item.name,
					section: item.section,
					qtyNum: item.qty_num,
					unit: item.unit,
					expiryDate: item.expiry_date
				})),
				reason: operation.reason
			};
		});
		const proposal = stageStockActionProposal(db, {
			userId,
			title: input.title,
			reason: input.reason,
			operations
		});
		return { ok: true, kind: 'stock_action_proposal', ...proposal };
	}
};
