import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { eq } from 'drizzle-orm';
import * as schema from '$lib/server/db/schema';
import {
	dryRunLegacyOverrideImport,
	initializeShoppingSourceData,
	importLegacyShoppingOverrides,
	materializePlanningHorizon
} from '$lib/server/shopping_entries';
import { updateCanonicalRecipe } from '$lib/server/recipe_mutations';
import { addDays, todayIso, weekStartFor } from '$lib/week';

type IngredientRecord = Record<string, unknown>;

const sourceArg = process.argv.find((arg) => arg.startsWith('--source='));
const sourcePath = path.resolve(sourceArg?.slice('--source='.length) || process.env.DATABASE_URL || './dev.db');
if (!fs.existsSync(sourcePath)) throw new Error(`Source database not found: ${sourcePath}`);

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outputDir = path.resolve('output', `gate-b-${stamp}`);
fs.mkdirSync(outputDir, { recursive: true });

const migrationFolder = path.resolve('drizzle');
const migration0020 = fs.readFileSync(path.join(migrationFolder, '0020_shopping_source_entries.sql'), 'utf8');
const migrationStatements = migration0020
	.split('--> statement-breakpoint')
	.map((statement) => statement.trim())
	.filter(Boolean);

function execStatements(sqlite: Database.Database, statements: string[]): void {
	for (const statement of statements) sqlite.exec(statement);
}

function releaseAMigrations(sqlite: Database.Database): void {
	const files = fs
		.readdirSync(migrationFolder)
		.filter((name) => /^\d{4}_.+\.sql$/.test(name) && name < '0020_')
		.sort();
	for (const file of files) {
		const sql = fs.readFileSync(path.join(migrationFolder, file), 'utf8');
		execStatements(
			sqlite,
			sql
				.split('--> statement-breakpoint')
				.map((statement) => statement.trim())
				.filter(Boolean)
		);
	}
}

function semanticWithoutIds(ingredients: IngredientRecord[]): IngredientRecord[] {
	return ingredients.map(({ id: _id, ...ingredient }) => ingredient);
}

function recipeIngredients(sqlite: Database.Database): Map<number, IngredientRecord[]> {
	return new Map(
		(sqlite.prepare('SELECT id, ingredients FROM recipes ORDER BY id').all() as Array<{ id: number; ingredients: string }>).map(
			(row) => [row.id, JSON.parse(row.ingredients) as IngredientRecord[]]
		)
	);
}

function assertIngredientMigration(
	before: Map<number, IngredientRecord[]>,
	after: Map<number, IngredientRecord[]>
): { recipeCount: number; ingredientCount: number; assignedIds: number; preservedIds: number } {
	let ingredientCount = 0;
	let assignedIds = 0;
	let preservedIds = 0;
	if (before.size !== after.size) throw new Error('Recipe count changed during ingredient migration');
	for (const [recipeId, oldIngredients] of before) {
		const migrated = after.get(recipeId);
		if (!migrated) throw new Error(`Recipe ${recipeId} disappeared during migration`);
		if (JSON.stringify(semanticWithoutIds(oldIngredients)) !== JSON.stringify(semanticWithoutIds(migrated))) {
			throw new Error(`Old ingredient fields or order changed for recipe ${recipeId}`);
		}
		const ids = migrated.map((ingredient) => ingredient.id);
		if (ids.some((id) => typeof id !== 'string' || id.length === 0)) {
			throw new Error(`Recipe ${recipeId} still has an ingredient without an ID`);
		}
		if (new Set(ids).size !== ids.length) throw new Error(`Recipe ${recipeId} has duplicate ingredient IDs`);
		ingredientCount += migrated.length;
		for (let index = 0; index < migrated.length; index++) {
			if (oldIngredients[index].id) preservedIds++;
			else assignedIds++;
		}
	}
	return { recipeCount: after.size, ingredientCount, assignedIds, preservedIds };
}

async function safeCopy(source: string, target: string): Promise<void> {
	const sqlite = new Database(source, { readonly: true });
	await sqlite.backup(target);
	sqlite.close();
}

