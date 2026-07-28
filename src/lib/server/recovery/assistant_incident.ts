import { createHash } from 'node:crypto';
import { asc, count, eq, inArray, notInArray } from 'drizzle-orm';
import * as schema from '$lib/server/db/schema';
import type { Db } from '$lib/server/db/types';
import {
	inventorySnapshotsEqual,
	restoreInventorySnapshot,
	toSnapshot,
	type ItemSnapshot
} from '$lib/server/domains/inventory/commands';
import { updateCanonicalRecipe } from '$lib/server/domains/recipes';

type StoredToolCall = {
	name?: unknown;
	input?: unknown;
	result?: unknown;
};

type RecipeSnapshot = {
	id: number;
	slug: string;
	contentRevision: number;
	notes: string | null;
};

type RecoveryInspection = {
	inventoryMessageId: number;
	recipeMessageId: number;
	operationIds: number[];
	inventory: Array<{
		operationId: number;
		itemId: number;
		currentMatchesIncidentAfter: boolean;
		beforeHash: string;
		afterHash: string;
	}>;
	recipe: {
		id: number;
		slug: string;
		expectedCurrentRevision: number;
		actualCurrentRevision: number;
		currentMatchesIncidentAfter: boolean;
		beforeNotesHash: string;
		afterNotesHash: string;
	};
	counts: {
		inventoryItems: number;
		inventoryOps: number;
		recipes: number;
	};
	unrelatedHash: string;
	ready: boolean;
};

export type AssistantIncidentRecoveryInput = {
	operationIds: number[];
	inventoryMessageId: number;
	recipeMessageId: number;
};

export type AssistantIncidentRecoveryResult = RecoveryInspection & {
	applied: true;
	compensatingOperationIds: number[];
	recipeRevision: number;
	postApply: {
		inventoryRestored: boolean;
		recipeRestored: boolean;
		counts: RecoveryInspection['counts'];
		unrelatedHash: string;
		unrelatedUnchanged: boolean;
	};
};

function object(value: unknown): Record<string, unknown> | null {
	return value !== null && typeof value === 'object'
		? (value as Record<string, unknown>)
		: null;
}

function hash(value: unknown): string {
	return createHash('sha256').update(JSON.stringify(value ?? null)).digest('hex');
}

function databaseCounts(db: Db): RecoveryInspection['counts'] {
	return {
		inventoryItems:
			db.select({ value: count() }).from(schema.inventoryItems).get()?.value ?? 0,
		inventoryOps:
			db.select({ value: count() }).from(schema.inventoryOpsLog).get()?.value ?? 0,
		recipes: db.select({ value: count() }).from(schema.recipes).get()?.value ?? 0
	};
}

function unrelatedFingerprint(db: Db, itemIds: number[], recipeId: number): string {
	return hash({
		inventory: db
			.select()
			.from(schema.inventoryItems)
			.where(notInArray(schema.inventoryItems.id, itemIds))
			.orderBy(asc(schema.inventoryItems.id))
			.all(),
		recipes: db
			.select()
			.from(schema.recipes)
			.where(notInArray(schema.recipes.id, [recipeId]))
			.orderBy(asc(schema.recipes.id))
			.all()
	});
}

function storedInventoryOperationIds(toolCalls: unknown): number[] {
	if (!Array.isArray(toolCalls)) return [];
	const ids = new Set<number>();
	for (const call of toolCalls as StoredToolCall[]) {
		const result = object(call.result);
		const single = result?.opId ?? result?.op_id;
		if (typeof single === 'number' && Number.isInteger(single) && single > 0) ids.add(single);
		const group = result?.opIds ?? result?.op_ids;
		if (Array.isArray(group)) {
			for (const value of group) {
				if (typeof value === 'number' && Number.isInteger(value) && value > 0) ids.add(value);
			}
		}
	}
	return [...ids].sort((a, b) => a - b);
}

