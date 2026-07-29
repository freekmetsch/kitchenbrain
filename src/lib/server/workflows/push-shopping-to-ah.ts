import {
	addFreetextItems,
	addProductItems,
	addProductsToOrder,
	AHNotConnectedError,
	AH_NOT_CONNECTED,
	getActiveOrder,
	getAHStatus,
	getProductsByIds,
	searchProducts,
	type AHProduct,
	type SearchOutcome
} from '$lib/server/ah/client';
import { aiArchetypePicks } from '$lib/server/ah/ai_pick';
import {
	bindAhPushDecisions,
	claimAhPreviewToken,
	createAhPreviewToken,
	isAhEligibleShoppingRow,
	type AhPreviewBinding,
	type AhPushDecision,
	type AhPreviewToken
} from '$lib/server/ah/preview_tokens';
import {
	deriveQuantity,
	effectiveUnitPrice,
	fallbackTerm,
	normalize,
	pricePerCount,
	rankProducts,
	toSearchTerm
} from '$lib/server/ah/matching';
import { db as appDb } from '$lib/server/db/index';
import type { Db } from '$lib/server/db/types';
import {
	createShoppingPushAttempt,
	getShoppingWeekView,
	listAhFavorites,
	listRecipeAhPreferencesForSources,
	recordShoppingPushOutcome,
	type ShoppingPushItemInsert,
	type ShoppingBuyRow,
	type RecipeAhPreference
} from '$lib/server/domains/shopping';
import { getWeekStartDay } from '$lib/server/meal_plan/prefs';
import type {
	PreviewConflict,
	PreviewItem,
	PreviewProduct
} from '$lib/shopping_ah';
import {
	initializeShoppingSourceData,
	materializeShoppingWeek
} from '$lib/server/workflows/reconcile-shopping';

const SEARCH_POOL = 24;
const DEFAULT_CANDIDATES = 10;

export { AH_NOT_CONNECTED };

type AhStatus = { connected: boolean; memberName: string | null };
type ProductWriteResult = { ok: boolean; status: number; uncertain: boolean };
type FreetextWriteResult = { pushed: string[]; failed: string[]; uncertain: string[] };
type ActiveOrder = { id: number } | null;

export type ShoppingAhAdapter = {
	getStatus(): AhStatus;
	searchProducts(dutchTerm: string, size: number): Promise<SearchOutcome>;
	getProductsByIds(ids: string[]): Promise<AHProduct[]>;
	pickArchetypes(items: PreviewItem[]): Promise<Map<string, number>>;
	getActiveOrder(): Promise<ActiveOrder>;
	addProductItems(products: Array<{ id: string; qty: number }>): Promise<ProductWriteResult>;
	addProductsToOrder(
		orderId: number,
		products: Array<{ id: string; qty: number }>
	): Promise<ProductWriteResult>;
	addFreetextItems(dutchDescriptions: string[]): Promise<FreetextWriteResult>;
	isNotConnectedError(cause: unknown): boolean;
};

export type ShoppingAhDependencies = {
	db: Db;
	ah: ShoppingAhAdapter;
	createPreviewToken: typeof createAhPreviewToken;
	claimPreviewToken: typeof claimAhPreviewToken;
	getWeekStartDay(db: Db): number;
	now(): Date;
};

export class ShoppingAhWorkflowError extends Error {
	constructor(
		public status: 400 | 409,
		message: string
	) {
		super(message);
		this.name = 'ShoppingAhWorkflowError';
	}
}

export type PreviewShoppingForAhInput = {
	userId: number;
	weekStart: string;
	entryIds: number[];
};

export type PushShoppingToAhInput = {
	userId: number;
	previewToken: string;
	decisions: AhPushDecision[];
};

