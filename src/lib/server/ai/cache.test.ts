import { describe, it, expect } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import { applyMessageCacheAnchors } from './cache';

// Which message indices currently carry a cache_control on their last block.
function anchoredIndices(messages: Anthropic.MessageParam[]): number[] {
	const out: number[] = [];
	messages.forEach((m, i) => {
		if (Array.isArray(m.content) && m.content.some((b) => 'cache_control' in b && b.cache_control)) {
			out.push(i);
		}
	});
	return out;
}

function totalAnchors(messages: Anthropic.MessageParam[]): number {
	let n = 0;
	for (const m of messages) {
		if (Array.isArray(m.content)) {
			for (const b of m.content) if ('cache_control' in b && b.cache_control) n++;
		}
	}
	return n;
}

const toolUse = (id: string): Anthropic.MessageParam => ({
	role: 'assistant',
	content: [{ type: 'tool_use', id, name: 'get_inventory', input: {} }]
});
const toolResult = (id: string): Anthropic.MessageParam => ({
	role: 'user',
	content: [{ type: 'tool_result', tool_use_id: id, content: '[]' }]
});

describe('applyMessageCacheAnchors', () => {
	it('anchors only the tail on the first request (no previous tail)', () => {
		const messages: Anthropic.MessageParam[] = [
			{ role: 'user', content: 'suggest meals for the week' }
		];
		const tail = applyMessageCacheAnchors(messages, null);
		expect(tail).toBe(0);
		expect(anchoredIndices(messages)).toEqual([0]);
		// The string tail is normalised to a text block carrying cache_control.
		expect(messages[0].content).toEqual([
			{ type: 'text', text: 'suggest meals for the week', cache_control: { type: 'ephemeral' } }
		]);
	});

	it('keeps exactly two anchors — previous tail + current tail — after a batch append', () => {
		const messages: Anthropic.MessageParam[] = [{ role: 'user', content: 'clean up the stock' }];
		let prev = applyMessageCacheAnchors(messages, null); // req 1, tail = 0

		// A big batch round appends many blocks (>20 across two messages).
		for (let i = 0; i < 12; i++) {
			messages.push(toolUse(`t${i}`));
			messages.push(toolResult(`t${i}`));
		}

		prev = applyMessageCacheAnchors(messages, prev); // req 2
		expect(totalAnchors(messages)).toBe(2);
		expect(anchoredIndices(messages)).toEqual([0, messages.length - 1]);
		expect(prev).toBe(messages.length - 1);
	});

	it('rolls the anchors forward and never exceeds two over many iterations', () => {
		const messages: Anthropic.MessageParam[] = [{ role: 'user', content: 'go' }];
		let prev = applyMessageCacheAnchors(messages, null);
		let lastTail = messages.length - 1;

		for (let round = 0; round < 5; round++) {
			messages.push(toolUse(`r${round}`));
			messages.push(toolResult(`r${round}`));
			const tailBefore = messages.length - 1;
			prev = applyMessageCacheAnchors(messages, prev);
			// Two anchors: the prior request's tail and the new tail.
			expect(totalAnchors(messages)).toBe(2);
			expect(anchoredIndices(messages)).toEqual([lastTail, tailBefore]);
			lastTail = tailBefore;
		}
	});

	it('places a single anchor when nothing was appended (prevTail === tail)', () => {
		const messages: Anthropic.MessageParam[] = [toolResult('a')];
		const prev = applyMessageCacheAnchors(messages, null);
		applyMessageCacheAnchors(messages, prev); // same tail, no append
		expect(totalAnchors(messages)).toBe(1);
		expect(anchoredIndices(messages)).toEqual([0]);
	});
});
