import { randomBytes, randomUUID } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import * as schema from '$lib/server/db/schema';
import type { Db, DbOrTx } from '$lib/server/db/types';
import {
	addInventory,
	toSnapshot,
	undoOp,
	undoOps,
	updateInventory,
	type ItemSnapshot
} from '$lib/server/domains/inventory/commands';
import {
	addManualShoppingEntry,
	removeManualShoppingEntry,
	restoreManualShoppingEntry,
	setBoughtForEntries,
	updateShoppingEntry
} from '$lib/server/domains/shopping/commands';
import { getShoppingWeekEntry } from '$lib/server/domains/shopping/queries';
import { getWeekStartDay } from '$lib/server/meal_plan/prefs';
import { inventoryParStatus } from '$lib/par_level';
import { normalizeNameKey } from '$lib/match';
import { isoDateInAppTimeZone, weekStartFor } from '$lib/week';

const IntakeItemSchema = z
	.object({
		name: z.string().trim().min(1).max(160),
		section: z.enum(['freezer', 'fridge', 'pantry']),
		qtyNum: z.number().nonnegative().nullable().optional(),
		unit: z.string().trim().min(1).max(40).nullable().optional(),
		expiryDate: z.string().date().nullable().optional()
	})
	.strict();

const StockReplaceSchema = z
	.object({
		kind: z.literal('stock_replace'),
		itemId: z.number().int().positive(),
		replacementName: z.string().trim().min(1).max(160),
		amount: z.string().trim().min(1).max(40).nullable().optional(),
		unit: z.string().trim().min(1).max(40).nullable().optional(),
		reason: z.string().trim().min(1).max(500)
	})
	.strict();

const ParRefillSchema = z
	.object({
		kind: z.literal('par_refill'),
		itemIds: z.array(z.number().int().positive()).min(1).max(30).optional(),
		reason: z.string().trim().min(1).max(500)
	})
	.strict();

const ShoppingAddSchema = z
	.object({
		kind: z.literal('shopping_add'),
		name: z.string().trim().min(1).max(160),
		amount: z.string().trim().min(1).max(40).nullable().optional(),
		unit: z.string().trim().min(1).max(40).nullable().optional(),
		reason: z.string().trim().min(1).max(500)
	})
	.strict();

const ShoppingChangeSchema = z
	.object({
		kind: z.literal('shopping_change'),
		name: z.string().trim().min(1).max(160),
		change: z.enum(['remove', 'mark_bought', 'set_quantity']),
		amount: z.string().trim().min(1).max(40).nullable().optional(),
		unit: z.string().trim().min(1).max(40).nullable().optional(),
		reason: z.string().trim().min(1).max(500)
	})
	.strict();

const BoughtIntakeSchema = z
	.object({
		kind: z.literal('bought_intake'),
		shoppingName: z.string().trim().min(1).max(160),
		item: IntakeItemSchema,
		reason: z.string().trim().min(1).max(500)
	})
	.strict();

const InventoryIntakeSchema = z
	.object({
		kind: z.literal('inventory_intake'),
		items: z.array(IntakeItemSchema).min(1).max(30),
		reason: z.string().trim().min(1).max(500)
	})
	.strict();

export const StockActionOperationSchema = z.discriminatedUnion('kind', [
	StockReplaceSchema,
	ParRefillSchema,
	ShoppingAddSchema,
	ShoppingChangeSchema,
	BoughtIntakeSchema,
	InventoryIntakeSchema
]);

export const StockActionProposalInputSchema = z
	.object({
		userId: z.number().int().positive(),
		title: z.string().trim().min(1).max(160),
		reason: z.string().trim().min(1).max(500),
		operations: z.array(StockActionOperationSchema).min(1).max(30)
	})
	.strict();

export type StockActionProposalInput = z.infer<typeof StockActionProposalInputSchema>;
type IntakeItem = z.infer<typeof IntakeItemSchema>;
type WeekEntry = typeof schema.shoppingWeekEntries.$inferSelect;

export type StockActionProposalOperation = {
	id: string;
	kind:
		| 'stock_replace'
		| 'par_refill'
		| 'shopping_add'
		| 'shopping_change'
		| 'bought_intake'
		| 'inventory_intake';
	label: string;
	before: string | null;
	after: string;
	reason: string;
};

