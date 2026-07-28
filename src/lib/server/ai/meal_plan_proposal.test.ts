import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import * as schema from '$lib/server/db/schema';
import { createTestDb } from '$lib/server/test_db';
import { createMealPlanService } from '$lib/server/workflows/meal-plan';
import {
	applyMealPlanProposal,
	getMealPlanProposalStatus,
	stageMealPlanProposal,
	undoMealPlanProposal
} from './meal_plan_proposal';

function seedRecipe(db: ReturnType<typeof createTestDb>, slug: string, title: string) {
	const now = new Date();
	return db
		.insert(schema.recipes)
		.values({ slug, title, ingredients: [], directions: [], createdAt: now, updatedAt: now })
		.returning()
		.get();
}

describe('meal-plan action bundle', () => {
	it('stages a no-write atomic review with the complete recommendation envelope', () => {
		const db = createTestDb();
		seedRecipe(db, 'linzencurry', 'Linzencurry');

		const proposal = stageMealPlanProposal(db, {
			userId: 1,
			weekStartDate: '2026-07-29',
			title: 'Volgende week',
			recommendation: {
				whyNow: 'De week heeft nog geen maaltijden.',
				evidence: ['Linzencurry is 42 dagen niet gekookt.', 'Alle droge ingrediënten zijn op voorraad.'],
				confidence: 'high',
				uncertainty: 'Verse koriander is niet als voorraad bekend.',
				consequence: 'Voegt één verse maaltijd voor vier personen toe.',
				alternatives: ['Plan de curry op donderdag.', 'Sla deze maaltijd over.']
			},
			operations: [
				{
					kind: 'add',
					dinner: 'Linzencurry',
					recipeSlug: 'linzencurry',
					plannedDate: '2026-07-31',
					servings: 4,
					source: 'fresh',
					note: null,
					reason: 'Gebruikt voorraad en vergroot de rotatie.'
				}
			]
		});

		expect(proposal).toMatchObject({
			status: 'active',
			title: 'Volgende week',
			weekStartDate: '2026-07-29',
			atomicity: {
				kind: 'atomic',
				consequence: 'The selected meal-plan changes and Shopping reconciliation commit together.'
			},
			recommendation: {
				whyNow: expect.any(String),
				evidence: expect.arrayContaining([expect.any(String)]),
				confidence: 'high',
				uncertainty: expect.any(String),
				consequence: expect.any(String),
				alternatives: expect.arrayContaining([expect.any(String)])
			},
			operations: [
				expect.objectContaining({
					id: expect.any(String),
					kind: 'add',
					label: 'Linzencurry',
					before: null,
					reason: expect.any(String)
				})
			]
		});
		expect(proposal.token).toMatch(/^[A-Za-z0-9_-]+$/);
		expect(db.select().from(schema.mealPlanMeals).all()).toHaveLength(0);
	});

	it('applies the reviewed selection and Shopping reconciliation in one transaction', () => {
		const db = createTestDb();
		seedRecipe(db, 'linzencurry', 'Linzencurry');
		const proposal = stageMealPlanProposal(db, {
			userId: 1,
			weekStartDate: '2026-07-29',
			title: 'Volgende week',
			recommendation: {
				whyNow: 'De week is leeg.',
				evidence: ['Linzencurry past bij de voorraad.'],
				confidence: 'high',
				uncertainty: null,
				consequence: 'Plant één maaltijd.',
				alternatives: ['Niet plannen.']
			},
			operations: [
				{
					kind: 'add',
					dinner: 'Linzencurry',
					recipeSlug: 'linzencurry',
					plannedDate: '2026-07-31',
					servings: 4,
					source: 'fresh',
					note: null,
					reason: 'Goede voorraaddekking.'
				}
			]
		});

		const result = applyMealPlanProposal(db, {
			token: proposal.token,
			userId: 1,
			operationIds: proposal.operations.map((operation) => operation.id)
		});

		expect(result).toMatchObject({
			ok: true,
			receipt: {
				status: 'committed',
				atomicity: 'atomic',
				applied: [{ kind: 'add', label: 'Linzencurry' }],
				undoToken: proposal.token
			}
		});
		expect(db.select().from(schema.mealPlanMeals).all()).toEqual([
			expect.objectContaining({
				dinner: 'Linzencurry',
				recipeSlug: 'linzencurry',
				plannedDate: '2026-07-31',
				servings: 4,
				source: 'fresh'
			})
		]);
	});

	it('edits a planned meal in place instead of removing and recreating it', () => {
		const db = createTestDb();
		seedRecipe(db, 'pasta', 'Pasta');
		seedRecipe(db, 'chili', 'Chili');
		const existing = createMealPlanService(db).create({
			weekStartDate: '2026-07-29',
			dinner: 'Pasta',
			recipeSlug: 'pasta',
			servings: 2,
			plannedDate: '2026-07-30',
			source: 'fresh',
			note: null,
			sourcePolicy: 'reject'
		});
		if (!existing.ok) throw new Error(existing.error);
		const proposal = stageMealPlanProposal(db, {
			userId: 1,
			weekStartDate: '2026-07-29',
			title: 'Donderdag aanpassen',
			recommendation: {
				whyNow: 'Donderdag vraagt om een diepvriesmaaltijd.',
				evidence: ['Chili is als recept gekoppeld.'],
				confidence: 'medium',
				uncertainty: 'Het exacte aantal diepvriesporties kan veranderd zijn.',
				consequence: 'Vervangt Pasta door Chili en plant vier porties op vrijdag.',
				alternatives: ['Behoud Pasta.']
			},
			operations: [
				{
					kind: 'update',
					mealId: existing.meal.id,
					changes: {
						dinner: 'Chili',
						recipeSlug: 'chili',
						plannedDate: '2026-07-31',
						servings: 4,
						source: 'freezer',
						note: 'Op tijd ontdooien'
					},
					reason: 'Past beter bij de beschikbare tijd.'
				}
			]
		});

		applyMealPlanProposal(db, {
			token: proposal.token,
			userId: 1,
			operationIds: [proposal.operations[0].id]
		});

		expect(db.select().from(schema.mealPlanMeals).all()).toEqual([
			expect.objectContaining({
				id: existing.meal.id,
				dinner: 'Chili',
				recipeSlug: 'chili',
				plannedDate: '2026-07-31',
				servings: 4,
				source: 'freezer',
				note: 'Op tijd ontdooien'
			})
		]);
	});

	it('undoes the whole committed bundle only while its written state is still current', () => {
		const db = createTestDb();
		seedRecipe(db, 'pasta', 'Pasta');
		seedRecipe(db, 'chili', 'Chili');
		const existing = createMealPlanService(db).create({
			weekStartDate: '2026-07-29',
			dinner: 'Pasta',
			recipeSlug: 'pasta',
			servings: 2,
			plannedDate: '2026-07-30',
			source: 'fresh',
			note: null,
			sourcePolicy: 'reject'
		});
		if (!existing.ok) throw new Error(existing.error);
		const proposal = stageMealPlanProposal(db, {
			userId: 1,
			weekStartDate: '2026-07-29',
			title: 'Week aanpassen',
			recommendation: {
				whyNow: 'Er is ruimte in de week.',
				evidence: ['De huidige week bevat één maaltijd.'],
				confidence: 'high',
				uncertainty: null,
				consequence: 'Past Pasta aan en voegt Chili toe.',
				alternatives: ['Behoud alleen Pasta.']
			},
			operations: [
				{
					kind: 'update',
					mealId: existing.meal.id,
					changes: { servings: 4, note: 'Dubbele portie' },
					reason: 'Maakt restjes.'
				},
				{
					kind: 'add',
					dinner: 'Chili',
					recipeSlug: 'chili',
					plannedDate: '2026-08-01',
					servings: 4,
					source: 'fresh',
					note: null,
					reason: 'Vult zaterdag.'
				}
			]
		});
		applyMealPlanProposal(db, {
			token: proposal.token,
			userId: 1,
			operationIds: proposal.operations.map((operation) => operation.id)
		});

		const result = undoMealPlanProposal(db, {
			token: proposal.token,
			userId: 1
		});

		expect(result).toEqual({
			ok: true,
			receipt: {
				status: 'undone',
				atomicity: 'atomic',
				restored: ['Pasta'],
				removed: ['Chili']
			}
		});
		expect(db.select().from(schema.mealPlanMeals).all()).toEqual([
			expect.objectContaining({
				id: existing.meal.id,
				dinner: 'Pasta',
				servings: 2,
				note: null
			})
		]);
	});

	it('removes a reviewed planned meal and can restore the exact row', () => {
		const db = createTestDb();
		const existing = createMealPlanService(db).create({
			weekStartDate: '2026-07-29',
			dinner: 'Afhalen',
			plannedDate: '2026-07-30',
			sourcePolicy: 'reject'
		});
		if (!existing.ok) throw new Error(existing.error);
		const proposal = stageMealPlanProposal(db, {
			userId: 1,
			weekStartDate: '2026-07-29',
			title: 'Donderdag vrijmaken',
			recommendation: {
				whyNow: 'Donderdag vervalt.',
				evidence: ['Afhalen staat op donderdag gepland.'],
				confidence: 'high',
				uncertainty: null,
				consequence: 'Verwijdert Afhalen en verzoent de boodschappenlijst.',
				alternatives: ['Verplaats Afhalen.']
			},
			operations: [
				{
					kind: 'remove',
					mealId: existing.meal.id,
					reason: 'Deze gelegenheid vervalt.'
				}
			]
		});

		applyMealPlanProposal(db, {
			token: proposal.token,
			userId: 1,
			operationIds: [proposal.operations[0].id]
		});
		expect(db.select().from(schema.mealPlanMeals).all()).toHaveLength(0);

		undoMealPlanProposal(db, { token: proposal.token, userId: 1 });
		expect(db.select().from(schema.mealPlanMeals).all()).toEqual([
			expect.objectContaining({ id: existing.meal.id, dinner: 'Afhalen' })
		]);
	});

	it('rolls back every selected operation when a later operation fails', () => {
		const db = createTestDb();
		seedRecipe(db, 'pasta', 'Pasta');
		const disappearing = seedRecipe(db, 'soep', 'Soep');
		const proposal = stageMealPlanProposal(db, {
			userId: 1,
			weekStartDate: '2026-07-29',
			title: 'Week vullen',
			recommendation: {
				whyNow: 'De week is leeg.',
				evidence: ['Twee recepten zijn beschikbaar.'],
				confidence: 'medium',
				uncertainty: 'Een recept kan ondertussen veranderen.',
				consequence: 'Voegt twee maaltijden toe.',
				alternatives: ['Voeg alleen Pasta toe.']
			},
			operations: [
				{
					kind: 'add',
					dinner: 'Pasta',
					recipeSlug: 'pasta',
					plannedDate: '2026-07-30',
					servings: 4,
					source: 'fresh',
					note: null,
					reason: 'Vult donderdag.'
				},
				{
					kind: 'add',
					dinner: 'Soep',
					recipeSlug: 'soep',
					plannedDate: '2026-07-31',
					servings: 4,
					source: 'fresh',
					note: null,
					reason: 'Vult vrijdag.'
				}
			]
		});
		db.delete(schema.recipes).where(eq(schema.recipes.id, disappearing.id)).run();

		expect(() =>
			applyMealPlanProposal(db, {
				token: proposal.token,
				userId: 1,
				operationIds: proposal.operations.map((operation) => operation.id)
			})
		).toThrow(/no longer exists/i);
		expect(db.select().from(schema.mealPlanMeals).all()).toHaveLength(0);
		expect(
			getMealPlanProposalStatus({
				token: proposal.token,
				userId: 1,
				weekStartDate: proposal.weekStartDate
			})
		).toEqual({ status: 'active' });
	});

	it('blocks all undo work when any committed meal has changed since apply', () => {
		const db = createTestDb();
		seedRecipe(db, 'pasta', 'Pasta');
		const proposal = stageMealPlanProposal(db, {
			userId: 1,
			weekStartDate: '2026-07-29',
			title: 'Week vullen',
			recommendation: {
				whyNow: 'De week is leeg.',
				evidence: ['Pasta is beschikbaar.'],
				confidence: 'high',
				uncertainty: null,
				consequence: 'Voegt Pasta toe.',
				alternatives: ['Niet plannen.']
			},
			operations: [
				{
					kind: 'add',
					dinner: 'Pasta',
					recipeSlug: 'pasta',
					plannedDate: '2026-07-30',
					servings: 4,
					source: 'fresh',
					note: null,
					reason: 'Vult donderdag.'
				}
			]
		});
		applyMealPlanProposal(db, {
			token: proposal.token,
			userId: 1,
			operationIds: [proposal.operations[0].id]
		});
		const [meal] = db.select().from(schema.mealPlanMeals).all();
		createMealPlanService(db).updateMetadata(meal.id, {
			servings: 6,
			plannedDate: meal.plannedDate
		});

		expect(() =>
			undoMealPlanProposal(db, { token: proposal.token, userId: 1 })
		).toThrow(/changed after apply/i);
		expect(db.select().from(schema.mealPlanMeals).all()).toEqual([
			expect.objectContaining({ id: meal.id, dinner: 'Pasta', servings: 6 })
		]);
	});

	it('scopes proposal status to the staging user and exact week', () => {
		const db = createTestDb();
		const proposal = stageMealPlanProposal(db, {
			userId: 1,
			weekStartDate: '2026-07-29',
			title: 'Week',
			recommendation: {
				whyNow: 'De week is leeg.',
				evidence: ['Geen maaltijden gepland.'],
				confidence: 'high',
				uncertainty: null,
				consequence: 'Voegt Afhalen toe.',
				alternatives: ['Niet plannen.']
			},
			operations: [
				{
					kind: 'add',
					dinner: 'Afhalen',
					recipeSlug: null,
					plannedDate: null,
					servings: null,
					source: 'fresh',
					note: null,
					reason: 'Open plek.'
				}
			]
		});

		expect(
			getMealPlanProposalStatus({
				token: proposal.token,
				userId: 1,
				weekStartDate: '2026-07-29'
			})
		).toEqual({ status: 'active' });
		expect(() =>
			getMealPlanProposalStatus({
				token: proposal.token,
				userId: 2,
				weekStartDate: '2026-07-29'
			})
		).toThrow(/expired or belongs/i);
		expect(() =>
			getMealPlanProposalStatus({
				token: proposal.token,
				userId: 1,
				weekStartDate: '2026-08-05'
			})
		).toThrow(/expired or belongs/i);
	});
});
