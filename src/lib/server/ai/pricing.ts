// Pure AI cost model — per-model pricing + spend-category caps. No db, no SDK
// import, so it stays unit-testable in isolation and is the single source of
// truth the db-coupled cap/log functions in client.ts build on.
//
// Spend splits into two budget lines so scheduled background jobs (recipe ingest,
// recipe translate — all on Haiku) can never pause interactive
// chat. `chat` = the foreground mutation/cook loops (Sonnet); `background` =
// everything scheduled/helper. The category rides on the model id — no schema
// migration — so checkDailyCap filters today's rows by the model's category.
export type SpendCategory = 'chat' | 'background';

export type UsageStats = {
	input_tokens: number;
	output_tokens: number;
	cache_read_input_tokens?: number | null;
	cache_creation_input_tokens?: number | null;
};

type ModelPricing = {
	inputPerM: number;
	outputPerM: number;
	cacheReadPerM: number;
	cacheWritePerM: number;
	category: SpendCategory;
};

export const USD_TO_EUR = parseFloat(process.env.USD_TO_EUR ?? '0.92');

// Per-model pricing (USD/M tokens). Cache read = 0.1× base input, 5-min cache
// write = 1.25× base input (Anthropic's standard multipliers — consistent with
// Sonnet's $3 → $0.30/$3.75). Env overrides preserve the prior seam.
// 🔍 verified pricing (claude-api skill, cached 2026-06-24; plan cost model).
const MODEL_PRICING: Record<string, ModelPricing> = {
	'claude-sonnet-4-6': {
		inputPerM: parseFloat(process.env.SONNET_INPUT_PRICE_PER_M ?? '3.00'),
		outputPerM: parseFloat(process.env.SONNET_OUTPUT_PRICE_PER_M ?? '15.00'),
		cacheReadPerM: parseFloat(process.env.SONNET_CACHE_READ_PRICE_PER_M ?? '0.30'),
		cacheWritePerM: parseFloat(process.env.SONNET_CACHE_WRITE_PRICE_PER_M ?? '3.75'),
		category: 'chat'
	},
	'claude-haiku-4-5-20251001': {
		inputPerM: parseFloat(process.env.HAIKU_INPUT_PRICE_PER_M ?? '1.00'),
		outputPerM: parseFloat(process.env.HAIKU_OUTPUT_PRICE_PER_M ?? '5.00'),
		cacheReadPerM: parseFloat(process.env.HAIKU_CACHE_READ_PRICE_PER_M ?? '0.10'),
		cacheWritePerM: parseFloat(process.env.HAIKU_CACHE_WRITE_PRICE_PER_M ?? '1.25'),
		category: 'background'
	},
	// GLM via OpenRouter (P5 provider switch). OpenRouter reports usage.cost per
	// response, so logSpend prefers that native figure; these rows are the fallback
	// when a native cost is absent and set categoryForModel for the daily-cap split.
	// GLM caches provider-side (no Anthropic cache_control): cached-input tokens ARE
	// now logged from usage.prompt_tokens_details, but billing still rides on the
	// provider's usage.cost, so these per-token cache rates stay a nominal fallback.
	// 🔍 verified live via OpenRouter models API 2026-07-06 (USD/M in·out; glm-5
	// cache-read $0.12/M, glm-5.2 $0.17/M — kept approximate since the fallback path
	// rarely fires).
	'z-ai/glm-5': {
		inputPerM: parseFloat(process.env.GLM5_INPUT_PRICE_PER_M ?? '0.60'),
		outputPerM: parseFloat(process.env.GLM5_OUTPUT_PRICE_PER_M ?? '1.92'),
		cacheReadPerM: 0.06,
		cacheWritePerM: 0.75,
		category: 'chat'
	},
	'z-ai/glm-5.2': {
		inputPerM: parseFloat(process.env.GLM52_INPUT_PRICE_PER_M ?? '0.91'),
		outputPerM: parseFloat(process.env.GLM52_OUTPUT_PRICE_PER_M ?? '2.86'),
		cacheReadPerM: 0.09,
		cacheWritePerM: 1.14,
		category: 'chat'
	},
	// Vision-capable GLM for chat image turns (photo → recipe); glm-5 is text-only.
	'z-ai/glm-4.6v': {
		inputPerM: parseFloat(process.env.GLM46V_INPUT_PRICE_PER_M ?? '0.30'),
		outputPerM: parseFloat(process.env.GLM46V_OUTPUT_PRICE_PER_M ?? '0.90'),
		cacheReadPerM: 0.03,
		cacheWritePerM: 0.375,
		category: 'chat'
	},
	// Cheap GLM for the background jobs (recipe ingest, translate).
	'z-ai/glm-4.7-flash': {
		inputPerM: parseFloat(process.env.GLM47FLASH_INPUT_PRICE_PER_M ?? '0.06'),
		outputPerM: parseFloat(process.env.GLM47FLASH_OUTPUT_PRICE_PER_M ?? '0.40'),
		cacheReadPerM: 0.006,
		cacheWritePerM: 0.075,
		category: 'background'
	}
};

// Unknown model id: price as Sonnet (conservative — never under-bill) and count
// against the chat cap (foreground-safe). Phase 5 adds GLM/Kimi/OpenRouter rows.
const DEFAULT_PRICING: ModelPricing = { ...MODEL_PRICING['claude-sonnet-4-6'], category: 'chat' };

function pricingFor(model: string): ModelPricing {
	return MODEL_PRICING[model] ?? DEFAULT_PRICING;
}

export function categoryForModel(model: string): SpendCategory {
	return pricingFor(model).category;
}

export function computeCostEur(model: string, usage: UsageStats): number {
	const p = pricingFor(model);
	const usd =
		(usage.input_tokens / 1_000_000) * p.inputPerM +
		(usage.output_tokens / 1_000_000) * p.outputPerM +
		((usage.cache_read_input_tokens ?? 0) / 1_000_000) * p.cacheReadPerM +
		((usage.cache_creation_input_tokens ?? 0) / 1_000_000) * p.cacheWritePerM;

	return usd * USD_TO_EUR;
}

// Foreground chat and background jobs each get their own daily cap so one can't
// starve the other. Both default to €0.50; background is independently tunable.
export const CHAT_DAILY_EUR_CAP = parseFloat(process.env.PWA_DAILY_EUR_CAP ?? '0.50');
export const BACKGROUND_DAILY_EUR_CAP = parseFloat(
	process.env.PWA_BACKGROUND_DAILY_EUR_CAP ?? '0.50'
);

export function capForCategory(category: SpendCategory): number {
	return category === 'chat' ? CHAT_DAILY_EUR_CAP : BACKGROUND_DAILY_EUR_CAP;
}

// OpenRouter-only shortcut surface (2026-07-12 amendment, FEATURE_LIST_SETTINGS_MENU.md):
// the Settings model pickers only ever suggest OpenRouter ids — claude-* rows stay in
// MODEL_PRICING purely as the dormant Anthropic-rollback price table (CLAUDE.md
// §Portability), never offered as a UI shortcut. Mirrors client.ts's backendFor()
// routing without importing it, so this file stays SDK/db-free.
function isOpenRouterId(model: string): boolean {
	return !model.startsWith('claude-') && !model.startsWith('anthropic/');
}

/** Curated shortcut chips for a Settings model picker — derived from the live
 * pricing table (not a second hardcoded list) so it can't drift as models churn. */
export function modelShortcuts(category: SpendCategory): string[] {
	return Object.entries(MODEL_PRICING)
		.filter(([id, p]) => p.category === category && isOpenRouterId(id))
		.map(([id]) => id);
}
