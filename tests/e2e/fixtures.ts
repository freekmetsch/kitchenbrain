import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import path from 'node:path';
import type { TestInfo } from '@playwright/test';
import { isoWeekNumber, todayIso, weekStartFor } from '../../src/lib/week';
import type { TestAccountName } from './config';

const E2E_WEEK_START_DAY = 2;

export type KitchenFixture = {
	account: TestAccountName;
	inventoryName: string;
	longInventoryNames: string[];
	cookRecipeSlug: string;
	cookRecipeTitle: string;
	recipeSlug: string;
	recipeTitle: string;
	shoppingName: string;
	longShoppingNames: string[];
	shoppingAlternative: string;
	shoppingNameEn: string;
	shoppingAlternativeEn: string;
	weekStart: string;
};

function fixtureForAccount(account: TestAccountName): KitchenFixture {
	const label = account === 'primary' ? 'Primary' : 'Secondary';
	const dutchLabel = account === 'primary' ? 'primaire' : 'secundaire';
	return {
		account,
		inventoryName: `E2E ${label} Soup`,
		longInventoryNames: Array.from(
			{ length: 6 },
			(_, index) => `E2E ${label} freezer meal ${index + 1} with a deliberately long name`
		),
		cookRecipeSlug: `e2e-${account}-cook-mode`,
		cookRecipeTitle: `E2E ${label} Cook Mode`,
		recipeSlug: `e2e-${account}-stew`,
		recipeTitle: `E2E ${label} Stew`,
		shoppingName: `E2E ${dutchLabel} tomaten`,
		longShoppingNames: [
			'amandelen',
			'broccoli',
			'citroenen',
			'doperwten',
			'havermout',
			'paprika'
		].map((name) => `E2E ${dutchLabel} ${name} met een bewust lange omschrijving`),
		shoppingAlternative: `E2E ${dutchLabel} tomatenblokjes`,
		shoppingNameEn: `E2E ${label} Tomatoes`,
		shoppingAlternativeEn: `E2E ${label} Canned Tomatoes`,
		weekStart: weekStartFor(todayIso(), E2E_WEEK_START_DAY)
	};
}

export const KITCHEN_FIXTURES = {
	primary: fixtureForAccount('primary'),
	secondary: fixtureForAccount('secondary')
} as const satisfies Record<TestAccountName, KitchenFixture>;

export function kitchenFixtureFor(testInfo: TestInfo): KitchenFixture {
	return testInfo.project.name.endsWith('secondary')
		? KITCHEN_FIXTURES.secondary
		: KITCHEN_FIXTURES.primary;
}

/**
 * Seed the household database before Vite imports the application DB singleton.
 * Each account gets uniquely named rows so the combined primary + secondary
 * Playwright run remains deterministic even though household data is shared.
 */
