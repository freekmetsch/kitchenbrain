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
	const path = mkdtempSync(join(tmpdir(), 'kitchenbrain-portion-removal-'));
	cleanupPaths.push(path);
	return path;
}

function preFeatureMigrationFolder(root: string): string {
	const folder = join(root, 'pre-feature-migrations');
	const meta = join(folder, 'meta');
	mkdirSync(meta, { recursive: true });
	for (const filename of readdirSync(migrationRoot)) {
		if (/^\d{4}_.+\.sql$/.test(filename) && Number(filename.slice(0, 4)) < 28) {
			copyFileSync(join(migrationRoot, filename), join(folder, filename));
		}
	}
	const journal = JSON.parse(
		readFileSync(join(migrationRoot, 'meta', '_journal.json'), 'utf8')
	) as { entries: Array<{ tag: string }> };
	journal.entries = journal.entries.filter((entry) => Number(entry.tag.slice(0, 4)) < 28);
	writeFileSync(join(meta, '_journal.json'), JSON.stringify(journal));
	return folder;
}

afterEach(() => {
	for (const path of cleanupPaths.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe('portion and reversible-removal migrations', () => {
	it('upgrades populated planning and shopping data without rewriting it', () => {
		const root = temporaryPath();
		const sqlite = new Database(join(root, 'upgrade.sqlite'));
		sqlite.pragma('foreign_keys = ON');
		const db = drizzle(sqlite, { schema });
		try {
			migrate(db, { migrationsFolder: preFeatureMigrationFolder(root) });
			const createdAt = 1_785_591_000;
			const recipe = sqlite
				.prepare(
					`INSERT INTO recipes
					(slug, title, servings, ingredients, directions, created_at, updated_at)
					VALUES (?, ?, ?, ?, '[]', ?, ?)`
				)
				.run(
					'portion-stage-pasta',
					'Portion stage pasta',
					4,
					JSON.stringify([{ id: 'tomaat', name: 'Tomaat', amount: '4', unit: 'stuks' }]),
					createdAt,
					createdAt
				);
			const recipeId = Number(recipe.lastInsertRowid);
			const meal = sqlite
				.prepare(
					`INSERT INTO meal_plan_meals
					(week_number, week_start_date, dinner, recipe_slug, servings, status, source, created_at)
					VALUES (31, '2026-07-27', ?, ?, 6, 'planned', 'fresh', ?)`
				)
				.run('Portion stage pasta', 'portion-stage-pasta', createdAt);
			const mealId = Number(meal.lastInsertRowid);
			sqlite
				.prepare(
					`INSERT INTO shopping_week_entries
					(week_start_date, source_key, source_kind, recipe_id, recipe_slug, ingredient_id,
					 name, amount, unit, amount_override, meal_ids, selected_name, bought, revision,
					 created_at, updated_at)
					VALUES ('2026-07-27', 'recipe:stage:tomaat', 'recipe', ?, ?, 'tomaat',
					 'Tomaat', '6', 'stuks', '8', ?, 'Trostomaten', 1, 3, ?, ?)`
				)
				.run(recipeId, 'portion-stage-pasta', JSON.stringify([mealId]), createdAt, createdAt);
			sqlite
				.prepare(
					`INSERT INTO shopping_push_history
					(week_start_date, destination, products_pushed, attempt_status, completed_at, created_at)
					VALUES ('2026-07-27', 'list', 1, 'succeeded', ?, ?)`
				)
				.run(createdAt, createdAt);

			migrate(db, { migrationsFolder: migrationRoot });

			expect(
				sqlite
					.prepare('SELECT slug, servings, archived_at FROM recipes WHERE id = ?')
					.get(recipeId)
			).toEqual({ slug: 'portion-stage-pasta', servings: 4, archived_at: null });
			expect(
				sqlite
					.prepare(
						`SELECT amount, amount_override, selected_name, bought, revision
						 FROM shopping_week_entries WHERE source_key = 'recipe:stage:tomaat'`
					)
					.get()
			).toEqual({
				amount: '6',
				amount_override: '8',
				selected_name: 'Trostomaten',
				bought: 1,
				revision: 3
			});
			expect(
				sqlite
					.prepare(
						`SELECT destination, products_pushed, attempt_status
						 FROM shopping_push_history WHERE week_start_date = '2026-07-27'`
					)
					.get()
			).toEqual({ destination: 'list', products_pushed: 1, attempt_status: 'succeeded' });

			sqlite
				.prepare(
					`INSERT INTO shopping_week_exclusions
					(week_start_date, name_key, name, created_at) VALUES ('2026-07-27', 'tomaat', 'Tomaat', ?)`
				)
				.run(createdAt);
			sqlite.prepare('UPDATE recipes SET archived_at = ? WHERE id = ?').run(createdAt, recipeId);
			expect(sqlite.prepare('SELECT count(*) AS count FROM shopping_week_exclusions').get()).toEqual({
				count: 1
			});
			expect(sqlite.pragma('foreign_key_check')).toEqual([]);
		} finally {
			sqlite.close();
		}
	});

	it('keeps the upgraded database usable after code rolls back to migration 0027', () => {
		const root = temporaryPath();
		const sqlite = new Database(join(root, 'rollback.sqlite'));
		const db = drizzle(sqlite, { schema });
		try {
			migrate(db, { migrationsFolder: migrationRoot });
			migrate(db, { migrationsFolder: preFeatureMigrationFolder(root) });
			const createdAt = 1_785_591_000;
			sqlite
				.prepare(
					`INSERT INTO recipes
					(slug, title, ingredients, directions, created_at, updated_at)
					VALUES ('rollback-pasta', 'Rollback pasta', '[]', '[]', ?, ?)`
				)
				.run(createdAt, createdAt);
			sqlite
				.prepare(
					`INSERT INTO shopping_week_entries
					(week_start_date, source_key, source_kind, name, amount, unit, created_at, updated_at)
					VALUES ('2026-07-27', 'manual:rollback', 'manual', 'Citroen', '2', 'stuks', ?, ?)`
				)
				.run(createdAt, createdAt);

			expect(
				sqlite
					.prepare('SELECT slug, title FROM recipes WHERE slug = ?')
					.get('rollback-pasta')
			).toEqual({ slug: 'rollback-pasta', title: 'Rollback pasta' });
			expect(
				sqlite
					.prepare('SELECT name, amount, unit FROM shopping_week_entries WHERE source_key = ?')
					.get('manual:rollback')
			).toEqual({ name: 'Citroen', amount: '2', unit: 'stuks' });
			expect(
				sqlite
					.prepare(
						"SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'shopping_week_exclusions'"
					)
					.get()
			).toEqual({ name: 'shopping_week_exclusions' });
		} finally {
			sqlite.close();
		}
	});
});