function parseRecipeRepair(toolCalls: unknown): {
	before: RecipeSnapshot;
	afterNotes: string;
} {
	if (!Array.isArray(toolCalls)) throw new Error('Incident message has no stored tool calls.');
	const calls = toolCalls as StoredToolCall[];
	const edits = calls
		.map((call, index) => ({ call, index }))
		.filter(({ call }) => call.name === 'edit_recipe');
	if (edits.length !== 1) {
		throw new Error(`Expected one edit_recipe call in the incident message, found ${edits.length}.`);
	}
	const edit = edits[0];
	const editInput = object(edit.call.input);
	const editResult = object(edit.call.result);
	if (!editInput || editResult?.ok !== true) {
		throw new Error('The incident edit_recipe call was not a committed edit.');
	}
	const editKeys = Object.keys(editInput).sort();
	if (JSON.stringify(editKeys) !== JSON.stringify(['notes', 'slug'])) {
		throw new Error('The incident recipe edit changed fields beyond notes; refusing a partial repair.');
	}
	const slug = editInput.slug;
	const afterNotes = editInput.notes;
	if (typeof slug !== 'string' || typeof afterNotes !== 'string') {
		throw new Error('The incident recipe edit lacks a concrete slug or notes value.');
	}

	const reads = calls
		.slice(0, edit.index)
		.filter((call) => call.name === 'get_recipe')
		.map((call) => object(object(call.result)?.recipe))
		.filter((recipe): recipe is Record<string, unknown> => recipe?.slug === slug);
	const recipe = reads.at(-1);
	if (
		!recipe ||
		typeof recipe.id !== 'number' ||
		typeof recipe.slug !== 'string' ||
		typeof recipe.contentRevision !== 'number' ||
		(recipe.notes !== null && typeof recipe.notes !== 'string')
	) {
		throw new Error('No authoritative pre-edit recipe snapshot was stored before the incident edit.');
	}
	return {
		before: {
			id: recipe.id,
			slug: recipe.slug,
			contentRevision: recipe.contentRevision,
			notes: recipe.notes as string | null
		},
		afterNotes
	};
}

function loadIncident(db: Db, input: AssistantIncidentRecoveryInput) {
	const operationIds = [...new Set(input.operationIds)];
	if (operationIds.length === 0 || operationIds.some((id) => !Number.isInteger(id) || id < 1)) {
		throw new Error('At least one positive inventory operation ID is required.');
	}
	if (operationIds.length !== input.operationIds.length) {
		throw new Error('Inventory operation IDs must be unique.');
	}
	const operations = db
		.select()
		.from(schema.inventoryOpsLog)
		.where(inArray(schema.inventoryOpsLog.id, operationIds))
		.all()
		.sort((a, b) => b.id - a.id);
	if (operations.length !== operationIds.length) {
		const found = new Set(operations.map((operation) => operation.id));
		throw new Error(
			`Inventory operations not found: ${operationIds.filter((id) => !found.has(id)).join(', ')}.`
		);
	}
	for (const operation of operations) {
		if (
			operation.opType !== 'update' ||
			!operation.itemId ||
			!object(operation.beforeSnapshot) ||
			!object(operation.afterSnapshot)
		) {
			throw new Error(`Inventory operation ${operation.id} is not a restorable update.`);
		}
	}

	const inventoryMessage = db
		.select()
		.from(schema.chatMessages)
		.where(eq(schema.chatMessages.id, input.inventoryMessageId))
		.get();
	if (!inventoryMessage || inventoryMessage.role !== 'assistant') {
		throw new Error(
			`Assistant inventory incident message ${input.inventoryMessageId} was not found.`
		);
	}
	const storedOperationIds = storedInventoryOperationIds(inventoryMessage.toolCalls);
	const requestedOperationIds = [...operationIds].sort((a, b) => a - b);
	if (JSON.stringify(storedOperationIds) !== JSON.stringify(requestedOperationIds)) {
		throw new Error(
			'Requested inventory operations do not exactly match the incident message tool results.'
		);
	}
	if (
		operations.some(
			(operation) =>
				operation.actor !== 'ai' || operation.userId !== inventoryMessage.userId
		)
	) {
		throw new Error('Incident inventory operations do not belong to the assistant message user.');
	}
	const recipeMessage = db
		.select()
		.from(schema.chatMessages)
		.where(eq(schema.chatMessages.id, input.recipeMessageId))
		.get();
	if (!recipeMessage || recipeMessage.role !== 'assistant') {
		throw new Error(
			`Assistant recipe incident message ${input.recipeMessageId} was not found.`
		);
	}
	if (recipeMessage.userId !== inventoryMessage.userId) {
		throw new Error('Incident inventory and recipe messages belong to different users.');
	}
	const recipeRepair = parseRecipeRepair(recipeMessage.toolCalls);
	const recipe = db
		.select()
		.from(schema.recipes)
		.where(eq(schema.recipes.id, recipeRepair.before.id))
		.get();
	if (!recipe || recipe.slug !== recipeRepair.before.slug) {
		throw new Error('The incident recipe target no longer resolves to the stored recipe.');
	}
	return { operations, recipeRepair, recipe };
}

