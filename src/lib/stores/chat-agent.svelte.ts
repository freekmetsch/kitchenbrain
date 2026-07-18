import { base } from '$app/paths';
import { invalidateAll } from '$app/navigation';
import { m } from '$lib/paraglide/messages';
import type { ScreenContextV1 } from '$lib/chat/screen_context';
import type { ToolDisplay } from '$lib/tool_display';
import { looksLikeJsonArtifact } from '$lib/chat_sanitize';

export type UndoState = 'undoing' | 'done' | 'conflict' | 'error';
export type ConfirmState = 'approving' | 'done' | 'expired' | 'conflict' | 'cancelled' | 'error';
export type ChatToolCall = {
	id?: string;
	name: string;
	input?: unknown;
	result: unknown;
	display?: ToolDisplay | null;
	pending?: boolean;
	undo?: UndoState;
	confirmState?: ConfirmState;
};
export type ChatMessage = {
	role: 'user' | 'assistant';
	content: string;
	toolCalls?: ChatToolCall[] | null;
	streaming?: boolean;
	hydrated?: boolean;
	images?: string[];
	status?: string;
	at?: Date;
	error?: string;
};
export type ChatAttachment = { id: number; blob: Blob; url: string; name: string };

type HydratedMessage = {
	role: 'user' | 'assistant';
	content: string;
	toolCalls?: unknown;
	createdAt?: Date | string;
	at?: Date | string;
};

const MAX_IMAGES = 2;
const MAX_DIM = 1568;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_INPUT_BYTES = 20 * 1024 * 1024;
const MAX_UPLOAD_BYTES = 3.5 * 1024 * 1024;

export class ChatAgentController {
	messages = $state<ChatMessage[]>([]);
	input = $state('');
	isStreaming = $state(false);
	capExceeded = $state(false);
	attachments = $state<ChatAttachment[]>([]);
	attachError = $state('');
	opened = $state(false);
	hydrating = $state(false);
	hydrationError = $state(false);
	screenContext = $state<ScreenContextV1 | undefined>();
	contextEnabled = $state(true);
	focusRequest = $state(0);
	unread = $state(0);

	readonly username: string;
	private hydrated = false;
	private hydrationPromise: Promise<void> | null = null;
	private abortController: AbortController | null = null;
	private attachmentId = 0;
	private readonly publishers = new Map<symbol, ScreenContextV1>();
	private returnFocus: HTMLElement | null = null;
	private invalidateTimer: ReturnType<typeof setTimeout> | null = null;

	constructor(username: string) {
		this.username = username;
	}

	hydrateOnce(
		initialMessages: HydratedMessage[],
		options?: { input?: string; capExceeded?: boolean }
	): void {
		if (this.hydrated) {
			if (options?.input && !this.input) this.input = options.input;
			return;
		}
		this.messages = initialMessages.map((message) => ({
			role: message.role,
			content: message.content,
			toolCalls: (message.toolCalls ?? null) as ChatToolCall[] | null,
			at: new Date(message.at ?? message.createdAt ?? Date.now()),
			hydrated: true
		}));
		this.input = options?.input ?? this.input;
		this.capExceeded = options?.capExceeded ?? this.capExceeded;
		this.hydrated = true;
	}

	async ensureHydrated(): Promise<void> {
		if (this.hydrated) return;
		if (this.hydrationPromise) return this.hydrationPromise;
		this.hydrating = true;
		this.hydrationError = false;
		this.hydrationPromise = (async () => {
			try {
				const response = await fetch(`${base}/api/chat/history`);
				if (!response.ok) throw new Error('history request failed');
				const data = await response.json();
				this.hydrateOnce(data.messages ?? [], { capExceeded: data.capExceeded === true });
			} catch {
				this.hydrationError = true;
			} finally {
				this.hydrating = false;
				this.hydrationPromise = null;
			}
		})();
		return this.hydrationPromise;
	}

	open(options?: { draft?: string }): void {
		if (typeof document !== 'undefined') this.returnFocus = document.activeElement as HTMLElement | null;
		if (options?.draft !== undefined) this.input = options.draft;
		this.opened = true;
		this.unread = 0;
		this.focusRequest += 1;
		void this.ensureHydrated();
	}

	close(): void {
		this.opened = false;
		this.returnFocus?.focus();
		this.returnFocus = null;
	}

	publishScreen(snapshot: ScreenContextV1): () => void {
		const id = Symbol(snapshot.routeId);
		this.publishers.set(id, snapshot);
		this.screenContext = snapshot;
		this.contextEnabled = true;
		return () => {
			this.publishers.delete(id);
			this.screenContext = [...this.publishers.values()].at(-1);
		};
	}

	removeContext(): void {
		this.contextEnabled = false;
	}

