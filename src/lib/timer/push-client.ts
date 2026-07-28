import { base } from '$app/paths';

export type TimerPushStatus =
	| 'checking'
	| 'ready'
	| 'permission-needed'
	| 'needs-install'
	| 'blocked'
	| 'server-unavailable'
	| 'unsupported'
	| 'error';

export type TimerPushState = {
	status: TimerPushStatus;
	subscriptionId?: string;
};

export type TimerTestStage =
	| 'provider-accepted'
	| 'worker-received'
	| 'notification-shown'
	| 'display-failed'
	| 'unconfirmed'
	| 'rate-limited'
	| 'failed';

export type TimerTestResult = {
	id?: string;
	stage: TimerTestStage;
	displayError?: string | null;
};

type BrowserPushSubscription = {
	endpoint: string;
	toJSON(): {
		endpoint?: string;
		keys?: { p256dh?: string; auth?: string };
	};
};

type TimerPushClientAdapters = {
	fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
	notificationPermission(): NotificationPermission | 'unsupported';
	requestNotificationPermission(): Promise<NotificationPermission>;
	isIos(): boolean;
	isStandalone(): boolean;
	getSubscription(): Promise<BrowserPushSubscription | null>;
	subscribe(applicationServerKey: ArrayBuffer): Promise<BrowserPushSubscription>;
	deviceLabel(): string;
	sleep(delayMs: number): Promise<void>;
};

export type TimerPushScheduleInput = {
	id: string;
	deadline: number;
	durationSeconds: number;
	title: string;
	body: string;
	navigate: string;
};

export function createTimerPushClient(
	overrides: Partial<TimerPushClientAdapters> = {}
) {
	const adapters = { ...defaultAdapters(), ...overrides };
	let subscriptionId: string | null = null;

	async function readServerReadiness(): Promise<
		{ enabled: true; publicKey: string } | { enabled: false }
	> {
		const response = await adapters.fetch(`${base}/api/timer-alerts/readiness`);
		if (!response.ok) return { enabled: false };
		const value = (await response.json()) as {
			enabled?: unknown;
			publicKey?: unknown;
		};
		if (value.enabled !== true || typeof value.publicKey !== 'string') {
			return { enabled: false };
		}
		return { enabled: true, publicKey: value.publicKey };
	}

	async function persistSubscription(
		subscription: BrowserPushSubscription,
		previousEndpoint?: string
	): Promise<string> {
		const serialized = subscription.toJSON();
		if (
			typeof serialized.endpoint !== 'string' ||
			typeof serialized.keys?.p256dh !== 'string' ||
			typeof serialized.keys.auth !== 'string'
		) {
			throw new Error('Push subscription is incomplete');
		}
		const response = await adapters.fetch(`${base}/api/timer-alerts/subscription`, {
			method: 'PUT',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				endpoint: serialized.endpoint,
				keys: {
					p256dh: serialized.keys.p256dh,
					auth: serialized.keys.auth
				},
				...(previousEndpoint ? { previousEndpoint } : {}),
				deviceLabel: adapters.deviceLabel()
			})
		});
		if (!response.ok) throw new Error('Push subscription was not accepted');
		const value = (await response.json()) as { id?: unknown };
		if (typeof value.id !== 'string') throw new Error('Push subscription response is invalid');
		subscriptionId = value.id;
		return value.id;
	}

	return {
		async inspect(): Promise<TimerPushState> {
			try {
				if (adapters.notificationPermission() === 'unsupported') {
					return { status: 'unsupported' };
				}
				if (adapters.isIos() && !adapters.isStandalone()) {
					return { status: 'needs-install' };
				}
				const readiness = await readServerReadiness();
				if (!readiness.enabled) return { status: 'server-unavailable' };
				const permission = adapters.notificationPermission();
				if (permission === 'denied') return { status: 'blocked' };
				if (permission !== 'granted') return { status: 'permission-needed' };
				const existing = await adapters.getSubscription();
				const subscription =
					existing ?? (await adapters.subscribe(base64UrlToBuffer(readiness.publicKey)));
				const id = await persistSubscription(subscription);
				return id
					? { status: 'ready', subscriptionId: id }
					: { status: 'error' };
			} catch {
				return { status: 'error' };
			}
		},

		async enable(): Promise<TimerPushState> {
			try {
				if (adapters.notificationPermission() === 'unsupported') {
					return { status: 'unsupported' };
				}
				if (adapters.isIos() && !adapters.isStandalone()) {
					return { status: 'needs-install' };
				}
				const readiness = await readServerReadiness();
				if (!readiness.enabled) return { status: 'server-unavailable' };
				const permission =
					adapters.notificationPermission() === 'granted'
						? 'granted'
						: await adapters.requestNotificationPermission();
				if (permission === 'denied') return { status: 'blocked' };
				if (permission !== 'granted') return { status: 'permission-needed' };
				const existing = await adapters.getSubscription();
				const subscription =
					existing ?? (await adapters.subscribe(base64UrlToBuffer(readiness.publicKey)));
				const id = await persistSubscription(subscription);
				return { status: 'ready', subscriptionId: id };
			} catch {
				return { status: 'error' };
			}
		},

		async sendTest(
			onUpdate?: (result: TimerTestResult) => void
		): Promise<TimerTestResult> {
			if (!subscriptionId) return { stage: 'failed' };
			try {
				const response = await adapters.fetch(`${base}/api/timer-alerts/test`, {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ subscriptionId })
				});
				if (response.status === 429) return { stage: 'rate-limited' };
				if (!response.ok) return { stage: 'failed' };
				const accepted = (await response.json()) as { id?: unknown; stage?: unknown };
				if (
					typeof accepted.id !== 'string' ||
					accepted.stage !== 'provider-accepted'
				) {
					return { stage: 'failed' };
				}
				let current: TimerTestResult = {
					id: accepted.id,
					stage: 'provider-accepted'
				};
				onUpdate?.(current);
				for (let attempt = 0; attempt < 15; attempt += 1) {
					if (attempt > 0) {
						await adapters.sleep(
							Math.min(5_000, 1_000 * 2 ** (attempt - 1))
						);
					}
					const statusResponse = await adapters.fetch(
						`${base}/api/timer-alerts/jobs/${encodeURIComponent(accepted.id)}`
					);
					if (
						statusResponse.status === 401 ||
						statusResponse.status === 403 ||
						statusResponse.status === 404
					) {
						return { id: accepted.id, stage: 'failed' };
					}
					if (!statusResponse.ok) continue;
					const value = (await statusResponse.json()) as {
						stage?: unknown;
						displayError?: unknown;
					};
					if (!isTimerTestStage(value.stage)) continue;
					const next: TimerTestResult = {
						id: accepted.id,
						stage: value.stage,
						displayError:
							typeof value.displayError === 'string' ? value.displayError : null
					};
					if (next.stage !== current.stage) onUpdate?.(next);
					current = next;
					if (
						current.stage === 'notification-shown' ||
						current.stage === 'display-failed' ||
						current.stage === 'failed'
					) {
						return current;
					}
				}
				const unconfirmed = { id: accepted.id, stage: 'unconfirmed' as const };
				onUpdate?.(unconfirmed);
				return unconfirmed;
			} catch {
				return { stage: 'failed' };
			}
		},

		async schedule(input: TimerPushScheduleInput): Promise<{ status: 'armed' | 'foreground-only' }> {
			if (!subscriptionId) return { status: 'foreground-only' };
			try {
				const response = await adapters.fetch(
					`${base}/api/timer-alerts/jobs/${encodeURIComponent(input.id)}`,
					{
						method: 'PUT',
						headers: { 'content-type': 'application/json' },
						body: JSON.stringify({
							subscriptionId,
							deadline: input.deadline,
							durationSeconds: input.durationSeconds,
							title: input.title,
							body: input.body,
							navigate: input.navigate
						})
					}
				);
				return response.ok ? { status: 'armed' } : { status: 'foreground-only' };
			} catch {
				return { status: 'foreground-only' };
			}
		},

		async cancel(id: string): Promise<{ status: 'cancelled' | 'cancel-pending' }> {
			try {
				const response = await adapters.fetch(
					`${base}/api/timer-alerts/jobs/${encodeURIComponent(id)}`,
					{ method: 'DELETE' }
				);
				return response.ok ? { status: 'cancelled' } : { status: 'cancel-pending' };
			} catch {
				return { status: 'cancel-pending' };
			}
		}
	};
}

