import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from '$lib/server/db/schema';
import type { WritePrecondition } from '$lib/server/inventory_writes';

export type DB = BetterSQLite3Database<typeof schema>;

// The optional precondition is only supplied by the approval path (P5.3);
// the add/remove executors forward it to the inventory boundary, which
// revalidates it in-transaction. Read/meal/recipe executors ignore it.
export type ExecutorFn = (
	raw: unknown,
	db: DB,
	userId: number,
	precondition?: WritePrecondition
) => Promise<unknown>;
