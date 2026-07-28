import type { CookTimerController } from './timer-controller.svelte';
import type { TimerWorkerOutbound } from '$lib/timer/messages';

export type CookModeWakeLock = {
	release(): Promise<void> | void;
	onRelease(listener: () => void): void;
};

export type CookModeLifecycleWorker = {
	addMessageListener(listener: (time: number) => void): void;
	postSubscribe(id: string): void;
	postUnsubscribe(id: string): void;
	terminate(): void;
};

export type CookModeAudioContext = {
	state: string;
	sampleRate: number;
	destination: unknown;
	createBuffer(channels: number, length: number, sampleRate: number): {
		getChannelData(channel: number): Float32Array;
	};
	createBufferSource(): {
		buffer: unknown;
		connect(destination: unknown): void;
		start(): void;
		stop(): void;
	};
	resume(): Promise<void>;
	close(): Promise<void>;
};

export type CookModeLifecycleBrowserAdapters = {
	createWorker(): CookModeLifecycleWorker;
	listenVisibility(listener: () => void): () => void;
	visibilityState(): DocumentVisibilityState | undefined;
	requestWakeLock(): Promise<CookModeWakeLock | null>;
	createAudioContext(): CookModeAudioContext | null;
	vibrate(pattern: number[]): void;
	setInterval(callback: () => void, delay: number): unknown;
	clearInterval(handle: unknown): void;
	now(): number;
	warn(message: string, error: unknown): void;
};

export type CookModeLifecycleDependencies = {
	timers: CookTimerController;
	subscriberId: string;
	shouldRetryAfterVisibility(): boolean;
	retryAfterVisibility(): void | Promise<void>;
	onTimerStateChange?(): void;
	browser: CookModeLifecycleBrowserAdapters;
};

const VIBRATE_PATTERN = [200, 100, 200, 100, 200];