export function inspectAssistantIncidentRecovery(
	db: Db,
	input: AssistantIncidentRecoveryInput
): RecoveryInspection {
	const { operations, recipeRepair, recipe } = loadIncident(db, input);
	const inventory = operations.map((operation) => {
		const current = db
			.select()
			.from(schema.inventoryItems)
			.where(eq(schema.inventoryItems.id, operation.itemId!))
			.get();
		const before = operation.beforeSnapshot as ItemSnapshot;
		const after = operation.afterSnapshot as ItemSnapshot;
		return {
			operationId: operation.id,
			itemId: operation.itemId!,
			currentMatchesIncidentAfter: Boolean(
				current && inventorySnapshotsEqual(toSnapshot(current), after)
			),
			beforeHash: hash(before),
			afterHash: hash(after)
		};
	});
	const expectedCurrentRevision = recipeRepair.before.contentRevision + 1;
	const recipeMatches =
		recipe.contentRevision === expectedCurrentRevision &&
		recipe.notes === recipeRepair.afterNotes;
	const counts = databaseCounts(db);
	const itemIds = operations.map((operation) => operation.itemId!);
	return {
		inventoryMessageId: input.inventoryMessageId,
		recipeMessageId: input.recipeMessageId,
		operationIds: operations.map((operation) => operation.id),
		inventory,
		recipe: {
			id: recipe.id,
			slug: recipe.slug,
			expectedCurrentRevision,
			actualCurrentRevision: recipe.contentRevision,
			currentMatchesIncidentAfter: recipeMatches,
			beforeNotesHash: hash(recipeRepair.before.notes),
			afterNotesHash: hash(recipeRepair.afterNotes)
		},
		counts,
		unrelatedHash: unrelatedFingerprint(db, itemIds, recipe.id),
		ready: inventory.every((item) => item.currentMatchesIncidentAfter) && recipeMatches
	};
}

export function applyAssistantIncidentRecovery(
	db: Db,
	input: AssistantIncidentRecoveryInput
): AssistantIncidentRecoveryResult {
	const inspection = inspectAssistantIncidentRecovery(db, input);
	if (!inspection.ready) {
		throw new Error('Incident recovery preconditions failed; no changes were applied.');
	}

	return db.transaction((tx) => {
		const { operations, recipeRepair, recipe } = loadIncident(tx as Db, input);
		const compensatingOperationIds: number[] = [];
		for (const operation of operations) {
			const restored = restoreInventorySnapshot(
				tx,
				operation.itemId!,
				operation.afterSnapshot as ItemSnapshot,
				operation.beforeSnapshot as ItemSnapshot,
				{ actor: 'ai', userId: operation.userId },
				{
					source: 'assistant_incident_recovery',
					reversesOperationId: operation.id,
					inventoryMessageId: input.inventoryMessageId,
					recipeMessageId: input.recipeMessageId
				}
			);
			if (restored.opId !== null) compensatingOperationIds.push(restored.opId);
		}
		const updatedRecipe = updateCanonicalRecipe(tx, {
			recipeId: recipe.id,
			expectedRevision: recipe.contentRevision,
			changes: {
				notes: recipeRepair.before.notes,
				titleEn: null,
				categoryEn: null,
				cuisineEn: null,
				notesEn: null,
				ingredientsEn: null,
				directionsEn: null,
				translationStatus: recipe.language === 'en' ? 'ready' : 'pending',
				translatedAt: null
			}
		});
		if (!updatedRecipe) throw new Error('Recipe changed during incident recovery.');
		const restoredInventory = operations.every((operation) => {
			const current = tx
				.select()
				.from(schema.inventoryItems)
				.where(eq(schema.inventoryItems.id, operation.itemId!))
				.get();
			return Boolean(
				current &&
					inventorySnapshotsEqual(
						toSnapshot(current),
						operation.beforeSnapshot as ItemSnapshot
					)
			);
		});
		const counts = databaseCounts(tx as Db);
		const unrelatedHash = unrelatedFingerprint(
			tx as Db,
			operations.map((operation) => operation.itemId!),
			recipe.id
		);
		return {
			...inspection,
			applied: true as const,
			compensatingOperationIds,
			recipeRevision: updatedRecipe.contentRevision,
			postApply: {
				inventoryRestored: restoredInventory,
				recipeRestored:
					updatedRecipe.notes === recipeRepair.before.notes &&
					updatedRecipe.contentRevision === inspection.recipe.expectedCurrentRevision + 1,
				counts,
				unrelatedHash,
				unrelatedUnchanged: unrelatedHash === inspection.unrelatedHash
			}
		};
	});
}
