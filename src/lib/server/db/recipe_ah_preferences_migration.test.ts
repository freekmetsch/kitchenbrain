import { afterEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import {
	copyFileSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as schema from './schema';

const migrationRoot = join(process.cwd(), 'drizzle');
const cleanupPaths: string[] = [];

function temporaryPath(): string {
	const path = mkdtempSync(join(tmpdir(), 'kitchenbrain-recipe-pref-'));
	cleanupPaths.push(path);
	return path;
}

function databaseAt(path: string) {
	const sqlite = new Database(path);
	sqlite.pragma('foreign_keys = ON');
	return { sqlite, db: drizzle(sqlite, { schema }) };
}

function legacyMigrationFolder(root: string): string {
	const folder = join(root, 'legacy-migrations');
	const meta = join(folder, 'meta');
	mkdirSync(meta, { recursive: true });
	for (const filename of readdirSync(migrationRoot)) {
		if (/^\d{4}_.+\.sql$/.test(filename) && !filename.startsWith('0025_')) {
			copyFileSync(join(migrationRoot, filename), join(folder, filename));
		}
	}
	const journal = JSON.parse(
		readFileSync(join(migrationRoot, 'meta', '_journal.json'), 'utf8')
	) as { entries: Array<{ tag: string }> };
	journal.entries = journal.entries.filter((entry) => entry.tag !== '0025_unusual_boomer');
	writeFileSync(join(meta, '_journal.json'), JSON.stringify(journal));
	return folder;
}

afterEach(() => {
	for (const path of cleanupPaths.splice(0)) {
		rmSync(path, { recursive: true, force: true });
	}
});

describe('recipe AH preference migration', () => {
	it('creates the additive table on a fresh database with valid foreign keys', () => {
		const root = temporaryPath();
		const { sqlite, db } = databaseAt(join(root, 'fresh.sqlite'));
		try {
			migrate(db, { migrationsFolder: migrationRoot });
			expect(
				sqlite
					.prepare(
						"SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'recipe_ah_preferences'"
					)
					.get()
			).toEqual({ name: 'recipe_ah_preferences' });
			expect(sqlite.pragma('foreign_key_check')).toEqual([]);
		} finally {
			sqlite.close();
		}
	});

	it('upgrades a populated pre-feature database without rewriting recipe ingredients', () => {
		const root = temporaryPath();
		const { sqlite, db } = databaseAt(join(root, 'upgrade.sqlite'));
		try {
			migrate(db, { migrationsFolder: legacyMigrationFolder(root) });
			const ingredients = [
				{
					id: 'stable-parmesan',
					name: 'Parmezaanse kaas',
					amount: '50',
					unit: 'g'
				}
			];
			const recipe = db
				.insert(schema.recipes)
				.values({
					slug: 'migration-pasta',
					title: 'Migration pasta',
					ingredients,
					directions: ['Kook.'],
					createdAt: new Date('2026-07-28T12:00:00.000Z'),
					updatedAt: new Date('2026-07-28T12:00:00.000Z')
				})
				.returning()
				.get();

			migrate(db, { migrationsFolder: migrationRoot });

			expect(
				db.select({ ingredients: schema.recipes.ingredients }).from(schema.recipes).get()
			).toEqual({ ingredients });
			db.insert(schema.recipeAhPreferences)
				.values({
					recipeId: recipe.id,
					ingredientId: 'stable-parmesan',
					productId: 'server-product',
					productName: 'AH Parmigiano Reggiano stuk',
					variantLabel: 'Heel stuk',
					selectedAt: new Date('2026-07-28T12:05:00.000Z')
				})
				.run();
			db.delete(schema.recipes).run();
			expect(db.select().from(schema.recipeAhPreferences).all()).toEqual([]);
			expect(sqlite.pragma('foreign_key_check')).toEqual([]);
		} finally {
			sqlite.close();
		}
	});
});
