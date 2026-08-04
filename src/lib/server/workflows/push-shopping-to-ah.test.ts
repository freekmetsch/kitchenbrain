import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import * as schema from '$lib/server/db/schema';
import { createTestDb, type TestDb } from '$lib/server/test_db';
import {
	claimAhPreviewToken,
	clearAhPreviewTokensForTest,
	createAhPreviewToken,
	offerAhPreviewProducts,
	peekAhPreviewToken
} from '$lib/server/ah/preview_tokens';
import {
	previewShoppingForAh,
	pushShoppingToAh,
	searchShoppingForAh,
	type ShoppingAhAdapter,
	type ShoppingAhDependencies
} from './push-shopping-to-ah';
import { getShoppingWeekView } from '$lib/server/domains/shopping';
import { materializeShoppingWeek } from './reconcile-shopping';
import type { AHProduct } from '$lib/server/ah/client';

const WEEK = '2026-07-22';
const NOW = new Date('2026-07-27T12:00:00.000Z');

function ahProduct(id: string, name: string): AHProduct {
	return {
		id,
		name,
		priceBeforeBonus: 4.99,
		currentPrice: null,
		isBonus: false,
		bonusMechanism: null,
		salesUnitSize: '100 g',
		unitPriceDescription: '€49.90/kg',
		imageUrl: null,
		isPreviouslyBought: false,
		mainCategory: 'Kaas'
	};
}

function fakeAdapter(
	overrides: Partial<ShoppingAhAdapter> = {}
): ShoppingAhAdapter {
	return {
		getStatus: () => ({ connected: true, memberName: 'Test household' }),
		searchProducts: async () => ({ ok: true, products: [] }),
		getProductsByIds: async () => [],
		pickArchetypes: async () => new Map(),
		getActiveOrder: async () => null,
		addProductItems: async () => ({
			ok: true,
			status: 200,
			uncertain: false
		}),
		addProductsToOrder: async () => ({
			ok: true,
			status: 200,
			uncertain: false
		}),
		addFreetextItems: async (items) => ({
			pushed: items,
			failed: [],
			uncertain: []
		}),
		isNotConnectedError: () => false,
		...overrides
	};
}

function dependencies(
	db: TestDb,
	ah: ShoppingAhAdapter
): ShoppingAhDependencies {
	return {
		db,
		ah,
		createPreviewToken: createAhPreviewToken,
		claimPreviewToken: claimAhPreviewToken,
		peekPreviewToken: peekAhPreviewToken,
		offerPreviewProducts: offerAhPreviewProducts,
		getWeekStartDay: () => 2,
		now: () => NOW
	};
}

function seedEntries(db: TestDb) {
	const rows = db
		.insert(schema.shoppingWeekEntries)
		.values([
			{
				weekStartDate: WEEK,
				sourceKey: 'manual:1',
				sourceKind: 'manual',
				name: 'pasta',
				amount: '400',
				unit: 'g',
				approvedTerms: ['pasta'],
				createdAt: NOW,
				updatedAt: NOW
			},
			{
				weekStartDate: WEEK,
				sourceKey: 'manual:2',
				sourceKind: 'manual',
				name: 'tomaten',
				amount: '2',
				unit: 'stuks',
				approvedTerms: ['tomaten'],
				createdAt: NOW,
				updatedAt: NOW
			}
		])
		.returning()
		.all();
	return { pasta: rows[0], tomatoes: rows[1] };
}

function seedRecipeShoppingRow(db: TestDb, recipeCount: number) {
	for (let index = 0; index < recipeCount; index += 1) {
		const recipe = db
			.insert(schema.recipes)
			.values({
				slug: `pasta-${index + 1}`,
				title: `Pasta ${index + 1}`,
				ingredients: [
					{
						id: `cheese-${index + 1}`,
						name: 'Parmezaanse kaas',
						amount: '50',
						unit: 'g',
						role: 'cook_in'
					}
				],
				directions: ['Kook.'],
				createdAt: NOW,
				updatedAt: NOW
			})
			.returning()
			.get();
		db.insert(schema.mealPlanMeals)
			.values({
				weekNumber: 30,
				weekStartDate: WEEK,
				dinner: recipe.title,
				recipeSlug: recipe.slug,
				status: 'planned',
				source: 'fresh',
				sortOrder: index,
				createdAt: NOW
			})
			.run();
	}
	materializeShoppingWeek(db, WEEK, { weekStartDay: 2 });
	return getShoppingWeekView(db, WEEK).toBuy.find(
		(row) => row.name === 'Parmezaanse kaas'
	)!;
}

