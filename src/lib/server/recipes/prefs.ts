// Household-wide Recipes setting for eager English translation on import. Same household_prefs
// resolution as ai/config.ts (Phase 1a precedent) — reuses resolveRaw rather
// than forking it. Neither knob has a Railway env-var layer (no such knob is
// planned), so resolveRaw's envVal argument is always undefined here;
// precedence collapses to household_prefs → hardcoded default.
import { db } from '$lib/server/db/index';
import { setHouseholdPref } from '$lib/server/db/household_prefs';
import { resolveRaw } from '$lib/server/ai/config';

export const K_AUTO_TRANSLATE_ON_IMPORT = 'recipes.auto_translate_on_import';

// Any stored value other than the literal 'true'/'false' string falls back to
// `fallback` — a malformed row must never crash Settings (Correctness Req #4).
function resolveBool(key: string, fallback: boolean): boolean {
	const raw = resolveRaw(key, undefined);
	if (raw === 'true') return true;
	if (raw === 'false') return false;
	return fallback;
}

// Default false — preserves today's lazy on-demand translate behavior.
export function getAutoTranslateOnImport(): boolean {
	return resolveBool(K_AUTO_TRANSLATE_ON_IMPORT, false);
}

export function setAutoTranslateOnImport(enabled: boolean): void {
	setHouseholdPref(db, K_AUTO_TRANSLATE_ON_IMPORT, String(enabled));
}
