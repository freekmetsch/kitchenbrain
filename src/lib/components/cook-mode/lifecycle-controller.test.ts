import { describe, expect, it, vi } from 'vitest';
import { CookTimerController } from './timer-controller.svelte';
import {
	CookModeLifecycleController,
	type CookModeLifecycleBrowserAdapters,
	type CookModeLifecycleDependencies,
	type CookModeWakeLock
} from './lifecycle-controller.svelte';

function browserAdapters(
	overrides: Partial<CookModeLifecycleBrowserAdapters> = {}
): CookModeLifecycleBrowserAdapters {
	return {
		createWorker: () => {
			throw new Error('worker unavailable');
		},
		listenVisibility: () => () => {},
		visibilityState: () => 'visible',
		requestWakeLock: async () => null,
		createAudioContext: () => null,
		vibrate: () => {},
		setInterval: () => 1,
		clearInterval: () => {},
		now: () => 1_000,
		warn: () => {},
		...overrides
	};
}

function dependencies(
	timers: CookTimerController,
	browser: CookModeLifecycleBrowserAdapters
): CookModeLifecycleDependencies {
	return {
		timers,
		subscriberId: 'bench-sheet-bean-stew',
		shouldRetryAfterVisibility: () => false,
		retryAfterVisibility: vi.fn(),
		browser
	};
}

describe('CookModeLifecycleController', () => {
	it('ticks timers and does not reacquire wake lock after the final timer expires', async () => {
		let visibilityListener: (() => void) | undefined;
		let now = 1_000;
		let releaseWakeLock: (() => void) | undefined;
		const wakeLocks: CookModeWakeLock[] = [];
		const requestWakeLock = vi.fn(async () => {
			const wakeLock: CookModeWakeLock = {
				release: vi.fn(async () => {}),
				onRelease: (listener) => {
					releaseWakeLock = listener;
				}
			};
			wakeLocks.push(wakeLock);
			return wakeLock;
		});
		const timers = new CookTimerController(now);
		timers.start(0, 10, now);
		const browser = browserAdapters({
			listenVisibility: (listener) => {
				visibilityListener = listener;
				return () => {};
			},
			requestWakeLock,
			now: () => now
		});
		const deps = dependencies(timers, browser);
		deps.shouldRetryAfterVisibility = () => true;
		const lifecycle = new CookModeLifecycleController(deps);

		lifecycle.mount();
		await Promise.resolve();
		releaseWakeLock?.();
		now = 11_000;
		visibilityListener?.();
		await Promise.resolve();

		expect(timers.snapshot.doneIdxs).toEqual(new Set([0]));
		expect(deps.retryAfterVisibility).toHaveBeenCalledOnce();
		expect(requestWakeLock).toHaveBeenCalledOnce();
		expect(wakeLocks).toHaveLength(1);
		lifecycle.destroy();
	});

	it('falls back to a main-thread tick when worker construction fails and cleans it up', () => {
		let fallbackTick: (() => void) | undefined;
		let now = 1_000;
		const clearInterval = vi.fn();
		const timers = new CookTimerController(now);
		timers.start(0, 10, now);
		const lifecycle = new CookModeLifecycleController(
			dependencies(
				timers,
				browserAdapters({
					createWorker: () => {
						throw new Error('blocked');
					},
					setInterval: (callback, delay) => {
						expect(delay).toBe(250);
						fallbackTick = callback;
						return 42;
					},
					clearInterval,
					now: () => now
				})
			)
		);

		lifecycle.syncTimerActivity(true);
		now = 11_000;
		fallbackTick?.();
		lifecycle.destroy();

		expect(timers.snapshot.doneIdxs).toEqual(new Set([0]));
		expect(clearInterval).toHaveBeenCalledWith(42);
	});

	it('persists only timer transitions rather than every countdown tick', () => {
		let fallbackTick: (() => void) | undefined;
		let now = 1_000;
		const timers = new CookTimerController(now);
		timers.start(0, 10, now);
		const deps = dependencies(
			timers,
			browserAdapters({
				setInterval: (callback) => {
					fallbackTick = callback;
					return 1;
				},
				now: () => now
			})
		);
		deps.onTimerStateChange = vi.fn();
		const lifecycle = new CookModeLifecycleController(deps);
		lifecycle.syncTimerActivity(true);

		now = 2_000;
		fallbackTick?.();
		expect(deps.onTimerStateChange).not.toHaveBeenCalled();

		now = 11_000;
		fallbackTick?.();
		expect(deps.onTimerStateChange).toHaveBeenCalledOnce();
		lifecycle.destroy();
	});

	it('keeps timers usable when wake lock, audio, and vibration fail', async () => {
		let visibilityListener: (() => void) | undefined;
		let now = 1_000;
		const timers = new CookTimerController(now);
		const deps = dependencies(
			timers,
			browserAdapters({
				listenVisibility: (listener) => {
					visibilityListener = listener;
					return () => {};
				},
				requestWakeLock: async () => {
					throw new Error('wake lock denied');
				},
				createAudioContext: () => {
					throw new Error('audio unavailable');
				},
				vibrate: () => {
					throw new Error('vibration unavailable');
				},
				now: () => now
			})
		);
		const lifecycle = new CookModeLifecycleController(deps);

		lifecycle.mount();
		expect(() => lifecycle.startTimer(0, 10)).not.toThrow();

		now = 11_000;
		expect(() => visibilityListener?.()).not.toThrow();
		await Promise.resolve();

		expect(timers.snapshot.doneIdxs).toEqual(new Set([0]));
		lifecycle.destroy();
	});

	it('keeps worker subscriptions isolated per instance and terminates only the destroyed instance', () => {
		const workers = Array.from({ length: 2 }, () => ({
			addMessageListener: vi.fn(),
			postSubscribe: vi.fn(),
			postUnsubscribe: vi.fn(),
			terminate: vi.fn()
		}));
		let workerIndex = 0;
		const browser = browserAdapters({
			createWorker: () => workers[workerIndex++]
		});
		const firstTimers = new CookTimerController(1_000);
		const secondTimers = new CookTimerController(1_000);
		const first = new CookModeLifecycleController(dependencies(firstTimers, browser));
		const secondDeps = dependencies(secondTimers, browser);
		secondDeps.subscriberId = 'bench-sheet-lentil-soup';
		const second = new CookModeLifecycleController(secondDeps);

		firstTimers.start(0, 10, 1_000);
		first.syncTimerActivity(true);

		expect(workers[0].postSubscribe).toHaveBeenCalledWith('bench-sheet-bean-stew');
		expect(workers[1].postSubscribe).not.toHaveBeenCalled();
		expect(secondTimers.ends).toEqual({});

		secondTimers.start(1, 20, 1_000);
		second.syncTimerActivity(true);
		first.destroy();

		expect(workers[0].postUnsubscribe).toHaveBeenCalledWith('bench-sheet-bean-stew');
		expect(workers[0].terminate).toHaveBeenCalledOnce();
		expect(workers[1].postUnsubscribe).not.toHaveBeenCalled();
		expect(workers[1].terminate).not.toHaveBeenCalled();
		expect(secondTimers.ends).toEqual({ 1: 21_000 });
		second.destroy();
	});
});