export type StockActionProposal = {
	token: string;
	status: 'active' | 'applying' | 'applied' | 'undone' | 'rejected' | 'superseded' | 'expired';
	title: string;
	weekStartDate: string;
	atomicity: { kind: 'atomic'; consequence: string };
	recommendation: {
		whyNow: string;
		evidence: string[];
		confidence: 'high' | 'medium' | 'low';
		uncertainty: string | null;
		consequence: string;
		alternatives: string[];
	};
	operations: StockActionProposalOperation[];
};

type ExecutableOperation =
	| {
			id: string;
			kind: 'stock_replace';
			itemId: number;
			replacementName: string;
			amount: string | null;
			unit: string | null;
			replacementEntryIds: number[];
	  }
	| {
			id: string;
			kind: 'par_refill';
			itemId: number;
			name: string;
			amount: string;
			unit: string;
	  }
	| {
			id: string;
			kind: 'shopping_add';
			name: string;
			amount: string | null;
			unit: string | null;
	  }
	| {
			id: string;
			kind: 'shopping_change';
			entryIds: number[];
			change: 'remove' | 'mark_bought' | 'set_quantity';
			amount: string | null;
			unit: string | null;
	  }
	| {
			id: string;
			kind: 'bought_intake';
			entryIds: number[];
			item: IntakeItem;
	  }
	| {
			id: string;
			kind: 'inventory_intake';
			item: IntakeItem;
	  };

type ShoppingEffect = { before: WeekEntry | null; after: WeekEntry };

type StoredProposal = Omit<StockActionProposal, 'token'> & {
	userId: number;
	expiresAt: number;
	executable: ExecutableOperation[];
	inventoryFingerprint: string;
	shoppingFingerprint: string;
	applied?: {
		inventoryOpIds: number[];
		shoppingEffects: ShoppingEffect[];
	};
};

const TTL_MS = 10 * 60 * 1000;
const MAX_PROPOSALS = 100;
const proposals = new Map<string, StoredProposal>();

function cleanExpired(now: number): void {
	for (const proposal of proposals.values()) {
		if (proposal.status === 'active' && proposal.expiresAt <= now) proposal.status = 'expired';
	}
	while (proposals.size >= MAX_PROPOSALS) proposals.delete(proposals.keys().next().value!);
}

function activeInventory(db: DbOrTx) {
	return db
		.select()
		.from(schema.inventoryItems)
		.where(isNull(schema.inventoryItems.deletedAt))
		.all();
}

function inventoryFingerprint(db: DbOrTx): string {
	return JSON.stringify(activeInventory(db).map(toSnapshot));
}

function activeShopping(db: DbOrTx, weekStartDate: string) {
	return db
		.select()
		.from(schema.shoppingWeekEntries)
		.where(
			and(
				eq(schema.shoppingWeekEntries.weekStartDate, weekStartDate),
				isNull(schema.shoppingWeekEntries.retiredAt)
			)
		)
		.all();
}

function shoppingFingerprint(db: DbOrTx, weekStartDate: string): string {
	return JSON.stringify(activeShopping(db, weekStartDate));
}

function displayQty(qty: number | null, unit: string | null): string {
	if (qty === null) return 'Unknown';
	return `${qty}${unit ? ` ${unit}` : ''}`;
}

function matchesShoppingName(entry: WeekEntry, name: string): boolean {
	return normalizeNameKey(entry.selectedName ?? entry.name) === normalizeNameKey(name);
}

function intakeAfter(item: IntakeItem): string {
	return `${item.section} · ${displayQty(item.qtyNum ?? null, item.unit ?? null)}`;
}

function proposalView(token: string, proposal: StoredProposal): StockActionProposal {
	return {
		token,
		status: proposal.status,
		title: proposal.title,
		weekStartDate: proposal.weekStartDate,
		atomicity: proposal.atomicity,
		recommendation: proposal.recommendation,
		operations: proposal.operations
	};
}

