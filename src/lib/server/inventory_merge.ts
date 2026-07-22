// Internal matching/merge engine for the inventory mutation boundary.
// All writes (and their history logging) go through inventory_writes.ts;
// nothing else may import the mutating functions in this module.
import { and, eq, isNull } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { normalizeFoodCategory } from '$lib/food_categories';
import { normalizeUnit } from '$lib/food_class';
import type { Kind } from '$lib/food_class';
import { normalizeNameKey, tokenizeNameKey } from '$lib/match';
import * as schema from '$lib/server/db/schema';

type DB = BetterSQLite3Database<typeof schema>;
type Tx = Parameters<Parameters<DB['transaction']>[0]>[0];
export type DbOrTx = DB | Tx;
type InventoryItem = typeof schema.inventoryItems.$inferSelect;
type Section = 'freezer' | 'pantry';

export type FindOrMergeInventoryInput = {
	name: string;
	section: Section;
	qtyText?: string | null;
	qtyNum?: number | null;
	unit?: string | null;
	category?: string | null;
	kind?: Kind | null;
	foodClass?: string | null;
	madeFromRecipeId?: number | null;
	recipeStatus?: 'linked' | 'plan_to_add' | 'no_recipe' | null;
	isStaple?: boolean | null;
	needsReview?: boolean | null;
	reviewReason?: string | null;
	expiryDate?: string | null;
	createdAt?: Date | null;
	tags?: string[] | null;
};

export type FindOrMergeInventoryResult = {
	action: 'add' | 'update';
	item: InventoryItem;
	/** Pre-merge state when action === 'update'; null for a fresh add. */
	before: InventoryItem | null;
	verified: boolean;
	matchedBy?: 'normalized-key' | 'qualified-name';
	warnings: string[];
};

const MERGE_QUALIFIER_TOKENS = new Set([
	'ah',
	'albert',
	'heijn',
	'huismerk',
	'excellent',
	'premium',
	'original',
	'origineel',
	'naturel',
	'roomboter',
	'diepvrie',
	'plak',
	'plakje',
	'plakjes',
	'pak',
	'zak'
]);

function cleanString(value: string | null | undefined): string | null {
	const trimmed = value?.trim();
	return trimmed ? trimmed : null;
}

function cleanTags(tags: string[] | null | undefined): string[] {
	return [...new Set((tags ?? []).map((tag) => tag.trim().toLowerCase()).filter(Boolean))];
}

function unitsAlign(existingUnit: string | null, incomingUnit: string | null | undefined): boolean {
	return normalizeUnit(existingUnit) === normalizeUnit(incomingUnit);
}

function formatQtyText(qty: number, unit: string | null | undefined): string {
	const rounded = Math.round((qty + Number.EPSILON) * 100) / 100;
	const text = String(rounded);
	const cleanedUnit = cleanString(unit);
	return cleanedUnit ? `${text} ${cleanedUnit}` : text;
}

function qtyTextFor(item: Pick<InventoryItem, 'qtyText' | 'qtyNum' | 'unit'>): string | null {
	return item.qtyText ?? (item.qtyNum !== null ? formatQtyText(item.qtyNum, item.unit) : null);
}

function inputQtyText(input: FindOrMergeInventoryInput): string | null {
	return cleanString(input.qtyText) ?? (input.qtyNum !== undefined && input.qtyNum !== null
		? formatQtyText(input.qtyNum, input.unit)
		: null);
}

function nearerExpiry(a: string | null, b: string | null | undefined): string | null {
	const incoming = cleanString(b);
	if (!a) return incoming;
	if (!incoming) return a;
	return incoming < a ? incoming : a;
}

function earlierDate(existing: Date, incoming: Date | null | undefined): Date {
	if (!incoming) return existing;
	return incoming.getTime() < existing.getTime() ? incoming : existing;
}

function uniqueTokens(name: string): string[] {
	return [...new Set(tokenizeNameKey(name))];
}