function defaultAdapters(): TimerPushClientAdapters {
	const registration = async () => {
		if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
			throw new Error('Service workers are unsupported');
		}
		return navigator.serviceWorker.ready;
	};
	return {
		fetch: (input, init) => fetch(input, init),
		notificationPermission: () =>
			typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
		requestNotificationPermission: () => Notification.requestPermission(),
		isIos: () => {
			if (typeof navigator === 'undefined') return false;
			return (
				/iPad|iPhone|iPod/.test(navigator.userAgent) ||
				(navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
			);
		},
		isStandalone: () => {
			if (typeof window === 'undefined') return false;
			const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };
			return (
				navigatorWithStandalone.standalone === true ||
				window.matchMedia('(display-mode: standalone)').matches
			);
		},
		getSubscription: async () => (await registration()).pushManager.getSubscription(),
		subscribe: async (applicationServerKey) =>
			(await registration()).pushManager.subscribe({
				userVisibleOnly: true,
				applicationServerKey
			}),
		deviceLabel: () => {
			if (typeof navigator === 'undefined') return 'Browser device';
			return /iPad|iPhone|iPod/.test(navigator.userAgent)
				? 'iPhone or iPad'
				: /Android/.test(navigator.userAgent)
					? 'Android device'
					: 'Browser device';
		},
		sleep: (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs))
	};
}

function isTimerTestStage(value: unknown): value is TimerTestStage {
	return (
		value === 'provider-accepted' ||
		value === 'worker-received' ||
		value === 'notification-shown' ||
		value === 'display-failed' ||
		value === 'failed'
	);
}

function base64UrlToBuffer(value: string): ArrayBuffer {
	const base64 = value.replaceAll('-', '+').replaceAll('_', '/');
	const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
	const binary = atob(padded);
	const buffer = new ArrayBuffer(binary.length);
	const bytes = new Uint8Array(buffer);
	for (let index = 0; index < binary.length; index += 1) {
		bytes[index] = binary.charCodeAt(index);
	}
	return buffer;
}
