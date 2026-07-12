// Config resolver for the AI model ids, spend caps, and category attribution —
// the db-aware layer `pricing.ts` deliberately stays free of (its header comment
// is an invariant: no db import, so it stays unit-testable in isolation).
//
// Precedence, per knob: household_prefs (Settings UI) → env var (Railway
// default) → hardcoded default. Phase 1a writes no household_prefs rows, so
// every getter below resolves exactly like the `export const` it replaces until
// the Settings UI (Phase 1c/1d) starts calling the setters.
import { db } from '$lib/server/db/index';
import { getHouseholdPref, setHouseholdPref, delHouseholdPref } from '$lib/server/db/household_prefs';
import { categoryForModel, capForCategory, type SpendCategory } from '$lib/server/ai/pricing';

export type ConfigSource = 'ui' | 'env' | 'default';
export type ResolvedConfig<T> = { value: T; source: ConfigSource };

/**
 * DB pref wins (a stored value deliberately overrides an env var), else env,
 * else neither. The one precedence implementation — resolveRaw and
 * resolveModel below both build on this instead of re-deriving it. Exported
 * for callers that need the source (e.g. tuning.ts's getTemperature) without
 * a second household_prefs read to recover it.
 */
export function resolvePresent(key: string, envVal: string | undefined): { raw: string; source: 'ui' | 'env' } | null {
	const dbVal = getHouseholdPref(db, key);
	if (dbVal != null && dbVal.trim() !== '') return { raw: dbVal.trim(), source: 'ui' };
	if (envVal && envVal.trim() !== '') return { raw: envVal.trim(), source: 'env' };
	return null;
}

/**
 * Effective raw string for a knob, source discarded. Shared by tuning.ts
 * (reasoning / provider-sort / temperature) — those callers only branch on the
 * value, not on where it came from.
 */
export function resolveRaw(key: string, envVal: string | undefined): string | null {
	return resolvePresent(key, envVal)?.raw ?? null;
}

function resolveModel(key: string, envVal: string | undefined, fallback: string): ResolvedConfig<string> {
	const r = resolvePresent(key, envVal);
	return r ? { value: r.raw, source: r.source } : { value: fallback, source: 'default' };
}

export type ModelRole = 'chat' | 'chat_fallback' | 'vision' | 'background';

// One parameterized role→(key, env var, default) map — mirrors getCap/setCap/
// resetCap's category param below — instead of four hand-duplicated getter/
// setter/resetter triples. GLM-5 is the P5 pick; glm-5.2 is the fallback;
// glm-4.6v handles chat image turns (glm-5 is text-only); background jobs run
// cheap. Defaults match the prior `export const` values in client.ts byte-for-byte.
const ROLE_CONFIG: Record<ModelRole, { key: string; envVar: string | undefined; fallback: string }> = {
	chat: { key: 'ai.chat_model', envVar: process.env.CHAT_MODEL, fallback: 'z-ai/glm-5' },
	chat_fallback: {
		key: 'ai.chat_fallback_model',
		envVar: process.env.CHAT_FALLBACK_MODEL,
		fallback: 'z-ai/glm-5.2'
	},
	vision: { key: 'ai.vision_model', envVar: process.env.VISION_MODEL, fallback: 'z-ai/glm-4.6v' },
	background: {
		key: 'ai.background_model',
		envVar: process.env.BACKGROUND_MODEL,
		fallback: 'z-ai/glm-4.7-flash'
	}
};

export function getModel(role: ModelRole): ResolvedConfig<string> {
	const c = ROLE_CONFIG[role];
	return resolveModel(c.key, c.envVar, c.fallback);
}

export function setModel(role: ModelRole, model: string): void {
	setHouseholdPref(db, ROLE_CONFIG[role].key, model);
}

// Reset deletes the row (not a sentinel like tuning.ts's 'default'/'auto') so a
// Railway env var regains control — copying tuning's sentinel here would mean a
// forker's CHAT_MODEL dies invisibly the moment anyone touches the UI.
export function resetModel(role: ModelRole): void {
	delHouseholdPref(db, ROLE_CONFIG[role].key);
}

// Named wrappers — every other call site (client.ts, chat/+server.ts,
// cook_mode.ts, translate_recipe.ts, ah/ai_pick.ts, recipe_ingest.ts, healthz,
// the Settings AI/Advanced panel loaders) reads more naturally as
// getChatModel()/getVisionModel()/etc. than a bare role string.
export const getChatModel = () => getModel('chat');
export const getChatFallbackModel = () => getModel('chat_fallback');
export const getVisionModel = () => getModel('vision');
export const getBackgroundModel = () => getModel('background');

export const K_CHAT_CAP = 'ai.chat_daily_cap';
export const K_BACKGROUND_CAP = 'ai.background_daily_cap';

const CAP_ENV_VAR: Record<SpendCategory, string | undefined> = {
	chat: process.env.PWA_DAILY_EUR_CAP,
	background: process.env.PWA_BACKGROUND_DAILY_EUR_CAP
};

export function getCap(category: SpendCategory): ResolvedConfig<number> {
	const key = category === 'chat' ? K_CHAT_CAP : K_BACKGROUND_CAP;
	const dbVal = getHouseholdPref(db, key);
	if (dbVal != null && dbVal.trim() !== '') {
		const n = parseFloat(dbVal);
		if (Number.isFinite(n)) return { value: n, source: 'ui' };
	}
	const envVal = CAP_ENV_VAR[category];
	// capForCategory already applies the env → hardcoded-default fallback (pricing.ts
	// resolves it once at module load) — reuse that value so behavior stays identical;
	// this layer only adds the source label for the panel's provenance line.
	return {
		value: capForCategory(category),
		source: envVal && envVal.trim() !== '' ? 'env' : 'default'
	};
}

export function setCap(category: SpendCategory, eur: number): void {
	setHouseholdPref(db, category === 'chat' ? K_CHAT_CAP : K_BACKGROUND_CAP, String(eur));
}

export function resetCap(category: SpendCategory): void {
	delHouseholdPref(db, category === 'chat' ? K_CHAT_CAP : K_BACKGROUND_CAP);
}

/**
 * Spend category for a model actually in use, not just a pricing-table lookup.
 * `categoryForModel` alone drifts the moment a custom BACKGROUND_MODEL isn't a
 * known pricing row: unknown id → DEFAULT_PRICING's 'chat' category, so a
 * configured background model would silently count against the chat cap and the
 * background cap would go dead. Checking the configured background model first
 * closes that gap without needing pricing.ts to know about household_prefs.
 * Vision models fall through to categoryForModel unchanged — vision stays
 * foreground ('chat'), same as today.
 *
 * Assumption: this tests "is this the configured background model id," not
 * "which role actually made this call" — if a future Settings UI ever lets the
 * chat model be set to the same id as the background model, that chat spend
 * would misattribute to background. Not reachable today (Phase 1a writes no
 * prefs); a real fix needs role-tagged spend rows, not a model-id match.
 *
 * backgroundModel is optional so a caller filtering many rows (checkDailyCap)
 * can resolve it once instead of paying a household_prefs read per row; a
 * single-off caller can omit it and let this resolve it itself.
 */
export function categoryForConfiguredModel(
	model: string,
	backgroundModel: string = getBackgroundModel().value
): SpendCategory {
	if (model === backgroundModel) return 'background';
	return categoryForModel(model);
}
