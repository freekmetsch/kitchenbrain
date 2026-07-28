import { describe, expect, it } from 'vitest';
import {
	buildTimerNotification,
	parseTimerAlertPushPayload
} from './notification';

describe('timer push notification', () => {
	it('renders the declarative payload through the classic service-worker path', () => {
		const payload = parseTimerAlertPushPayload({
			web_push: 8030,
			mutable: true,
			notification: {
				title: 'TIMER',
				body: 'Turn off the oven',
				navigate: '/recipes/roast',
				tag: 'cook-timer-job-id',
				renotify: false,
				silent: false,
				requireInteraction: true,
				timestamp: 20_000,
				data: { timerJobId: 'job-id', navigate: '/recipes/roast' }
			}
		});

		expect(payload).not.toBeNull();
		expect(buildTimerNotification(payload!, true)).toEqual({
			title: 'TIMER',
			options: expect.objectContaining({
				body: 'Turn off the oven',
				tag: 'cook-timer-job-id',
				silent: true,
				renotify: false,
				requireInteraction: true,
				data: { timerJobId: 'job-id', navigate: '/recipes/roast' }
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
});