export function stageStockActionProposal(
	db: Db,
	rawInput: StockActionProposalInput,
	now = new Date()
): StockActionProposal {
	const input = StockActionProposalInputSchema.parse(rawInput);
	cleanExpired(now.getTime());
	const weekStartDate = weekStartFor(isoDateInAppTimeZone(now), getWeekStartDay(db));
	const inventory = activeInventory(db);
	const shopping = activeShopping(db, weekStartDate);
	const executable: ExecutableOperation[] = [];
	const operations: StockActionProposalOperation[] = [];
	const evidence: string[] = [];
	const uncertainties: string[] = [];

	for (const operation of input.operations) {
		if (operation.kind === 'stock_replace') {
			const item = inventory.find((candidate) => candidate.id === operation.itemId);
			if (!item) throw new Error(`Inventory item ${operation.itemId} not found`);
			const replacementEntries = shopping.filter((entry) =>
				matchesShoppingName(entry, operation.replacementName)
			);
			const id = randomUUID();
			executable.push({
				id,
				kind: operation.kind,
				itemId: item.id,
				replacementName: operation.replacementName,
				amount: operation.amount ?? null,
				unit: operation.unit ?? null,
				replacementEntryIds: replacementEntries.map((entry) => entry.id)
			});
			operations.push({
				id,
				kind: operation.kind,
				label: item.name,
				before: displayQty(item.qtyNum, item.unit),
				after: replacementEntries.length
					? `Set stock to 0 and reopen ${replacementEntries.length} existing Shopping source${replacementEntries.length === 1 ? '' : 's'}`
					: `Set stock to 0 and add ${operation.replacementName} to Shopping`,
				reason: operation.reason
			});
			evidence.push(`${item.name} currently has ${displayQty(item.qtyNum, item.unit)} in ${item.section}.`);
			if (replacementEntries.length) {
				evidence.push(
					`${operation.replacementName} already has ${replacementEntries.length} authoritative Shopping source${replacementEntries.length === 1 ? '' : 's'}; no duplicate row will be added.`
				);
			}
			continue;
		}

		if (operation.kind === 'par_refill') {
			const requested = new Set(operation.itemIds ?? inventory.map((item) => item.id));
			for (const item of inventory.filter((candidate) => requested.has(candidate.id))) {
				const status = inventoryParStatus(item);
				if (status.state === 'below') {
					const existingShopping = shopping.filter((entry) => matchesShoppingName(entry, item.name));
					if (existingShopping.length) {
						uncertainties.push(
							`${item.name} is below target but already has ${existingShopping.length} Shopping source${existingShopping.length === 1 ? '' : 's'}; no duplicate refill was prepared.`
						);
						continue;
					}
					const id = randomUUID();
					executable.push({
						id,
						kind: operation.kind,
						itemId: item.id,
						name: item.name,
						amount: String(status.deficitQty),
						unit: status.unit
					});
					operations.push({
						id,
						kind: operation.kind,
						label: item.name,
						before: displayQty(item.qtyNum, item.unit),
						after: `Add ${status.deficitQty} ${status.unit} to Shopping`,
						reason: operation.reason
					});
					evidence.push(
						`${item.name} has ${displayQty(item.qtyNum, item.unit)} against a ${item.parTargetQty} ${item.parTargetUnit} target.`
					);
				} else if (status.state === 'unknown') {
					uncertainties.push(`${item.name} has a target but its current quantity is not comparable.`);
				}
			}
			continue;
		}

		if (operation.kind === 'shopping_add') {
			const matches = shopping.filter((entry) => matchesShoppingName(entry, operation.name));
			if (matches.length) {
				throw new Error(
					`${operation.name} already has ${matches.length} authoritative Shopping source${matches.length === 1 ? '' : 's'}`
				);
			}
			const id = randomUUID();
			executable.push({
				id,
				kind: operation.kind,
				name: operation.name,
				amount: operation.amount ?? null,
				unit: operation.unit ?? null
			});
			operations.push({
				id,
				kind: operation.kind,
				label: operation.name,
				before: null,
				after: `Add ${[operation.amount, operation.unit].filter(Boolean).join(' ') || 'one item'} to Shopping`,
				reason: operation.reason
			});
			evidence.push(`${operation.name} is not being inferred from a recipe source; it will be a manual row.`);
			continue;
		}

		if (operation.kind === 'shopping_change') {
			const matches = shopping.filter((entry) => matchesShoppingName(entry, operation.name));
			if (!matches.length) throw new Error(`${operation.name} is not on this week's Shopping list`);
			if (operation.change === 'set_quantity' && matches.length !== 1) {
				throw new Error(`${operation.name} has multiple Shopping sources; choose one before changing quantity`);
			}
			if (operation.change === 'set_quantity' && !operation.amount) {
				throw new Error(`An amount is required to change ${operation.name}'s Shopping quantity`);
			}
			const id = randomUUID();
			executable.push({
				id,
				kind: operation.kind,
				entryIds: matches.map((entry) => entry.id),
				change: operation.change,
				amount: operation.amount ?? null,
				unit: operation.unit ?? null
			});
			operations.push({
				id,
				kind: operation.kind,
				label: operation.name,
				before: matches.map((entry) => `${entry.sourceKind}: ${entry.amount ?? '—'} ${entry.unit ?? ''}`.trim()).join('; '),
				after:
					operation.change === 'remove'
						? 'Exclude from this week'
						: operation.change === 'mark_bought'
							? 'Mark bought'
							: `Set to ${operation.amount ?? '—'} ${operation.unit ?? ''}`.trim(),
				reason: operation.reason
			});
			evidence.push(
				`${operation.name} has ${matches.length} authoritative source${matches.length === 1 ? '' : 's'}: ${matches.map((entry) => entry.sourceKind).join(', ')}.`
			);
			continue;
		}

		if (operation.kind === 'bought_intake') {
			const matches = shopping.filter((entry) => matchesShoppingName(entry, operation.shoppingName));
			if (!matches.length) throw new Error(`${operation.shoppingName} is not on this week's Shopping list`);
			const id = randomUUID();
			executable.push({
				id,
				kind: operation.kind,
				entryIds: matches.map((entry) => entry.id),
				item: operation.item
			});
			operations.push({
				id,
				kind: operation.kind,
				label: operation.item.name,
				before: `${matches.length} Shopping source${matches.length === 1 ? '' : 's'} not bought`,
				after: `Mark bought and add to ${intakeAfter(operation.item)}`,
				reason: operation.reason
			});
			evidence.push(`${operation.shoppingName} is present in this week's Shopping sources.`);
			continue;
		}

		for (const item of operation.items) {
			const id = randomUUID();
			executable.push({ id, kind: operation.kind, item });
			const existing = inventory.find(
				(candidate) =>
					candidate.section === item.section &&
					normalizeNameKey(candidate.name) === normalizeNameKey(item.name)
			);
			operations.push({
				id,
				kind: operation.kind,
				label: item.name,
				before: existing ? `${displayQty(existing.qtyNum, existing.unit)} in ${existing.section}` : null,
				after: `${existing ? 'Merge into' : 'Add to'} ${intakeAfter(item)}`,
				reason: operation.reason
			});
			evidence.push(
				existing
					? `${item.name} already exists in ${item.section}; the reviewed intake will merge it.`
					: `${item.name} is new in ${item.section}.`
			);
		}
	}

	if (!operations.length) {
		throw new Error(
			uncertainties.length
				? `No exact refill can be prepared: ${uncertainties.join(' ')}`
				: 'No applicable Stock or Shopping operations were found'
		);
	}

	for (const proposal of proposals.values()) {
		if (proposal.userId === input.userId && proposal.status === 'active') {
			proposal.status = 'superseded';
		}
	}
	const token = randomBytes(18).toString('base64url');
	const consequence = `${operations.length} selected operation${operations.length === 1 ? '' : 's'} will commit together in one SQLite transaction.`;
	const proposal: StoredProposal = {
		userId: input.userId,
		expiresAt: now.getTime() + TTL_MS,
		status: 'active',
		title: input.title,
		weekStartDate,
		atomicity: { kind: 'atomic', consequence },
		recommendation: {
			whyNow: input.reason,
			evidence: evidence.slice(0, 12),
			confidence: uncertainties.length ? 'medium' : 'high',
			uncertainty: uncertainties.length ? uncertainties.join(' ') : null,
			consequence,
			alternatives: ['Adjust the selected rows', 'Use the Stock or Shopping page directly', 'Reject this proposal']
		},
		operations,
		executable,
		inventoryFingerprint: inventoryFingerprint(db),
		shoppingFingerprint: shoppingFingerprint(db, weekStartDate)
	};
	proposals.set(token, proposal);
	return proposalView(token, proposal);
}

