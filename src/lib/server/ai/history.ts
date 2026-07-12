import type Anthropic from '@anthropic-ai/sdk';

export type ChatHistoryRow = {
	id: number;
	role: 'user' | 'assistant';
	content: string;
	toolCalls: unknown;
};

type StoredToolCall = { id?: string; name: string; input: unknown; result: unknown };

// Above this many chars of JSON, a REPLAYED (past-turn) tool result is summarized
// so the growing history prefix stays small. Only affects history replay — the
// current turn's results are always sent in full (the agent acts on them). The
// full payload stays in the chatMessages row; the agent re-runs the tool if it
// needs detail again.
const COMPACT_THRESHOLD = 800;

function pluckStrings(arr: unknown, key: string): string[] {
	if (!Array.isArray(arr)) return [];
	return arr
		.map((x) => (x && typeof x === 'object' ? String((x as Record<string, unknown>)[key] ?? '') : ''))
		.filter(Boolean);
}

// Compact a stored tool result for replay. Small results pass through verbatim;
// large read results (get_inventory, suggest_meals) collapse to counts + names,
// and any other oversized blob keeps its ok/count markers with the bulk dropped.
export function compactToolResult(name: string, result: unknown): string {
	const full = JSON.stringify(result ?? null);
	if (full.length <= COMPACT_THRESHOLD) return full;

	const r = (result && typeof result === 'object' ? result : {}) as Record<string, unknown>;

	if (name === 'get_inventory' && Array.isArray(r.items)) {
		return JSON.stringify({
			count: typeof r.count === 'number' ? r.count : (r.items as unknown[]).length,
			item_names: pluckStrings(r.items, 'name'),
			_compacted: 'inventory detail elided from history — call get_inventory again for full fields'
		});
	}

	if (name === 'suggest_meals') {
		return JSON.stringify({
			inventory_count: Array.isArray(r.inventory) ? r.inventory.length : undefined,
			stale_count: Array.isArray(r.stale_inventory) ? r.stale_inventory.length : undefined,
			recipe_titles: pluckStrings(r.recipes, 'title').slice(0, 40),
			_compacted: 'meal-suggestion context elided from history — call suggest_meals again to refresh'
		});
	}

	return JSON.stringify({
		...(typeof r.count === 'number' ? { count: r.count } : {}),
		...(typeof r.ok === 'boolean' ? { ok: r.ok } : {}),
		_compacted: `${name} result elided from history (${full.length} chars) — re-run the tool for detail`
	});
}

// How many recent message rows to replay. A raw "last N" sliding window shifts
// its oldest row every turn, moving the cached prefix start and dropping the
// cross-turn cache. Instead we advance the window start in `step` increments, so
// the oldest included row (and thus the message-prefix cache) stays put for a
// band of turns before jumping. Deterministic, no stored state. Sessions shorter
// than `base` include everything, so this only kicks in for long conversations.
export function stableHistoryWindow(total: number, base = 20, step = 10): number {
	if (total <= base) return base;
	const start = Math.floor((total - base) / step) * step;
	return total - start;
}

// Replays stored tool calls as real tool_use/tool_result blocks so the agent
// can see what it did in earlier turns. An assistant row with tool calls
// expands to: assistant [tool_use...] -> user [tool_result...] -> assistant
// text, matching the in-loop shape. Legacy rows persisted without ids get
// deterministic synthetic ids - the API only checks that each tool_result
// pairs with a tool_use id in the preceding assistant message.
//
// The history window is counted in DB rows (turns) upstream, and each row
// expands to its full block shape here - so a truncated window can never
// orphan a tool_use from its tool_result (which would 400 the API).
export function buildClaudeHistory(rows: ChatHistoryRow[]): Anthropic.MessageParam[] {
	const history: Anthropic.MessageParam[] = [];
	for (const row of rows) {
		const calls = row.toolCalls as StoredToolCall[] | null;
		if (row.role === 'assistant' && calls && calls.length > 0) {
			const ids = calls.map((c, i) => c.id ?? `legacy_${row.id}_${i}`);
			history.push({
				role: 'assistant',
				content: calls.map((c, i) => ({
					type: 'tool_use' as const,
					id: ids[i],
					name: c.name,
					input: c.input ?? {}
				}))
			});
			history.push({
				role: 'user',
				content: calls.map((c, i) => ({
					type: 'tool_result' as const,
					tool_use_id: ids[i],
					content: compactToolResult(c.name, c.result)
				}))
			});
			// A turn can end tool-only (stream died after the tools ran); replaying an
			// empty assistant text block would 400 the Anthropic path, so skip it.
			if (row.content) history.push({ role: 'assistant', content: row.content });
		} else {
			history.push({ role: row.role, content: row.content });
		}
	}

	// The API requires the first message to be role 'user'; the window (or the
	// Sunday routine, which inserts assistant rows) can leave assistant turns
	// at the head. Shifting an assistant(tool_use) head must also take its paired
	// user(tool_result) with it — a leading orphaned tool_result rejects at the
	// provider. The just-inserted user message guarantees a non-empty result.
	const isToolResultMsg = (m: Anthropic.MessageParam) =>
		Array.isArray(m.content) &&
		m.content.some((b) => (b as { type?: string }).type === 'tool_result');
	while (history.length > 0 && (history[0].role !== 'user' || isToolResultMsg(history[0])))
		history.shift();

	return history;
}
