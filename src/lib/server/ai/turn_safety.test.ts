import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import * as schema from '$lib/server/db/schema';
import { createTestDb } from '$lib/server/test_db';
import { addInventory, updateInventory } from '$lib/server/workflows/inventory';
import type { TurnExecutionContext } from './commit_risk';
import { executeToolCall } from './executors';
import { createTurnSafetyState } from './turn_safety';

function turn(): TurnExecutionContext {
	return {
		createdThisTurn: new Set(),
		destructiveCount: 0,
		safety: createTurnSafetyState()
	};
}

function seedRecipe(db: ReturnType<typeof createTestDb>) {
	return db
		.insert(schema.recipes)
		.values({
			slug: 'stoofpot',
			title: 'Stoofpot',
			ingredients: [],
			directions: ['Koken'],
			createdAt: new Date(),
			updatedAt: new Date()
		})
		.returning()
		.get();
}

function operationCount(db: ReturnType<typeof createTestDb>) {
	return db.select().from(schema.inventoryOpsLog).all().length;
}

describe('current-turn target provenance', () => {
	it('rejects a guessed inventory id without writing', async () => {
		const db = createTestDb();
		const item = addInventory(db, { name: 'Kip', section: 'freezer', qtyNum: 2 }, { actor: 'ai', userId: 1 });
		const before = operationCount(db);

		const result = await executeToolCall(
			'update_inventory_item',
			{ id: item.item.id, qty_num: 99 },
			db,
			1,
			turn()
		);

		expect(result).toMatchObject({
			ok: false,
			contract_error: 'missing_provenance',
			write_latched: true
		});
		expect(
			db.select().from(schema.inventoryItems).where(eq(schema.inventoryItems.id, item.item.id)).get()
				?.qtyNum
		).toBe(2);
		expect(operationCount(db)).toBe(before);
	});

	it('allows an exact current-turn read followed by a preconditioned write', async () => {
		const db = createTestDb();
		const item = addInventory(db, { name: 'Kip', section: 'freezer', qtyNum: 2 }, { actor: 'ai', userId: 1 });
		const context = turn();

		await executeToolCall('get_inventory', {}, db, 1, context);
		const result = await executeToolCall(
			'update_inventory_item',
			{ id: item.item.id, qty_num: 3 },
			db,
			1,
			context
		);

		expect(result).toMatchObject({ ok: true, id: item.item.id });
		expect(
			db.select().from(schema.inventoryItems).where(eq(schema.inventoryItems.id, item.item.id)).get()
				?.qtyNum
		).toBe(3);
	});

	it('rejects state that drifted after the current-turn read', async () => {
		const db = createTestDb();
		const item = addInventory(db, { name: 'Kip', section: 'freezer', qtyNum: 2 }, { actor: 'ai', userId: 1 });
		const context = turn();
		await executeToolCall('get_inventory', {}, db, 1, context);
		updateInventory(db, item.item.id, { qtyNum: 4 }, { actor: 'testuser', userId: 1 });
		const before = operationCount(db);

		const result = await executeToolCall(
			'update_inventory_item',
			{ id: item.item.id, qty_num: 5 },
			db,
			1,
			context
		);

		expect(result).toMatchObject({ ok: false, contract_error: 'stale_target' });
		expect(operationCount(db)).toBe(before);
	});

	it('requires the linked recipe to be read before adding recipe-derived stock', async () => {
		const db = createTestDb();
		const recipe = seedRecipe(db);
		const context = turn();
		const input = {
			name: 'Stoofpot',
			section: 'freezer',
			qty_num: 4,
			unit: 'portion',
			kind: 'leftover',
			made_from_recipe_id: recipe.id
		};

		const rejected = await executeToolCall('add_to_inventory', input, db, 1, context);
		expect(rejected).toMatchObject({
			ok: false,
			contract_error: 'missing_provenance',
			write_latched: true
		});
		expect(
			db.select().from(schema.inventoryItems).where(eq(schema.inventoryItems.name, 'Stoofpot')).get()
		).toBeUndefined();

		const freshContext = turn();
		await executeToolCall('get_recipe', { slug: recipe.slug }, db, 1, freshContext);
		const added = await executeToolCall('add_to_inventory', input, db, 1, freshContext);
		expect(added).toMatchObject({ ok: true, name: 'Stoofpot' });
	});
});