function requireActiveProposal(token: string, userId: number, now = Date.now()): StoredProposal {
	const proposal = proposals.get(token);
	if (!proposal || proposal.userId !== userId) {
		throw new Error('Stock proposal expired or belongs to another user');
	}
	if (proposal.status === 'active' && proposal.expiresAt <= now) proposal.status = 'expired';
	if (proposal.status !== 'active') throw new Error(`Stock proposal is ${proposal.status}`);
	return proposal;
}

function assertFingerprints(db: DbOrTx, proposal: StoredProposal): void {
	if (
		inventoryFingerprint(db) !== proposal.inventoryFingerprint ||
		shoppingFingerprint(db, proposal.weekStartDate) !== proposal.shoppingFingerprint
	) {
		throw new Error('Stock or Shopping changed; prepare a fresh proposal');
	}
}

function addIntake(
	tx: DbOrTx,
	item: IntakeItem,
	userId: number
): { opId: number | null } {
	return addInventory(
		tx,
		{
			name: item.name,
			section: item.section,
			qtyNum: item.qtyNum ?? undefined,
			unit: item.unit ?? undefined,
			expiryDate: item.expiryDate ?? undefined
		},
		{ actor: 'ai', userId }
	);
}

export function applyStockActionProposal(
	db: Db,
	input: { token: string; userId: number; operationIds: string[] },
	now = Date.now()
) {
	const proposal = requireActiveProposal(input.token, input.userId, now);
	const selected = new Set(input.operationIds);
	if (!selected.size || [...selected].some((id) => !proposal.executable.some((op) => op.id === id))) {
		throw new Error('Choose at least one valid Stock proposal operation');
	}
	proposal.status = 'applying';
	try {
		const applied = db.transaction((tx) => {
			assertFingerprints(tx, proposal);
			const inventoryOpIds: number[] = [];
			const shoppingEffects: ShoppingEffect[] = [];
			const weekStartDay = getWeekStartDay(tx);
			for (const operation of proposal.executable.filter((candidate) => selected.has(candidate.id))) {
				if (operation.kind === 'stock_replace') {
					const before = activeInventory(tx).find((item) => item.id === operation.itemId)!;
					const result = updateInventory(
						tx,
						operation.itemId,
						{
							qtyNum: 0,
							qtyText: `0${before.unit ? ` ${before.unit}` : ''}`
						},
						{ actor: 'ai', userId: input.userId }
					);
					if (!result.ok) throw new Error(result.error);
					if (result.opId !== null) inventoryOpIds.push(result.opId);
					if (operation.replacementEntryIds.length) {
						for (const entryId of operation.replacementEntryIds) {
							const existing = getShoppingWeekEntry(tx, entryId)!;
							const reopened = updateShoppingEntry(tx, {
								entryId,
								expectedRevision: existing.revision,
								weekStartDay,
								included: true,
								bought: false,
								...(operation.amount ? { amountOverride: operation.amount } : {}),
								...(operation.unit ? { unitOverride: operation.unit } : {})
							});
							shoppingEffects.push({ before: existing, after: reopened });
						}
					} else {
						const row = addManualShoppingEntry(tx, {
							weekStart: proposal.weekStartDate,
							weekStartDay,
							name: operation.replacementName,
							amount: operation.amount,
							unit: operation.unit
						});
						shoppingEffects.push({ before: null, after: row });
					}
					continue;
				}
				if (operation.kind === 'par_refill' || operation.kind === 'shopping_add') {
					const row = addManualShoppingEntry(tx, {
						weekStart: proposal.weekStartDate,
						weekStartDay,
						name: operation.kind === 'par_refill' ? operation.name : operation.name,
						amount: operation.amount,
						unit: operation.unit
					});
					shoppingEffects.push({ before: null, after: row });
					continue;
				}
				if (operation.kind === 'inventory_intake') {
					const result = addIntake(tx, operation.item, input.userId);
					if (result.opId !== null) inventoryOpIds.push(result.opId);
					continue;
				}
				if (operation.kind === 'bought_intake') {
					const beforeRows = operation.entryIds.map((id) => getShoppingWeekEntry(tx, id)!);
					setBoughtForEntries(tx, {
						entryIds: operation.entryIds,
						weekStart: proposal.weekStartDate,
						weekStartDay,
						bought: true
					});
					for (const before of beforeRows) {
						shoppingEffects.push({ before, after: getShoppingWeekEntry(tx, before.id)! });
					}
					const result = addIntake(tx, operation.item, input.userId);
					if (result.opId !== null) inventoryOpIds.push(result.opId);
					continue;
				}

				const beforeRows = operation.entryIds.map((id) => getShoppingWeekEntry(tx, id)!);
				if (operation.change === 'mark_bought') {
					setBoughtForEntries(tx, {
						entryIds: operation.entryIds,
						weekStart: proposal.weekStartDate,
						weekStartDay,
						bought: true
					});
				} else if (operation.change === 'set_quantity') {
					const before = beforeRows[0];
					updateShoppingEntry(tx, {
						entryId: before.id,
						expectedRevision: before.revision,
						weekStartDay,
						amountOverride: operation.amount,
						unitOverride: operation.unit
					});
				} else {
					for (const before of beforeRows) {
						if (before.sourceKind === 'manual') {
							removeManualShoppingEntry(tx, {
								entryId: before.id,
								expectedRevision: before.revision,
								weekStartDay
							});
						} else {
							updateShoppingEntry(tx, {
								entryId: before.id,
								expectedRevision: before.revision,
								weekStartDay,
								included: false
							});
						}
					}
				}
				for (const before of beforeRows) {
					shoppingEffects.push({ before, after: getShoppingWeekEntry(tx, before.id)! });
				}
			}
			return { inventoryOpIds, shoppingEffects };
		});
		proposal.applied = applied;
		proposal.status = 'applied';
		return {
			status: 'committed' as const,
			atomicity: 'atomic' as const,
			inventoryChanges: applied.inventoryOpIds.length,
			shoppingChanges: applied.shoppingEffects.length,
			undoToken: input.token
		};
	} catch (error) {
		proposal.status = 'active';
		throw error;
	}
}

