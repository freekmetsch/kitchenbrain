import { db as appDb } from '$lib/server/db/index';
import type { Db } from '$lib/server/db/types';
import { kickCookModeGeneration } from '$lib/server/ai/cook_mode';
import { kickTranslateOnImport } from '$lib/server/ai/translate_recipe';

export function kickCookModeForDb(db: Db, slug: string) {
	if (db === appDb) kickCookModeGeneration(slug);
}

export function kickTranslationForDb(db: Db, slug: string) {
	if (db === appDb) kickTranslateOnImport(slug);
}