function isSubset(subset: string[], superset: string[]): boolean {
	return subset.every((token) => superset.includes(token));
}

function isQualifiedDuplicate(a: string, b: string): boolean {
	if (normalizeNameKey(a) === normalizeNameKey(b)) return true;

	const aTokens = uniqueTokens(a);
	const bTokens = uniqueTokens(b);
	if (aTokens.length === 0 || bTokens.length === 0) return false;

	if (isSubset(aTokens, bTokens)) {
		return bTokens
			.filter((token) => !aTokens.includes(token))
			.every((token) => MERGE_QUALIFIER_TOKENS.has(token));
	}

	if (isSubset(bTokens, aTokens)) {
		return aTokens
			.filter((token) => !bTokens.includes(token))
			.every((token) => MERGE_QUALIFIER_TOKENS.has(token));
	}

	return false;
}

function mergeQuantity(existing: InventoryItem, input: FindOrMergeInventoryInput, warnings: string[]) {
	const incomingHasQuantity =
		input.qtyNum !== undefined || input.qtyText !== undefined || input.unit !== undefined;
	if (!incomingHasQuantity) {
		return {
			qtyText: existing.qtyText,
			qtyNum: existing.qtyNum,
			unit: existing.unit
		};
	}

	if (
		existing.qtyNum !== null &&
		input.qtyNum !== undefined &&
		input.qtyNum !== null &&
		unitsAlign(existing.unit, input.unit ?? null)
	) {
		const unit = existing.unit ?? cleanString(input.unit);
		const qtyNum = existing.qtyNum + input.qtyNum;
		return {
			qtyText: formatQtyText(qtyNum, unit),
			qtyNum,
			unit
		};
	}

	if (existing.qtyNum === null && existing.qtyText === null && input.qtyNum !== undefined) {
		const unit = cleanString(input.unit);
		const qtyNum = input.qtyNum ?? null;
		return {
			qtyText: inputQtyText(input),
			qtyNum,
			unit
		};
	}

	const existingText = qtyTextFor(existing);
	const incomingText = inputQtyText(input);
	if (!incomingText) {
		return {
			qtyText: existing.qtyText,
			qtyNum: existing.qtyNum,
			unit: existing.unit
		};
	}

	if (!existingText) {
		return {
			qtyText: incomingText,
			qtyNum: input.qtyNum ?? null,
			unit: cleanString(input.unit)
		};
	}

	if (existingText === incomingText) {
		return {
			qtyText: existing.qtyText,
			qtyNum: existing.qtyNum,
			unit: existing.unit
		};
	}

	warnings.push('unit_mismatch_quantity_not_summed');
	return {
		qtyText: `${existingText} + ${incomingText}`,
		qtyNum: null,
		unit: null
	};
}

export function readInventoryItem(db: DbOrTx, id: number): InventoryItem | undefined {
	return db.select().from(schema.inventoryItems).where(eq(schema.inventoryItems.id, id)).get();
}

// Merge key (ADR 0001): (section, kind, normalized name); leftovers additionally
// key on made_from_recipe_id so two different recipe leftovers with the same
// name, or an ingredient vs a leftover of the same name, never collapse.
// Transition rule for legacy null-kind rows: null matches an incoming kind
// (the merge adopts it and flags Needs Review); two different explicit kinds
// never merge.
function kindsCompatible(existing: InventoryItem, input: FindOrMergeInventoryInput): boolean {
	const incomingKind = input.kind ?? null;
	if (existing.kind && incomingKind && existing.kind !== incomingKind) return false;
	if (existing.kind === 'leftover' || incomingKind === 'leftover') {
		return (existing.madeFromRecipeId ?? null) === (input.madeFromRecipeId ?? null);
	}
	return true;
}