function rowState(row: WeekEntry): string {
	return JSON.stringify(row);
}

export function undoStockActionProposal(
	db: Db,
	input: { token: string; userId: number }
) {
	const proposal = proposals.get(input.token);
	if (!proposal || proposal.userId !== input.userId || proposal.status !== 'applied' || !proposal.applied) {
		throw new Error('Applied Stock proposal not found');
	}
	db.transaction((tx) => {
		for (const effect of proposal.applied!.shoppingEffects) {
			const current = getShoppingWeekEntry(tx, effect.after.id);
			if (!current || rowState(current) !== rowState(effect.after)) {
				throw new Error('Shopping changed after apply; the bundle cannot be undone safely');
			}
		}
		if (proposal.applied!.inventoryOpIds.length === 1) {
			const result = undoOp(tx, proposal.applied!.inventoryOpIds[0], {
				actor: 'ai',
				userId: input.userId
			});
			if (!result.ok) throw new Error(result.error);
		} else if (proposal.applied!.inventoryOpIds.length > 1) {
			const reversed = [...proposal.applied!.inventoryOpIds].reverse();
			if (reversed.length <= 10) {
				undoOps(tx, reversed, {
					actor: 'ai',
					userId: input.userId
				});
			} else {
				for (const opId of reversed) {
					const result = undoOp(tx, opId, {
						actor: 'ai',
						userId: input.userId
					});
					if (!result.ok) throw new Error(result.error);
				}
			}
		}
		const weekStartDay = getWeekStartDay(tx);
		for (const effect of [...proposal.applied!.shoppingEffects].reverse()) {
			if (effect.before === null) {
				removeManualShoppingEntry(tx, {
					entryId: effect.after.id,
					expectedRevision: effect.after.revision,
					weekStartDay
				});
				continue;
			}
			if (effect.after.retiredAt) {
				restoreManualShoppingEntry(tx, {
					entryId: effect.after.id,
					expectedRevision: effect.after.revision,
					weekStartDay,
					before: effect.before
				});
				continue;
			}
			updateShoppingEntry(tx, {
				entryId: effect.after.id,
				expectedRevision: effect.after.revision,
				weekStartDay,
				included: effect.before.included,
				selectedName: effect.before.selectedName,
				bought: effect.before.bought,
				amountOverride: effect.before.amountOverride,
				unitOverride: effect.before.unitOverride
			});
		}
	});
	proposal.status = 'undone';
	return { status: 'undone' as const, atomicity: 'atomic' as const };
}

export function rejectStockActionProposal(input: { token: string; userId: number }): void {
	const proposal = requireActiveProposal(input.token, input.userId);
	proposal.status = 'rejected';
}

export function getStockActionProposal(input: {
	token: string;
	userId: number;
}): StockActionProposal | null {
	const proposal = proposals.get(input.token);
	if (!proposal || proposal.userId !== input.userId) return null;
	if (proposal.status === 'active' && proposal.expiresAt <= Date.now()) proposal.status = 'expired';
	return proposalView(input.token, proposal);
}