export function createCookModeLifecycleBrowserAdapters(
	createWorker: () => Worker
): CookModeLifecycleBrowserAdapters {
	return {
		createWorker: () => {
			const worker = createWorker();
			return {
				addMessageListener: (listener) => {
					worker.addEventListener('message', (event: MessageEvent<TimerWorkerOutbound>) => {
						if (event.data?.type === 'tick') listener(event.data.t);
					});
				},
				postSubscribe: (id) => worker.postMessage({ type: 'subscribe', id }),
				postUnsubscribe: (id) => worker.postMessage({ type: 'unsubscribe', id }),
				terminate: () => worker.terminate()
			};
		},
		listenVisibility: (listener) => {
			if (typeof document === 'undefined') return () => {};
			document.addEventListener('visibilitychange', listener);
			return () => document.removeEventListener('visibilitychange', listener);
		},
		visibilityState: () =>
			typeof document === 'undefined' ? undefined : document.visibilityState,
		requestWakeLock: async () => {
			if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return null;
			const sentinel = await navigator.wakeLock.request('screen');
			return {
				release: () => sentinel.release(),
				onRelease: (listener) => sentinel.addEventListener('release', listener, { once: true })
			};
		},
		createAudioContext: () => {
			if (typeof window === 'undefined') return null;
			const AudioContextConstructor =
				window.AudioContext ??
				(window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
			return AudioContextConstructor
				? (new AudioContextConstructor() as unknown as CookModeAudioContext)
				: null;
		},
		vibrate: (pattern) => {
			if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(pattern);
		},
		setInterval: (callback, delay) => globalThis.setInterval(callback, delay),
		clearInterval: (handle) =>
			globalThis.clearInterval(handle as ReturnType<typeof globalThis.setInterval>),
		now: () => Date.now(),
		warn: (message, error) => console.warn(message, error)
	};
}

export class CookModeLifecycleController {
	readonly #dependencies: CookModeLifecycleDependencies;
	#wakeLock: CookModeWakeLock | null = null;
	#removeVisibilityListener: (() => void) | null = null;
	#worker: CookModeLifecycleWorker | null = null;
	#workerSubscribed = false;
	#fallbackInterval: unknown | null = null;
	#audioContext: CookModeAudioContext | null = null;
	#alarmBuffer: ReturnType<CookModeAudioContext['createBuffer']> | null = null;
	#alarmSources = new Map<number, ReturnType<CookModeAudioContext['createBufferSource']>>();
	#mounted = false;
	#destroyed = false;

	constructor(dependencies: CookModeLifecycleDependencies) {
		this.#dependencies = dependencies;
	}

	mount(): void {
		if (this.#mounted || this.#destroyed) return;
		this.#mounted = true;
		this.#removeVisibilityListener = this.#dependencies.browser.listenVisibility(() => {
			this.#onVisibilityChange();
		});
		if (this.#dependencies.timers.anyRunning) void this.#acquireWakeLock();
	}

	syncTimerActivity(running: boolean): void {
		if (this.#destroyed) return;
		if (!running) {
			this.#unsubscribeWorker();
			this.#clearFallbackInterval();
			this.#releaseWakeLock();
			return;
		}
		if (this.#mounted && !this.#wakeLock) void this.#acquireWakeLock();
		this.#ensureWorker();
		if (this.#worker) {
			this.#clearFallbackInterval();
			if (!this.#workerSubscribed) {
				this.#worker.postSubscribe(this.#dependencies.subscriberId);
				this.#workerSubscribed = true;
			}
			return;
		}
		if (this.#fallbackInterval == null) {
			this.#fallbackInterval = this.#dependencies.browser.setInterval(() => {
				this.#tick(this.#dependencies.browser.now());
			}, 250);
		}
	}

	startTimer(index: number, seconds: number): number {
		this.#ensureAudio();
		const deadline = this.#dependencies.timers.start(
			index,
			seconds,
			this.#dependencies.browser.now()
		);
		this.#dependencies.onTimerStateChange?.();
		return deadline;
	}

	cancelTimer(index: number): void {
		this.#stopAlarm(index);
		this.#dependencies.timers.cancel(index);
		this.#dependencies.onTimerStateChange?.();
	}

	resetTimers(): void {
		this.#dependencies.timers.reset(this.#dependencies.browser.now());
		this.#stopAllAlarms();
		this.#dependencies.onTimerStateChange?.();
	}

	destroy(): void {
		if (this.#destroyed) return;
		this.#destroyed = true;
		this.#removeVisibilityListener?.();
		this.#removeVisibilityListener = null;
		this.#unsubscribeWorker();
		this.#worker?.terminate();
		this.#worker = null;
		this.#clearFallbackInterval();
		this.#releaseWakeLock();
		this.#stopAllAlarms();
		const audioContext = this.#audioContext;
		this.#audioContext = null;
		this.#alarmBuffer = null;
		if (audioContext && audioContext.state !== 'closed') {
			try {
				void audioContext.close().catch(() => {});
			} catch {
				// A browser may synchronously reject a revoked AudioContext.
			}
		}
	}

	#onVisibilityChange(): void {
		if (this.#dependencies.browser.visibilityState() !== 'visible') return;
		this.#tick(this.#dependencies.browser.now());
		if (this.#dependencies.shouldRetryAfterVisibility()) {
			void this.#dependencies.retryAfterVisibility();
		}
		if (this.#dependencies.timers.anyRunning && !this.#wakeLock) {
			void this.#acquireWakeLock();
		}
		if (this.#audioContext?.state === 'suspended') {
			void this.#audioContext.resume().catch(() => {});
		}
	}

	#tick(time: number): void {
		for (const index of this.#dependencies.timers.tick(time)) {
			this.#fireAlarm(index);
		}
		this.#dependencies.onTimerStateChange?.();
		this.syncTimerActivity(this.#dependencies.timers.anyRunning);
	}

	#ensureWorker(): void {
		if (this.#worker) return;
		try {
			this.#worker = this.#dependencies.browser.createWorker();
			this.#worker.addMessageListener((time) => this.#tick(time));
		} catch {
			this.#worker = null;
		}
	}

	#unsubscribeWorker(): void {
		if (!this.#worker || !this.#workerSubscribed) return;
		this.#worker.postUnsubscribe(this.#dependencies.subscriberId);
		this.#workerSubscribed = false;
	}

	#clearFallbackInterval(): void {
		if (this.#fallbackInterval == null) return;
		this.#dependencies.browser.clearInterval(this.#fallbackInterval);
		this.#fallbackInterval = null;
	}

	#ensureAudio(): void {
		try {
			this.#audioContext ??= this.#dependencies.browser.createAudioContext();
			if (!this.#audioContext) return;
			if (this.#audioContext.state === 'suspended') {
				void this.#audioContext.resume().catch(() => {});
			}
			this.#alarmBuffer ??= this.#buildAlarmBuffer(this.#audioContext);
		} catch {
			this.#audioContext = null;
			this.#alarmBuffer = null;
		}
	}

	#buildAlarmBuffer(
		context: CookModeAudioContext
	): ReturnType<CookModeAudioContext['createBuffer']> {
		const sampleRate = context.sampleRate;
		const beepSamples = Math.round(0.4 * sampleRate);
		const gapSamples = Math.round(0.2 * sampleRate);
		const length = Math.round(12 * sampleRate);
		const buffer = context.createBuffer(1, length, sampleRate);
		const data = buffer.getChannelData(0);
		const beepCount = Math.floor(length / (beepSamples + gapSamples));
		for (let beep = 0; beep < beepCount; beep++) {
			const start = beep * (beepSamples + gapSamples);
			for (let sample = 0; sample < beepSamples; sample++) {
				const phase = ((sample / sampleRate) * 880) % 1;
				data[start + sample] = phase < 0.5 ? 0.28 : -0.28;
			}
		}
		return buffer;
	}

	#playAlarm(index: number): void {
		if (!this.#audioContext || !this.#alarmBuffer) return;
		try {
			this.#stopAlarm(index);
			const source = this.#audioContext.createBufferSource();
			source.buffer = this.#alarmBuffer;
			source.connect(this.#audioContext.destination);
			source.start();
			this.#alarmSources.set(index, source);
		} catch (error) {
			this.#dependencies.browser.warn('cook-mode alarm playback failed', error);
		}
	}

	#fireAlarm(index: number): void {
		this.#playAlarm(index);
		try {
			this.#dependencies.browser.vibrate(VIBRATE_PATTERN);
		} catch {
			// Vibration is an optional alarm layer.
		}
	}

	#stopAlarm(index: number): void {
		const source = this.#alarmSources.get(index);
		if (!source) return;
		this.#alarmSources.delete(index);
		try {
			source.stop();
		} catch {
			// An already-ended source is effectively stopped.
		}
	}

	#stopAllAlarms(): void {
		for (const index of [...this.#alarmSources.keys()]) this.#stopAlarm(index);
	}

	async #acquireWakeLock(): Promise<void> {
		if (this.#wakeLock || this.#destroyed) return;
		try {
			const wakeLock = await this.#dependencies.browser.requestWakeLock();
			if (!wakeLock) return;
			if (this.#destroyed || this.#wakeLock) {
				await Promise.resolve(wakeLock.release()).catch(() => {});
				return;
			}
			this.#wakeLock = wakeLock;
			wakeLock.onRelease(() => {
				if (this.#wakeLock === wakeLock) this.#wakeLock = null;
			});
		} catch {
			this.#wakeLock = null;
		}
	}

	#releaseWakeLock(): void {
		const wakeLock = this.#wakeLock;
		this.#wakeLock = null;
		if (!wakeLock) return;
		try {
			void Promise.resolve(wakeLock.release()).catch(() => {});
		} catch {
			// Revoked wake locks are already released.
		}
	}
}
