// Per-user key-value accessors over the `prefs` table — the per-user
// counterpart to household_prefs.ts's household-level get/set. Generic on
// purpose: recipe language, default sort, theme, and any future per-user
// setting share this one seam instead of each load function hand-rolling its
// own "select all, find by key" query.
import { eq, and } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from '$lib/server/db/schema';

type DB = BetterSQLite3Database<typeof schema>;

export function getUserPref(db: DB, userId: number, key: string): string | null {
	return (
		db
			.select({ value: schema.prefs.value })
			.from(schema.prefs)
			.where(and(eq(schema.prefs.userId, userId), eq(schema.prefs.key, key)))
			.get()?.value ?? null
	);
}

export function setUserPref(db: DB, userId: number, key: string, value: string): void {
	db.insert(schema.prefs)
		.values({ userId, key, value, updatedAt: new Date() })
		.onConflictDoUpdate({
			target: [schema.prefs.userId, schema.prefs.key],
			set: { value, updatedAt: new Date() }
		})
		.run();
}