	private async loadImage(file: File): Promise<HTMLImageElement> {
		return new Promise((resolve, reject) => {
			const url = URL.createObjectURL(file);
			const image = new Image();
			image.onload = () => {
				URL.revokeObjectURL(url);
				resolve(image);
			};
			image.onerror = () => {
				URL.revokeObjectURL(url);
				reject(new Error('decode failed'));
			};
			image.src = url;
		});
	}

	private async downscaleToJpeg(file: File): Promise<Blob> {
		const image = await this.loadImage(file);
		let width = image.naturalWidth || image.width;
		let height = image.naturalHeight || image.height;
		const longest = Math.max(width, height);
		if (longest > MAX_DIM) {
			const scale = MAX_DIM / longest;
			width = Math.round(width * scale);
			height = Math.round(height * scale);
		}
		const canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;
		const context = canvas.getContext('2d');
		if (!context) throw new Error('canvas unavailable');
		context.drawImage(image, 0, 0, width, height);
		const blob = await new Promise<Blob | null>((resolve) =>
			canvas.toBlob(resolve, 'image/jpeg', 0.82)
		);
		if (!blob) throw new Error('encode failed');
		return blob;
	}

	async addFiles(files: File[]): Promise<void> {
		this.attachError = '';
		for (const file of files) {
			if (this.attachments.length >= MAX_IMAGES) {
				this.attachError = m.chat_attach_max_photos({ max: MAX_IMAGES });
				break;
			}
			if (!ALLOWED_MIME.has(file.type)) {
				this.attachError = m.chat_attach_invalid_type();
				continue;
			}
			if (file.size > MAX_INPUT_BYTES) {
				this.attachError = m.chat_attach_too_large();
				continue;
			}
			try {
				const blob = await this.downscaleToJpeg(file);
				if (blob.size > MAX_UPLOAD_BYTES) {
					this.attachError = m.chat_attach_too_large();
					continue;
				}
				this.attachments.push({
					id: this.attachmentId++,
					blob,
					url: URL.createObjectURL(blob),
					name: file.name
				});
			} catch {
				this.attachError = m.chat_attach_read_failed();
			}
		}
	}

	removeAttachment(id: number): void {
		const index = this.attachments.findIndex((attachment) => attachment.id === id);
		if (index < 0) return;
		URL.revokeObjectURL(this.attachments[index].url);
		this.attachments.splice(index, 1);
	}

	private scheduleInvalidation(): void {
		if (this.invalidateTimer) clearTimeout(this.invalidateTimer);
		this.invalidateTimer = setTimeout(() => {
			this.invalidateTimer = null;
			void invalidateAll();
		}, 120);
	}

