import Anthropic from '@anthropic-ai/sdk';
import { db } from '$lib/server/db/index';
import { spending } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { computeCostEur, USD_TO_EUR, type SpendCategory, type UsageStats } from '$lib/server/ai/pricing';
import { buildChatTuningPayload } from '$lib/server/ai/tuning';
import { categoryForConfiguredModel, getBackgroundModel, getCap } from '$lib/server/ai/config';
import { todayIso } from '$lib/week';

export class DailyCapExceeded extends Error {
	constructor() {
		super('Daily EUR cap exceeded');
	}
}

// Invariant: the `category` a call site checks here must match the category its
// model logs under (categoryForConfiguredModel), so the gate and the ledger stay
// one source of truth — e.g. the chat route checks 'chat' and spends the chat
// model; translate checks 'background' and spends the background model. The P5
// provider seam will fold gate+call+log into one wrapper so category can't drift.
export function checkDailyCap(category: SpendCategory = 'chat'): { exceeded: boolean; totalEur: number } {
	const today = todayIso();
	const rows = db
		.select({ model: spending.model, costEur: spending.costEur })
		.from(spending)
		.where(eq(spending.date, today))
		.all();
	// Resolve once (not per row) — the configured background model is invariant
	// across this scan.
	const backgroundModel = getBackgroundModel().value;
	const totalEur = rows
		.filter((r) => categoryForConfiguredModel(r.model, backgroundModel) === category)
		.reduce((acc, r) => acc + r.costEur, 0);
	return { exceeded: totalEur >= getCap(category).value, totalEur };
}

// costUsdOverride: OpenRouter reports usage.cost per response — pass it here so the
// ledger records the provider's actual charge rather than our recomputed estimate.
// Absent (Anthropic native, or a missing field) → fall back to the pricing table.
export function logSpend(model: string, usage: UsageStats, costUsdOverride?: number | null): number {
	const costEur = costUsdOverride != null ? costUsdOverride * USD_TO_EUR : computeCostEur(model, usage);
	db.insert(spending)
		.values({
			date: todayIso(),
			model,
			inputTokens: usage.input_tokens,
			outputTokens: usage.output_tokens,
			cacheReadTokens: usage.cache_read_input_tokens ?? 0,
			cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
			costEur,
			createdAt: new Date()
		})
		.run();
	return costEur;
}

/** A transient image attached to a chat turn (Stage 4b / P5.4 vision). */
export type VisionImage = {
	mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
	/** Base64-encoded image bytes (no data: prefix). */
	base64: string;
};

/**
 * Build a user message that carries one or more images alongside the text, in the
 * SDK's content-block shape. The Anthropic image shapes live here (behind the
 * client seam) so route/UI never import SDK content types — the portability rule
 * (CLAUDE.md §Portability): the only module that knows Anthropic wire shapes is
 * this one. Images go before the text per Anthropic's own guidance.
 */
export function buildVisionMessage(text: string, images: VisionImage[]): Anthropic.MessageParam {
	const content: Anthropic.ContentBlockParam[] = images.map((img) => ({
		type: 'image',
		source: { type: 'base64', media_type: img.mediaType, data: img.base64 }
	}));
	content.push({ type: 'text', text });
	return { role: 'user', content };
}

let anthropicClient: Anthropic | null = null;

function getAnthropicClient(): Anthropic {
	const apiKey = process.env.ANTHROPIC_API_KEY;
	if (!apiKey) {
		throw new Error('ANTHROPIC_API_KEY is required for AI calls.');
	}
	anthropicClient ??= new Anthropic({ apiKey });
	return anthropicClient;
}

export const anthropic = new Proxy({} as Anthropic, {
	get(_target, prop, receiver) {
		return Reflect.get(getAnthropicClient(), prop, receiver);
	}
});

