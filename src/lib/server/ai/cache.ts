import type Anthropic from '@anthropic-ai/sdk';

const EPHEMERAL = { type: 'ephemeral' as const };

// Anthropic prompt caching walks back at most 20 content blocks from each
// cache_control breakpoint to find an already-cached prefix. A single breakpoint
// on the newest block therefore loses the cache the moment one loop iteration
// appends >20 blocks (a whole-freezer batch does exactly that: many tool_use +
// matching tool_result blocks in one round). So we keep TWO rolling message
// anchors — one on the tail of the *previous* API request, one on the *current*
// tail — so there is always a breakpoint within 20 blocks of any freshly
// appended content and the cached prefix extends incrementally instead of being
// dropped and fully rewritten. The system/tools prefix is cached separately via
// the system block's own breakpoint (chat/+server.ts).
//
// Budget: 1 system breakpoint + these 2 message anchors = 3, under the 4-max.

function stripCacheControl(block: Anthropic.ContentBlockParam): void {
	if ('cache_control' in block) delete (block as { cache_control?: unknown }).cache_control;
}

// Mark the last content block of messages[idx] as a cache breakpoint. A plain
// string message is normalised to a single text block (strings can't carry
// cache_control); array content gets the flag on its final block.
function anchorLastBlock(messages: Anthropic.MessageParam[], idx: number): void {
	const msg = messages[idx];
	if (!msg) return;
	if (typeof msg.content === 'string') {
		messages[idx] = {
			...msg,
			content: [{ type: 'text', text: msg.content, cache_control: EPHEMERAL }]
		};
		return;
	}
	if (Array.isArray(msg.content) && msg.content.length > 0) {
		const last = msg.content.length - 1;
		// Cast: the SDK's ContentBlockParam union includes block types that
		// don't declare cache_control (thinking/redacted_thinking), so the
		// spread-widened union isn't assignable. Anchors only ever land on
		// text/tool blocks in practice.
		msg.content[last] = {
			...msg.content[last],
			cache_control: EPHEMERAL
		} as Anthropic.ContentBlockParam;
	}
}

/**
 * Place the two rolling message-prefix cache anchors on `messages` in place,
 * just before an API request. Strips any anchors left by earlier iterations so
 * at most two message blocks ever carry cache_control (never overrunning the
 * 4-breakpoint limit). Returns the index that should be passed as
 * `prevTailIdx` on the next call (i.e. this request's tail).
 */
export function applyMessageCacheAnchors(
	messages: Anthropic.MessageParam[],
	prevTailIdx: number | null
): number {
	for (const msg of messages) {
		if (Array.isArray(msg.content)) for (const block of msg.content) stripCacheControl(block);
	}

	const tail = messages.length - 1;
	if (tail < 0) return tail;

	anchorLastBlock(messages, tail);
	// prevTailIdx is always a value this function returned (a prior tail) and the
	// loop only appends, so it stays in range; anchorLastBlock null-guards anyway.
	if (prevTailIdx !== null && prevTailIdx !== tail) anchorLastBlock(messages, prevTailIdx);
	return tail;
}