function defaultDependencies(): ShoppingAhDependencies {
	return {
		db: appDb,
		ah: {
			getStatus: getAHStatus,
			searchProducts,
			getProductsByIds,
			pickArchetypes: aiArchetypePicks,
			getActiveOrder,
			addProductItems,
			addProductsToOrder,
			addFreetextItems,
			isNotConnectedError: (cause) => cause instanceof AHNotConnectedError
		},
		createPreviewToken: createAhPreviewToken,
		claimPreviewToken: claimAhPreviewToken,
		getWeekStartDay,
		now: () => new Date()
	};
}

export function getShoppingAhStatus(
	dependencies: ShoppingAhDependencies = defaultDependencies()
): AhStatus {
	return dependencies.ah.getStatus();
}

function toPreviewProduct(
	product: AHProduct,
	amount: string | null,
	unit: string | null,
	incompatibleQuantities: boolean
): PreviewProduct {
	const unitPrice = effectiveUnitPrice(product);
	return {
		id: product.id,
		name: product.name,
		price: product.currentPrice ?? product.priceBeforeBonus,
		regularPrice: product.priceBeforeBonus,
		isBonus: product.isBonus,
		bonusMechanism: product.bonusMechanism,
		salesUnitSize: product.salesUnitSize,
		unitPrice: unitPrice ? `€${unitPrice.value.toFixed(2)}/${unitPrice.basis}` : null,
		imageUrl: product.imageUrl,
		isPreviouslyBought: product.isPreviouslyBought,
		qty: incompatibleQuantities ? null : deriveQuantity(amount, unit, product.salesUnitSize),
		pricePerCount: pricePerCount(product)
	};
}

function quantitySources(row: ShoppingBuyRow) {
	return row.sources.map((source) => ({
		name: source.name,
		amount: source.amount,
		unit: source.unit,
		recipeTitle: source.recipeTitle,
		sourceKind: source.sourceKind
	}));
}

function sourceQuantityKey(source: ShoppingBuyRow['sources'][number]): string | null {
	const amount = source.amount?.trim().toLocaleLowerCase('nl-NL');
	const unit = source.unit?.trim().toLocaleLowerCase('nl-NL');
	if (!amount && !unit) return null;
	return `${amount ?? ''}\u0000${unit ?? ''}`;
}

export function shoppingRowConflicts(row: ShoppingBuyRow): PreviewConflict[] {
	const manual = row.sources.filter((source) => source.sourceKind === 'manual');
	const recipe = row.sources.filter((source) => source.sourceKind === 'recipe');
	const conflicts: PreviewConflict[] = [];
	const counts = {
		sourceCount: row.sources.length,
		manualCount: manual.length,
		recipeCount: recipe.length
	};
	if (row.incompatibleQuantities) {
		conflicts.push({ kind: 'incompatible_quantity', ...counts });
	}
	if (manual.length > 0 && recipe.length > 0) {
		const manualQuantities = new Set(
			manual.map(sourceQuantityKey).filter((key): key is string => key !== null)
		);
		const duplicates = recipe.some((source) => {
			const key = sourceQuantityKey(source);
			return key !== null && manualQuantities.has(key);
		});
		conflicts.push({
			kind: duplicates ? 'duplicate_quantity' : 'manual_recipe_overlap',
			...counts
		});
	}
	if (row.sources.length >= 3) {
		conflicts.push({ kind: 'multi_source_total', ...counts });
	}
	return conflicts;
}

function conflictSignature(conflicts: PreviewConflict[]): string {
	return conflicts
		.map(
			(conflict) =>
				`${conflict.kind}:${conflict.sourceCount}:${conflict.manualCount}:${conflict.recipeCount}`
		)
		.join('|');
}

function quantitySummary(row: ShoppingBuyRow): string | null {
	if (!row.incompatibleQuantities) return null;
	const parts = row.sources
		.map((source) => [source.amount, source.unit].filter(Boolean).join(' '))
		.filter(Boolean);
	return parts.length ? parts.join(' + ') : null;
}

