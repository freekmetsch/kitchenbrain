// Shared in-memory test database, built from the real migration files so the
// test schema can never drift from production DDL.
import path from 'path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from '$lib/server/db/schema';

export function createTestDb() {
	const sqlite = new Database(':memory:');
	sqlite.pragma('foreign_keys = ON');
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: path.join(process.cwd(), 'drizzle') });
	db.insert(schema.users)
		.values({ username: 'testuser', passwordHash: 'test', credsVersion: 1, createdAt: new Date() })
		.run();
	return db;
}

export type TestDb = ReturnType<typeof createTestDb>;