// ─────────────────────────────────────────────────────────────────────────────
// Provider seam (P5). The LLM provider is swappable behind this module — the chat
// route and background jobs call createMessage / streamAgentTurn and never touch a
// wire shape. The backend is chosen by model id: `claude-*` → Anthropic native
// (kept as a dormant, env-flip rollback); everything else → OpenRouter's
// OpenAI-compatible endpoint (GLM et al.). The internal message representation stays
// Anthropic content-block shaped (Anthropic.MessageParam) so history.ts, cache.ts,
// and the chat loop are untouched — the OpenAI translation lives only here.
// ─────────────────────────────────────────────────────────────────────────────

// Effective model ids resolve at call time via config.ts (household_prefs → env
// var → default) — see getChatModel/getChatFallbackModel/getVisionModel/
// getBackgroundModel there. Nothing here reads them anymore; this seam only
// knows how to route a model id, not which one is configured.
export function backendFor(model: string): 'anthropic' | 'openrouter' {
	return model.startsWith('claude-') || model.startsWith('anthropic/') ? 'anthropic' : 'openrouter';
}

// The chat renders replies as raw text, so any markdown shows as literal clutter.
// The system prompt bans it, but GLM models don't reliably obey on longer replies
// (verified: bold `**` and backticks leak ~half the time). Strip the inline emitters
// as a hard guarantee — safe per streamed delta because plain replies and Dutch
// ingredient names never legitimately contain `*` or backticks. Model-agnostic:
// keeps output clean whatever backend is configured.
export function stripInlineMarkdown(s: string): string {
	return s.replace(/[*`]/g, '');
}

/**
 * Parse a JSON object out of a model's text reply, tolerating a leading/trailing
 * ```json code fence. GLM occasionally wraps structured output in a fence despite
 * a prompt that bans it (same markdown leakage stripInlineMarkdown guards against
 * on chat). The recipe scrape + translate paths both JSON.parse model output, so
 * they share this defensive unwrap here rather than each risking a raw-parse crash.
 */
export function parseModelJson(text: string): unknown {
	const trimmed = text.trim();
	// 1) Cleanly fenced ```json … ``` → unwrap and parse.
	const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
	const candidate = fenced ? fenced[1].trim() : trimmed;
	try {
		return JSON.parse(candidate);
	} catch {
		// 2) Prose around the object or an unclosed fence ("Here's the recipe: ```json
		//    {…}"): slice the outermost {…} / […] span and retry before giving up.
		const first = candidate.search(/[{[]/);
		const last = Math.max(candidate.lastIndexOf('}'), candidate.lastIndexOf(']'));
		if (first !== -1 && last > first) return JSON.parse(candidate.slice(first, last + 1));
		throw new Error('No JSON found in model reply');
	}
}

function openRouterKey(): string {
	const key = process.env.OPENROUTER_API_KEY;
	if (!key) throw new Error('OPENROUTER_API_KEY is required for OpenRouter AI calls.');
	return key;
}

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Error messages thrown from this seam end up user-visible (tool error chips
// render the executor's { error } string) and in the model's tool_result — so
// never embed a raw response body. Extract the provider's human message and
// drop the JSON envelope.
function openRouterErrorMessage(status: number | string, body: string): string {
	let detail = '';
	try {
		const parsed = JSON.parse(body);
		const msg = parsed?.error?.message;
		if (typeof msg === 'string') detail = msg;
	} catch {
		// Non-JSON body (HTML gateway page etc.) — status alone is enough.
	}
	return `AI service error (${status})${detail ? `: ${detail.slice(0, 200)}` : ''}`;
}
const OPENROUTER_HEADERS = () => ({
	Authorization: `Bearer ${openRouterKey()}`,
	'Content-Type': 'application/json',
	'HTTP-Referer': process.env.ORIGIN ?? 'http://localhost:5173',
	'X-Title': 'household-brain'
});

// OpenRouter always returns usage details now (the old `usage:{include:true}`
// opt-in is deprecated/no-effect). We read `prompt_tokens_details` so the spending
// ledger's cache columns reflect GLM's provider-side prompt caching (the 60–80%
// repeated-context discount), then map prompt/completion → our Anthropic-shaped
// UsageStats. Answers "is caching actually working?" from the ledger, not a guess.
type OpenRouterUsage = {
	prompt_tokens?: number;
	completion_tokens?: number;
	cost?: number;
	prompt_tokens_details?: { cached_tokens?: number; cache_write_tokens?: number };
};

function usageFromOpenRouter(u: OpenRouterUsage): UsageStats {
	// OpenRouter's `prompt_tokens` is the TOTAL input, cached tokens included (unlike
	// Anthropic's non-overlapping buckets). Subtract the cached portion so the ledger's
	// input vs cache-read columns don't double-count the same tokens.
	const cachedRead = u.prompt_tokens_details?.cached_tokens ?? 0;
	return {
		input_tokens: Math.max(0, (u.prompt_tokens ?? 0) - cachedRead),
		output_tokens: u.completion_tokens ?? 0,
		cache_read_input_tokens: cachedRead,
		cache_creation_input_tokens: u.prompt_tokens_details?.cache_write_tokens ?? 0
	};
}

type OpenAiMsg =
	| { role: 'system' | 'user' | 'assistant'; content: string | unknown[] | null; tool_calls?: unknown[] }
	| { role: 'tool'; tool_call_id: string; content: string };

// Anthropic content-block messages → OpenAI chat messages. A user message is one of
// three shapes in our pipeline: plain string, tool_result blocks (from the loop), or
// a vision message (text + image blocks). tool_result blocks each become a separate
// role:'tool' message; images become image_url parts.
function toOpenAiMessages(system: string, messages: Anthropic.MessageParam[]): OpenAiMsg[] {
	const out: OpenAiMsg[] = [{ role: 'system', content: system }];
	for (const m of messages) {
		if (typeof m.content === 'string') {
			out.push({ role: m.role, content: m.content });
			continue;
		}
		const blocks = m.content as Anthropic.ContentBlockParam[];
		if (m.role === 'assistant') {
			let text = '';
			const toolCalls: unknown[] = [];
			for (const b of blocks) {
				if (b.type === 'text') text += b.text;
				else if (b.type === 'tool_use')
					toolCalls.push({
						id: b.id,
						type: 'function',
						function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) }
					});
			}
			out.push({
				role: 'assistant',
				content: text || null,
				...(toolCalls.length ? { tool_calls: toolCalls } : {})
			});
			continue;
		}
		// user message: tool_result blocks → role:'tool'; else text (+ images)
		const toolResults = blocks.filter((b) => b.type === 'tool_result');
		if (toolResults.length) {
			for (const b of toolResults as Anthropic.ToolResultBlockParam[]) {
				const content =
					typeof b.content === 'string'
						? b.content
						: JSON.stringify(b.content ?? '');
				out.push({ role: 'tool', tool_call_id: b.tool_use_id, content });
			}
			continue;
		}
		const parts: unknown[] = [];
		for (const b of blocks) {
			if (b.type === 'text') parts.push({ type: 'text', text: b.text });
			else if (b.type === 'image' && b.source.type === 'base64')
				parts.push({
					type: 'image_url',
					image_url: { url: `data:${b.source.media_type};base64,${b.source.data}` }
				});
		}
		out.push({ role: 'user', content: parts.length ? parts : '' });
	}
	return out;
}

function toOpenAiTools(tools: Anthropic.Tool[]): unknown[] {
	return tools.map((t) => ({
		type: 'function',
		function: { name: t.name, description: t.description, parameters: t.input_schema }
	}));
}

export type AgentTurnResult = {
	/** Assistant reply in Anthropic content-block shape (text + completed tool_use). */
	content: Anthropic.ContentBlockParam[];
	toolCalls: Array<{ id: string; name: string; input: unknown }>;
	usage: UsageStats;
	model: string;
	/** Provider-reported cost (USD) when available — pass straight to logSpend. */
	costUsd?: number | null;
};

export type AgentTurnOpts = {
	model: string;
	system: string;
	messages: Anthropic.MessageParam[];
	tools: Anthropic.Tool[];
	maxTokens: number;
	signal: AbortSignal;
	/** Called with each streamed text delta so the route can forward SSE to the client. */
	onText: (delta: string) => void;
};

// Stream one agent turn (text + tool calls) from either backend, forwarding text
// deltas via onText. Returns the assembled assistant content (Anthropic-shaped),
// the completed tool calls to execute, and usage/cost for the ledger.
export async function streamAgentTurn(opts: AgentTurnOpts): Promise<AgentTurnResult> {
	return backendFor(opts.model) === 'anthropic'
		? streamAnthropicTurn(opts)
		: streamOpenRouterTurn(opts);
}

async function streamOpenRouterTurn(opts: AgentTurnOpts): Promise<AgentTurnResult> {
	const res = await fetch(OPENROUTER_URL, {
		method: 'POST',
		headers: OPENROUTER_HEADERS(),
		signal: opts.signal,
		body: JSON.stringify({
			model: opts.model,
			messages: toOpenAiMessages(opts.system, opts.messages),
			tools: toOpenAiTools(opts.tools),
			tool_choice: 'auto',
			max_tokens: opts.maxTokens,
			stream: true,
			...buildChatTuningPayload()
		})
	});
	if (!res.ok || !res.body) {
		throw new Error(openRouterErrorMessage(res.status, await res.text()));
	}

	let text = '';
	// Accumulate streamed tool_calls by their index (id/name arrive once, arguments
	// stream in fragments).
	const tc: Record<number, { id: string; name: string; args: string }> = {};
	let usage: OpenRouterUsage = {};

	const reader = res.body.getReader();
	const decoder = new TextDecoder();
	let buf = '';
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		buf += decoder.decode(value, { stream: true });
		// SSE frames are separated by blank lines.
		let nl: number;
		while ((nl = buf.indexOf('\n')) !== -1) {
			const line = buf.slice(0, nl).trim();
			buf = buf.slice(nl + 1);
			if (!line.startsWith('data:')) continue;
			const data = line.slice(5).trim();
			if (data === '[DONE]') continue;
			let chunk: any;
			try {
				chunk = JSON.parse(data);
			} catch {
				continue;
			}
			// Mid-stream failures arrive as a chunk with a top-level `error` field and
			// finish_reason "error" (verified: OpenRouter streaming docs) — the stream
			// dies after it. Throw so the route's fallback/retry and error SSE engage
			// instead of the turn silently ending as an empty bubble.
			if (chunk.error) {
				throw new Error(
					openRouterErrorMessage(chunk.error.code ?? 'stream', JSON.stringify(chunk))
				);
			}
			if (chunk.usage) usage = chunk.usage;
			const delta = chunk.choices?.[0]?.delta;
			if (!delta) continue;
			if (typeof delta.content === 'string' && delta.content) {
				text += delta.content;
				opts.onText(delta.content);
			}
			for (const call of delta.tool_calls ?? []) {
				const i = call.index ?? 0;
				tc[i] ??= { id: '', name: '', args: '' };
				if (call.id) tc[i].id = call.id;
				if (call.function?.name) tc[i].name = call.function.name;
				if (call.function?.arguments) tc[i].args += call.function.arguments;
			}
		}
	}

	const content: Anthropic.ContentBlockParam[] = [];
	if (text) content.push({ type: 'text', text });
	const toolCalls: Array<{ id: string; name: string; input: unknown }> = [];
	for (const key of Object.keys(tc)) {
		const c = tc[+key];
		// A tool call truncated by max_tokens has unparseable JSON — drop it rather
		// than run a partial call (mirrors the Anthropic-path guard).
		let input: unknown;
		try {
			input = JSON.parse(c.args || '{}');
		} catch {
			continue;
		}
		const id = c.id || `call_${key}`;
		content.push({ type: 'tool_use', id, name: c.name, input });
		toolCalls.push({ id, name: c.name, input });
	}

	return {
		content,
		toolCalls,
		usage: usageFromOpenRouter(usage),
		model: opts.model,
		costUsd: usage.cost ?? null
	};
}

async function streamAnthropicTurn(opts: AgentTurnOpts): Promise<AgentTurnResult> {
	const stream = anthropic.messages.stream({
		model: opts.model,
		max_tokens: opts.maxTokens,
		system: [{ type: 'text', text: opts.system, cache_control: { type: 'ephemeral' } }],
		tools: opts.tools,
		messages: opts.messages
	});
	const onAbort = () => stream.abort();
	opts.signal.addEventListener('abort', onAbort, { once: true });
	try {
		for await (const event of stream) {
			if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
				opts.onText(event.delta.text);
			}
		}
		const final = await stream.finalMessage();
		const completed = new Set<string>();
		const toolCalls: Array<{ id: string; name: string; input: unknown }> = [];
		for (const b of final.content) {
			if (b.type === 'tool_use') {
				completed.add(b.id);
				toolCalls.push({ id: b.id, name: b.name, input: b.input });
			}
		}
		return {
			content: final.content as Anthropic.ContentBlockParam[],
			toolCalls,
			usage: final.usage,
			model: final.model,
			costUsd: null
		};
	} finally {
		opts.signal.removeEventListener('abort', onAbort);
	}
}

export type CreateMessageResult = { text: string; model: string; usage: UsageStats; costUsd?: number | null };

/** A message part for createMessage — text-only messages can pass a plain string;
 * the Settings vision-model test-on-save is the one caller that needs an image. */
export type CreateMessagePart =
	| { type: 'text'; text: string }
	| { type: 'image'; mediaType: VisionImage['mediaType']; base64: string };

// Non-streaming text completion — the seam for the background/helper jobs (cook_mode,
// recipe ingest, recipe translate) and the Settings model-picker test-on-save.
// system + user messages → text.
export async function createMessage(opts: {
	model: string;
	system: string;
	messages: Array<{ role: 'user' | 'assistant'; content: string | CreateMessagePart[] }>;
	maxTokens: number;
}): Promise<CreateMessageResult> {
	if (backendFor(opts.model) === 'anthropic') {
		const msg = await anthropic.messages.create({
			model: opts.model,
			max_tokens: opts.maxTokens,
			system: opts.system,
			messages: opts.messages.map((m) => ({
				role: m.role,
				content:
					typeof m.content === 'string'
						? m.content
						: m.content.map((p) =>
								p.type === 'text'
									? { type: 'text' as const, text: p.text }
									: {
											type: 'image' as const,
											source: { type: 'base64' as const, media_type: p.mediaType, data: p.base64 }
										}
							)
			}))
		});
		const text = msg.content.find((b) => b.type === 'text')?.text ?? '';
		return { text, model: msg.model, usage: msg.usage, costUsd: null };
	}
	const res = await fetch(OPENROUTER_URL, {
		method: 'POST',
		headers: OPENROUTER_HEADERS(),
		body: JSON.stringify({
			model: opts.model,
			messages: [
				{ role: 'system', content: opts.system },
				...opts.messages.map((m) => ({
					role: m.role,
					content:
						typeof m.content === 'string'
							? m.content
							: m.content.map((p) =>
									p.type === 'text'
										? { type: 'text', text: p.text }
										: { type: 'image_url', image_url: { url: `data:${p.mediaType};base64,${p.base64}` } }
								)
				}))
			],
			max_tokens: opts.maxTokens
		})
	});
	if (!res.ok) throw new Error(openRouterErrorMessage(res.status, await res.text()));
	const data = await res.json();
	const text = data.choices?.[0]?.message?.content ?? '';
	const u: OpenRouterUsage = data.usage ?? {};
	return {
		text: typeof text === 'string' ? text : '',
		model: data.model ?? opts.model,
		usage: usageFromOpenRouter(u),
		costUsd: u.cost ?? null
	};
}