async function searchWithFallback(
	adapter: ShoppingAhAdapter,
	dutchName: string
): Promise<{ outcome: SearchOutcome; usedDutchTerm: string }> {
	const cleanedDutchTerm = toSearchTerm(dutchName);
	const outcome = await adapter.searchProducts(cleanedDutchTerm, SEARCH_POOL);
	if (outcome.ok && !outcome.products.length) {
		const fallbackDutchTerm = fallbackTerm(cleanedDutchTerm);
		if (fallbackDutchTerm) {
			const second = await adapter.searchProducts(fallbackDutchTerm, SEARCH_POOL);
			if (second.ok && second.products.length) {
				return { outcome: second, usedDutchTerm: fallbackDutchTerm };
			}
		}
	}
	return { outcome, usedDutchTerm: cleanedDutchTerm };
}

type RowPreference =
	| { kind: 'none' }
	| { kind: 'recipe'; preference: RecipeAhPreference }
	| { kind: 'unresolved' };

function resolveRowPreference(
	row: ShoppingBuyRow,
	preferences: Map<string, RecipeAhPreference>,
	globalFavoriteId: string | undefined
): RowPreference {
	const sourcePreferences = row.sources.map((source) => {
		if (
			source.sourceKind !== 'recipe' ||
			source.recipeId == null ||
			!source.ingredientId
		) {
			return null;
		}
		return preferences.get(`${source.recipeId}\u0000${source.ingredientId}`) ?? null;
	});
	const selected = sourcePreferences.filter(
		(preference): preference is RecipeAhPreference => preference !== null
	);
	if (selected.length === 0) return { kind: 'none' };
	const everySourcePreferred =
		selected.length === row.sources.length &&
		row.sources.every((source) => source.sourceKind === 'recipe');
	const productIds = new Set(selected.map((preference) => preference.productId));
	if (!everySourcePreferred || productIds.size !== 1) return { kind: 'unresolved' };
	const preference = selected[0];
	if (globalFavoriteId && globalFavoriteId !== preference.productId) {
		return { kind: 'unresolved' };
	}
	return { kind: 'recipe', preference };
}

function preferenceSignature(
	resolution: RowPreference,
	_globalFavoriteId: string | undefined
): string {
	if (resolution.kind === 'recipe') return `recipe:${resolution.preference.productId}`;
	if (resolution.kind === 'unresolved') return 'unresolved';
	// A household favorite ranks candidates but does not authorize an AH write.
	// Let the user explicitly save/edit/forget that ranking inside an active
	// preview without invalidating the already reviewed product set.
	return 'none';
}

