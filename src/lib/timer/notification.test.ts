import { describe, expect, it } from 'vitest';
import {
	buildDeclarativeTimerNotification,
	buildTimerNotification,
	parseTimerAlertPushPayload
} from './notification';

describe('timer push notification', () => {
	it('keeps timer alerts audible even when the payload asks for silence', () => {
		const payload = parseTimerAlertPushPayload({
			web_push: 8030,
			mutable: true,
			notification: {
				title: 'TIMER',
				body: 'Turn off the oven',
				navigate: '/recipes/roast',
				tag: 'cook-timer-job-id',
				renotify: false,
				silent: true,
				requireInteraction: true,
				timestamp: 20_000,
				data: { timerJobId: 'job-id', navigate: '/recipes/roast' }
			}
		});

		expect(payload).not.toBeNull();
		expect(buildTimerNotification(payload!)).toEqual({
			title: 'TIMER',
			options: expect.objectContaining({
				body: 'Turn off the oven',
				tag: 'cook-timer-job-id',
				silent: false,
				renotify: false,
				requireInteraction: true,
				data: { timerJobId: 'job-id', navigate: '/recipes/roast' },
				vibrate: [200, 100, 200, 100, 200]
			})
		});
	});

	it('rejects malformed or cross-origin navigation payloads', () => {
		expect(parseTimerAlertPushPayload({ web_push: 8030 })).toBeNull();
		expect(
			parseTimerAlertPushPayload({
				web_push: 8030,
				notification: {
					title: 'Timer',
					body: 'Done',
					navigate: 'https://example.com/steal',
					data: { timerJobId: 'job-id' }
				}
			})
		).toBeNull();
	});

	it('renders a browser-parsed declarative notification instead of the generic fallback', () => {
		expect(
			buildDeclarativeTimerNotification({
				title: 'OVEN · LEFT',
				body: 'Remove the tray',
				tag: 'cook-timer-declarative',
				renotify: false,
				silent: true,
				requireInteraction: true,
				timestamp: 30_000,
				data: { timerJobId: 'declarative-id', navigate: '/recipes/roast' }
			})
		).toEqual({
			title: 'OVEN · LEFT',
			options: expect.objectContaining({
				body: 'Remove the tray',
				tag: 'cook-timer-declarative',
				silent: false,
				data: { timerJobId: 'declarative-id', navigate: '/recipes/roast' }
			})
		});
	});
});
