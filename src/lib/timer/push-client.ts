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

		async sendTest(): Promise<boolean> {
			if (!subscriptionId) return false;
			try {
				const response = await adapters.fetch(`${base}/api/timer-alerts/test`, {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ subscriptionId })
				});
				return response.ok;
			} catch {
				return false;
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
		}
	};
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