export async function previewShoppingForAh(
	input: PreviewShoppingForAhInput,
	dependencies: ShoppingAhDependencies = defaultDependencies()
): Promise<{ ok: true; previewToken: string; items: PreviewItem[] }> {
	const { db, ah } = dependencies;
	const requested = new Set(input.entryIds);
	const weekStartDay = dependencies.getWeekStartDay(db);
	const prepared = db.transaction((tx) => {
		initializeShoppingSourceData(tx);
		materializeShoppingWeek(tx, input.weekStart, { weekStartDay });
		const rows = getShoppingWeekView(tx, input.weekStart).toBuy
			.filter(isAhEligibleShoppingRow)
			.filter((row) => row.entryIds.some((id) => requested.has(id)));
		const favorites = new Map(
			listAhFavorites(tx)
				.map((favorite) => [favorite.nameKey, favorite])
		);
		const recipePreferences = new Map(
			listRecipeAhPreferencesForSources(
				tx,
				rows.flatMap((row) => row.sources)
			).map((preference) => [
				`${preference.recipeId}\u0000${preference.ingredientId}`,
				preference
			])
		);
		const rowPreferences = new Map(
			rows.map((row) => {
				const ref = `entries:${[...row.entryIds].sort((a, b) => a - b).join(',')}`;
				return [
					ref,
					resolveRowPreference(
						row,
						recipePreferences,
						favorites.get(normalize(row.name))?.productId
					)
				] as const;
			})
		);
		return { rows, favorites, rowPreferences };
	});
	const { rows, favorites, rowPreferences } = prepared;
	const represented = new Set(rows.flatMap((row) => row.entryIds));
	if ([...requested].some((id) => !represented.has(id))) {
		throw new ShoppingAhWorkflowError(409, 'The shopping list changed; review it again');
	}

	const items: PreviewItem[] = await Promise.all(
		rows.map(async (row): Promise<PreviewItem> => {
			const ref = `entries:${[...row.entryIds].sort((a, b) => a - b).join(',')}`;
			const rowPreference = rowPreferences.get(ref) ?? { kind: 'none' as const };
			const purchaseForm = row.sources.find((source) => source.purchaseForm)?.purchaseForm;
			const { outcome, usedDutchTerm } = await searchWithFallback(ah, row.name);
			const sourceAmounts = quantitySources(row);
			const conflicts = shoppingRowConflicts(row);
			const sourceReviewRequired = conflicts.some(
				(conflict) => conflict.kind !== 'incompatible_quantity'
			);
			if (!outcome.ok) {
				return {
					ref,
					sourceName: row.name,
					term: row.name,
					amount: row.amount,
					unit: row.unit,
					incompatibleQuantities: row.incompatibleQuantities,
					quantitySources: sourceAmounts,
					conflicts,
					...(sourceReviewRequired ? { requiresExplicitDecision: true } : {}),
					purchaseForm,
					status: 'unknown',
					candidates: [],
					lowConfidence: false,
					...(rowPreference.kind === 'recipe'
						? {
								preferenceState: 'recipe' as const,
								preferenceLabel: rowPreference.preference.variantLabel
							}
						: rowPreference.kind === 'unresolved'
							? {
								requiresExplicitDecision: true,
								preferenceState: 'unresolved' as const
							}
						: {})
				};
			}
			if (!outcome.products.length) {
				return {
					ref,
					sourceName: row.name,
					term: row.name,
					amount: row.amount,
					unit: row.unit,
					incompatibleQuantities: row.incompatibleQuantities,
					quantitySources: sourceAmounts,
					conflicts,
					...(sourceReviewRequired ? { requiresExplicitDecision: true } : {}),
					purchaseForm,
					status: 'freetext',
					candidates: [],
					lowConfidence: false,
					...(rowPreference.kind === 'recipe'
						? {
								preferenceState: 'recipe' as const,
								preferenceLabel: rowPreference.preference.variantLabel
							}
						: rowPreference.kind === 'unresolved'
							? {
								requiresExplicitDecision: true,
								preferenceState: 'unresolved' as const
							}
						: {})
				};
			}
			const { ranked, lowConfidence } = rankProducts(
				usedDutchTerm,
				outcome.products,
				purchaseForm
			);
			return {
				ref,
				sourceName: row.name,
				term: row.name,
				amount: row.amount,
				unit: row.unit,
				incompatibleQuantities: row.incompatibleQuantities,
				quantitySources: sourceAmounts,
				conflicts,
				...(sourceReviewRequired ? { requiresExplicitDecision: true } : {}),
				purchaseForm,
				status: 'product',
				candidates: ranked
					.slice(0, DEFAULT_CANDIDATES)
					.map((product) =>
						toPreviewProduct(
							product,
							row.amount,
							row.unit,
							row.incompatibleQuantities
						)
					),
				lowConfidence,
				...(rowPreference.kind === 'recipe'
					? {
							preferenceState: 'recipe' as const,
							preferenceLabel: rowPreference.preference.variantLabel
						}
					: rowPreference.kind === 'unresolved'
						? {
								requiresExplicitDecision: true,
								preferenceState: 'unresolved' as const
							}
						: {})
			};
		})
	);

	const missingPins: Array<{
		item: PreviewItem;
		productId: string;
		kind: 'favorite' | 'recipe';
	}> = [];
	for (const item of items) {
		const rowPreference = rowPreferences.get(item.ref) ?? { kind: 'none' as const };
		if (rowPreference.kind === 'unresolved') continue;
		const recipePreference =
			rowPreference.kind === 'recipe' ? rowPreference.preference : undefined;
		const favorite = recipePreference ? undefined : favorites.get(normalize(item.term));
		const productId = recipePreference?.productId ?? favorite?.productId;
		if (!productId || (item.status === 'unknown' && !recipePreference)) continue;
		const index = item.candidates.findIndex(
			(candidate) => candidate.id === productId
		);
		if (index >= 0) {
			const [candidate] = item.candidates.splice(index, 1);
			item.candidates.unshift({
				...candidate,
				...(recipePreference
					? { isRecipePreference: true }
					: { isFavorite: true })
			});
			item.status = 'product';
			item.lowConfidence = false;
		} else {
			missingPins.push({
				item,
				productId,
				kind: recipePreference ? 'recipe' : 'favorite'
			});
		}
	}
	if (missingPins.length) {
		const fetched = new Map(
			(
				await ah.getProductsByIds([
					...new Set(missingPins.map((item) => item.productId))
				])
			).map((product) => [product.id, product])
		);
		for (const { item, productId, kind } of missingPins) {
			const product = fetched.get(productId);
			if (!product) {
				if (kind === 'recipe') {
					item.preferenceState = 'unavailable';
					item.requiresExplicitDecision = true;
				}
				continue;
			}
			item.candidates.unshift({
				...toPreviewProduct(
					product,
					item.amount,
					item.unit,
					item.incompatibleQuantities
				),
				...(kind === 'recipe'
					? { isRecipePreference: true }
					: { isFavorite: true })
			});
			item.status = 'product';
			item.lowConfidence = false;
		}
	}
	const adjustable = items.filter(
		(item) =>
			item.status === 'product' &&
			!item.candidates[0]?.isFavorite &&
			!item.candidates[0]?.isRecipePreference &&
			!item.requiresExplicitDecision &&
			item.candidates.length > 1
	);
	const picks = await ah.pickArchetypes(adjustable);
	for (const item of adjustable) {
		const index = picks.get(item.ref);
		if (index !== undefined && index > 0 && index < item.candidates.length) {
			const [candidate] = item.candidates.splice(index, 1);
			item.candidates.unshift(candidate);
		}
	}
	const byRef = new Map(
		rows.map((row) => [
			`entries:${[...row.entryIds].sort((a, b) => a - b).join(',')}`,
			row
		])
	);
	const previewToken = dependencies.createPreviewToken({
		userId: input.userId,
		weekStart: input.weekStart,
		items: items.map((item) => {
			const row = byRef.get(item.ref)!;
			return {
				ref: item.ref,
				entryIds: row.entryIds,
				entryRevisions: row.sources.map((source) => source.revision),
				term: item.term,
				amount: item.amount,
				unit: item.unit,
				incompatibleQuantities: item.incompatibleQuantities,
				quantitySummary: quantitySummary(row),
				conflictSignature: conflictSignature(item.conflicts),
				preferenceSignature: preferenceSignature(
					rowPreferences.get(item.ref) ?? { kind: 'none' },
					favorites.get(normalize(row.name))?.productId
				),
				offeredProducts: item.candidates.map((candidate) => ({
					id: candidate.id,
					name: candidate.name
				}))
			};
		})
	});
	return { ok: true, previewToken, items };
}

