import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { readFileSync } from 'fs';
import { join } from 'path';
import type Anthropic from '@anthropic-ai/sdk';
import { eq, desc, count } from 'drizzle-orm';
import { db } from '$lib/server/db/index';
import { chatMessages } from '$lib/server/db/schema';
import {
	checkDailyCap,
	logSpend,
	buildVisionMessage,
	streamAgentTurn,
	stripInlineMarkdown,
	backendFor,
	type VisionImage
} from '$lib/server/ai/client';
import { getChatModel, getChatFallbackModel, getVisionModel } from '$lib/server/ai/config';
import { buildClaudeHistory, stableHistoryWindow } from '$lib/server/ai/history';
import { tools } from '$lib/server/ai/tools';
import { applyMessageCacheAnchors } from '$lib/server/ai/cache';
import { executeToolCall } from '$lib/server/ai/executors';
import { describeToolStart, type ToolDisplay } from '$lib/tool_display';
import { looksLikeJsonArtifact, ARTIFACT_FALLBACK } from '$lib/chat_sanitize';
import { buildToolDisplay } from '$lib/server/ai/tool_display';
import { getHouseholdPref, K_HOUSEHOLD_PROFILE } from '$lib/server/db/household_prefs';
import type { TurnExecutionContext } from '$lib/server/ai/commit_risk';
import { APP_TIME_ZONE } from '$lib/week';
import { getLocale } from '$lib/paraglide/runtime';
import type { ScreenContextV1 } from '$lib/chat/screen_context';
import {
	blocksDirtyRecipeWrite,
	parseScreenContext,
	serializeScreenContext
} from '$lib/server/ai/screen_context';

// Vision upload hard caps (Stage 4b / P5.4). Images arrive as multipart/form-data
// (no base64 +33% on the wire); the client downscales to ≤1568px before sending,
// so these are generous ceilings, not the common case. Per-image stays under
// Anthropic's 5 MB base64 limit (3.5 MB raw → ~4.7 MB base64). Requires
// BODY_SIZE_LIMIT raised above MAX_TOTAL_IMAGE_BYTES on the node adapter (Railway).
const MAX_IMAGES = 2;
const ALLOWED_IMAGE_MIME = new Set<VisionImage['mediaType']>([
	'image/jpeg',
	'image/png',
	'image/webp',
	'image/gif'
]);
const MAX_IMAGE_BYTES = 3.5 * 1024 * 1024;
const MAX_TOTAL_IMAGE_BYTES = 7 * 1024 * 1024;

let systemPromptTemplate: string | null = null;

function loadSystemPrompt(username: string): string {
	if (!systemPromptTemplate) {
		systemPromptTemplate = readFileSync(
			join(process.cwd(), 'src/lib/server/ai/prompts/system.md'),
			'utf-8'
		);
	}
	// Reply language follows the request's UI locale (Settings -> Display),
	// not the household's fixed identity — resolved per call, same as date/profile.
	const locale = getLocale();
	const language = locale === 'nl' ? 'Dutch' : 'English';
	const date = new Date().toLocaleDateString(locale === 'nl' ? 'nl-NL' : 'en-GB', {
		timeZone: APP_TIME_ZONE,
		weekday: 'long',
		day: 'numeric',
		month: 'long',
		year: 'numeric'
	});
	// Read per call (not cached with the template) so a Settings edit applies
	// on the next chat turn without a redeploy.
	const profile = getHouseholdPref(db, K_HOUSEHOLD_PROFILE)?.trim();
	return systemPromptTemplate
		.replace('{{user}}', username)
		.replace('{{date}}', date)
		.replace('{{language}}', language)
		.replace(
			'{{household_profile}}',
			profile || '(No household profile set yet — members can add one in Settings.)'
		);
}

function sse(chunk: object): Uint8Array {
	return new TextEncoder().encode(`data: ${JSON.stringify(chunk)}\n\n`);
}