	async undo(tool: ChatToolCall, opId: number): Promise<void> {
		if (tool.undo === 'undoing' || tool.undo === 'done') return;
		tool.undo = 'undoing';
		try {
			const response = await fetch(`${base}/api/inventory/undo`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ op_id: opId })
			});
			if (response.ok) {
				tool.undo = 'done';
				await invalidateAll();
			} else if (response.status === 409) tool.undo = 'conflict';
			else tool.undo = 'error';
		} catch {
			tool.undo = 'error';
		}
	}

	async approveConfirm(tool: ChatToolCall, confirmationId: string): Promise<void> {
		if (tool.confirmState) return;
		tool.confirmState = 'approving';
		try {
			const response = await fetch(`${base}/api/chat/confirm`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ confirmation_id: confirmationId })
			});
			if (response.ok) {
				const data = await response.json();
				if (data.display) tool.display = data.display;
				tool.confirmState = 'done';
				await invalidateAll();
			} else if (response.status === 409) tool.confirmState = 'conflict';
			else if (response.status === 410) tool.confirmState = 'expired';
			else tool.confirmState = 'error';
		} catch {
			tool.confirmState = 'error';
		}
	}

	cancelConfirm(tool: ChatToolCall): void {
		if (!tool.confirmState) tool.confirmState = 'cancelled';
	}

	canRetry(message: ChatMessage, index: number): boolean {
		if (
			message.role !== 'assistant' ||
			!message.error ||
			message.content ||
			message.toolCalls?.length
		) {
			return false;
		}
		if (index !== this.messages.length - 1 || this.isStreaming || this.capExceeded) return false;
		const previous = this.messages[index - 1];
		return Boolean(previous?.role === 'user' && !previous.images?.length && previous.content.trim());
	}

	async retry(): Promise<void> {
		const previous = this.messages[this.messages.length - 2];
		if (!previous) return;
		this.messages.pop();
		this.messages.pop();
		await this.send(previous.content, true);
	}

	abort(): void {
		this.abortController?.abort();
	}

	async send(text = this.input, isRetry = false): Promise<void> {
		// A contextual CTA can open the agent and send in the same tick. Let the
		// one-time history load settle first; otherwise hydrateOnce can replace the
		// just-appended optimistic turn with the older server snapshot.
		if (!this.hydrated) await this.ensureHydrated();
		const outgoing = this.attachments;
		const hasAttachments = outgoing.length > 0;
		if (this.isStreaming || (!text.trim() && !hasAttachments)) return;
		// Screen publishers run inside Svelte's reactive graph, so screenContext is
		// normally a deeply reactive Proxy. Browser structuredClone rejects those
		// proxies with DataCloneError before the request can even start. JSON is the
		// wire format for this bounded, primitive-only object anyway, so use that
		// same serialization boundary to detach it from Svelte state.
		const screenContext = this.contextEnabled && this.screenContext
			? (JSON.parse(JSON.stringify(this.screenContext)) as ScreenContextV1)
			: undefined;

		this.attachments = [];
		this.attachError = '';
		this.messages.push({
			role: 'user',
			content: text,
			at: new Date(),
			images: hasAttachments ? outgoing.map((attachment) => attachment.url) : undefined
		});
		this.messages.push({
			role: 'assistant',
			content: '',
			toolCalls: [],
			at: new Date(),
			streaming: true,
			status: hasAttachments ? m.chat_status_reading_photo() : m.chat_status_thinking()
		});
		this.input = '';
		this.isStreaming = true;
		this.abortController = new AbortController();
		let wrote = false;

		try {
			let body: BodyInit;
			const headers: Record<string, string> = {};
			if (hasAttachments) {
				const form = new FormData();
				form.append('message', text);
				if (screenContext) form.append('screenContext', JSON.stringify(screenContext));
				outgoing.forEach((attachment, index) =>
					form.append('images', attachment.blob, `photo-${index + 1}.jpg`)
				);
				body = form;
			} else {
				headers['Content-Type'] = 'application/json';
				body = JSON.stringify({ message: text, retry: isRetry, screenContext });
			}
			const response = await fetch(`${base}/api/chat`, {
				method: 'POST',
				headers,
				body,
				signal: this.abortController.signal
			});

			if (!response.ok || !response.body) {
				const last = this.messages.at(-1)!;
				last.error = m.chat_error_generic();
				last.streaming = false;
				return;
			}

			const reader = response.body.getReader();
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
					const last = this.messages.at(-1)!;
					if (last.status) last.status = undefined;
					if (event.type === 'text' && event.text) last.content += event.text;
					else if (event.type === 'tool_start' && event.id) {
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
							? last.toolCalls.find((tool) => tool.id === event.id && tool.pending)
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
						if (event.display?.kind === 'write') wrote = true;
					} else if (event.type === 'error') {
						if (event.code === 'cap_exceeded') {
							this.capExceeded = true;
							last.error = m.chat_cap_error();
						} else if (event.code === 'turn_too_large') last.error = m.chat_error_too_large();
						else last.error = event.message ?? m.chat_error_generic_short();
					}
				}
			}
		} catch (error) {
			const last = this.messages.at(-1);
			if ((error as Error).name === 'AbortError') {
				if (last && !last.content && !last.toolCalls?.length) last.error = m.chat_error_stopped();
			} else if (last && !last.error) last.error = m.chat_error_connection_lost();
		} finally {
			this.isStreaming = false;
			this.abortController = null;
			const last = this.messages.at(-1);
			if (last) {
				last.streaming = false;
				last.status = undefined;
				if (
					last.role === 'assistant' &&
					!last.error &&
					!last.content.trim() &&
					!last.toolCalls?.length
				) {
					last.error = m.chat_error_empty_reply();
				}
				for (const tool of last.toolCalls ?? []) {
					if (!tool.pending) continue;
					tool.pending = false;
					tool.display = {
						kind: 'error',
						summary: m.chat_tool_interrupted({
							summary: (tool.display?.summary ?? m.chat_tool_working_fallback()).replace(/…$/, '')
						})
					};
				}
			}
			if (wrote) this.scheduleInvalidation();
			if (!this.opened && typeof window !== 'undefined' && location.pathname !== `${base}/`) {
				this.unread += 1;
			}
		}
	}

	destroy(): void {
		this.abortController?.abort();
		if (this.invalidateTimer) clearTimeout(this.invalidateTimer);
		for (const attachment of this.attachments) URL.revokeObjectURL(attachment.url);
		for (const message of this.messages) {
			for (const url of message.images ?? []) URL.revokeObjectURL(url);
		}
		this.attachments = [];
	}
}

export function isRetryableArtifact(message: ChatMessage): boolean {
	return message.role === 'assistant' && looksLikeJsonArtifact(message.content);
}
