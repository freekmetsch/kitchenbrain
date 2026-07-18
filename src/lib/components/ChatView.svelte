<script lang="ts">
	import { tick, untrack, onDestroy } from 'svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import { fly } from 'svelte/transition';
	import { base } from '$app/paths';
	import Icon from '$lib/components/ui/icons/Icon.svelte';
	import { m } from '$lib/paraglide/messages';
	import { getLocale } from '$lib/paraglide/runtime';
	import type { IconName } from '$lib/components/ui/icons/paths';
	import type { ToolDisplay } from '$lib/tool_display';
	import { looksLikeJsonArtifact, ARTIFACT_FALLBACK } from '$lib/chat_sanitize';
	import { displayName } from '$lib/actors';

	type UndoState = 'undoing' | 'done' | 'conflict' | 'error';
	type ConfirmState = 'approving' | 'done' | 'expired' | 'conflict' | 'cancelled' | 'error';
	type ToolCall = {
		id?: string;
		name: string;
		input?: unknown;
		result: unknown;
		display?: ToolDisplay | null;
		pending?: boolean;
		undo?: UndoState;
		confirmState?: ConfirmState;
	};
	type Message = {
		role: 'user' | 'assistant';
		content: string;
		toolCalls?: ToolCall[] | null;
		streaming?: boolean;
		/** True for turns loaded from history — their Approve cards are inert. */
		hydrated?: boolean;
		/** Object URLs of photos attached to a user turn (display only, this session). */
		images?: string[];
		/** Transient status line on a streaming assistant turn, e.g. "Reading the photo…". */
		status?: string;
		/** When this turn was created — drives the day separators. */
		at?: Date;
		/** Friendly failure line rendered below the content; empty content + error offers Retry. */
		error?: string;
	};

	let { initialMessages = [], initialInput = '', initialCapExceeded = false, username = '' }: { initialMessages: Message[]; initialInput?: string; initialCapExceeded?: boolean; username?: string } = $props();

	let messages = $state<Message[]>(untrack(() => initialMessages.map((m) => ({ ...m, hydrated: true }))));
	let input = $state(untrack(() => initialInput));
	let isStreaming = $state(false);
	let capExceeded = $state(untrack(() => initialCapExceeded));
	let abortController: AbortController | null = null;
	let messageListEl: HTMLElement;
	let textareaEl: HTMLTextAreaElement;

	// Entry motion for new turns only — history renders instantly (Svelte plays no
	// intro on initial mount) and reduced-motion users get none at all.
	const motionMs =
		typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
			? 0
			: 180;

	// Photo attachments (Stage 4b / P5.4). The client downscales each image to
	// ≤1568px and re-encodes to JPEG before upload, so the wire payload stays small
	// and EXIF is stripped. Caps mirror the server (see /api/chat/+server.ts).
	type Attachment = { id: number; blob: Blob; url: string; name: string };
	const MAX_IMAGES = 2;
	const MAX_DIM = 1568;
	const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
	const MAX_INPUT_BYTES = 20 * 1024 * 1024; // pre-downscale sanity (phone photos)
	const MAX_UPLOAD_BYTES = 3.5 * 1024 * 1024; // post-downscale, matches server per-image cap
	let attachments = $state<Attachment[]>([]);
	let attachError = $state('');
	let attachId = 0;
	let fileInput: HTMLInputElement;

	function loadImage(file: File): Promise<HTMLImageElement> {
		return new Promise((resolve, reject) => {
			const url = URL.createObjectURL(file);
			const img = new Image();
			img.onload = () => {
				URL.revokeObjectURL(url);
				resolve(img);
			};
			img.onerror = () => {
				URL.revokeObjectURL(url);
				reject(new Error('decode failed'));
			};
			img.src = url;
		});
	}

	// Downscale to ≤MAX_DIM on the longest edge and re-encode as JPEG. Recipe cards
	// and screenshots stay legible at 1568px; the smaller payload keeps us well under
	// the body-size limit and the daily-cost cap.
	async function downscaleToJpeg(file: File): Promise<Blob> {
		const img = await loadImage(file);
		let w = img.naturalWidth || img.width;
		let h = img.naturalHeight || img.height;
		const longest = Math.max(w, h);
		if (longest > MAX_DIM) {
			const scale = MAX_DIM / longest;
			w = Math.round(w * scale);
			h = Math.round(h * scale);
		}
		const canvas = document.createElement('canvas');
		canvas.width = w;
		canvas.height = h;
		const ctx = canvas.getContext('2d');
		if (!ctx) throw new Error('canvas unavailable');
		ctx.drawImage(img, 0, 0, w, h);
		const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.82));
		if (!blob) throw new Error('encode failed');
		return blob;
	}

	async function onFilesSelected(e: Event) {
		const el = e.currentTarget as HTMLInputElement;
		const files = Array.from(el.files ?? []);
		el.value = ''; // reset so the same file can be re-picked after removal
		attachError = '';
		for (const file of files) {
			if (attachments.length >= MAX_IMAGES) {
				attachError = m.chat_attach_max_photos({ max: MAX_IMAGES });
				break;
			}
			if (!ALLOWED_MIME.has(file.type)) {
				attachError = m.chat_attach_invalid_type();
				continue;
			}
			if (file.size > MAX_INPUT_BYTES) {
				attachError = m.chat_attach_too_large();
				continue;
			}
			try {
				const blob = await downscaleToJpeg(file);
				if (blob.size > MAX_UPLOAD_BYTES) {
					attachError = m.chat_attach_too_large();
					continue;
				}
				attachments.push({ id: attachId++, blob, url: URL.createObjectURL(blob), name: file.name });
			} catch {
				attachError = m.chat_attach_read_failed();
			}
		}
	}

	function removeAttachment(id: number) {
		const idx = attachments.findIndex((a) => a.id === id);
		if (idx >= 0) {
			URL.revokeObjectURL(attachments[idx].url);
			attachments.splice(idx, 1);
		}
	}

	// Reclaim any object URLs still alive (pending composer photos + sent-bubble
	// thumbnails) when the chat view unmounts, so blobs don't linger past the view.
	onDestroy(() => {
		for (const a of attachments) URL.revokeObjectURL(a.url);
		for (const m of messages) m.images?.forEach((u) => URL.revokeObjectURL(u));
	});

	// Nav chips deep-link straight to the destination page — no AI round trip, no
	// daily-cap risk. AI chips stay chat sends because they need a model turn
	// (freezer lookup, write action) rather than just opening a screen that
	// already does the job (meal-plan has its own per-week Suggest button).
	type QuickChip =
		| { kind: 'nav'; label: string; href: string; icon: IconName }
		| { kind: 'ai'; label: string; prompt: string };

	const QUICK_CHIPS: QuickChip[] = [
		{ kind: 'nav', label: m.chat_chip_shopping_list(), href: `${base}/shopping`, icon: 'cart' },
		{ kind: 'nav', label: m.chat_chip_meal_plan(), href: `${base}/meal-plan`, icon: 'calendar' },
		{ kind: 'ai', label: m.chat_chip_freezer_question(), prompt: m.chat_chip_freezer_question() },
		{ kind: 'ai', label: m.chat_chip_add_freezer(), prompt: m.chat_chip_add_freezer() }
	];

	// Stick-to-bottom scrolling: streaming keeps the view pinned only while the
	// user is already near the bottom — scrolling up to reread stops the yanking,
	// and the floating jump button brings them back.
	let atBottom = $state(true);

	function onListScroll() {
		if (!messageListEl) return;
		atBottom =
			messageListEl.scrollHeight - messageListEl.scrollTop - messageListEl.clientHeight < 80;
	}

	async function scrollToBottom(force = false) {
		await tick();
		if (messageListEl && (force || atBottom)) {
			messageListEl.scrollTop = messageListEl.scrollHeight;
			atBottom = true;
		}
	}

	function jumpToBottom() {
		atBottom = true;
		messageListEl?.scrollTo({ top: messageListEl.scrollHeight, behavior: 'smooth' });
	}

	$effect(() => {
		// Re-run whenever the conversation grows or the last turn changes shape —
		// including a tool card filling in (pending→done renders taller).
		const last = messages.at(-1);
		void (
			messages.length +
			(last?.content.length ?? 0) +
			(last?.toolCalls?.length ?? 0) +
			(last?.toolCalls?.filter((t) => t.pending).length ?? 0) +
			(last?.error ? 1 : 0)
		);
		scrollToBottom();
	});

	// ── Render helpers ──────────────────────────────────────────────────────

	// Redemption layer for replies persisted before the JSON-leak fixes (and any
	// artifact that still slips through server-side): never render a machine
	// payload as chat text.
	function displayText(msg: Message): string {
		if (!msg.content) return '';
		if (msg.role === 'assistant' && looksLikeJsonArtifact(msg.content)) return ARTIFACT_FALLBACK;
		return msg.content.trim();
	}

	function dayLabel(d: Date): string {
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const day = new Date(d);
		day.setHours(0, 0, 0, 0);
		const diff = Math.round((today.getTime() - day.getTime()) / 86400000);
		if (diff <= 0) return m.chat_day_today();
		if (diff === 1) return m.chat_day_yesterday();
		return day.toLocaleDateString(getLocale() === 'nl' ? 'nl-NL' : 'en-GB', {
			weekday: 'long',
			day: 'numeric',
			month: 'long'
		});
	}

	function isNewDay(i: number): boolean {
		const at = messages[i].at;
		if (!at) return false;
		const prev = messages[i - 1]?.at;
		if (!prev) return i === 0;
		return new Date(at).toDateString() !== new Date(prev).toDateString();
	}

	function greeting(): string {
		const h = new Date().getHours();
		const part = h < 6 ? m.chat_greeting_evening() : h < 12 ? m.chat_greeting_morning() : h < 18 ? m.chat_greeting_afternoon() : m.chat_greeting_evening();
		const name = username ? `, ${displayName(username)}` : '';
		return `${part}${name}`;
	}

	function firstUndoableOp(tool: ToolCall): number | null {
		const op = tool.display?.ops?.find((o) => o.undoable);
		return op ? op.opId : null;
	}

	// Best-effort plan check-off (P5.2): count the completed write-displays that
	// follow this present_plan in the same turn. No rigid step↔tool binding — a
	// plan of N steps checks off the first min(N, writesDone) rows. Only writes
	// advance it, so a plan step that's a read or a confirm won't tick a row —
	// acceptable for a cosmetic progress cue (the prompt steers plans to writes).
	function planStepsDone(tools: ToolCall[], planIndex: number): number {
		let n = 0;
		for (let i = planIndex + 1; i < tools.length; i++) {
			const t = tools[i];
			if (!t.pending && t.display?.kind === 'write') n++;
		}
		return n;
	}

	async function undo(tool: ToolCall, opId: number) {
		if (tool.undo === 'undoing' || tool.undo === 'done') return;
		tool.undo = 'undoing';
		try {
			const res = await fetch(`${base}/api/inventory/undo`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ op_id: opId })
			});
			if (res.ok) tool.undo = 'done';
			else if (res.status === 409) tool.undo = 'conflict';
			else tool.undo = 'error';
		} catch {
			tool.undo = 'error';
		}
	}

	// Approve a deferred action (P5.3). Server-side claim is single-use, so this
	// double-click guard is belt-and-suspenders. On success the confirm card
	// morphs into the executed write card (display swapped → kind becomes 'write',
	// inline Undo appears).
	async function approveConfirm(tool: ToolCall, confirmationId: string) {
		if (tool.confirmState) return;
		tool.confirmState = 'approving';
		try {
			const res = await fetch(`${base}/api/chat/confirm`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ confirmation_id: confirmationId })
			});
			if (res.ok) {
				const data = await res.json();
				if (data.display) tool.display = data.display;
				tool.confirmState = 'done';
			} else if (res.status === 409) {
				tool.confirmState = 'conflict';
			} else if (res.status === 410) {
				tool.confirmState = 'expired';
			} else {
				tool.confirmState = 'error';
			}
		} catch {
			tool.confirmState = 'error';
		}
	}

	function cancelConfirm(tool: ToolCall) {
		if (tool.confirmState) return;
		tool.confirmState = 'cancelled';
	}

	async function send(text: string, isRetry = false) {
		const outgoing = attachments;
		const hasAttachments = outgoing.length > 0;
		if (isStreaming || (!text.trim() && !hasAttachments)) return;

		// Detach the pending photos from the composer for this send. The object URLs
		// stay alive for the sent bubble's thumbnails (revoked on page unload).
		attachments = [];
		attachError = '';

		messages.push({
			role: 'user',
			content: text,
			at: new Date(),
			images: hasAttachments ? outgoing.map((a) => a.url) : undefined
		});
		messages.push({
			role: 'assistant',
			content: '',
			toolCalls: [],
			at: new Date(),
			streaming: true,
			// Text turns show "Thinking…" until the first text/tool/error event clears it —
			// GLM-5 reasons before its first token, so this fills the pre-stream pause.
			status: hasAttachments ? 'Reading the photo…' : 'Thinking…'
		});
		input = '';
		if (textareaEl) {
			textareaEl.style.height = 'auto';
			textareaEl.focus();
		}
		isStreaming = true;
		abortController = new AbortController();
		scrollToBottom(true);

		try {
			let body: BodyInit;
			const headers: Record<string, string> = {};
			if (hasAttachments) {
				const form = new FormData();
				form.append('message', text);
				outgoing.forEach((a, i) => form.append('images', a.blob, `photo-${i + 1}.jpg`));
				body = form; // multipart — the browser sets the boundary Content-Type
			} else {
				headers['Content-Type'] = 'application/json';
				// retry tells the server the user row already exists (the failed turn
				// persisted it) so it doesn't insert a duplicate.
				body = JSON.stringify({ message: text, retry: isRetry });
			}
			const res = await fetch(`${base}/api/chat`, {
				method: 'POST',
				headers,
				body,
				signal: abortController.signal
			});

			if (!res.ok || !res.body) {
				const last = messages.at(-1)!;
				last.error = m.chat_error_generic();
				last.streaming = false;
				return;
			}

			const reader = res.body.getReader();
			const decoder = new TextDecoder();
			let buffer = '';

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split('\n');
				buffer = lines.pop()!;

				for (const line of lines) {
					if (!line.startsWith('data: ')) continue;
					const data = line.slice(6).trim();
					if (data === '[DONE]') break;

					let event: {
						type: string;
						text?: string;
						name?: string;
						result?: unknown;
						code?: string;
						message?: string;
						id?: string;
						summary?: string;
						display?: ToolDisplay | null;
					};
					try {
						event = JSON.parse(data);
					} catch {
						continue;
					}

					const last = messages.at(-1)!;
					// First event back from the model — drop the "Reading the photo…" cue.
					if (last.status) last.status = undefined;
					if (event.type === 'text' && event.text) {
						last.content += event.text;
					} else if (event.type === 'tool_start' && event.id) {
						// Provisional "doing" line; the matching `tool` event fills it in.
						last.toolCalls ??= [];
						last.toolCalls.push({
							id: event.id,
							name: event.name ?? '',
							result: null,
							display: event.summary ? { kind: 'read', summary: event.summary } : null,
							pending: true
						});
					} else if (event.type === 'tool') {
						last.toolCalls ??= [];
						const entry = event.id
							? last.toolCalls.find((t) => t.id === event.id && t.pending)
							: undefined;
						if (entry) {
							entry.result = event.result ?? null;
							entry.display = event.display ?? null;
							entry.pending = false;
						} else {
							last.toolCalls.push({
								id: event.id,
								name: event.name ?? '',
								result: event.result ?? null,
								display: event.display ?? null
							});
						}
					} else if (event.type === 'error') {
						if (event.code === 'cap_exceeded') {
							capExceeded = true;
							last.error = m.chat_cap_error();
						} else if (event.code === 'turn_too_large') {
							last.error = m.chat_error_too_large();
						} else {
							last.error = event.message ?? m.chat_error_generic_short();
						}
					}
				}
			}
		} catch (err) {
			const last = messages.at(-1);
			if ((err as Error).name === 'AbortError') {
				// User pressed Stop before anything arrived — mark it so the bubble
				// isn't just blank (Retry picks it up from here).
				if (last && !last.content && !last.toolCalls?.length) last.error = m.chat_error_stopped();
			} else if (last && !last.error) {
				last.error = m.chat_error_connection_lost();
			}
		} finally {
			isStreaming = false;
			abortController = null;
			const last = messages.at(-1);
			if (last) {
				last.streaming = false;
				last.status = undefined;
				// A clean [DONE] with nothing to show — GLM can return an empty "stub"
				// completion (no text, no tool call), which would otherwise render as a
				// blank bubble ("No response?"). Land it as a retryable error instead;
				// canRetry() picks it up from here. Tool-only turns are excluded — they
				// still have a tool line to show.
				if (
					last.role === 'assistant' &&
					!last.error &&
					!last.content.trim() &&
					!last.toolCalls?.length
				) {
					last.error = m.chat_error_empty_reply();
				}
				// A tool that never got its result event would spin forever — the stream
				// is done, so land it honestly.
				for (const t of last.toolCalls ?? []) {
					if (t.pending) {
						t.pending = false;
						t.display = {
							kind: 'error',
							summary: m.chat_tool_interrupted({
								summary: (t.display?.summary ?? m.chat_tool_working_fallback()).replace(/…$/, '')
							})
						};
					}
				}
			}
		}
	}

	function abort() {
		abortController?.abort();
	}

	// Retry re-sends the user text of a turn that failed with nothing to show.
	// Only the trailing turn qualifies; never a photo turn (the image blobs were
	// transient and are gone) and never one whose tools already ran — a blind
	// re-send could commit those writes twice.
	function canRetry(msg: Message, i: number): boolean {
		if (msg.role !== 'assistant' || !msg.error || msg.content || msg.toolCalls?.length)
			return false;
		if (i !== messages.length - 1 || isStreaming || capExceeded) return false;
		const prev = messages[i - 1];
		return !!prev && prev.role === 'user' && !prev.images?.length && !!prev.content.trim();
	}

	async function retry() {
		const prev = messages[messages.length - 2];
		if (!prev) return;
		messages.pop(); // failed assistant bubble
		messages.pop(); // user bubble — send() re-pushes it
		await send(prev.content, true);
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			send(input);
		}
	}
