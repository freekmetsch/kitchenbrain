import { describe, expect, it, vi } from 'vitest';
import { ChatAgentController } from './chat-agent.svelte';

describe('ChatAgentController state integrity', () => {
	it('refreshes cap metadata in both directions without replacing hydrated messages', () => {
		const controller = new ChatAgentController('freek');
		controller.hydrateOnce(
			[{ role: 'user', content: 'Keep me', createdAt: new Date('2026-07-23T10:00:00Z') }],
			{ capExceeded: true, capEur: 0.5 }
		);

		controller.hydrateOnce([], {
			capExceeded: false,
			capEur: 2,
			hasOlder: true,
			visibleLimit: 20
		});

		expect(controller.messages).toHaveLength(1);
		expect(controller.capExceeded).toBe(false);
		expect(controller.capEur).toBe(2);
		expect(controller.historyHasOlder).toBe(true);
	});

	it('turns a derived interrupted row into a retryable localized error', () => {
		const controller = new ChatAgentController('freek');
		controller.hydrateOnce([
			{ role: 'user', content: 'Try again', createdAt: new Date('2026-07-23T10:00:00Z') },
			{
				role: 'assistant',
				content: '',
				errorCode: 'interrupted_turn',
				createdAt: new Date('2026-07-23T10:00:00Z')
			}
		]);

		expect(controller.messages[1].error).toBeTruthy();
		expect(controller.canRetry(controller.messages[1], 1)).toBe(true);
	});

	it('does not create a doomed optimistic turn while the cap is active', async () => {
		const controller = new ChatAgentController('freek');
		controller.hydrateOnce([], { capExceeded: true });
		const fetchSpy = vi.spyOn(globalThis, 'fetch');

		await controller.send('blocked');

		expect(controller.messages).toHaveLength(0);
		expect(fetchSpy).not.toHaveBeenCalled();
		fetchSpy.mockRestore();
	});

	it('shares and persists the collapsed prompt-starter preference per user', () => {
		const stored = new Map<string, string>([
			['kitchenbrain.chat.prompt-starters-collapsed.v1:freek', 'true']
		]);
		vi.stubGlobal('window', {
			localStorage: {
				getItem: (key: string) => stored.get(key) ?? null,
				setItem: (key: string, value: string) => stored.set(key, value)
			}
		});

		try {
			const controller = new ChatAgentController('freek');
			controller.hydratePromptStarterPreference();
			expect(controller.promptStartersCollapsed).toBe(true);

			controller.setPromptStartersCollapsed(false);
			expect(controller.promptStartersCollapsed).toBe(false);
			expect(stored.get('kitchenbrain.chat.prompt-starters-collapsed.v1:freek')).toBe('false');
		} finally {
			vi.unstubAllGlobals();
		}
	});

	it('turns a prompt starter into an editable draft without making a request', () => {
		const controller = new ChatAgentController('freek');
		const fetchSpy = vi.spyOn(globalThis, 'fetch');

		controller.applyPromptStarter('Help me cook with');

		expect(controller.input).toBe('Help me cook with ');
		expect(controller.messages).toHaveLength(0);
		expect(fetchSpy).not.toHaveBeenCalled();
		fetchSpy.mockRestore();
	});

	it('uses one generic working state while preserving factual tool activity', async () => {
		const controller = new ChatAgentController('freek');
		const encoder = new TextEncoder();
		let stream!: ReadableStreamDefaultController<Uint8Array>;
		const body = new ReadableStream<Uint8Array>({
			start(controller) {
				stream = controller;
			}
		});
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { status: 200 })));

		try {
			const request = controller.send('Check the freezer');
			stream.enqueue(
				encoder.encode(
					'data: {"type":"tool_start","id":"tool-1","name":"get_inventory","summary":"Checking inventory…"}\n'
				)
			);

			await vi.waitFor(() => {
				expect(controller.messages.at(-1)?.status).toBe('Working on your request…');
			});
			expect(controller.messages.at(-1)?.toolCalls?.[0]).toMatchObject({
				name: 'get_inventory',
				pending: true,
				display: { kind: 'read', summary: 'Checking inventory…' }
			});

			stream.enqueue(
				encoder.encode(
					'data: {"type":"tool","id":"tool-1","name":"get_inventory","result":{"items":[]},"display":{"kind":"read","summary":"Checked inventory"}}\n'
				)
			);
			stream.enqueue(
				encoder.encode('data: {"type":"text","text":"The freezer is empty."}\ndata: [DONE]\n')
			);
			stream.close();
			await request;

			expect(controller.messages.at(-1)).toMatchObject({
				content: 'The freezer is empty.',
				status: undefined,
				toolCalls: [
					expect.objectContaining({
						pending: false,
						display: { kind: 'read', summary: 'Checked inventory' }
					})
				]
			});
		} finally {
			vi.unstubAllGlobals();
		}
	});
});
