import { CookTimerController } from '$lib/components/cook-mode/timer-controller.svelte';
import {
	CookModeLifecycleController,
	type CookModeLifecycleBrowserAdapters
} from '$lib/components/cook-mode/lifecycle-controller.svelte';
import type { CookTimerAlert } from '$lib/components/cook-mode/cook_session';
import {
	createTimerPushClient,
	type TimerTestResult,
	type TimerPushState
} from './push-client';

export type CookTimerCoordinatorBrowserAdapters = CookModeLifecycleBrowserAdapters;

export type CookTimerSessionIdentity = {
	key: string;
	recipeSlug: string;
	recipeTitle: string;
};

export type VisibleCookTimer = {
	sessionKey: string;
	index: number;
	recipeSlug: string;
	recipeTitle: string;
	label: string;
	deadline: number;
	done: boolean;
	remainingSeconds: number;
};

type TimerMetadata = {
	label: string;
	title?: string;
	body?: string;
	navigate?: string;
};

type CookTimerCoordinatorStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export type CookTimerCoordinatorPushClient = Pick<
	ReturnType<typeof createTimerPushClient>,
	'inspect' | 'enable' | 'sendTest' | 'schedule' | 'cancel'
>;

type CookTimerCoordinatorOptions = {
	browser: CookTimerCoordinatorBrowserAdapters;
	storage?: CookTimerCoordinatorStorage | null;
	storageKey?: string;
	push?: CookTimerCoordinatorPushClient;
	uuid?: () => string;
};

export class CookTimerSession {
	readonly timers: CookTimerController;
	identity = $state<CookTimerSessionIdentity>({
		key: '',
		recipeSlug: '',
		recipeTitle: ''
	});
	metadata = $state<Record<number, TimerMetadata>>({});
	alerts = $state<Record<number, CookTimerAlert>>({});
	timerStateInitialized = $state(false);

	readonly #lifecycle: CookModeLifecycleController;
	readonly #onChange: () => void;
	readonly #now: () => number;
	readonly #push: CookTimerCoordinatorPushClient;
	readonly #uuid: () => string;
	#shouldRetryAfterVisibility = () => false;
	#retryAfterVisibility = () => {};
	#mounted = false;

