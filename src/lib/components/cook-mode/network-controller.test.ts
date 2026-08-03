import { describe, expect, it, vi } from 'vitest';
import type { StoredCookModeRecipe } from '$lib/types';
import {
	CookModeNetworkController,
	type CookModeNetworkControllerDependencies
} from './network-controller.svelte';

const generatedCookMode: StoredCookModeRecipe = {
	version: 4,
	generation_id: 'generation-4',
	baseline_servings: 4,
	prep_tasks: [],
	streams: [{ id: 'pot', name: { en: 'Pot', nl: 'Pan' } }],
	steps: [
		{
			title: { en: 'Cook', nl: 'Bak' },
			goal: { en: 'Cook beans — hot and tender', nl: 'Bak bonen — warm en zacht' },
			body: { en: 'Cook gently.', nl: 'Bak rustig.' },
			ingredient_indexes: [],
			stream_id: 'pot',
			merges_from: []
		}
	]
};

const ineligibleCookMode: StoredCookModeRecipe = {
	version: 3,
	generation_id: 'generation-3',
	servings: 4,
	mise_en_place: [],
	streams: [{ id: 'pot', name: { en: 'Pot', nl: 'Pan' } }],
	steps: []
};

function dependencies(
	overrides: Partial<CookModeNetworkControllerDependencies> = {}
): CookModeNetworkControllerDependencies {
	return {
		basePath: '/kitchen',
		recipeSlug: 'bean-stew',
		recipeRevision: 3,
		fetcher: vi.fn(),
		readGenerationContext: () => ({
			viewLang: 'en',
			servings: 4,
			sessionStarted: false
		}),
		adoptCookMode: vi.fn(),
		reload: vi.fn(),
		clearProgress: vi.fn(),
		onCooked: vi.fn(),
		resetSession: vi.fn(),
		notifySuccess: vi.fn(),
		notifyError: vi.fn(),
		messages: {
			loadFailed: () => 'load failed',
			budgetReached: () => 'budget reached',
			noDirections: () => 'no directions',
			connectionFailed: () => 'connection failed',
			cookFailed: () => 'cook failed',
			swapSaved: () => 'swap saved',
			swapSaveFailed: () => 'swap save failed'
		},
		...overrides
	};
}