function freetextDescription(item: AhPreviewBinding): string {
	if (item.incompatibleQuantities) {
		return [item.term, item.quantitySummary].filter(Boolean).join(' — ');
	}
	return [item.term, item.amount, item.unit]
		.filter((value) => value && value.trim())
		.join(' ');
}

class AhWriteUncertainError extends Error {}

function assertCurrentPreview(
	db: Db,
	weekStart: string,
	bindings: AhPreviewBinding[]
): void {
	const currentRows = new Map(
		getShoppingWeekView(db, weekStart)
			.toBuy.filter(isAhEligibleShoppingRow)
			.map((row) => [
				`entries:${[...row.entryIds].sort((a, b) => a - b).join(',')}`,
				row
			])
	);
	const favorites = new Map(
		listAhFavorites(db).map((favorite) => [favorite.nameKey, favorite])
	);
	const recipePreferences = new Map(
		listRecipeAhPreferencesForSources(
			db,
			[...currentRows.values()].flatMap((row) => row.sources)
		).map((preference) => [
			`${preference.recipeId}\u0000${preference.ingredientId}`,
			preference
		])
	);
	for (const binding of bindings) {
		const row = currentRows.get(binding.ref);
		if (
			!row ||
			row.name !== binding.term ||
			row.amount !== binding.amount ||
			row.unit !== binding.unit ||
			row.incompatibleQuantities !== (binding.incompatibleQuantities ?? false)
		) {
			throw new ShoppingAhWorkflowError(
				409,
				'The shopping list changed; review it again'
			);
		}
		if (
			conflictSignature(shoppingRowConflicts(row)) !==
			(binding.conflictSignature ?? '')
		) {
			throw new ShoppingAhWorkflowError(
				409,
				'The shopping source conflicts changed; review them again'
			);
		}
		const ids = [...row.entryIds].sort((a, b) => a - b);
		const expectedIds = [...binding.entryIds].sort((a, b) => a - b);
		if (JSON.stringify(ids) !== JSON.stringify(expectedIds)) {
			throw new ShoppingAhWorkflowError(
				409,
				'The shopping sources changed; review them again'
			);
		}
		const revisions = new Map(
			row.sources.map((source) => [source.id, source.revision])
		);
		if (
			binding.entryIds.some(
				(id, index) => revisions.get(id) !== binding.entryRevisions[index]
			)
		) {
			throw new ShoppingAhWorkflowError(
				409,
				'A shopping choice changed; review it again'
			);
		}
		const currentPreferenceSignature = preferenceSignature(
			resolveRowPreference(
				row,
				recipePreferences,
				favorites.get(normalize(row.name))?.productId
			),
			favorites.get(normalize(row.name))?.productId
		);
		if (
			binding.preferenceSignature !== undefined &&
			binding.preferenceSignature !== currentPreferenceSignature
		) {
			throw new ShoppingAhWorkflowError(
				409,
				'An AH product preference changed; review the shopping list again'
			);
		}
	}
}