function tokenFor(
	userId: number,
	entries: ReturnType<typeof seedEntries>
): string {
	return createAhPreviewToken({
		userId,
		weekStart: WEEK,
		items: [
			{
				ref: `entries:${entries.pasta.id}`,
				entryIds: [entries.pasta.id],
				entryRevisions: [entries.pasta.revision],
				term: 'pasta',
				amount: '400',
				unit: 'g',
				offeredProducts: [{ id: '123', name: 'AH Pasta' }]
			},
			{
				ref: `entries:${entries.tomatoes.id}`,
				entryIds: [entries.tomatoes.id],
				entryRevisions: [entries.tomatoes.revision],
				term: 'tomaten',
				amount: '2',
				unit: 'stuks',
				offeredProducts: []
			}
		]
	});
}

describe('pushShoppingToAh', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(NOW);
		clearAhPreviewTokensForTest();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('authorizes products found by a manual row search without replacing the preview', async () => {
		const db = createTestDb();
		const entries = seedEntries(db);
		const previewToken = tokenFor(1, entries);
		const result = await searchShoppingForAh(
			{
				userId: 1,
				previewToken,
				ref: `entries:${entries.pasta.id}`,
				query: 'volkoren penne'
			},
			dependencies(
				db,
				fakeAdapter({
					searchProducts: async (term) => ({
						ok: true,
						products: [ahProduct('manual-result', `AH ${term}`)]
					})
				})
			)
		);

		expect(result).toMatchObject({
			ok: true,
			candidates: [{ id: 'manual-result', name: 'AH volkoren penne' }]
		});
		expect(peekAhPreviewToken(previewToken, 1)?.items[0].offeredProducts).toContainEqual({
			id: 'manual-result',
			name: 'AH volkoren penne'
		});
	});

	it('fails a manual search when the row is not bound or the preview was replaced during search', async () => {
		const db = createTestDb();
		const entries = seedEntries(db);
		const missingRefToken = tokenFor(1, entries);
		await expect(
			searchShoppingForAh(
				{ userId: 1, previewToken: missingRefToken, ref: 'entries:999', query: 'pasta' },
				dependencies(db, fakeAdapter())
			)
		).rejects.toMatchObject({ status: 409 });

		const racingToken = tokenFor(1, entries);
		const deps = dependencies(
			db,
			fakeAdapter({
				searchProducts: async () => {
					tokenFor(1, entries);
					return { ok: true, products: [ahProduct('late-result', 'AH Pasta')] };
				}
			})
		);
		await expect(
			searchShoppingForAh(
				{
					userId: 1,
					previewToken: racingToken,
					ref: `entries:${entries.pasta.id}`,
					query: 'pasta'
				},
				deps
			)
		).rejects.toMatchObject({ status: 409 });
	});

	it('searches and ranks every complete either/or ingredient alternative', async () => {
		const db = createTestDb();
		const entry = db
			.insert(schema.shoppingWeekEntries)
			.values({
				weekStartDate: WEEK,
				sourceKey: 'manual:herbs',
				sourceKind: 'manual',
				name: 'munt of peterselie',
				amount: '15',
				unit: 'g',
				approvedTerms: ['munt of peterselie'],
				createdAt: NOW,
				updatedAt: NOW
			})
			.returning()
			.get();
		const searches: string[] = [];
		const peppermint = ahProduct('peppermint', 'AH Pepermunt');
		peppermint.mainCategory = 'Snoep, koek';
		const parsley = ahProduct('parsley', 'AH Platte peterselie');
		parsley.mainCategory = 'Groente, fruit';

		const preview = await previewShoppingForAh(
			{ userId: 1, weekStart: WEEK, entryIds: [entry.id] },
			dependencies(
				db,
				fakeAdapter({
					searchProducts: async (term) => {
						searches.push(term);
						return {
							ok: true,
							products: term === 'munt' ? [peppermint] : [parsley]
						};
					}
				})
			)
		);

		expect(searches).toEqual(['munt', 'peterselie']);
		expect(preview.items[0].candidates.map((candidate) => candidate.id)).toEqual([
			'parsley',
			'peppermint'
		]);
	});

	it('pins a unanimous recipe preference and never leaks it to a neutral source', async () => {
		const preferred = ahProduct('cheese-block', 'AH Parmigiano Reggiano stuk');
		const ordinary = ahProduct('cheese-grated', 'AH Parmigiano Reggiano geraspt');

		const preferredDb = createTestDb();
		const preferredRow = seedRecipeShoppingRow(preferredDb, 1);
		preferredDb
			.insert(schema.recipeAhPreferences)
			.values({
				recipeId: preferredRow.sources[0].recipeId!,
				ingredientId: preferredRow.sources[0].ingredientId!,
				productId: preferred.id,
				productName: preferred.name,
				variantLabel: 'Heel stuk',
				selectedAt: NOW
			})
			.run();
		const preferredPreview = await previewShoppingForAh(
			{
				userId: 1,
				weekStart: WEEK,
				entryIds: preferredRow.entryIds
			},
			dependencies(
				preferredDb,
				fakeAdapter({
					searchProducts: async () => ({ ok: true, products: [ordinary] }),
					getProductsByIds: async () => [preferred]
				})
			)
		);
		expect(preferredPreview.items[0]).toMatchObject({
			preferenceState: 'recipe',
			preferenceLabel: 'Heel stuk',
			status: 'product'
		});
		expect(preferredPreview.items[0].candidates[0]).toMatchObject({
			id: preferred.id,
			isRecipePreference: true
		});
		expect(preferredPreview.items[0].requiresExplicitDecision).not.toBe(true);

		clearAhPreviewTokensForTest();
		const mixedDb = createTestDb();
		const mixedRow = seedRecipeShoppingRow(mixedDb, 2);
		mixedDb
			.insert(schema.recipeAhPreferences)
			.values({
				recipeId: mixedRow.sources[0].recipeId!,
				ingredientId: mixedRow.sources[0].ingredientId!,
				productId: preferred.id,
				productName: preferred.name,
				variantLabel: 'Heel stuk',
				selectedAt: NOW
			})
			.run();
		const mixedPreview = await previewShoppingForAh(
			{ userId: 1, weekStart: WEEK, entryIds: mixedRow.entryIds },
			dependencies(
				mixedDb,
				fakeAdapter({
					searchProducts: async () => ({ ok: true, products: [ordinary, preferred] })
				})
			)
		);
		expect(mixedPreview.items[0]).toMatchObject({
			preferenceState: 'unresolved',
			requiresExplicitDecision: true
		});
		expect(mixedPreview.items[0].candidates[0]?.isRecipePreference).not.toBe(true);
	});

	it('requires review when a saved recipe product is unavailable', async () => {
		const db = createTestDb();
		const row = seedRecipeShoppingRow(db, 1);
		db.insert(schema.recipeAhPreferences)
			.values({
				recipeId: row.sources[0].recipeId!,
				ingredientId: row.sources[0].ingredientId!,
				productId: 'missing-product',
				productName: 'Verdwenen kaas',
				variantLabel: 'Heel stuk',
				selectedAt: NOW
			})
			.run();
		const preview = await previewShoppingForAh(
			{ userId: 1, weekStart: WEEK, entryIds: row.entryIds },
			dependencies(
				db,
				fakeAdapter({
					searchProducts: async () => ({
						ok: true,
						products: [ahProduct('ordinary', 'AH Geraspte kaas')]
					}),
					getProductsByIds: async () => []
				})
			)
		);
		expect(preview.items[0]).toMatchObject({
			preferenceState: 'unavailable',
			requiresExplicitDecision: true
		});
	});

	it('pins only unanimous recipe preferences and rejects conflicting ones', async () => {
		const preferred = ahProduct('cheese-block', 'AH Parmigiano Reggiano stuk');
		const grated = ahProduct('cheese-grated', 'AH Parmigiano Reggiano geraspt');

		const unanimousDb = createTestDb();
		const unanimousRow = seedRecipeShoppingRow(unanimousDb, 2);
		unanimousDb
			.insert(schema.recipeAhPreferences)
			.values(
				unanimousRow.sources.map((source) => ({
					recipeId: source.recipeId!,
					ingredientId: source.ingredientId!,
					productId: preferred.id,
					productName: preferred.name,
					variantLabel: 'Heel stuk',
					selectedAt: NOW
				}))
			)
			.run();
		const unanimousPreview = await previewShoppingForAh(
			{ userId: 1, weekStart: WEEK, entryIds: unanimousRow.entryIds },
			dependencies(
				unanimousDb,
				fakeAdapter({
					searchProducts: async () => ({ ok: true, products: [grated] }),
					getProductsByIds: async () => [preferred]
				})
			)
		);
		expect(unanimousPreview.items[0]).toMatchObject({
			preferenceState: 'recipe'
		});
		expect(unanimousPreview.items[0].requiresExplicitDecision).toBeUndefined();
		expect(unanimousPreview.items[0].candidates[0]).toMatchObject({
			id: preferred.id,
			isRecipePreference: true
		});

		clearAhPreviewTokensForTest();
		const conflictingDb = createTestDb();
		const conflictingRow = seedRecipeShoppingRow(conflictingDb, 2);
		conflictingDb
			.insert(schema.recipeAhPreferences)
			.values(
				conflictingRow.sources.map((source, index) => ({
					recipeId: source.recipeId!,
					ingredientId: source.ingredientId!,
					productId: index === 0 ? preferred.id : grated.id,
					productName: index === 0 ? preferred.name : grated.name,
					variantLabel: index === 0 ? 'Heel stuk' : 'Vers geraspt',
					selectedAt: NOW
				}))
			)
			.run();
		const conflictingPreview = await previewShoppingForAh(
			{ userId: 1, weekStart: WEEK, entryIds: conflictingRow.entryIds },
			dependencies(
				conflictingDb,
				fakeAdapter({
					searchProducts: async () => ({ ok: true, products: [grated, preferred] })
				})
			)
		);
		expect(conflictingPreview.items[0]).toMatchObject({
			preferenceState: 'unresolved',
			requiresExplicitDecision: true
		});
	});

	it('requires an explicit choice for recipe-plus-manual and global-favorite conflicts', async () => {
		const preferred = ahProduct('cheese-block', 'AH Parmigiano Reggiano stuk');
		const grated = ahProduct('cheese-grated', 'AH Parmigiano Reggiano geraspt');

		const manualDb = createTestDb();
		const initialRow = seedRecipeShoppingRow(manualDb, 1);
		manualDb
			.insert(schema.recipeAhPreferences)
			.values({
				recipeId: initialRow.sources[0].recipeId!,
				ingredientId: initialRow.sources[0].ingredientId!,
				productId: preferred.id,
				productName: preferred.name,
				variantLabel: 'Heel stuk',
				selectedAt: NOW
			})
			.run();
		manualDb
			.insert(schema.shoppingWeekEntries)
			.values({
				weekStartDate: WEEK,
				sourceKey: 'manual:cheese',
				sourceKind: 'manual',
				name: 'Parmezaanse kaas',
				amount: '25',
				unit: 'g',
				approvedTerms: ['Parmezaanse kaas'],
				createdAt: NOW,
				updatedAt: NOW
			})
			.run();
		const mixedRow = getShoppingWeekView(manualDb, WEEK).toBuy.find(
			(row) => row.name === 'Parmezaanse kaas'
		)!;
		expect(mixedRow.sources.some((source) => source.sourceKind === 'manual')).toBe(true);
		const manualPreview = await previewShoppingForAh(
			{ userId: 1, weekStart: WEEK, entryIds: mixedRow.entryIds },
			dependencies(
				manualDb,
				fakeAdapter({
					searchProducts: async () => ({ ok: true, products: [grated, preferred] })
				})
			)
		);
		expect(manualPreview.items[0]).toMatchObject({
			preferenceState: 'unresolved',
			requiresExplicitDecision: true
		});

		clearAhPreviewTokensForTest();
		const favoriteDb = createTestDb();
		const favoriteRow = seedRecipeShoppingRow(favoriteDb, 1);
		favoriteDb
			.insert(schema.recipeAhPreferences)
			.values({
				recipeId: favoriteRow.sources[0].recipeId!,
				ingredientId: favoriteRow.sources[0].ingredientId!,
				productId: preferred.id,
				productName: preferred.name,
				variantLabel: 'Heel stuk',
				selectedAt: NOW
			})
			.run();
		favoriteDb
			.insert(schema.ahFavorites)
			.values({
				nameKey: 'parmezaanse kaas',
				productId: grated.id,
				productName: grated.name,
				createdAt: NOW
			})
			.run();
		const favoritePreview = await previewShoppingForAh(
			{ userId: 1, weekStart: WEEK, entryIds: favoriteRow.entryIds },
			dependencies(
				favoriteDb,
				fakeAdapter({
					searchProducts: async () => ({ ok: true, products: [grated, preferred] })
				})
			)
		);
		expect(favoritePreview.items[0]).toMatchObject({
			preferenceState: 'unresolved',
			requiresExplicitDecision: true
		});
		expect(favoritePreview.items[0].candidates[0]?.isFavorite).not.toBe(true);
		expect(favoritePreview.items[0].candidates[0]?.isRecipePreference).not.toBe(true);
	});

	it('keeps the existing global favorite fallback when no recipe preference exists', async () => {
		const db = createTestDb();
		const entries = seedEntries(db);
		const favorite = ahProduct('favorite-pasta', 'AH Volkoren penne');
		db.insert(schema.ahFavorites)
			.values({
				nameKey: 'pasta',
				productId: favorite.id,
				productName: favorite.name,
				createdAt: NOW
			})
			.run();

		const preview = await previewShoppingForAh(
			{ userId: 1, weekStart: WEEK, entryIds: [entries.pasta.id] },
			dependencies(
				db,
				fakeAdapter({
					searchProducts: async () => ({
						ok: true,
						products: [ahProduct('ordinary-pasta', 'AH Spaghetti')]
					}),
					getProductsByIds: async () => [favorite]
				})
			)
		);

		expect(preview.items[0].preferenceState).toBeUndefined();
		expect(preview.items[0].candidates[0]).toMatchObject({
			id: favorite.id,
			isFavorite: true
		});
	});

	it('invalidates a preview token when its recipe preference changes', async () => {
		const db = createTestDb();
		const row = seedRecipeShoppingRow(db, 1);
		const preferred = ahProduct('cheese-block', 'AH Parmigiano Reggiano stuk');
		db.insert(schema.recipeAhPreferences)
			.values({
				recipeId: row.sources[0].recipeId!,
				ingredientId: row.sources[0].ingredientId!,
				productId: preferred.id,
				productName: preferred.name,
				variantLabel: 'Heel stuk',
				selectedAt: NOW
			})
			.run();
		let writes = 0;
		const deps = dependencies(
			db,
			fakeAdapter({
				searchProducts: async () => ({ ok: true, products: [preferred] }),
				addProductItems: async () => {
					writes += 1;
					return { ok: true, status: 200, uncertain: false };
				}
			})
		);
		const preview = await previewShoppingForAh(
			{ userId: 1, weekStart: WEEK, entryIds: row.entryIds },
			deps
		);
		db.update(schema.recipeAhPreferences)
			.set({
				productId: 'cheese-grated',
				productName: 'AH Parmigiano Reggiano geraspt',
				variantLabel: 'Vers geraspt',
				selectedAt: new Date(NOW.getTime() + 1_000)
			})
			.run();

		await expect(
			pushShoppingToAh(
				{
					userId: 1,
					previewToken: preview.previewToken,
					decisions: [
						{
							ref: preview.items[0].ref,
							mode: 'product',
							productId: preview.items[0].candidates[0].id,
							qty: 1
						}
					]
				},
				deps
			)
		).rejects.toMatchObject({ status: 409 });
		expect(writes).toBe(0);
	});

	it('keeps an open review valid when its household favorite changes', async () => {
		const db = createTestDb();
		const user = db
			.insert(schema.users)
			.values({ username: 'test', passwordHash: 'none', createdAt: NOW })
			.returning()
			.get();
		const entries = seedEntries(db);
		const product = ahProduct('pasta-product', 'AH Penne');
		let writes = 0;
		const deps = dependencies(
			db,
			fakeAdapter({
				searchProducts: async () => ({ ok: true, products: [product] }),
				addProductItems: async () => {
					writes += 1;
					return { ok: true, status: 200, uncertain: false };
				}
			})
		);
		const preview = await previewShoppingForAh(
			{ userId: user.id, weekStart: WEEK, entryIds: [entries.pasta.id] },
			deps
		);
		db.insert(schema.ahFavorites)
			.values({
				nameKey: 'pasta',
				productId: product.id,
				productName: product.name,
				createdAt: NOW
			})
			.run();

		await expect(
			pushShoppingToAh(
				{
					userId: user.id,
					previewToken: preview.previewToken,
					decisions: [
						{
							ref: preview.items[0].ref,
							mode: 'product',
							productId: product.id,
							qty: 1
						}
					]
				},
				deps
			)
		).resolves.toMatchObject({ ok: true });
		expect(writes).toBe(1);
	});

	it('records pending before product-first dispatch and marks only definite successes bought', async () => {
		const db = createTestDb();
		const user = db.select().from(schema.users).get()!;
		const entries = seedEntries(db);
		const calls: string[] = [];
		const ah = fakeAdapter({
			addProductItems: async () => {
				calls.push('product');
				expect(
					db.select().from(schema.shoppingPushHistory).get()
				).toMatchObject({ attemptStatus: 'pending' });
				return { ok: true, status: 200, uncertain: false };
			},
			addFreetextItems: async () => {
				calls.push('freetext');
				return {
					pushed: [],
					failed: ['tomaten 2 stuks'],
					uncertain: []
				};
			}
		});

		const result = await pushShoppingToAh(
			{
				userId: user.id,
				previewToken: tokenFor(user.id, entries),
				decisions: [
					{
						ref: `entries:${entries.pasta.id}`,
						mode: 'product',
						productId: '123',
						qty: 1
					},
					{
						ref: `entries:${entries.tomatoes.id}`,
						mode: 'freetext'
					}
				]
			},
			dependencies(db, ah)
		);

		expect(calls).toEqual(['product', 'freetext']);
		expect(result).toMatchObject({
			ok: false,
			uncertain: false,
			markedBoughtRefs: [`entries:${entries.pasta.id}`]
		});
		expect(
			db
				.select()
				.from(schema.shoppingWeekEntries)
				.where(eq(schema.shoppingWeekEntries.id, entries.pasta.id))
				.get()?.bought
		).toBe(true);
		expect(
			db
				.select()
				.from(schema.shoppingWeekEntries)
				.where(eq(schema.shoppingWeekEntries.id, entries.tomatoes.id))
				.get()?.bought
		).toBe(false);
		expect(
			db.select().from(schema.shoppingPushHistory).get()
		).toMatchObject({ attemptStatus: 'failed', productsPushed: 1 });
		expect(
			db
				.select()
				.from(schema.shoppingPushItems)
				.all()
				.map((item) => item.status)
		).toEqual(['success', 'failed']);
	});

	it('claims an uncertain attempt once and never retries the external write', async () => {
		const db = createTestDb();
		const user = db.select().from(schema.users).get()!;
		const entries = seedEntries(db);
		let writes = 0;
		const ah = fakeAdapter({
			addProductItems: async () => {
				writes++;
				return { ok: false, status: 500, uncertain: true };
			}
		});
		const token = tokenFor(user.id, entries);
		const input = {
			userId: user.id,
			previewToken: token,
			decisions: [
				{
					ref: `entries:${entries.pasta.id}`,
					mode: 'product' as const,
					productId: '123',
					qty: 1
				},
				{
					ref: `entries:${entries.tomatoes.id}`,
					mode: 'exclude' as const
				}
			]
		};

		const result = await pushShoppingToAh(input, dependencies(db, ah));
		expect(result).toMatchObject({ ok: false, uncertain: true });
		expect(writes).toBe(1);
		expect(
			db.select().from(schema.shoppingPushHistory).get()
		).toMatchObject({ attemptStatus: 'uncertain' });
		expect(
			db
				.select()
				.from(schema.shoppingWeekEntries)
				.where(eq(schema.shoppingWeekEntries.id, entries.pasta.id))
				.get()?.bought
		).toBe(false);

		await expect(
			pushShoppingToAh(input, dependencies(db, ah))
		).rejects.toMatchObject({
			status: 409
		});
		expect(writes).toBe(1);
	});
});
