export type TimerAlertPushPayload = {
	web_push: 8030;
	mutable: boolean;
	notification: {
		title: string;
		body: string;
		navigate: string;
		tag: string;
		renotify: boolean;
		silent: boolean;
		requireInteraction: boolean;
		timestamp: number;
		data: {
			timerJobId: string;
			navigate: string;
		};
	};
};

export type TimerNotificationOptions = NotificationOptions & {
	renotify?: boolean;
	timestamp?: number;
	vibrate?: number[];
};

export function parseTimerAlertPushPayload(value: unknown): TimerAlertPushPayload | null {
	if (value == null || typeof value !== 'object' || Array.isArray(value)) return null;
	const payload = value as Record<string, unknown>;
	if (payload.web_push !== 8030) return null;
	const rawNotification = payload.notification;
	if (
		rawNotification == null ||
		typeof rawNotification !== 'object' ||
		Array.isArray(rawNotification)
	) {
		return null;
	}
	const notification = rawNotification as Record<string, unknown>;
	const rawData = notification.data;
	if (rawData == null || typeof rawData !== 'object' || Array.isArray(rawData)) return null;
	const data = rawData as Record<string, unknown>;
	if (
		typeof notification.title !== 'string' ||
		notification.title.length === 0 ||
		typeof notification.body !== 'string' ||
		typeof notification.navigate !== 'string' ||
		!validNavigate(notification.navigate) ||
		typeof notification.tag !== 'string' ||
		typeof data.timerJobId !== 'string' ||
		typeof data.navigate !== 'string' ||
		data.navigate !== notification.navigate
	) {
		return null;
	}
	return {
		web_push: 8030,
		mutable: payload.mutable === true,
		notification: {
			title: notification.title,
			body: notification.body,
			navigate: notification.navigate,
			tag: notification.tag,
			renotify: notification.renotify === true,
			silent: notification.silent === true,
			requireInteraction: notification.requireInteraction === true,
			timestamp:
				typeof notification.timestamp === 'number' ? notification.timestamp : Date.now(),
			data: {
				timerJobId: data.timerJobId,
				navigate: data.navigate
			}
		}
	};
}

export function buildTimerNotification(
	payload: TimerAlertPushPayload
): { title: string; options: TimerNotificationOptions } {
	const { notification } = payload;
	return {
		title: notification.title,
		options: {
			body: notification.body,
			tag: notification.tag,
			renotify: notification.renotify,
			silent: false,
			requireInteraction: notification.requireInteraction,
			timestamp: notification.timestamp,
			data: notification.data,
			vibrate: [200, 100, 200, 100, 200]
		}
	};
}

export function buildDeclarativeTimerNotification(
	value: unknown
): { title: string; options: TimerNotificationOptions } | null {
	if (value == null || typeof value !== 'object') return null;
	const notification = value as Record<string, unknown>;
	const rawData = notification.data;
	if (rawData == null || typeof rawData !== 'object' || Array.isArray(rawData)) return null;
	const data = rawData as Record<string, unknown>;
	if (
		typeof notification.title !== 'string' ||
		notification.title.length === 0 ||
		typeof data.timerJobId !== 'string' ||
		typeof data.navigate !== 'string' ||
		!validNavigate(data.navigate)
	) {
		return null;
	}
	return buildTimerNotification({
		web_push: 8030,
		mutable: true,
		notification: {
			title: notification.title,
			body: typeof notification.body === 'string' ? notification.body : '',
			navigate: data.navigate,
			tag:
				typeof notification.tag === 'string' && notification.tag.length > 0
					? notification.tag
					: `cook-timer-${data.timerJobId}`,
			renotify: notification.renotify === true,
			silent: false,
			requireInteraction: notification.requireInteraction === true,
			timestamp:
				typeof notification.timestamp === 'number' ? notification.timestamp : Date.now(),
			data: { timerJobId: data.timerJobId, navigate: data.navigate }
		}
	});
}

function validNavigate(value: string): boolean {
	return value === '/' || /^\/recipes\/[A-Za-z0-9][A-Za-z0-9_-]*(?:[/?#][^\s]*)?$/.test(value);
}