export function seedKitchenFixtures(databasePath: string): void {
	const sqlite = new Database(databasePath);
	sqlite.pragma('foreign_keys = ON');
	migrate(drizzle(sqlite), { migrationsFolder: path.join(process.cwd(), 'drizzle') });

	const now = Math.floor(Date.now() / 1000);
	const insertInventory = sqlite.prepare(`
		INSERT INTO inventory_items (
			name, qty_text, qty_num, unit, section, category, kind, food_class,
			needs_review, is_staple, tags, created_at, updated_at
		) VALUES (
			@inventoryName, '2 portions', 2, 'portions', 'freezer', 'meal', 'leftover',
			'main', 0, 0, '[]', @now, @now
		)
	`);
	const insertRecipe = sqlite.prepare(`
		INSERT INTO recipes (
			slug, title, servings, structure_version, content_revision, total_time_min,
			ingredients, directions, direction_ids_json, language, title_en,
			ingredients_en, directions_en, translation_status, cook_mode_json, cooked_count,
			is_freezer_staple, freezer_staple_opt_out, needs_review, created_at, updated_at
		) VALUES (
			@recipeSlug, @recipeTitle, 4, 2, 1, 30,
			@ingredients, @directions, @directionIds, 'nl', @recipeTitle,
			@ingredientsEn, @directionsEn, 'ready', @cookModeJson, 0, 0, 0, 0, @now, @now
		)
	`);
	const insertManualShoppingEntry = sqlite.prepare(`
		INSERT INTO shopping_week_entries (
			week_start_date, source_key, source_kind, name, amount, unit,
			meal_ids, approved_terms, included, bought, needs_review, revision,
			created_at, updated_at
		) VALUES (
			@weekStart, @sourceKey, 'manual', @name, '1', 'piece',
			'[]', @approvedTerms, 1, 0, 0, 1, @now, @now
		)
	`);
	const insertMeal = sqlite.prepare(`
		INSERT INTO meal_plan_meals (
			week_number, week_start_date, dinner, recipe_slug, servings, status,
			source, sort_order, created_at
		) VALUES (
			@weekNumber, @weekStart, @recipeTitle, @recipeSlug, 4, 'planned',
			'fresh', @sortOrder, @now
		)
	`);

	const seed = sqlite.transaction(() => {
		Object.values(KITCHEN_FIXTURES).forEach((fixture, index) => {
			const ingredients = [
				{
					id: `e2e-${fixture.account}-tomatoes`,
					name: fixture.shoppingName,
					amount: '2',
					unit: 'cans',
					role: 'cook_in',
					purchaseForm: 'preserved',
					origin: 'source',
					substitutes: [{ name: fixture.shoppingAlternative }]
				}
			];
			const ingredientsEn = [
				{
					name: fixture.shoppingNameEn,
					amount: '2',
					unit: 'cans',
					substitutes: [{ name: fixture.shoppingAlternativeEn }]
				}
			];
			const directions = ['Laat sudderen tot gaar.', 'Serveer de stoofpot.'];
			const directionsEn = ['Simmer until ready.', 'Serve the stew.'];
			const directionIds = [
				`e2e-${fixture.account}-step-1`,
				`e2e-${fixture.account}-step-2`
			];
			const cookModeJson = {
				version: 4,
				generation_id: `e2e-${fixture.account}-generation`,
				baseline_servings: 4,
				prep_tasks: [],
				streams: [{ id: 'pot', name: { en: 'Pot', nl: 'Pan' } }],
				steps: [
					{
						title: { en: 'Simmer the stew', nl: 'Laat de stoofpot sudderen' },
						goal: {
							en: 'Simmer stew — piping hot',
							nl: 'Laat stoofpot sudderen — door en door heet'
						},
						body: { en: directionsEn[0], nl: directions[0] },
						ingredient_indexes: [0],
						timer_seconds: null,
						timer_purpose: null,
						timer_action: null,
						timer_location: null,
						stream_id: 'pot',
						merges_from: []
					},
					{
						title: { en: 'Serve the stew', nl: 'Serveer de stoofpot' },
						goal: {
							en: 'Serve stew — hot in bowls',
							nl: 'Serveer stoofpot — heet in kommen'
						},
						body: { en: directionsEn[1], nl: directions[1] },
						ingredient_indexes: [],
						timer_seconds: null,
						timer_purpose: null,
						timer_action: null,
						timer_location: null,
						stream_id: 'pot',
						merges_from: []
					}
				]
			};
			insertInventory.run({ inventoryName: fixture.inventoryName, now });
			for (const inventoryName of fixture.longInventoryNames) {
				insertInventory.run({ inventoryName, now });
			}
			fixture.longShoppingNames.forEach((name, shoppingIndex) => {
				insertManualShoppingEntry.run({
					weekStart: fixture.weekStart,
					sourceKey: `manual:e2e:${fixture.account}:${shoppingIndex}`,
					name,
					approvedTerms: JSON.stringify([name]),
					now
				});
			});
			insertRecipe.run({
				recipeSlug: fixture.recipeSlug,
				recipeTitle: fixture.recipeTitle,
				ingredients: JSON.stringify(ingredients),
				directions: JSON.stringify(directions),
				directionIds: JSON.stringify(directionIds),
				ingredientsEn: JSON.stringify(ingredientsEn),
				directionsEn: JSON.stringify(directionsEn),
				cookModeJson: JSON.stringify(cookModeJson),
				now
			});
			insertRecipe.run({
				recipeSlug: fixture.cookRecipeSlug,
				recipeTitle: fixture.cookRecipeTitle,
				ingredients: JSON.stringify(ingredients),
				directions: JSON.stringify(directions),
				directionIds: JSON.stringify(directionIds),
				ingredientsEn: JSON.stringify(ingredientsEn),
				directionsEn: JSON.stringify(directionsEn),
				cookModeJson: JSON.stringify({
					...cookModeJson,
					generation_id: `e2e-${fixture.account}-cook-mode-generation`
				}),
				now
			});
			insertMeal.run({
				weekNumber: isoWeekNumber(fixture.weekStart),
				weekStart: fixture.weekStart,
				recipeTitle: fixture.recipeTitle,
				recipeSlug: fixture.recipeSlug,
				sortOrder: index,
				now
			});
		});
	});

	seed();
	sqlite.close();
}
