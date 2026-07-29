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
	const path = mkdtempSync(join(tmpdir(), 'kitchenbrain-inventory-zones-'));
	cleanupPaths.push(path);
	return path;
}

function databaseAt(path: string) {
	const sqlite = new Database(path);
	sqlite.pragma('foreign_keys = ON');
	return { sqlite, db: drizzle(sqlite, { schema }) };
}

function preTargetMigrationFolder(root: string): string {
	const folder = join(root, 'legacy-migrations');
	const meta = join(folder, 'meta');
	mkdirSync(meta, { recursive: true });
	for (const filename of readdirSync(migrationRoot)) {
		const match = filename.match(/^(\d{4})_.+\.sql$/);
		if (match && Number(match[1]) < 26) {
			copyFileSync(join(migrationRoot, filename), join(folder, filename));
		}
	}
	const journal = JSON.parse(
		readFileSync(join(migrationRoot, 'meta', '_journal.json'), 'utf8')
	) as { entries: Array<{ idx: number }> };
	journal.entries = journal.entries.filter((entry) => entry.idx < 26);
	writeFileSync(join(meta, '_journal.json'), JSON.stringify(journal));
	return folder;
}

afterEach(() => {
	for (const path of cleanupPaths.splice(0)) {
		rmSync(path, { recursive: true, force: true });
	}
});

describe('inventory zones and pantry targets migration', () => {
	it('adds only nullable target columns on a fresh database', () => {
		const root = temporaryPath();
		const { sqlite, db } = databaseAt(join(root, 'fresh.sqlite'));
		try {
			migrate(db, { migrationsFolder: migrationRoot });
			const columns = sqlite.prepare('PRAGMA table_info(inventory_items)').all() as Array<{
				name: string;
				notnull: number;
			}>;
			expect(columns).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ name: 'par_target_qty', notnull: 0 }),
					expect.objectContaining({ name: 'par_target_unit', notnull: 0 })
				])
			);
			expect(sqlite.pragma('foreign_key_check')).toEqual([]);
		} finally {
			sqlite.close();
		}
	});

	it('preserves populated inventory and accepts fridge plus targets after upgrade', () => {
		const root = temporaryPath();
		const { sqlite, db } = databaseAt(join(root, 'upgrade.sqlite'));
		try {
			migrate(db, { migrationsFolder: preTargetMigrationFolder(root) });
			const now = new Date('2026-07-29T10:00:00Z');
			sqlite
				.prepare(
					'INSERT INTO inventory_items (name, section, is_staple, needs_review, created_at, updated_at) VALUES (?, ?, 0, 0, ?, ?)'
				)
				.run('Rijst', 'pantry', now.getTime(), now.getTime());

			migrate(db, { migrationsFolder: migrationRoot });
			const existing = db.select().from(schema.inventoryItems).get()!;
			expect(existing).toMatchObject({
				name: 'Rijst',
				section: 'pantry',
				parTargetQty: null,
				parTargetUnit: null
			});

			db.update(schema.inventoryItems)
				.set({ section: 'fridge', parTargetQty: null, parTargetUnit: null })
				.run();
			expect(db.select().from(schema.inventoryItems).get()).toMatchObject({ section: 'fridge' });
			expect(sqlite.pragma('foreign_key_check')).toEqual([]);
		} finally {
			sqlite.close();
		}
	});

	it('keeps the legacy inventory projection readable after a code rollback', () => {
		const root = temporaryPath();
		const { sqlite, db } = databaseAt(join(root, 'rollback.sqlite'));
		try {
			migrate(db, { migrationsFolder: migrationRoot });
			const now = new Date('2026-07-29T10:00:00Z').getTime();
			sqlite
				.prepare(
					'INSERT INTO inventory_items (name, section, is_staple, needs_review, created_at, updated_at) VALUES (?, ?, 0, 0, ?, ?)'
				)
				.run('Rijst', 'pantry', now, now);

			const legacyRows = sqlite
				.prepare('SELECT id, name, section, is_staple FROM inventory_items ORDER BY id')
				.all();
			expect(legacyRows).toEqual([
				expect.objectContaining({
					name: 'Rijst',
					section: 'pantry',
					is_staple: 0
				})
			]);
			expect(sqlite.pragma('foreign_key_check')).toEqual([]);
		} finally {
			sqlite.close();
		}
	});
});