</script>

<div class="flex flex-col h-full">
	<!-- Message list -->
	<div class="relative flex-1 min-h-0">
		<div
			bind:this={messageListEl}
			onscroll={onListScroll}
			class="h-full overflow-y-auto px-3 py-4 space-y-1"
		>
		{#if messages.length === 0}
			<div class="flex flex-col items-center justify-center h-full text-center pt-16 pb-8 gap-1.5">
				<p class="text-lg font-medium text-base-content/80">{greeting()}</p>
				<p class="text-sm text-base-content/45">{m.chat_empty_hint()}</p>
			</div>
		{/if}

		{#each messages as msg, mi}
			{#if isNewDay(mi)}
				<div class="flex items-center gap-3 py-2" aria-hidden="true">
					<div class="h-px flex-1 bg-base-300/60"></div>
					<span class="text-[11px] font-medium text-base-content/40">{dayLabel(msg.at!)}</span>
					<div class="h-px flex-1 bg-base-300/60"></div>
				</div>
			{/if}
			{@const shown = displayText(msg)}
			<div class="chat {msg.role === 'user' ? 'chat-end' : 'chat-start'}" in:fly={{ y: 10, duration: motionMs }}>
				<div
					class="chat-bubble {msg.role === 'user'
						? 'chat-bubble-primary'
						: 'bg-base-200 text-base-content'} max-w-[85%] text-sm leading-relaxed whitespace-pre-wrap"
				>
					{#if msg.images && msg.images.length > 0}
						<div class="mb-2 flex flex-wrap gap-1.5">
							{#each msg.images as src}
								<img {src} alt="attachment" class="max-h-40 max-w-[48%] rounded-md border border-base-300/50 object-cover" />
							{/each}
						</div>
					{/if}
					{#if msg.status}
						<div class="mb-1 flex items-center gap-1.5 text-xs text-base-content/60">
							<Spinner size="xs" />
							<span>{msg.status}</span>
						</div>
					{/if}
					{#if msg.toolCalls && msg.toolCalls.length > 0}
						<div class="mb-2 flex flex-col gap-1.5">
							{#each msg.toolCalls as tool, ti}
								{#if tool.display && tool.display.kind === 'plan' && tool.display.steps}
									{@const d = tool.display}
									{@const done = planStepsDone(msg.toolCalls, ti)}
									<div class="flex flex-col gap-1.5 rounded-md bg-base-100/50 px-2 py-1.5">
										<div class="flex items-center gap-1.5">
											<svg class="h-3.5 w-3.5 shrink-0 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>
											<span class="text-xs font-medium text-base-content/80 leading-tight">{d.summary}</span>
										</div>
										<ol class="flex flex-col gap-1 pl-5">
											{#each d.steps as step, si}
												<li class="flex items-start gap-1.5 text-xs leading-tight {si < done ? 'text-base-content/45' : 'text-base-content/80'}">
													{#if si < done}
														<svg class="mt-px h-3 w-3 shrink-0 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" /></svg>
													{:else}
														<span class="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full border border-current opacity-40"></span>
													{/if}
													<span class={si < done ? 'line-through' : ''}>{step}</span>
												</li>
											{/each}
										</ol>
									</div>
								{:else if tool.display}
									{@const d = tool.display}
									{@const opId = firstUndoableOp(tool)}
									<div class="flex flex-col gap-1 rounded-md bg-base-100/50 px-2 py-1.5">
										<div class="flex items-center gap-1.5">
											{#if tool.pending}
												<Spinner size="xs" class="opacity-60" />
											{:else if d.kind === 'error'}
												<svg class="h-3.5 w-3.5 shrink-0 text-warning" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
											{:else if d.kind === 'confirm'}
												<svg class="h-3.5 w-3.5 shrink-0 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
											{:else if d.kind === 'write'}
												<svg class="h-3.5 w-3.5 shrink-0 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" /></svg>
											{:else}
												<svg class="h-3.5 w-3.5 shrink-0 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-4.35-4.35M11 18a7 7 0 100-14 7 7 0 000 14z" /></svg>
											{/if}
											<span class="text-xs {d.kind === 'error' ? 'text-warning' : d.kind === 'confirm' ? 'text-base-content' : 'text-base-content/70'} leading-tight">{d.summary}</span>
										</div>

										{#if d.diff && d.diff.length > 0}
											<div class="flex flex-wrap gap-1 pl-5">
												{#each d.diff as chip}
													<span class="badge badge-ghost badge-sm gap-1 text-[0.68rem]">
														<span class="opacity-60">{chip.label}</span>
														<span class="line-through opacity-50">{chip.before ?? '—'}</span>
														<span aria-hidden="true">→</span>
														<span class="font-medium">{chip.after ?? '—'}</span>
													</span>
												{/each}
											</div>
										{/if}

										{#if opId !== null}
											<div class="pl-5">
												{#if !tool.undo}
													<button class="btn btn-ghost btn-xs h-6 min-h-6 px-1.5 text-xs opacity-70 hover:opacity-100" onclick={() => undo(tool, opId)}>
														<svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 10h10a5 5 0 015 5v1M3 10l4-4M3 10l4 4" /></svg>
														{m.chat_tool_undo_button()}
													</button>
												{:else if tool.undo === 'undoing'}
													<span class="text-xs opacity-60 inline-flex items-center gap-1"><Spinner size="xs" /> {m.chat_tool_undoing_label()}</span>
												{:else if tool.undo === 'done'}
													<span class="text-xs opacity-50">{m.chat_tool_undone_label()}</span>
												{:else if tool.undo === 'conflict'}
													<span class="text-xs text-warning">{m.chat_tool_undo_conflict()}</span>
												{:else}
													<span class="text-xs text-error">{m.chat_tool_undo_failed()}</span>
												{/if}
											</div>
										{/if}

										{#if d.kind === 'confirm'}
											<div class="pl-5">
												{#if msg.hydrated || tool.confirmState === 'expired'}
													<span class="text-xs opacity-50 italic">{m.chat_confirm_expired_hydrated()}</span>
												{:else if tool.confirmState === 'cancelled'}
													<span class="text-xs opacity-50">{m.chat_confirm_cancelled()}</span>
												{:else if tool.confirmState === 'conflict'}
													<span class="text-xs text-warning">{m.chat_confirm_conflict()}</span>
												{:else if tool.confirmState === 'error'}
													<span class="text-xs text-error">{m.chat_confirm_error()}</span>
												{:else if tool.confirmState === 'approving'}
													<span class="text-xs opacity-60 inline-flex items-center gap-1"><Spinner size="xs" /> {m.chat_confirm_applying_label()}</span>
												{:else}
													<div class="flex gap-1.5">
														<button
															class="btn btn-primary btn-xs h-6 min-h-6"
															disabled={!d.confirmationId}
															onclick={() => d.confirmationId && approveConfirm(tool, d.confirmationId)}
														>{m.chat_confirm_approve_button()}</button>
														<button class="btn btn-ghost btn-xs h-6 min-h-6 opacity-70" onclick={() => cancelConfirm(tool)}>{m.chat_confirm_cancel_button()}</button>
													</div>
												{/if}
											</div>
										{/if}
									</div>
								{:else}
									<!-- Legacy tool call (pre-P5.1, no display) -->
									<details class="opacity-60">
										<summary class="cursor-pointer text-xs font-mono select-none">⚙ {tool.name}</summary>
										<pre class="text-xs mt-1 overflow-x-auto whitespace-pre-wrap break-all">{JSON.stringify(tool.result, null, 2)}</pre>
									</details>
								{/if}
							{/each}
						</div>
					{/if}
					{shown}{#if msg.streaming && !shown && !msg.status}<span class="inline-block w-2 h-4 bg-current animate-pulse ml-0.5 align-middle"></span>{/if}{#if msg.streaming && shown && !looksLikeJsonArtifact(msg.content)}<span class="inline-block w-0.5 h-4 bg-current animate-pulse ml-0.5 align-middle"></span>{/if}
					{#if msg.error}
						<div class="flex items-start gap-1.5 text-xs text-warning {msg.content || msg.toolCalls?.length ? 'mt-1.5' : ''}">
							<svg class="h-3.5 w-3.5 shrink-0 mt-px" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
							<span>{msg.error}</span>
						</div>
						{#if canRetry(msg, mi)}
							<button class="btn btn-xs btn-outline btn-warning mt-2 h-6 min-h-6 gap-1" onclick={retry}>
								<svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
								{m.mealplan_retry_button()}
							</button>
						{/if}
					{/if}
				</div>
			</div>
		{/each}
		</div>

		{#if !atBottom}
			<button
				class="btn btn-circle btn-sm absolute bottom-3 left-1/2 -translate-x-1/2 border border-base-300 bg-base-100 text-base-content/70 shadow-md hover:bg-base-200"
				onclick={jumpToBottom}
				title={m.chat_jump_to_latest_aria()}
				aria-label={m.chat_jump_to_latest_aria()}
				transition:fly={{ y: 6, duration: motionMs }}
			>
				<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>
			</button>
		{/if}
	</div>

	<!-- Daily cap banner -->
	{#if capExceeded}
		<div class="mx-3 mb-2 alert alert-warning text-sm py-2">
			<span>{m.chat_cap_banner()}</span>
		</div>
	{/if}

	<!-- Quick chips — only when no messages -->
	{#if messages.length === 0 && !isStreaming}
		<div class="px-3 pb-2 flex flex-wrap gap-2">
			{#each QUICK_CHIPS as chip}
				{#if chip.kind === 'nav'}
					<a href={chip.href} class="btn btn-sm btn-outline btn-neutral text-xs gap-1.5">
						<Icon name={chip.icon} class="h-3.5 w-3.5" />
						{chip.label}
					</a>
				{:else}
					<button
						class="btn btn-sm btn-outline btn-neutral text-xs"
						onclick={() => send(chip.prompt)}
					>
						{chip.label}
					</button>
				{/if}
			{/each}
		</div>
	{/if}

	<!-- Input bar -->
	<div
		class="px-3 pb-3 pt-2 bg-base-100 border-t border-base-300"
		style="padding-bottom: max(0.75rem, env(safe-area-inset-bottom))"
	>
		<!-- Attached photo previews -->
		{#if attachments.length > 0}
			<div class="mb-2 flex flex-wrap gap-2">
				{#each attachments as att (att.id)}
					<div class="relative">
						<img src={att.url} alt={att.name} class="h-16 w-16 rounded-md border border-base-300 object-cover" />
						<button
							class="btn btn-circle btn-xs btn-neutral absolute -right-1.5 -top-1.5 h-5 min-h-5 w-5 shadow"
							onclick={() => removeAttachment(att.id)}
							title={m.recipes_header_remove_photo()}
							aria-label={m.recipes_header_remove_photo()}
						>
							<svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
						</button>
					</div>
				{/each}
			</div>
		{/if}
		{#if attachError}
			<div class="mb-1.5 text-xs text-warning">{attachError}</div>
		{/if}

		<input
			bind:this={fileInput}
			type="file"
			accept="image/jpeg,image/png,image/webp,image/gif"
			multiple
			class="hidden"
			onchange={onFilesSelected}
		/>

		<div class="flex gap-2 items-end">
			<button
				class="btn btn-square btn-ghost btn-sm h-10 min-h-0 w-10"
				disabled={isStreaming || capExceeded || attachments.length >= MAX_IMAGES}
				onclick={() => fileInput?.click()}
				title={m.chat_attach_photo_aria()}
				aria-label={m.chat_attach_photo_aria()}
			>
				<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
					<path stroke-linecap="round" stroke-linejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
				</svg>
			</button>

			<textarea
				bind:this={textareaEl}
				class="textarea textarea-bordered flex-1 resize-none text-sm min-h-[2.5rem] max-h-32 leading-snug"
				placeholder={m.chat_composer_placeholder()}
				rows="1"
				disabled={isStreaming || capExceeded}
				bind:value={input}
				onkeydown={handleKeydown}
				oninput={(e) => {
					const el = e.currentTarget as HTMLTextAreaElement;
					el.style.height = 'auto';
					el.style.height = Math.min(el.scrollHeight, 128) + 'px';
				}}
			></textarea>

			{#if isStreaming}
				<button class="btn btn-square btn-error btn-sm h-10 min-h-0 w-10" onclick={abort} title={m.chat_stop_button_title()}>
					<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
						<rect x="6" y="6" width="12" height="12" rx="1" />
					</svg>
				</button>
			{:else}
				<button
					class="btn btn-square btn-primary btn-sm h-10 min-h-0 w-10"
					disabled={(!input.trim() && attachments.length === 0) || capExceeded}
					onclick={() => send(input)}
					title={m.chat_send_button_title()}
				>
					<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M12 19V5m-7 7l7-7 7 7" />
					</svg>
				</button>
			{/if}
		</div>
	</div>
</div>