describe('CookModeNetworkController', () => {
	it('adopts an eligible generated cooking plan', async () => {
		const fetcher = vi.fn().mockResolvedValue(
			new Response(JSON.stringify({ cookMode: generatedCookMode, recipeRevision: 3 }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			})
		);
		const deps = dependencies({ fetcher });
		const network = new CookModeNetworkController(deps);

		await network.loadCookMode();

		expect(fetcher).toHaveBeenCalledWith(
			'/kitchen/api/recipes/bean-stew/cook-mode?lang=en&servings=4',
			{ method: 'POST' }
		);
		expect(deps.adoptCookMode).toHaveBeenCalledWith(generatedCookMode);
		expect(network.loading).toBe(false);
		expect(network.loadError).toBe('');
	});

	it('starts only one cooking-details request for a double click', async () => {
		let finishRequest: ((response: Response) => void) | undefined;
		const fetcher = vi.fn(
			() =>
				new Promise<Response>((resolve) => {
					finishRequest = resolve;
				})
		);
		const network = new CookModeNetworkController(dependencies({ fetcher }));

		const first = network.loadCookMode();
		const second = network.loadCookMode();

		expect(fetcher).toHaveBeenCalledTimes(1);
		finishRequest?.(
			new Response(JSON.stringify({ cookMode: generatedCookMode, recipeRevision: 3 }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			})
		);
		await Promise.all([first, second]);
		expect(fetcher).toHaveBeenCalledTimes(1);
	});

	it('surfaces a non-retryable generation limit without replacing the plan', async () => {
		const fetcher = vi.fn().mockResolvedValue(
			new Response(JSON.stringify({ reason: 'daily_cap_exceeded' }), {
				status: 429,
				headers: { 'Content-Type': 'application/json' }
			})
		);
		const deps = dependencies({ fetcher });
		const network = new CookModeNetworkController(deps);

		await network.loadCookMode();

		expect(deps.adoptCookMode).not.toHaveBeenCalled();
		expect(network.loadError).toBe('budget reached');
		expect(network.loadErrorRetryable).toBe(false);
		expect(network.loading).toBe(false);
	});

	it('keeps a failed request idle until the user retries', async () => {
		const fetcher = vi
			.fn()
			.mockRejectedValueOnce(new Error('offline'))
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ cookMode: generatedCookMode, recipeRevision: 3 }), {
					status: 200,
					headers: { 'Content-Type': 'application/json' }
				})
			);
		const deps = dependencies({
			fetcher,
			setTimer: vi.fn(() => 41),
			clearTimer: vi.fn()
		});
		const network = new CookModeNetworkController(deps);

		await network.loadCookMode();

		expect(network.loadError).toBe('connection failed');
		expect(network.loadErrorRetryable).toBe(true);
		expect(deps.setTimer).not.toHaveBeenCalled();
		expect(fetcher).toHaveBeenCalledTimes(1);

		await network.loadCookMode();
		expect(deps.adoptCookMode).toHaveBeenCalledWith(generatedCookMode);
		expect(fetcher).toHaveBeenCalledTimes(2);
		expect(network.loadError).toBe('');
	});

	it('requires a deliberate retry when a response is still ineligible', async () => {
		const fetcher = vi.fn().mockResolvedValue(
			new Response(JSON.stringify({ cookMode: ineligibleCookMode }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			})
		);
		const setTimer = vi.fn((_callback: () => void, _delay: number) => 51);
		const network = new CookModeNetworkController(dependencies({ fetcher, setTimer }));

		await network.loadCookMode();

		expect(fetcher).toHaveBeenCalledTimes(1);
		expect(setTimer).not.toHaveBeenCalled();
		expect(network.loadError).toBe('load failed');
		expect(network.loadErrorRetryable).toBe(true);
	});

	it('logs a direct recipe cook and resets the acknowledged session', async () => {
		let acknowledge: (() => void) | null = null;
		const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
		const deps = dependencies({
			fetcher,
			setTimer: (callback, delay) => {
				expect(delay).toBe(1_200);
				acknowledge = callback;
				return 42;
			},
			clearTimer: vi.fn()
		});
		const network = new CookModeNetworkController(deps);

		await network.markCooked(null);

		expect(fetcher).toHaveBeenCalledWith('/kitchen/api/recipes/bean-stew/cook', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: '{}'
		});
		expect(network.cookedSubmitting).toBe(true);
		expect(network.cookedDone).toBe(true);
		expect(deps.clearProgress).toHaveBeenCalledOnce();
		expect(deps.onCooked).toHaveBeenCalledOnce();

		(acknowledge as (() => void) | null)?.();
		expect(deps.resetSession).toHaveBeenCalledOnce();
	});

	it('uses the planned-meal endpoint and cooked status payload', async () => {
		const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
		const network = new CookModeNetworkController(
			dependencies({ fetcher, setTimer: vi.fn(() => 43) })
		);

		await network.markCooked(88);

		expect(fetcher).toHaveBeenCalledWith('/kitchen/api/meal-plan/88', {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: '{"status":"cooked"}'
		});
	});

	it.each([
		['non-ok response', () => Promise.resolve(new Response(null, { status: 500 }))],
		['thrown request', () => Promise.reject(new Error('offline'))]
	])('rolls back mark-cooked submission after a %s', async (_case, request) => {
		const fetcher = vi.fn(request);
		const deps = dependencies({ fetcher });
		const network = new CookModeNetworkController(deps);

		await network.markCooked(null);

		expect(network.cookedSubmitting).toBe(false);
		expect(network.cookedDone).toBe(false);
		expect(deps.clearProgress).not.toHaveBeenCalled();
		expect(deps.notifyError).toHaveBeenCalledWith('cook failed');
	});

	it('persists an ingredient swap as the new recipe default', async () => {
		const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
		const deps = dependencies({ fetcher });
		const network = new CookModeNetworkController(deps);

		await network.saveSwapDefault('beans', 2);

		expect(fetcher).toHaveBeenCalledWith('/kitchen/api/recipes/bean-stew/ingredient-swap', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: '{"ingredientId":"beans","substituteIndex":2,"expectedRecipeRevision":3}'
		});
		expect(network.savingIngredientId).toBe('beans');
		expect(deps.notifySuccess).toHaveBeenCalledWith('swap saved');
		expect(deps.reload).toHaveBeenCalledOnce();
	});

	it.each([
		['non-ok response', () => Promise.resolve(new Response(null, { status: 409 }))],
		['thrown request', () => Promise.reject(new Error('offline'))]
	])('re-enables swap persistence after a %s', async (_case, request) => {
		const deps = dependencies({ fetcher: vi.fn(request) });
		const network = new CookModeNetworkController(deps);

		await network.saveSwapDefault('beans', 1);

		expect(network.savingIngredientId).toBeNull();
		expect(deps.notifySuccess).not.toHaveBeenCalled();
		expect(deps.notifyError).toHaveBeenCalledWith('swap save failed');
		expect(deps.reload).not.toHaveBeenCalled();
	});
});
