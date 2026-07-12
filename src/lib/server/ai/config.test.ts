import { describe, it, expect, afterEach } from 'vitest';
import {
	categoryForConfiguredModel,
	getChatModel,
	getBackgroundModel,
	setModel,
	resetModel,
	getCap,
	setCap,
	resetCap
} from './config';
import { categoryForModel, capForCategory } from './pricing';

afterEach(() => {
	resetModel('chat');
	resetModel('background');
	resetCap('chat');
	resetCap('background');
});

describe('categoryForConfiguredModel — Correctness Requirement #1 (category drift)', () => {
	it('an unconfigured unknown model id falls to the DEFAULT_PRICING chat category (today\'s behavior)', () => {
		expect(categoryForModel('totally-unknown-model-xyz')).toBe('chat');
		expect(categoryForConfiguredModel('totally-unknown-model-xyz')).toBe('chat');
	});

	it('a custom background model still counts as background — does not drift to chat via the pricing-table fallback', () => {
		const fakeModel = 'test-vendor/fake-background-model-verify';
		setModel('background', fakeModel);
		expect(getBackgroundModel()).toEqual({ value: fakeModel, source: 'ui' });
		// The bug this guards: categoryForModel alone would say 'chat' for an
		// unknown id (DEFAULT_PRICING), silently starving the background cap.
		expect(categoryForModel(fakeModel)).toBe('chat');
		expect(categoryForConfiguredModel(fakeModel)).toBe('background');
	});

	it('vision stays foreground (chat) — categoryForConfiguredModel does not special-case it', () => {
		expect(categoryForConfiguredModel('z-ai/glm-4.6v')).toBe('chat');
	});
});

describe('reset semantics — Correctness Requirement #2 (delete, not a sentinel)', () => {
	it('setModel then resetModel returns to the env/default source, not a stored sentinel', () => {
		setModel('chat', 'some/custom-model');
		expect(getChatModel().source).toBe('ui');
		resetModel('chat');
		const after = getChatModel();
		expect(after.source).not.toBe('ui');
		expect(after.value).not.toBe('some/custom-model');
	});

	it('setCap then resetCap returns to capForCategory (env/default), not a stored sentinel', () => {
		setCap('background', 5);
		expect(getCap('background')).toEqual({ value: 5, source: 'ui' });
		resetCap('background');
		const after = getCap('background');
		expect(after.source).not.toBe('ui');
		expect(after.value).toBe(capForCategory('background'));
	});
});

describe('getCap — behavior-identical with no household_pref written (Phase 1a)', () => {
	it('matches capForCategory exactly when no UI pref exists', () => {
		expect(getCap('chat').value).toBe(capForCategory('chat'));
		expect(getCap('background').value).toBe(capForCategory('background'));
	});
});
