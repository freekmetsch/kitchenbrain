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
	const path = mkdtempSync(join(tmpdir(), 'kitchenbrain-rotation-'));
	cleanupPaths.push(path);
	return path;
}

function legacyMigrationFolder(root: string): string {
	const folder = join(root, 'legacy-migrations');
	const meta = join(folder, 'meta');
	mkdirSync(meta, { recursive: true });
	for (const filename of readdirSync(migrationRoot)) {
		if (/^\d{4}_.+\.sql$/.test(filename) && Number(filename.slice(0, 4)) < 27) {
			copyFileSync(join(migrationRoot, filename), join(folder, filename));
		}
	}
	const journal = JSON.parse(
		readFileSync(join(migrationRoot, 'meta', '_journal.json'), 'utf8')
	) as { entries: Array<{ tag: string }> };
	journal.entries = journal.entries.filter((entry) => Number(entry.tag.slice(0, 4)) < 27);
	writeFileSync(join(meta, '_journal.json'), JSON.stringify(journal));
	return folder;
}

afterEach(() => {
	for (const path of cleanupPaths.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe('recipe rotation migration', () => {
	it('defaults existing recipes to an unconfigured rhythm without changing freezer metadata', () => {
		const root = temporaryPath();
		const sqlite = new Database(join(root, 'upgrade.sqlite'));
		const db = drizzle(sqlite, { schema });
		try {
			migrate(db, { migrationsFolder: legacyMigrationFolder(root) });
			sqlite
				.prepare(
					`INSERT INTO recipes
					(slug, title, ingredients, directions, is_freezer_staple, target_portions, created_at, updated_at)
					VALUES (?, ?, '[]', '[]', 1, 6, ?, ?)`
				)
				.run('bolo', 'Spaghetti bolognese', 1_785_493_200, 1_785_493_200);

			migrate(db, { migrationsFolder: migrationRoot });

			expect(
				db
					.select({
						rotationPolicy: schema.recipes.rotationPolicy,
						rotationSeasons: schema.recipes.rotationSeasonsJson,
						isFreezerStaple: schema.recipes.isFreezerStaple,
						targetPortions: schema.recipes.targetPortions
					})
					.from(schema.recipes)
					.get()
			).toEqual({
				rotationPolicy: null,
				rotationSeasons: [],
				isFreezerStaple: true,
				targetPortions: 6
			});
			expect(sqlite.pragma('foreign_key_check')).toEqual([]);
		} finally {
			sqlite.close();
		}
	});

	it('keeps the upgraded database usable after a code rollback that ignores additive columns', () => {
		const root = temporaryPath();
		const sqlite = new Database(join(root, 'rollback.sqlite'));
		const db = drizzle(sqlite, { schema });
		try {
			migrate(db, { migrationsFolder: migrationRoot });
			// A rolled-back binary only knows migrations 0000-0026. Replaying that
			// journal must not remove 0027 or stop old-shaped reads and writes.
			migrate(db, { migrationsFolder: legacyMigrationFolder(root) });
			sqlite
				.prepare(
					`INSERT INTO recipes
					(slug, title, ingredients, directions, is_freezer_staple, target_portions, created_at, updated_at)
					VALUES (?, ?, '[]', '[]', 1, 4, ?, ?)`
				)
				.run('rollback-bolo', 'Rollback bolognese', 1_785_493_200, 1_785_493_200);

			expect(
				sqlite
					.prepare(
						`SELECT slug, is_freezer_staple, target_portions
						 FROM recipes WHERE slug = ?`
					)
					.get('rollback-bolo')
			).toEqual({
				slug: 'rollback-bolo',
				is_freezer_staple: 1,
				target_portions: 4
			});
			expect(
				sqlite
					.prepare(
						`SELECT rotation_policy, rotation_seasons_json
						 FROM recipes WHERE slug = ?`
					)
					.get('rollback-bolo')
			).toEqual({ rotation_policy: null, rotation_seasons_json: '[]' });
		} finally {
			sqlite.close();
		}
	});
});
