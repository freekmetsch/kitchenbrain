import { describe, it, expect } from 'vitest';
import {
	buildClaudeHistory,
	compactToolResult,
	stableHistoryWindow,
	type ChatHistoryRow
} from './history';

const user = (id: number, content: string): ChatHistoryRow => ({
	id,
	role: 'user',
	content,
	toolCalls: null
});

const assistant = (id: number, content: string, toolCalls: unknown = null): ChatHistoryRow => ({
	id,
	role: 'assistant',
	content,
	toolCalls
});

describe('buildClaudeHistory', () => {
	it('passes plain text turns through unchanged', () => {
		const history = buildClaudeHistory([user(1, 'hi'), assistant(2, 'hello')]);
		expect(history).toEqual([
			{ role: 'user', content: 'hi' },
			{ role: 'assistant', content: 'hello' }
		]);
	});

	it('expands an assistant row with tool calls into tool_use -> tool_result -> text', () => {
		const history = buildClaudeHistory([
			user(1, 'add 3 pizzas to the freezer'),
			assistant(2, 'Added 3 pizzas.', [
				{
					id: 'toolu_abc',
					name: 'add_to_inventory',
					input: { name: 'pizza', qty_num: 3 },
					result: { ok: true, item_id: 7 }
				}
			])
		]);

		expect(history).toEqual([
			{ role: 'user', content: 'add 3 pizzas to the freezer' },
			{
				role: 'assistant',
				content: [
					{
						type: 'tool_use',
						id: 'toolu_abc',
						name: 'add_to_inventory',
						input: { name: 'pizza', qty_num: 3 }
					}
				]
			},
			{
				role: 'user',
				content: [
					{
						type: 'tool_result',
						tool_use_id: 'toolu_abc',
						content: JSON.stringify({ ok: true, item_id: 7 })
					}
				]
			},
			{ role: 'assistant', content: 'Added 3 pizzas.' }
		]);
	});

	it('synthesizes deterministic ids for legacy rows persisted without ids', () => {
		const history = buildClaudeHistory([
			user(1, 'stock check'),
			assistant(2, 'Done.', [
				{ name: 'get_inventory', input: { section: 'freezer' }, result: [] },
				{ name: 'get_inventory', input: { section: 'pantry' }, result: [] }
			])
		]);

		const toolUses = history[1].content as { type: string; id: string }[];
		const toolResults = history[2].content as { type: string; tool_use_id: string }[];
		expect(toolUses.map((b) => b.id)).toEqual(['legacy_2_0', 'legacy_2_1']);
		expect(toolResults.map((b) => b.tool_use_id)).toEqual(['legacy_2_0', 'legacy_2_1']);
	});

	it('drops leading assistant turns so history starts with a user message', () => {
		const history = buildClaudeHistory([
			assistant(1, 'Sunday routine: shall we plan meals?'),
			user(2, 'yes'),
			assistant(3, 'Great!')
		]);
		expect(history[0]).toEqual({ role: 'user', content: 'yes' });
		expect(history).toHaveLength(2);
	});

	it('keeps every tool_use paired with a matching tool_result in the next message', () => {
		const history = buildClaudeHistory([
			user(1, 'a'),
			assistant(2, 'b', [{ id: 'toolu_1', name: 'x', input: {}, result: 1 }]),
			user(3, 'c'),
			assistant(4, 'd', [{ name: 'y', input: {}, result: 2 }])
		]);

		for (let i = 0; i < history.length; i++) {
			const content = history[i].content;
			if (!Array.isArray(content)) continue;
			for (const block of content) {
				if (block.type !== 'tool_use') continue;
				const next = history[i + 1].content;
				expect(Array.isArray(next)).toBe(true);
				const match = (next as { type: string; tool_use_id?: string }[]).find(
					(b) => b.type === 'tool_result' && b.tool_use_id === block.id
				);
				expect(match).toBeDefined();
			}
		}
	});

	it('compacts a large get_inventory result on replay but keeps the item names', () => {
		const items = Array.from({ length: 24 }, (_, i) => ({
			id: i,
			name: `item ${i}`,
			section: 'freezer',
			category: 'meat',
			qtyText: '1 stuk',
			expiryDate: null,
			days_in_inventory: 5
		}));
		const history = buildClaudeHistory([
			user(1, 'clean up the stock'),
			assistant(2, 'Done.', [
				{ id: 'toolu_inv', name: 'get_inventory', input: {}, result: { count: 24, items } }
			])
		]);
		const replayed = JSON.parse((history[2].content as { content: string }[])[0].content);
		expect(replayed.count).toBe(24);
		expect(replayed.item_names).toHaveLength(24);
		expect(replayed.item_names[0]).toBe('item 0');
		expect(replayed._compacted).toMatch(/get_inventory/);
		// The verbose per-item fields are gone from the replayed prefix.
		expect(JSON.stringify(replayed)).not.toContain('days_in_inventory');
	});

	it('leaves a small tool result untouched on replay', () => {
		const small = { ok: true, item_id: 7 };
		expect(compactToolResult('add_to_inventory', small)).toBe(JSON.stringify(small));
	});
});

describe('compactToolResult', () => {
	it('summarizes suggest_meals to counts + recipe titles', () => {
		const result = {
			inventory: Array.from({ length: 30 }, (_, i) => ({ name: `x${i}` })),
			stale_inventory: [{ name: 'old' }],
			recipes: Array.from({ length: 50 }, (_, i) => ({ title: `Recipe ${i}`, slug: `r${i}` }))
		};
		const out = JSON.parse(compactToolResult('suggest_meals', result));
		expect(out.inventory_count).toBe(30);
		expect(out.stale_count).toBe(1);
		expect(out.recipe_titles.length).toBe(40); // capped
		expect(out._compacted).toBeTruthy();
	});

	it('drops the bulk of an oversized unknown result but keeps ok/count markers', () => {
		const big = { ok: true, count: 12, blob: 'x'.repeat(2000) };
		const out = JSON.parse(compactToolResult('some_tool', big));
		expect(out.ok).toBe(true);
		expect(out.count).toBe(12);
		expect(out.blob).toBeUndefined();
		expect(out._compacted).toMatch(/some_tool/);
	});
});

describe('stableHistoryWindow', () => {
	it('includes everything for sessions at or under the base', () => {
		expect(stableHistoryWindow(0)).toBe(20);
		expect(stableHistoryWindow(15)).toBe(20);
		expect(stableHistoryWindow(20)).toBe(20);
	});

	it('holds the oldest included row fixed across a band, then jumps', () => {
		// Within a band the returned limit grows so the window START stays put.
		// oldest-row index = total - limit; assert it is constant per 10-turn band.
		const oldest = (total: number) => total - stableHistoryWindow(total);
		for (let t = 21; t <= 29; t++) expect(oldest(t)).toBe(0);
		for (let t = 30; t <= 39; t++) expect(oldest(t)).toBe(10);
		for (let t = 40; t <= 49; t++) expect(oldest(t)).toBe(20);
		// Never replays fewer than the base window.
		for (let t = 21; t <= 60; t++) expect(stableHistoryWindow(t)).toBeGreaterThanOrEqual(20);
	});
});