type PushOutcome = {
	ok: boolean;
	uncertain: boolean;
	reason?: string;
	productsPushed: number;
	freetextPushed: number;
	failed: Array<{ term: string; kind: 'product' | 'freetext' }>;
	destination: 'order' | 'list';
	markedBoughtRefs: string[];
	accountName: string | null;
};

function bindDecisions(
	preview: AhPreviewToken,
	input: PushShoppingToAhInput
): Map<string, AhPushDecision> {
	try {
		return bindAhPushDecisions(preview.items, input.decisions);
	} catch (cause) {
		throw new ShoppingAhWorkflowError(
			400,
			cause instanceof Error ? cause.message : 'Invalid AH push decisions'
		);
	}
}

export async function pushShoppingToAh(
	input: PushShoppingToAhInput,
	dependencies: ShoppingAhDependencies = defaultDependencies()
): Promise<PushOutcome | { ok: false; reason: typeof AH_NOT_CONNECTED }> {
	const { db, ah } = dependencies;
	const preview = dependencies.claimPreviewToken(input.previewToken, input.userId);
	if (!preview) {
		throw new ShoppingAhWorkflowError(
			409,
			'This AH review expired or was already used'
		);
	}
	const decisions = bindDecisions(preview, input);
	assertCurrentPreview(db, preview.weekStart, preview.items);
	if (
		![...decisions.values()].some((decision) => decision.mode !== 'exclude')
	) {
		throw new ShoppingAhWorkflowError(400, 'Choose at least one item to send');
	}
	if (!ah.getStatus().connected) {
		return { ok: false, reason: AH_NOT_CONNECTED };
	}

	let destination: 'order' | 'list' = 'list';
	let historyId: number | null = null;
	let productsPushed = 0;
	let freetextPushed = 0;
	let reason: string | undefined;
	const failed: Array<{ term: string; kind: 'product' | 'freetext' }> = [];
	const successfulRefs = new Set<string>();
	const uncertainRefs = new Set<string>();
	try {
		const order = await ah.getActiveOrder();
		if (order) destination = 'order';
		historyId = createShoppingPushAttempt(db, {
			weekStartDate: preview.weekStart,
			userId: input.userId,
			destination,
			accountName: ah.getStatus().memberName,
			createdAt: dependencies.now()
		});

		const productChoices = preview.items.flatMap((item) => {
			const decision = decisions.get(item.ref)!;
			return decision.mode === 'product' ? [{ item, decision }] : [];
		});
		if (productChoices.length) {
			const requestItems = productChoices.map(({ decision }) => ({
				id: decision.productId,
				qty: decision.qty
			}));
			const result = order
				? await ah.addProductsToOrder(order.id, requestItems)
				: await ah.addProductItems(requestItems);
			if (result.ok) {
				productsPushed = productChoices.length;
				productChoices.forEach(({ item }) => successfulRefs.add(item.ref));
			} else if (result.uncertain) {
				productChoices.forEach(({ item }) => uncertainRefs.add(item.ref));
				throw new AhWriteUncertainError(
					'AH returned an ambiguous product-write response'
				);
			} else {
				productChoices.forEach(({ item }) =>
					failed.push({ term: item.term, kind: 'product' })
				);
				reason = `Albert Heijn rejected the product push (HTTP ${result.status}).`;
			}
		}

		const textChoices = preview.items.filter(
			(item) => decisions.get(item.ref)?.mode === 'freetext'
		);
		if (textChoices.length) {
			if (order) {
				textChoices.forEach((item) =>
					failed.push({
						term: freetextDescription(item),
						kind: 'freetext'
					})
				);
				reason ??=
					'There is an open AH order, so free-text items were not sent.';
			} else {
				const descriptions = textChoices.map(freetextDescription);
				const result = await ah.addFreetextItems(descriptions);
				freetextPushed = result.pushed.length;
				if (result.uncertain.length) {
					const uncertainDescriptions = new Set(result.uncertain);
					textChoices
						.filter((item) =>
							uncertainDescriptions.has(freetextDescription(item))
						)
						.forEach((item) => uncertainRefs.add(item.ref));
					throw new AhWriteUncertainError(
						'AH returned an ambiguous free-text write response'
					);
				}
				const failedCounts = new Map<string, number>();
				result.failed.forEach((term) =>
					failedCounts.set(term, (failedCounts.get(term) ?? 0) + 1)
				);
				textChoices.forEach((item, index) => {
					const description = descriptions[index];
					const count = failedCounts.get(description) ?? 0;
					if (count) {
						failedCounts.set(description, count - 1);
						failed.push({ term: description, kind: 'freetext' });
					} else {
						successfulRefs.add(item.ref);
					}
				});
				if (result.failed.length) {
					reason ??= 'Some free-text items could not be sent.';
				}
			}
		}

		const markedBoughtRefs = db.transaction((tx) => {
			const completedAt = dependencies.now();
			const rows: ShoppingPushItemInsert[] =
				preview.items.map((item) => {
					const decision = decisions.get(item.ref)!;
					const product =
						decision.mode === 'product'
							? item.offeredProducts.find(
									(candidate) => candidate.id === decision.productId
								)
							: undefined;
					const status =
						decision.mode === 'exclude'
							? 'skipped'
							: successfulRefs.has(item.ref)
								? 'success'
								: 'failed';
					return {
						pushId: historyId!,
						sourceRef: item.entryIds.join(','),
						sourceName: item.term,
						amount: item.amount,
						unit: item.unit,
						mode:
							decision.mode === 'exclude' ? 'skip' : decision.mode,
						ahProductId: product?.id ?? null,
						ahProductName: product?.name ?? null,
						quantity:
							decision.mode === 'product'
								? decision.qty
								: decision.mode === 'freetext'
									? 1
									: null,
						destination,
						status,
						failureReason:
							status === 'failed'
								? reason ?? 'AH rejected this item'
								: null,
						createdAt: completedAt
					};
				});
			const successful = preview.items.filter((item) =>
				successfulRefs.has(item.ref)
			);
			const entryIds = successful.flatMap((item) => item.entryIds);
			recordShoppingPushOutcome(tx, {
				historyId: historyId!,
				items: rows,
				boughtEntryIds: entryIds,
				productsPushed,
				freetextPushed,
				failedCount: failed.length,
				skippedCount:
					preview.items.length - successful.length - failed.length,
				attemptStatus: failed.length ? 'failed' : 'succeeded',
				attemptError: reason ?? null,
				completedAt
			});
			return successful.map((item) => item.ref);
		});
		return {
			ok: failed.length === 0,
			uncertain: false,
			reason,
			productsPushed,
			freetextPushed,
			failed,
			destination,
			markedBoughtRefs,
			accountName: ah.getStatus().memberName
		};
	} catch (cause) {
		const definite = ah.isNotConnectedError(cause);
		reason = definite
			? AH_NOT_CONNECTED
			: 'AH may have received part of this push. Review the basket before trying again.';
		if (historyId != null) {
			db.transaction((tx) => {
				const completedAt = dependencies.now();
				const rows: ShoppingPushItemInsert[] =
					preview.items.map((item) => {
						const decision = decisions.get(item.ref)!;
						const product =
							decision.mode === 'product'
								? item.offeredProducts.find(
										(candidate) => candidate.id === decision.productId
									)
								: undefined;
						const status =
							decision.mode === 'exclude'
								? 'skipped'
								: successfulRefs.has(item.ref)
									? 'success'
									: uncertainRefs.has(item.ref) || !definite
										? 'uncertain'
										: 'failed';
						return {
							pushId: historyId!,
							sourceRef: item.entryIds.join(','),
							sourceName: item.term,
							amount: item.amount,
							unit: item.unit,
							mode:
								decision.mode === 'exclude' ? 'skip' : decision.mode,
							ahProductId: product?.id ?? null,
							ahProductName: product?.name ?? null,
							quantity:
								decision.mode === 'product'
									? decision.qty
									: decision.mode === 'freetext'
										? 1
										: null,
							destination,
							status,
							failureReason:
								status === 'success' || status === 'skipped'
									? null
									: reason,
							createdAt: completedAt
						};
					});
				const knownSuccessfulIds = preview.items
					.filter((item) => successfulRefs.has(item.ref))
					.flatMap((item) => item.entryIds);
				recordShoppingPushOutcome(tx, {
					historyId: historyId!,
					items: rows,
					boughtEntryIds: knownSuccessfulIds,
					productsPushed,
					freetextPushed,
					failedCount: failed.length,
					skippedCount: preview.items.filter(
						(item) => decisions.get(item.ref)?.mode === 'exclude'
					).length,
					attemptStatus: definite ? 'failed' : 'uncertain',
					attemptError: reason!,
					completedAt
				});
			});
		}
		return {
			ok: false,
			uncertain: !definite,
			reason,
			productsPushed,
			freetextPushed,
			failed,
			destination,
			markedBoughtRefs: [...successfulRefs],
			accountName: ah.getStatus().memberName
		};
	}
}
