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

	it('reconciles a recoverable server tail after a reload interrupted an active stream', async () => {
		const controller = new ChatAgentController('freek');
		const createdAt = new Date('2026-07-23T10:00:00Z');
		controller.hydrateOnce([{ role: 'user', content: 'Try again', createdAt }]);
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
			new Response(
				JSON.stringify({
					messages: [
						{ role: 'user', content: 'Try again', createdAt },
						{ role: 'assistant', content: '', errorCode: 'interrupted_turn', createdAt }
					],
					capExceeded: false,
					capEur: 0.5
				}),
				{ status: 200, headers: { 'Content-Type': 'application/json' } }
			)
		);

		await controller.refreshStatus();

		expect(controller.messages).toHaveLength(2);
		expect(controller.canRetry(controller.messages[1], 1)).toBe(true);
		fetchSpy.mockRestore();
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

	it('lets screen context be disabled and restored on the same route', () => {
		const controller = new ChatAgentController('freek');
		controller.setContextEnabled(false);
		expect(controller.contextEnabled).toBe(false);
		controller.setContextEnabled(true);
		expect(controller.contextEnabled).toBe(true);
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
});