	constructor(
		identity: CookTimerSessionIdentity,
		browser: CookTimerCoordinatorBrowserAdapters,
		push: CookTimerCoordinatorPushClient,
		uuid: () => string,
		onChange: () => void
	) {
		this.identity = identity;
		this.timers = new CookTimerController(browser.now());
		this.#onChange = onChange;
		this.#now = browser.now;
		this.#push = push;
		this.#uuid = uuid;
		this.#lifecycle = new CookModeLifecycleController({
			timers: this.timers,
			subscriberId: `cook-timer-${identity.key}`,
			shouldRetryAfterVisibility: () => this.#shouldRetryAfterVisibility(),
			retryAfterVisibility: () => this.#retryAfterVisibility(),
			onTimerStateChange: () => this.#onChange(),
			browser
		});
	}

	mount(): void {
		if (this.#mounted) return;
		this.#mounted = true;
		this.#lifecycle.mount();
		this.#lifecycle.syncTimerActivity(this.timers.anyRunning);
		this.retryPendingCancellations();
	}

	updateIdentity(identity: CookTimerSessionIdentity): void {
		this.identity = identity;
		this.#onChange();
	}

	attachView(
		shouldRetryAfterVisibility: () => boolean,
		retryAfterVisibility: () => void | Promise<void>
	): () => void {
		this.#shouldRetryAfterVisibility = shouldRetryAfterVisibility;
		this.#retryAfterVisibility = retryAfterVisibility;
		return () => {
			if (
				this.#shouldRetryAfterVisibility !== shouldRetryAfterVisibility ||
				this.#retryAfterVisibility !== retryAfterVisibility
			) {
				return;
			}
			this.#shouldRetryAfterVisibility = () => false;
			this.#retryAfterVisibility = () => {};
		};
	}

	start(index: number, seconds: number, metadata: TimerMetadata): number {
		this.timerStateInitialized = true;
		this.metadata = { ...this.metadata, [index]: metadata };
		const deadline = this.#lifecycle.startTimer(index, seconds);
		const jobId = this.#uuid();
		this.alerts = {
			...this.alerts,
			[index]: { jobId, status: 'arming' }
		};
		if (this.#mounted) this.#lifecycle.syncTimerActivity(true);
		this.#onChange();
		if (metadata.title && metadata.body && metadata.navigate) {
			void this.#push
				.schedule({
					id: jobId,
					deadline,
					durationSeconds: seconds,
					title: metadata.title,
					body: metadata.body,
					navigate: metadata.navigate
				})
				.then((result) => {
					if (this.alerts[index]?.jobId !== jobId) return;
					this.alerts = {
						...this.alerts,
						[index]: {
							jobId,
							status: result.status === 'armed' ? 'armed' : 'foreground-only'
						}
					};
					this.#onChange();
				});
		} else {
			this.alerts = {
				...this.alerts,
				[index]: { jobId, status: 'foreground-only' }
			};
		}
		return deadline;
	}

	cancel(index: number): void {
		this.timerStateInitialized = true;
		this.#lifecycle.cancelTimer(index);
		const metadata = { ...this.metadata };
		delete metadata[index];
		this.metadata = metadata;
		const alert = this.alerts[index];
		if (alert?.jobId) {
			this.alerts = {
				...this.alerts,
				[index]: { ...alert, status: 'cancel-pending' }
			};
			void this.#push.cancel(alert.jobId).then((result) => {
				if (
					result.status !== 'cancelled' ||
					this.alerts[index]?.jobId !== alert.jobId
				) {
					return;
				}
				const alerts = { ...this.alerts };
				delete alerts[index];
				this.alerts = alerts;
				this.#onChange();
			});
		} else if (alert) {
			const alerts = { ...this.alerts };
			delete alerts[index];
			this.alerts = alerts;
		}
		if (this.#mounted) this.#lifecycle.syncTimerActivity(this.timers.anyRunning);
		this.#onChange();
	}

	restore(
		ends: Record<number, number>,
		order: number[],
		metadata: Record<number, TimerMetadata> = {},
		alerts: Record<number, CookTimerAlert> = {},
		persist = true
	): void {
		this.timers.restore(ends, order, this.#now());
		this.timerStateInitialized = true;
		this.metadata = { ...metadata };
		this.alerts = { ...alerts };
		if (this.#mounted) this.#lifecycle.syncTimerActivity(this.timers.anyRunning);
		if (persist) this.#onChange();
	}

	reset(): void {
		this.timerStateInitialized = true;
		const pending: Record<number, CookTimerAlert> = {};
		for (const [rawIndex, alert] of Object.entries(this.alerts)) {
			if (!alert.jobId) continue;
			const index = Number(rawIndex);
			pending[index] = { ...alert, status: 'cancel-pending' };
			void this.#push
				.cancel(alert.jobId)
				.then((result) => {
					if (
						result.status !== 'cancelled' ||
						this.alerts[index]?.jobId !== alert.jobId
					) {
						return;
					}
					const alerts = { ...this.alerts };
					delete alerts[index];
					this.alerts = alerts;
					this.#onChange();
				})
				.catch(() => {});
		}
		this.metadata = {};
		this.alerts = pending;
		this.#lifecycle.resetTimers();
		if (this.#mounted) this.#lifecycle.syncTimerActivity(false);
		this.#onChange();
	}

	destroy(): void {
		this.#lifecycle.destroy();
	}

	retryPendingCancellations(): void {
		for (const [rawIndex, alert] of Object.entries(this.alerts)) {
			if (alert.status !== 'cancel-pending' || !alert.jobId) continue;
			const index = Number(rawIndex);
			void this.#push.cancel(alert.jobId).then((result) => {
				if (
					result.status !== 'cancelled' ||
					this.alerts[index]?.jobId !== alert.jobId
				) {
					return;
				}
				const alerts = { ...this.alerts };
				delete alerts[index];
				this.alerts = alerts;
				this.#onChange();
			});
		}
	}
}

export class CookTimerCoordinator {
	sessions = $state<Record<string, CookTimerSession>>({});
	pushState = $state<TimerPushState>({ status: 'checking' });
	readonly visibleTimers = $derived.by<VisibleCookTimer[]>(() =>
		Object.values(this.sessions)
			.flatMap((session) =>
				session.timers.order.map((index) => {
					const deadline = session.timers.ends[index];
					const done = deadline <= session.timers.now;
					return {
						sessionKey: session.identity.key,
						index,
						recipeSlug: session.identity.recipeSlug,
						recipeTitle: session.identity.recipeTitle,
						label: session.metadata[index]?.label ?? session.identity.recipeTitle,
						deadline,
						done,
						remainingSeconds: Math.max(
							0,
							Math.ceil((deadline - session.timers.now) / 1_000)
						)
					};
				})
			)
			.sort((left, right) => left.deadline - right.deadline)
	);

	readonly #browser: CookTimerCoordinatorBrowserAdapters;
	readonly #storage: CookTimerCoordinatorStorage | null;
	readonly #storageKey: string;
	readonly #push: CookTimerCoordinatorPushClient;
	readonly #uuid: () => string;
	#mounted = false;
	#destroyed = false;
	#pushRequestToken = 0;
	#removeServiceWorkerListener: (() => void) | null = null;

	constructor(options: CookTimerCoordinatorOptions) {
		this.#browser = options.browser;
		this.#storage = options.storage ?? null;
		this.#storageKey = options.storageKey ?? 'cook-timer-registry:v1';
		this.#push = options.push ?? createTimerPushClient();
		this.#uuid = options.uuid ?? (() => crypto.randomUUID());
		this.#restore();
	}

	mount(): void {
		if (this.#mounted || this.#destroyed) return;
		this.#mounted = true;
		for (const session of Object.values(this.sessions)) session.mount();
		void this.inspectPush();
		if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
			const listener = (event: MessageEvent) => {
				if (event.data?.type === 'timer-push-subscription-changed') {
					void this.inspectPush();
				}
			};
			navigator.serviceWorker.addEventListener('message', listener);
			this.#removeServiceWorkerListener = () =>
				navigator.serviceWorker.removeEventListener('message', listener);
		}
	}

	session(identity: CookTimerSessionIdentity): CookTimerSession {
		const existing = this.sessions[identity.key];
		if (existing) {
			existing.updateIdentity(identity);
			return existing;
		}
		const session = new CookTimerSession(
			identity,
			this.#browser,
			this.#push,
			this.#uuid,
			() => this.#persist()
		);
		this.sessions = { ...this.sessions, [identity.key]: session };
		if (this.#mounted) session.mount();
		this.#persist();
		return session;
	}

	cancel(sessionKey: string, index: number): void {
		this.sessions[sessionKey]?.cancel(index);
	}

	async inspectPush(): Promise<TimerPushState> {
		const token = ++this.#pushRequestToken;
		this.pushState = { status: 'checking' };
		const state = await this.#push.inspect();
		if (token === this.#pushRequestToken) this.pushState = state;
		return state;
	}

	async enablePush(): Promise<TimerPushState> {
		const token = ++this.#pushRequestToken;
		this.pushState = { status: 'checking' };
		const state = await this.#push.enable();
		if (token === this.#pushRequestToken) this.pushState = state;
		return state;
	}

	sendTest(onUpdate?: (result: TimerTestResult) => void): Promise<TimerTestResult> {
		return this.#push.sendTest(onUpdate);
	}

	destroy(): void {
		if (this.#destroyed) return;
		this.#destroyed = true;
		this.#pushRequestToken += 1;
		this.#removeServiceWorkerListener?.();
		this.#removeServiceWorkerListener = null;
		for (const session of Object.values(this.sessions)) session.destroy();
	}

	#persist(): void {
		try {
			this.#storage?.setItem(
				this.#storageKey,
				JSON.stringify({
					v: 1,
					sessions: Object.values(this.sessions).map((session) => ({
						...session.identity,
						ends: session.timers.ends,
						order: session.timers.order,
						metadata: session.metadata,
						alerts: session.alerts
					}))
				})
			);
		} catch {
			// The live coordinator remains usable when browser storage is unavailable.
		}
	}

	#restore(): void {
		let raw: unknown;
		try {
			const saved = this.#storage?.getItem(this.#storageKey);
			if (!saved) return;
			raw = JSON.parse(saved);
		} catch {
			this.#clearPersisted();
			return;
		}
		if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
			this.#clearPersisted();
			return;
		}
		const registry = raw as { v?: unknown; sessions?: unknown };
		if (registry.v !== 1 || !Array.isArray(registry.sessions) || registry.sessions.length > 50) {
			this.#clearPersisted();
			return;
		}
		const now = this.#browser.now();
		const sessions: Record<string, CookTimerSession> = {};
		for (const value of registry.sessions) {
			const restored = readPersistedSession(value, now);
			if (!restored || sessions[restored.identity.key]) continue;
			const session = new CookTimerSession(
				restored.identity,
				this.#browser,
				this.#push,
				this.#uuid,
				() => this.#persist()
			);
			session.restore(restored.ends, restored.order, restored.metadata, restored.alerts, false);
			sessions[restored.identity.key] = session;
		}
		this.sessions = sessions;
		this.#persist();
	}

	#clearPersisted(): void {
		try {
			this.#storage?.removeItem(this.#storageKey);
		} catch {
			// Invalid optional persistence does not affect the live coordinator.
		}
	}
}

