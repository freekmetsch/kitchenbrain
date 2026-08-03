import { db as appDb } from '$lib/server/db/index';
import type { Db } from '$lib/server/db/types';
import { kickTranslateOnImport } from '$lib/server/ai/translate_recipe';

export function kickTranslationForDb(db: Db, slug: string) {
	if (db === appDb) kickTranslateOnImport(slug);
}