function createReleaseAFixture(target: string): void {
	const sqlite = new Database(target);
	sqlite.pragma('foreign_keys = ON');
	releaseAMigrations(sqlite);
	const now = Date.now();
	const currentWeek = weekStartFor(todayIso(), 2);
	const recipeInsert = sqlite.prepare(
		`INSERT INTO recipes (slug, title, servings, ingredients, directions, created_at, updated_at)
		 VALUES (?, ?, ?, ?, '[]', ?, ?)`
	);
	recipeInsert.run(
		'bolognese',
		'Bolognese',
		4,
		JSON.stringify([
			{ name: 'pasta', amount: '400', unit: 'g', component: 'Pasta', substitutes: [{ name: 'spaghetti' }] },
			{ name: 'Parmezaan', amount: '80', unit: 'g', optional: true },
			{ name: 'balsamico', amount: '1', unit: 'el' }
		]),
		now,
		now
	);
	recipeInsert.run(
		'tomato-side',
		'Tomato side',
		4,
		JSON.stringify([{ name: 'tomaat', amount: '2' }]),
		now,
		now
	);
	const mealInsert = sqlite.prepare(
		`INSERT INTO meal_plan_meals
		 (week_number, week_start_date, dinner, recipe_slug, servings, status, source, sort_order, created_at)
		 VALUES (30, ?, ?, ?, 4, 'planned', 'fresh', ?, ?)`
	);
	mealInsert.run(currentWeek, 'Bolognese', 'bolognese', 0, now);
	mealInsert.run(currentWeek, 'Tomato side', 'tomato-side', 1, now);
	const overrideInsert = sqlite.prepare(
		`INSERT INTO shopping_list_overrides
		 (week_start_date, name, bought, manual, amount, unit, included, selected_name, created_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
	);
	overrideInsert.run(currentWeek, 'pasta', 0, 0, null, null, 1, 'spaghetti', now);
	overrideInsert.run(currentWeek, 'melk', 1, 1, '2', 'pak', 1, null, now);
	overrideInsert.run(currentWeek, 'verdwenen', 0, 0, null, null, 1, 'ander product', now);
	sqlite.close();
}

function rehearseDatabase(
	label: string,
	beforePath: string,
	migratedPath: string,
	mode: 'journal' | 'direct'
) {
	const beforeSqlite = new Database(beforePath, { readonly: true });
	const beforeIngredients = recipeIngredients(beforeSqlite);
	beforeSqlite.close();
	fs.copyFileSync(beforePath, migratedPath);
	const sqlite = new Database(migratedPath);
	sqlite.pragma('foreign_keys = ON');
	const db = drizzle(sqlite, { schema });
	if (mode === 'journal') migrate(db, { migrationsFolder: migrationFolder });
	else execStatements(sqlite, migrationStatements);

	const afterIngredients = recipeIngredients(sqlite);
	const semantic = assertIngredientMigration(beforeIngredients, afterIngredients);
	const afterFirstBackfill = JSON.stringify([...afterIngredients.entries()]);
	execStatements(
		sqlite,
		migrationStatements.filter((statement) => statement.startsWith('UPDATE `recipes`'))
	);
	const afterSecondBackfill = JSON.stringify([...recipeIngredients(sqlite).entries()]);
	if (afterFirstBackfill !== afterSecondBackfill) throw new Error(`${label}: ingredient backfill changed on second run`);

	const weekStartDay = 2;
	const currentWeek = weekStartFor(todayIso(), weekStartDay);
	const dryRun = dryRunLegacyOverrideImport(db);
	const initialized = initializeShoppingSourceData(db);
	const imported = initialized.imported;
	const horizon = materializePlanningHorizon(db, { currentWeek, weekStartDay, planAheadWeeks: 4 });
	const secondImport = importLegacyShoppingOverrides(db);
	const secondInitialize = initializeShoppingSourceData(db);
	if (dryRun.total !== imported.total) throw new Error(`${label}: legacy dry-run and import totals differ`);
	if (secondImport.alreadyImported !== imported.total) throw new Error(`${label}: legacy import was not idempotent`);
	if (!secondInitialize.alreadyComplete) throw new Error(`${label}: production initializer was not idempotent`);

	const recipe = db.select().from(schema.recipes).orderBy(schema.recipes.id).get();
	let codeRollbackEdit = { exercised: false, idsPreserved: true };
	if (recipe) {
		const idsBefore = recipe.ingredients.map((ingredient) => ingredient.id);
		const updated = updateCanonicalRecipe(db, {
			recipeId: recipe.id,
			expectedRevision: recipe.contentRevision,
			changes: { notes: recipe.notes ? `${recipe.notes}\nrollback probe` : 'rollback probe' }
		});
		if (!updated) throw new Error(`${label}: SRD-0 mutation seam rejected the migrated recipe`);
		const idsAfter = updated.ingredients.map((ingredient) => ingredient.id);
		codeRollbackEdit = { exercised: true, idsPreserved: JSON.stringify(idsBefore) === JSON.stringify(idsAfter) };
		if (!codeRollbackEdit.idsPreserved) throw new Error(`${label}: SRD-0 mutation seam changed ingredient IDs`);
	}

	const counts = {
		recurringItems: db.select().from(schema.recurringShoppingItems).all().length,
		weekEntries: db.select().from(schema.shoppingWeekEntries).all().length,
		unresolvedLegacy: db
			.select()
			.from(schema.shoppingWeekEntries)
			.where(eq(schema.shoppingWeekEntries.needsReview, true))
			.all().length
	};
	sqlite.close();
	return {
		label,
		beforePath,
		migratedPath,
		semantic,
		dryRun,
		imported,
		secondImport,
		secondInitialize,
		horizon,
		counts,
		codeRollbackEdit
	};
}

const currentBefore = path.join(outputDir, 'current-before-0020.db');
const currentMigrated = path.join(outputDir, 'current-migrated.db');
await safeCopy(sourcePath, currentBefore);

const fixtureBefore = path.join(outputDir, 'release-a-fixture-before-0020.db');
const fixtureMigrated = path.join(outputDir, 'release-a-fixture-migrated.db');
createReleaseAFixture(fixtureBefore);

const current = rehearseDatabase('current-copy', currentBefore, currentMigrated, 'journal');
const fixture = rehearseDatabase('release-a-fixture', fixtureBefore, fixtureMigrated, 'direct');

const fullRestore = path.join(outputDir, 'full-restore-pre-0020.db');
fs.copyFileSync(fixtureBefore, fullRestore);
const restored = new Database(fullRestore, { readonly: true });
const restoredTables = (restored.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as Array<{ name: string }>).map(
	(row) => row.name
);
if (restoredTables.includes('shopping_week_entries')) throw new Error('Full restore still contains the 0020 tables');
restored.close();

const evidence = {
	createdAt: new Date().toISOString(),
	sourcePath,
	outputDir,
	current,
	fixture,
	fullRestore: { path: fullRestore, pre0020ShapeRestored: true },
	nextWeek: addDays(weekStartFor(todayIso(), 2), 7)
};
const evidencePath = path.join(outputDir, 'gate-b-evidence.json');
fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
console.log(evidencePath);
