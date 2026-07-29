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
	const path = mkdtempSync(join(tmpdir(), 'kitchenbrain-butler-state-'));
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
		if (/^\d{4}_.+\.sql$/.test(filename) && !filename.startsWith('0026_')) {
			copyFileSync(join(migrationRoot, filename), join(folder, filename));
		}
	}
	const journal = JSON.parse(
		readFileSync(join(migrationRoot, 'meta', '_journal.json'), 'utf8')
	) as { entries: Array<{ tag: string }> };
	journal.entries = journal.entries.filter((entry) => entry.tag !== '0026_unique_malice');
	writeFileSync(join(meta, '_journal.json'), JSON.stringify(journal));
	return folder;
}

afterEach(() => {
	for (const path of cleanupPaths.splice(0)) {
		rmSync(path, { recursive: true, force: true });
	}
});

describe('Butler service-state migration', () => {
	it('creates only additive state tables on a fresh database', () => {
		const root = temporaryPath();
		const { sqlite, db } = databaseAt(join(root, 'fresh.sqlite'));
		try {
			migrate(db, { migrationsFolder: migrationRoot });
			const names = sqlite
				.prepare(
					"SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'butler_%' ORDER BY name"
				)
				.all();
			expect(names).toEqual([
				{ name: 'butler_candidate_states' },
				{ name: 'butler_initiative_preferences' },
				{ name: 'butler_user_states' }
			]);
			expect(sqlite.pragma('foreign_key_check')).toEqual([]);
		} finally {
			sqlite.close();
		}
	});

	it('upgrades populated household data and cascades per-user Butler state', () => {
		const root = temporaryPath();
		const { sqlite, db } = databaseAt(join(root, 'upgrade.sqlite'));
		try {
			migrate(db, { migrationsFolder: legacyMigrationFolder(root) });
			const now = new Date('2026-07-29T10:00:00Z');
			const user = db
				.insert(schema.users)
				.values({ username: 'migration-user', passwordHash: 'test', createdAt: now })
				.returning()
				.get();
			db.insert(schema.inventoryItems)
				.values({ name: 'Spinazie', section: 'pantry', createdAt: now, updatedAt: now })
				.run();

			migrate(db, { migrationsFolder: migrationRoot });

			expect(db.select().from(schema.inventoryItems).all()).toEqual([
				expect.objectContaining({ name: 'Spinazie' })
			]);
			db.insert(schema.butlerCandidateStates)
				.values({
					userId: user.id,
					candidateKey: 'brief:stock-expiry:spinach',
					disposition: 'dismissed',
					createdAt: now,
					updatedAt: now
				})
				.run();
			db.insert(schema.butlerInitiativePreferences)
				.values({
					userId: user.id,
					domain: 'stock',
					level: 'notice',
					createdAt: now,
					updatedAt: now
				})
				.run();
			db.insert(schema.butlerUserStates)
				.values({
					userId: user.id,
					changesSeenThrough: now,
					createdAt: now,
					updatedAt: now
				})
				.run();
			db.delete(schema.users).run();

			expect(db.select().from(schema.butlerCandidateStates).all()).toEqual([]);
			expect(db.select().from(schema.butlerInitiativePreferences).all()).toEqual([]);
			expect(db.select().from(schema.butlerUserStates).all()).toEqual([]);
			expect(sqlite.pragma('foreign_key_check')).toEqual([]);
		} finally {
			sqlite.close();
		}
	});
});