describe('contract failure write latch', () => {
	it('blocks every later persistent write while still allowing reads', async () => {
		const db = createTestDb();
		const recipe = seedRecipe(db);
		const item = addInventory(db, { name: 'Kip', section: 'freezer', qtyNum: 2 }, { actor: 'ai', userId: 1 });
		const context = turn();
		await executeToolCall('get_recipe', { slug: recipe.slug }, db, 1, context);

		const invalid = await executeToolCall(
			'edit_recipe',
			{ slug: recipe.slug, ingredient_additions: [{ name: 'Ui' }] },
			db,
			1,
			context
		);
		expect(invalid).toMatchObject({
			ok: false,
			contract_error: 'invalid_input',
			write_latched: true
		});

		const read = await executeToolCall('get_inventory', {}, db, 1, context);
		expect(read).toMatchObject({ count: 1 });
		const before = operationCount(db);
		const blocked = await executeToolCall(
			'update_inventory_item',
			{ id: item.item.id, qty_num: 100 },
			db,
			1,
			context
		);
		expect(blocked).toMatchObject({ ok: false, contract_error: 'write_latched' });
		expect(operationCount(db)).toBe(before);
	});

	it('memoizes an identical contract failure without re-executing it', async () => {
		const db = createTestDb();
		const context = turn();
		const input = { id: 123, qty_num: 9 };
		const first = await executeToolCall('update_inventory_item', input, db, 1, context);
		const failures = context.safety!.failedCalls.size;
		const second = await executeToolCall('update_inventory_item', input, db, 1, context);

		expect(second).toEqual(first);
		expect(context.safety!.failedCalls.size).toBe(failures);
	});
});

describe('current-turn AH evidence', () => {
	it('binds a recipe proposal to a sanitized AH result from this turn', async () => {
		const db = createTestDb();
		const recipe = db
			.insert(schema.recipes)
			.values({
				slug: 'soep',
				title: 'Soep',
				ingredients: [{ id: 'ing-ui', name: 'Ui', amount: '1' }],
				directions: ['Kook.'],
				createdAt: new Date(),
				updatedAt: new Date()
			})
			.returning()
			.get();
		const context = turn();
		await executeToolCall('get_recipe', { slug: recipe.slug }, db, 1, context);
		context.safety!.ahEvidence.set('ah-result-1', {
			key: 'ah-result-1',
			source: 'ah',
			query: 'wortel',
			productId: 'ah-winterpeen',
			productName: 'AH Winterpeen',
			packageSize: '1 kg',
			price: 1.49
		});

		const result = await executeToolCall(
			'propose_recipe_patch',
			{
				slug: recipe.slug,
				operations: [
					{
						kind: 'add_ingredient',
						after: { name: 'Wortel', amount: '500', unit: 'g' },
						reason: 'Hoort in de soep.',
						evidence: { evidence_key: 'ah-result-1' }
					}
				]
			},
			db,
			1,
			context
		);

		expect(result).toMatchObject({
			ok: true,
			operations: [
				expect.objectContaining({
					evidence: {
						key: 'ah-result-1',
						source: 'ah',
						query: 'wortel',
						productName: 'AH Winterpeen',
						packageSize: '1 kg',
						price: 1.49
					}
				})
			]
		});
	});

	it('rejects a forged retailer evidence key', async () => {
		const db = createTestDb();
		const recipe = seedRecipe(db);
		const context = turn();
		await executeToolCall('get_recipe', { slug: recipe.slug }, db, 1, context);

		const result = await executeToolCall(
			'propose_recipe_patch',
			{
				slug: recipe.slug,
				operations: [
					{
						kind: 'add_ingredient',
						after: { name: 'Wortel', amount: '1' },
						reason: 'Hoort erbij.',
						evidence: { evidence_key: 'forged' }
					}
				]
			},
			db,
			1,
			context
		);

		expect(result).toMatchObject({ ok: false, contract_error: 'missing_provenance' });
	});

	it('latches writes when a recipe patch targets an ingredient outside the observed recipe', async () => {
		const db = createTestDb();
		const recipe = seedRecipe(db);
		const context = turn();
		await executeToolCall('get_recipe', { slug: recipe.slug }, db, 1, context);

		const result = await executeToolCall(
			'propose_recipe_patch',
			{
				slug: recipe.slug,
				operations: [
					{
						kind: 'update_ingredient',
						ingredient_id: 'guessed-id',
						changes: { amount: '9' },
						reason: 'Correctie.'
					}
				]
			},
			db,
			1,
			context
		);

		expect(result).toMatchObject({
			ok: false,
			contract_error: 'prohibited_target',
			write_latched: true
		});
	});
});

