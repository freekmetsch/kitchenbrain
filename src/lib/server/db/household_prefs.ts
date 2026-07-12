// Household-level (not per-user) key-value accessors over the `household_prefs`
// table. Generic on purpose — chat tuning and any future app-wide setting share
// this one seam. (`prefs` is the separate per-user store.)
import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from '$lib/server/db/schema';

type DB = BetterSQLite3Database<typeof schema>;

// Free-text household profile injected into the AI system prompt
// ({{household_profile}}); written from Settings, read per chat turn.
export const K_HOUSEHOLD_PROFILE = 'household.profile';

export function getHouseholdPref(db: DB, key: string): string | null {
	return (
		db.select().from(schema.householdPrefs).where(eq(schema.householdPrefs.key, key)).get()
			?.value ?? null
	);
}

export function setHouseholdPref(db: DB, key: string, value: string): void {
	db.insert(schema.householdPrefs)
		.values({ key, value, updatedAt: new Date() })
		.onConflictDoUpdate({
			target: schema.householdPrefs.key,
			set: { value, updatedAt: new Date() }
		})
		.run();
}

// Deletes the row outright (as opposed to setChatTuning's 'default' sentinel,
// which deliberately overrides env). Settings knobs that must let a Railway env
// var regain control on reset (model ids, spend caps) use this instead.
export function delHouseholdPref(db: DB, key: string): void {
	db.delete(schema.householdPrefs).where(eq(schema.householdPrefs.key, key)).run();
}
