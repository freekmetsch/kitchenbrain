// Chat-model tuning seam. The reasoning + provider-routing knobs used to be read
// straight from Railway env vars (CHAT_REASONING_EFFORT / CHAT_PROVIDER_SORT) inside
// client.ts, which meant tuning them required a trip into the Railway dashboard.
// They now live in the household_prefs table so the Settings UI can set them and the
// next chat request picks them up — no redeploy.
//
// Precedence, per knob: DB pref (Settings UI) → env var (Railway default) → model
// default. So byte-for-byte behaviour is unchanged until someone touches the UI, and
// any Railway env var already set keeps acting as the baseline.
//
// Why these two knobs (verified 2026-07-07 bench, CLAUDE.md §Portability):
//   reasoning — GLM-5 reasons by default; 'low' vs 'high' effort is ~a no-op on
//     latency, so the only meaningful move is turning it OFF (reasoning.enabled=false,
//     ~2.5s vs ~5s+ to first word) at some risk of terser multi-step replies. The UI
//     exposes that as a Balanced/Fast toggle.
//   provider_sort — GLM-5 is served by ~8 OpenRouter providers at wildly different
//     speeds (some spike to 60s+); sort:'latency' routes around the slow tail. The one
//     with the biggest felt speed-up, no quality cost.
// Temperature (output randomness) resolves the same DB-pref → env → default chain
// via ai.temperature — added in Phase 1a alongside the model/cap config resolver
// (config.ts); UI editability lands in Phase 1c.
import { db } from '$lib/server/db/index';
import { getHouseholdPref, setHouseholdPref, delHouseholdPref } from '$lib/server/db/household_prefs';
import { resolveRaw, resolvePresent, type ResolvedConfig } from '$lib/server/ai/config';

const K_REASONING = 'chat.reasoning_effort';
const K_PROVIDER_SORT = 'chat.provider_sort';
const K_TEMPERATURE = 'ai.temperature';

export type ReasoningMode = 'default' | 'off';
export type ProviderSort = 'auto' | 'latency' | 'throughput' | 'price';

export type ChatTuning = { reasoning: ReasoningMode; providerSort: ProviderSort };

const OFF_RE = /^(off|disabled|none|false)$/i;
const DEFAULT_RE = /^(default|auto)$/i;

/** Effective knob values for the Settings UI — what's active on the next chat turn. */
export function getChatTuning(): ChatTuning {
	const rawReason = resolveRaw(K_REASONING, process.env.CHAT_REASONING_EFFORT);
	const reasoning: ReasoningMode = rawReason && OFF_RE.test(rawReason) ? 'off' : 'default';

	const rawSort = resolveRaw(K_PROVIDER_SORT, process.env.CHAT_PROVIDER_SORT);
	const providerSort: ProviderSort =
		rawSort === 'latency' || rawSort === 'throughput' || rawSort === 'price' ? rawSort : 'auto';

	return { reasoning, providerSort };
}

/**
 * Persist a knob household-wide. The 'default'/'auto' choices are stored (not
 * deleted) so an explicit UI pick overrides any Railway env var per the precedence
 * rule above, and buildChatTuningPayload treats them as "emit nothing".
 */
export function setChatTuning(patch: {
	reasoning?: ReasoningMode;
	providerSort?: ProviderSort;
}): void {
	if (patch.reasoning !== undefined) {
		setHouseholdPref(db, K_REASONING, patch.reasoning === 'off' ? 'off' : 'default');
	}
	if (patch.providerSort !== undefined) {
		setHouseholdPref(db, K_PROVIDER_SORT, patch.providerSort);
	}
}

/** Effective temperature + its source, for the Advanced panel's provenance line. */
export function getTemperature(): ResolvedConfig<number | null> {
	const r = resolvePresent(K_TEMPERATURE, process.env.CHAT_TEMPERATURE);
	const n = r ? parseFloat(r.raw) : NaN;
	if (!r || !Number.isFinite(n)) return { value: null, source: 'default' };
	return { value: n, source: r.source };
}

export function setTemperature(value: number): void {
	setHouseholdPref(db, K_TEMPERATURE, String(value));
}

// Deletes the row (not a sentinel) so a Railway CHAT_TEMPERATURE regains control —
// same reasoning as config.ts's model/cap resets.
export function resetTemperature(): void {
	delHouseholdPref(db, K_TEMPERATURE);
}

/**
 * The OpenRouter request-body fragment for chat tuning. Empty when everything is on
 * default, so the request is byte-for-byte today's until a knob is set. Faithful to
 * the old env-only behaviour (including arbitrary effort levels and CHAT_TEMPERATURE)
 * when no DB pref exists.
 */
export function buildChatTuningPayload(): Record<string, unknown> {
	const out: Record<string, unknown> = {};

	const rawReason = resolveRaw(K_REASONING, process.env.CHAT_REASONING_EFFORT);
	if (rawReason && !DEFAULT_RE.test(rawReason)) {
		out.reasoning = OFF_RE.test(rawReason) ? { enabled: false } : { effort: rawReason };
	}

	// Temperature: DB pref (Settings UI) → env var → model default (unset = no
	// override; overrides GLM's default of 1 when set).
	const rawTemp = resolveRaw(K_TEMPERATURE, process.env.CHAT_TEMPERATURE);
	if (rawTemp && Number.isFinite(parseFloat(rawTemp))) out.temperature = parseFloat(rawTemp);

	const rawSort = resolveRaw(K_PROVIDER_SORT, process.env.CHAT_PROVIDER_SORT);
	if (rawSort && !DEFAULT_RE.test(rawSort)) out.provider = { sort: rawSort };

	return out;
}