// Exported so the commit-risk classifier (P5.3) can do a readonly "would this
// merge?" pre-match without mutating. This never writes; findOrMergeInventory
// remains the only merge path that mutates.
export function findExistingItem(db: DbOrTx, input: FindOrMergeInventoryInput) {
	const incomingKey = normalizeNameKey(input.name);
	const candidates = db
		.select()
		.from(schema.inventoryItems)
		.where(and(eq(schema.inventoryItems.section, input.section), isNull(schema.inventoryItems.deletedAt)))
		.all()
		.filter((item) => kindsCompatible(item, input));

	if (incomingKey) {
		const normalized = candidates.find((item) => normalizeNameKey(item.name) === incomingKey);
		if (normalized) return { item: normalized, matchedBy: 'normalized-key' as const };
	}

	const qualified = candidates.find((item) => isQualifiedDuplicate(input.name, item.name));
	return qualified ? { item: qualified, matchedBy: 'qualified-name' as const } : null;
}

export function findOrMergeInventory(
	db: DbOrTx,
	input: FindOrMergeInventoryInput
): FindOrMergeInventoryResult {
	const now = new Date();
	const tags = cleanTags(input.tags);
	const existingMatch = findExistingItem(db, input);

	if (!existingMatch) {
		const createdAt = input.createdAt ?? now;
		const item = db
			.insert(schema.inventoryItems)
			.values({
				name: input.name.trim(),
				section: input.section,
				qtyText: cleanString(input.qtyText),
				qtyNum: input.qtyNum ?? null,
				unit: cleanString(input.unit),
				category: normalizeFoodCategory(input.category),
				kind: input.kind ?? null,
				foodClass: input.foodClass ?? null,
				madeFromRecipeId: input.madeFromRecipeId ?? null,
				recipeStatus: input.recipeStatus ?? null,
				recipeStatusAt: input.recipeStatus ? now : null,
				isStaple: input.isStaple ?? false,
				needsReview: input.needsReview ?? false,
				reviewReason: input.reviewReason ?? null,
				expiryDate: cleanString(input.expiryDate),
				tags,
				createdAt,
				updatedAt: now
			})
			.returning()
			.get();

		const verified = readInventoryItem(db, item.id);
		return {
			action: 'add',
			item: verified ?? item,
			before: null,
			verified: Boolean(verified),
			warnings: []
		};
	}

	const existing = existingMatch.item;
	const warnings: string[] = [];
	const quantity = mergeQuantity(existing, input, warnings);
	const nextTags = [...new Set([...(existing.tags ?? []), ...tags])];

	const kindAdopted = existing.kind === null && (input.kind ?? null) !== null;
	if (kindAdopted) warnings.push('kind_adopted_on_merge');
	const needsReview =
		existing.needsReview || (input.needsReview ?? false) || kindAdopted;
	const reviewReason = kindAdopted
		? 'kind_adopted_on_merge'
		: (input.reviewReason ?? existing.reviewReason);

	const updated = db
		.update(schema.inventoryItems)
		.set({
			qtyText: quantity.qtyText,
			qtyNum: quantity.qtyNum,
			unit: quantity.unit,
			category: existing.category ?? normalizeFoodCategory(input.category),
			kind: existing.kind ?? input.kind ?? null,
			foodClass: existing.foodClass ?? input.foodClass ?? null,
			isStaple: input.isStaple ?? existing.isStaple,
			needsReview,
			reviewReason: needsReview ? reviewReason : null,
			expiryDate: nearerExpiry(existing.expiryDate, input.expiryDate),
			createdAt: earlierDate(existing.createdAt, input.createdAt),
			tags: nextTags,
			updatedAt: now
		})
		.where(eq(schema.inventoryItems.id, existing.id))
		.returning()
		.get();

	const verified = readInventoryItem(db, updated.id);
	return {
		action: 'update',
		item: verified ?? updated,
		before: existing,
		verified: Boolean(verified),
		matchedBy: existingMatch.matchedBy,
		warnings
	};
}