function sseDone(): Uint8Array {
	return new TextEncoder().encode('data: [DONE]\n\n');
}

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	const user = locals.user;

	const { exceeded } = checkDailyCap();
	if (exceeded) {
		const stream = new ReadableStream({
			start(controller) {
				controller.enqueue(sse({ type: 'error', code: 'cap_exceeded' }));
				controller.enqueue(sseDone());
				controller.close();
			}
		});
		return new Response(stream, {
			headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no' }
		});
	}

	// Two request shapes: plain JSON (text only) or multipart/form-data when the
	// user attached photos (Stage 4b). Images are TRANSIENT — read into memory for
	// this one turn, never persisted and never replayed in history (the agent reads
	// the photo → add_recipe in the same turn; see buildVisionMessage below).
	const images: VisionImage[] = [];
	let message = '';
	let isRetry = false;
	let screenContext: ScreenContextV1 | undefined;
	const contentType = request.headers.get('content-type') ?? '';
	if (contentType.includes('multipart/form-data')) {
		let form: FormData;
		try {
			form = await request.formData();
		} catch {
			throw error(400, 'Invalid form data');
		}
		const rawMsg = form.get('message');
		message = typeof rawMsg === 'string' ? rawMsg : '';
		const rawContext = form.get('screenContext');
		if (typeof rawContext === 'string' && rawContext) {
			try {
				screenContext = parseScreenContext(JSON.parse(rawContext));
			} catch {
				throw error(400, 'Invalid screen context');
			}
		}
		// getAll returns (File | string)[]; a non-string entry is the uploaded File.
		const files = form.getAll('images').filter((f): f is File => typeof f !== 'string');
		if (files.length > MAX_IMAGES) throw error(400, `Attach at most ${MAX_IMAGES} photos.`);
		let total = 0;
		for (const file of files) {
			if (!ALLOWED_IMAGE_MIME.has(file.type as VisionImage['mediaType']))
				throw error(415, `Unsupported image type: ${file.type || 'unknown'}`);
			const bytes = Buffer.from(await file.arrayBuffer());
			if (bytes.byteLength > MAX_IMAGE_BYTES) throw error(413, 'That photo is too large.');
			total += bytes.byteLength;
			if (total > MAX_TOTAL_IMAGE_BYTES) throw error(413, 'Those photos are too large together.');
			images.push({
				mediaType: file.type as VisionImage['mediaType'],
				base64: bytes.toString('base64')
			});
		}
	} else {
		let raw: unknown;
		try {
			raw = await request.json();
		} catch {
			throw error(400, 'Invalid JSON');
		}
		const body = (raw ?? {}) as { message?: unknown; retry?: unknown; screenContext?: unknown };
		message = typeof body.message === 'string' ? body.message : '';
		isRetry = body.retry === true;
		try {
			screenContext = parseScreenContext(body.screenContext);
		} catch {
			throw error(400, 'Invalid screen context');
		}
	}

	const hasImages = images.length > 0;
	// A photo can arrive with no caption; give the model a minimal instruction so the
	// user turn is never empty. The same text is what we persist (images are dropped).
	const userText = message.trim() || (hasImages ? "Here's a photo." : '');
	if (!userText) throw error(400, 'message required');

	// Persist user message (text only — images are transient). A client Retry
	// re-sends a message whose row already exists (its turn failed before any
	// reply persisted) — skip the duplicate insert iff the newest row is exactly
	// that user text; anything else means state moved on, so insert normally.
	const newest = db
		.select({ role: chatMessages.role, content: chatMessages.content })
		.from(chatMessages)
		.where(eq(chatMessages.userId, user.id))
		.orderBy(desc(chatMessages.createdAt), desc(chatMessages.id))
		.limit(1)
		.get();
	if (!(isRetry && newest?.role === 'user' && newest.content === userText)) {
		db.insert(chatMessages)
			.values({ userId: user.id, role: 'user', content: userText, createdAt: new Date() })
			.run();
	}

	// Replay recent messages (including the one just inserted) with their stored
	// tool calls as real tool_use/tool_result blocks. The window size is quantized
	// (stableHistoryWindow) so its oldest row — and thus the message-prefix cache
	// start — holds steady across a band of turns instead of shifting every turn.
	const totalMessages =
		db.select({ n: count() }).from(chatMessages).where(eq(chatMessages.userId, user.id)).get()?.n ?? 0;
	const history = buildClaudeHistory(
		db
			.select({
				id: chatMessages.id,
				role: chatMessages.role,
				content: chatMessages.content,
				toolCalls: chatMessages.toolCalls
			})
			.from(chatMessages)
			.where(eq(chatMessages.userId, user.id))
			// id tiebreak: createdAt is second-resolution, and a fast turn's user +
			// assistant rows can share a second — without it the replay can scramble.
			.orderBy(desc(chatMessages.createdAt), desc(chatMessages.id))
			.limit(stableHistoryWindow(totalMessages))
			.all()
			.reverse()
	);

	const systemPrompt = loadSystemPrompt(user.username);

	const stream = new ReadableStream({
		async start(controller) {
			let fullText = '';
			const allToolCalls: { id: string; name: string; input: unknown; result: unknown; display?: ToolDisplay }[] =
				[];
			const messages: Anthropic.MessageParam[] = [...history];
			// Attach the transient image(s) to THIS turn's user message. history's last
			// entry is always the just-inserted user text (we inserted it above, then
			// loaded the window including it), so swap it for a vision message carrying
			// the image blocks. They live only in this in-memory array — the DB row and
			// every future turn stay text-only (one-shot ingestion).
			if (hasImages && messages.length > 0) {
				messages[messages.length - 1] = buildVisionMessage(userText, images);
			}
			if (screenContext && messages.length > 0) {
				const current = messages[messages.length - 1];
				const contextText = serializeScreenContext(screenContext);
				messages[messages.length - 1] = {
					role: 'user',
					content:
						typeof current.content === 'string'
							? `${current.content}\n\n${contextText}`
							: [...current.content, { type: 'text', text: contextText }]
				};
			}
			// One TurnExecutionContext per chat request drives the commit-risk gate
			// (just-created tracking + bulk-destructive count) across the tool loop.
			// visionTurn forces photo-derived recipes to needs_review in the executor.
			const turnCtx: TurnExecutionContext = {
				createdThisTurn: new Set<number>(),
				destructiveCount: 0,
				visionTurn: hasImages
			};

			try {
				// Cap agent-loop iterations; backstops a pathological tool-retry loop.
				const MAX_ITERATIONS = 25;
				let iterations = 0;
				// Tail index of the previous loop iteration's request, so cache anchors
				// can straddle the >20-block gap a big batch turn appends (see cache.ts).
				let prevTailIdx: number | null = null;
				// Text turns run on the configured chat model; image turns need a
				// vision-capable model (GLM-5 is text-only). The seam picks the backend.
				// Resolved per request (not at module load) so a Settings change or
				// Railway env edit applies on the next turn without a redeploy.
				const chatModel = hasImages ? getVisionModel().value : getChatModel().value;
				let usedFallback = false;
				// Resolved lazily on first use, not hoisted alongside chatModel — the
				// fallback only fires on a provider hiccup, so most turns never pay for it.
				let fallbackModel: string | null = null;
				while (true) {
					if (iterations++ >= MAX_ITERATIONS) break;

					const activeModel = usedFallback ? (fallbackModel ??= getChatFallbackModel().value) : chatModel;
					// Message-prefix caching only helps the Anthropic backend (OpenAI
					// endpoints reject cache_control); skip anchor bookkeeping for OpenRouter.
					if (backendFor(activeModel) === 'anthropic') {
						prevTailIdx = applyMessageCacheAnchors(messages, prevTailIdx);
					}

					let turn;
					try {
						turn = await streamAgentTurn({
							model: activeModel,
							system: systemPrompt,
							tools,
							messages,
							signal: request.signal,
							onText: (delta) => {
								// Strip inline markdown per delta (GLM leaks ** / backticks despite
								// the plain-text rule); persist and stream the cleaned text.
								const clean = stripInlineMarkdown(delta);
								if (!clean) return;
								fullText += clean;
								controller.enqueue(sse({ type: 'text', text: clean }));
							}
						});
					} catch (err) {
						// One automatic retry on the fallback model if the primary errors before
						// any text streamed on iteration 1 (a provider hiccup). If GLM-5 fails
						// consistently, flip CHAT_MODEL in config.
						if (!request.signal.aborted && !usedFallback && iterations === 1 && !fullText) {
							usedFallback = true;
							iterations--;
							continue;
						}
						throw err;
					}

					logSpend(turn.model, turn.usage, turn.costUsd);

					if (turn.finishReason === 'length' && turn.droppedToolCalls > 0) {
						// No artificial output cap, so this only fires if the model hit its own
						// context limit mid-tool-call. The half-parsed call can't be run and there's
						// no bigger budget to retry into — surface it rather than run a partial tool
						// set and half-process the request.
						controller.enqueue(sse({ type: 'error', code: 'turn_too_large' }));
						break;
					}

					// Run every tool call that fully streamed this turn, regardless of stop
					// reason — a big batch can hit max_tokens mid-stream but the completed
					// calls are valid and must run.
					if (turn.toolCalls.length === 0) break;

					const toolResults: Anthropic.ToolResultBlockParam[] = [];
					for (const tool of turn.toolCalls) {
						controller.enqueue(
							sse({
								type: 'tool_start',
								id: tool.id,
								name: tool.name,
								summary: describeToolStart(tool.name, tool.input)
							})
						);
						const result = blocksDirtyRecipeWrite(screenContext, tool.name, tool.input)
							? {
									ok: false,
									error: 'Save or discard the open recipe draft before changing this recipe with AI.'
								}
							: await executeToolCall(tool.name, tool.input, db, user.id, turnCtx);
						const display = buildToolDisplay(db, tool.name, tool.input, result);
						allToolCalls.push({ id: tool.id, name: tool.name, input: tool.input, result, display });
						controller.enqueue(sse({ type: 'tool', id: tool.id, name: tool.name, result, display }));
						toolResults.push({
							type: 'tool_result',
							tool_use_id: tool.id,
							content: JSON.stringify(result)
						});
					}

					// streamAgentTurn already dropped any tool_use truncated mid-JSON, so every
					// tool_use in turn.content has a matching tool_result above.
					messages.push({ role: 'assistant', content: turn.content });
					messages.push({ role: 'user', content: toolResults });
				}
			} catch (err) {
				if (!request.signal.aborted) {
					console.error('[chat] stream error:', err);
					controller.enqueue(
						sse({ type: 'error', message: 'The AI ran into a problem mid-reply.' })
					);
				}
			}

			// Persist assistant response. A reply that is itself a machine payload
			// (provider error echoed as text) must not enter history — swap for the
			// same fallback sentence the UI shows.
			const persistText = looksLikeJsonArtifact(fullText) ? ARTIFACT_FALLBACK : fullText.trim();
			if (persistText || allToolCalls.length > 0) {
				db.insert(chatMessages)
					.values({
						userId: user.id,
						role: 'assistant',
						content: persistText,
						toolCalls: allToolCalls.length > 0 ? allToolCalls : null,
						createdAt: new Date()
					})
					.run();
			}

			controller.enqueue(sseDone());
			controller.close();
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			'X-Accel-Buffering': 'no'
		}
	});
};
