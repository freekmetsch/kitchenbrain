import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schema from './schema';

export type Db = BetterSQLite3Database<typeof schema>;
export type DbTransaction = Parameters<Parameters<Db['transaction']>[0]>[0];
export type DbOrTx = Db | DbTransaction;
