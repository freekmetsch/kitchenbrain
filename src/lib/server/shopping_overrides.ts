import { asc, eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { normalizeNameKey } from '$lib/match';
import * as schema from '$lib/server/db/schema';

type DB = BetterSQLite3Database<typeof schema>;
type Tx = Parameters<Parameters<DB['transaction']>[0]>[0];

/** Stable compatibility read for DBs that may contain exact-string variants. */
export function listShoppingOverrides(db: DB | Tx, weekStart: string) {
	return db
		.select()
		.from(schema.shoppingListOverrides)
		.where(eq(schema.shoppingListOverrides.weekStartDate, weekStart))
		.orderBy(asc(schema.shoppingListOverrides.id))
		.all();
}

/** One canonical identity lookup for manual edits, staples, and AH outcomes.
 * Newest wins, matching the page projection; older normalized duplicates stay
 * harmless compatibility rows instead of requiring a destructive rewrite. */
export function findShoppingOverride(db: DB | Tx, weekStart: string, name: string) {
	const key = normalizeNameKey(name);
	return listShoppingOverrides(db, weekStart)
		.filter((row) => normalizeNameKey(row.name) === key)
		.at(-1);
}