function readPersistedSession(
	value: unknown,
	now: number
): {
	identity: CookTimerSessionIdentity;
	ends: Record<number, number>;
	order: number[];
	metadata: Record<number, TimerMetadata>;
	alerts: Record<number, CookTimerAlert>;
} | null {
	if (value == null || typeof value !== 'object' || Array.isArray(value)) return null;
	const saved = value as Record<string, unknown>;
	if (
		typeof saved.key !== 'string' ||
		saved.key.length === 0 ||
		saved.key.length > 160 ||
		typeof saved.recipeSlug !== 'string' ||
		!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(saved.recipeSlug) ||
		typeof saved.recipeTitle !== 'string' ||
		saved.recipeTitle.length === 0 ||
		saved.recipeTitle.length > 160 ||
		saved.ends == null ||
		typeof saved.ends !== 'object' ||
		Array.isArray(saved.ends) ||
		!Array.isArray(saved.order) ||
		saved.metadata == null ||
		typeof saved.metadata !== 'object' ||
		Array.isArray(saved.metadata) ||
		(saved.alerts != null &&
			(typeof saved.alerts !== 'object' || Array.isArray(saved.alerts)))
	) {
		return null;
	}
	const order = saved.order;
	if (
		order.length > 100 ||
		order.some((index) => !Number.isInteger(index) || (index as number) < 0) ||
		new Set(order).size !== order.length
	) {
		return null;
	}
	const ends: Record<number, number> = {};
	const metadata: Record<number, TimerMetadata> = {};
	const alerts: Record<number, CookTimerAlert> = {};
	for (const rawIndex of order) {
		const index = rawIndex as number;
		const deadline = (saved.ends as Record<string, unknown>)[String(index)];
		const rawMetadata = (saved.metadata as Record<string, unknown>)[String(index)];
		if (
			typeof deadline !== 'number' ||
			!Number.isFinite(deadline) ||
			deadline < now - 5 * 60_000 ||
			deadline > now + 12 * 60 * 60_000 ||
			rawMetadata == null ||
			typeof rawMetadata !== 'object' ||
			typeof (rawMetadata as Record<string, unknown>).label !== 'string' ||
			((rawMetadata as Record<string, unknown>).label as string).length > 80
		) {
			return null;
		}
		ends[index] = deadline;
		metadata[index] = {
			label: (rawMetadata as Record<string, string>).label,
			...(typeof (rawMetadata as Record<string, unknown>).title === 'string'
				? { title: (rawMetadata as Record<string, string>).title }
				: {}),
			...(typeof (rawMetadata as Record<string, unknown>).body === 'string'
				? { body: (rawMetadata as Record<string, string>).body }
				: {}),
			...(typeof (rawMetadata as Record<string, unknown>).navigate === 'string'
				? { navigate: (rawMetadata as Record<string, string>).navigate }
				: {})
		};
	}
	for (const [rawIndex, rawAlert] of Object.entries(
		(saved.alerts as Record<string, unknown> | undefined) ?? {}
	)) {
		const index = Number(rawIndex);
		const alert = readPersistedAlert(rawAlert);
		if (
			!Number.isInteger(index) ||
			index < 0 ||
			!alert ||
			(!order.includes(index) && alert.status !== 'cancel-pending')
		) {
			return null;
		}
		alerts[index] = alert;
	}
	return {
		identity: {
			key: saved.key,
			recipeSlug: saved.recipeSlug,
			recipeTitle: saved.recipeTitle
		},
		ends,
		order: order as number[],
		metadata,
		alerts
	};
}

function readPersistedAlert(value: unknown): CookTimerAlert | null {
	if (value == null || typeof value !== 'object' || Array.isArray(value)) return null;
	const alert = value as Record<string, unknown>;
	if (
		typeof alert.jobId !== 'string' ||
		alert.jobId.length === 0 ||
		(alert.status !== 'arming' &&
			alert.status !== 'armed' &&
			alert.status !== 'foreground-only' &&
			alert.status !== 'cancel-pending')
	) {
		return null;
	}
	return { jobId: alert.jobId, status: alert.status };
}
