import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { eq } from 'drizzle-orm';
import path from 'path';
import bcrypt from 'bcryptjs';
import * as schema from './schema';
import { MACHINE_ACTORS } from '$lib/actors';

const sqlite = new Database(process.env.DATABASE_URL ?? './dev.db');
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');
sqlite.pragma('busy_timeout = 5000');
if (process.env.LITESTREAM_ENABLED === '1') {
	// Litestream owns checkpointing via its long-lived read transaction
	// (litestream.io/how-it-works); app-side checkpoints would fight it.
	sqlite.pragma('wal_autocheckpoint = 0');
} else {
	sqlite.pragma('wal_checkpoint(TRUNCATE)');
}

export const db = drizzle(sqlite, { schema });

migrate(db, { migrationsFolder: path.join(process.cwd(), 'drizzle') });

// Users are seeded from HOUSEHOLD_USERS ("name:password,name:password" — a
// password may contain ':' but never ','). Idempotent on every boot: missing
// users are created; an existing user's password follows the env value only
// while creds_version is 1 — an in-app password change (Settings) bumps it and
// takes ownership, so a redeploy never reverts it. Users absent from the env
// are left untouched; removing a user is a manual DB operation by design.
// 'system' is the display label for null-actor ops, so it is reserved too.
const RESERVED_USERNAMES = new Set<string>([...MACHINE_ACTORS, 'system']);
const VALID_USERNAME = /^[a-z0-9][a-z0-9_-]{0,31}$/;

function seedUsers(spec: string | undefined): void {
	if (!spec?.trim()) {
		const anyUser = db.select({ id: schema.users.id }).from(schema.users).limit(1).get();
		if (!anyUser) {
			console.warn('[db] No users exist and HOUSEHOLD_USERS is not set — nobody can log in.');
		}
		return;
	}
	// Entries are logged by position only: a malformed entry can be a stray
	// password fragment, which must never reach the logs.
	spec.split(',').forEach((pair, i) => {
		const sep = pair.indexOf(':');
		const username = (sep === -1 ? pair : pair.slice(0, sep)).trim().toLowerCase();
		const password = sep === -1 ? '' : pair.slice(sep + 1);
		if (!VALID_USERNAME.test(username) || RESERVED_USERNAMES.has(username) || !password) {
			console.warn(`[db] Skipping invalid HOUSEHOLD_USERS entry #${i + 1}`);
			return;
		}
		const existing = db.select().from(schema.users).where(eq(schema.users.username, username)).get();
		if (!existing) {
			db.insert(schema.users)
				.values({
					username,
					passwordHash: bcrypt.hashSync(password, 12),
					credsVersion: 1,
					createdAt: new Date()
				})
				.run();
			console.log(`[db] Seeded user '${username}'`);
		} else if (existing.credsVersion === 1 && !bcrypt.compareSync(password, existing.passwordHash)) {
			db.update(schema.users)
				.set({ passwordHash: bcrypt.hashSync(password, 12) })
				.where(eq(schema.users.id, existing.id))
				.run();
			console.log(`[db] Updated password for user '${username}' from HOUSEHOLD_USERS`);
		}
	});
}
seedUsers(process.env.HOUSEHOLD_USERS);