describe('meal-plan proposal provenance', () => {
	it('requires the exact target week and linked recipes to be read in the current turn', async () => {
		const db = createTestDb();
		const recipe = seedRecipe(db);
		const input = {
			week_start_date: '2026-07-29',
			title: 'Volgende week',
			recommendation: {
				why_now: 'De week is leeg.',
				evidence: ['Stoofpot staat in de receptencatalogus.'],
				confidence: 'high',
				uncertainty: null,
				consequence: 'Plant één maaltijd.',
				alternatives: ['Niet plannen.']
			},
			operations: [
				{
					kind: 'add',
					dinner: 'Stoofpot',
					recipe_slug: recipe.slug,
					planned_date: '2026-07-31',
					servings: 4,
					source: 'fresh',
					note: null,
					reason: 'Vult vrijdag.'
				}
			]
		};

		const rejected = await executeToolCall(
			'propose_meal_plan',
			input,
			db,
			1,
			turn()
		);
		expect(rejected).toMatchObject({
			ok: false,
			contract_error: 'missing_provenance'
		});

		const context = turn();
		await executeToolCall(
			'get_meal_plan',
			{ week_start_date: '2026-07-29' },
			db,
			1,
			context
		);
		await executeToolCall('get_recipe', { slug: recipe.slug }, db, 1, context);
		const staged = await executeToolCall(
			'propose_meal_plan',
			input,
			db,
			1,
			context
		);
		expect(staged).toMatchObject({ ok: true, kind: 'meal_plan_proposal' });
	});
});

describe('cooking-action provenance', () => {
	it('permits timer preparation directly but requires current reads for household targets', async () => {
		const db = createTestDb();
		const recipe = seedRecipe(db);
		const now = new Date('2026-07-29T10:00:00Z');
		const item = db
			.insert(schema.inventoryItems)
			.values({
				name: 'Stoofpot',
				section: 'freezer',
				qtyNum: 2,
				unit: 'portion',
				createdAt: now,
				updatedAt: now
			})
			.returning()
			.get();

		await expect(
			executeToolCall(
				'prepare_cooking_action',
				{ action: 'timer', timer_operation: 'start', seconds: 300, label: 'Pasta' },
				db,
				1,
				turn()
			)
		).resolves.toMatchObject({ ok: true, actionKind: 'timer' });

		await expect(
			executeToolCall(
				'prepare_cooking_action',
				{ action: 'rescue', recipe_slug: recipe.slug, issue: 'too_thin', step_index: 0 },
				db,
				1,
				turn()
			)
		).resolves.toMatchObject({
			ok: false,
			contract_error: 'missing_provenance'
		});
		await expect(
			executeToolCall(
				'prepare_cooking_action',
				{ action: 'defrost', inventory_id: item.id },
				db,
				1,
				turn()
			)
		).resolves.toMatchObject({
			ok: false,
			contract_error: 'missing_provenance'
		});

		const rescueContext = turn();
		await executeToolCall('get_recipe', { slug: recipe.slug }, db, 1, rescueContext);
		await expect(
			executeToolCall(
				'prepare_cooking_action',
				{ action: 'rescue', recipe_slug: recipe.slug, issue: 'too_thin', step_index: 0 },
				db,
				1,
				rescueContext
			)
		).resolves.toMatchObject({ ok: true, actionKind: 'rescue' });

		const defrostContext = turn();
		await executeToolCall('get_inventory', {}, db, 1, defrostContext);
		await expect(
			executeToolCall(
				'prepare_cooking_action',
				{ action: 'defrost', inventory_id: item.id },
				db,
				1,
				defrostContext
			)
		).resolves.toMatchObject({ ok: true, actionKind: 'defrost' });
	});
});
