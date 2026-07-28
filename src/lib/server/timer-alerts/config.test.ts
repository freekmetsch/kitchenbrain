import { describe, expect, it } from 'vitest';
import { createECDH } from 'node:crypto';
import { readTimerAlertVapidConfig } from './config';

function generatePrivateKey(): { privateKey: string; publicKey: string } {
	const key = createECDH('prime256v1');
	key.generateKeys();
	const scalar = key.getPrivateKey();
	return {
		privateKey: Buffer.concat([Buffer.alloc(32 - scalar.length), scalar]).toString('base64url'),
		publicKey: key.getPublicKey().toString('base64url')
	};
}

describe('timer alert VAPID configuration', () => {
	it('keeps foreground timers available when configuration is incomplete', () => {
		expect(
			readTimerAlertVapidConfig({
				VAPID_PUBLIC_KEY: 'partial-public-key',
				VAPID_PRIVATE_KEY: undefined,
				VAPID_SUBJECT: 'mailto:timers@example.com'
			})
		).toEqual({ enabled: false, reason: 'missing' });
	});

	it('derives the public application-server key from one stored private key', () => {
		const { privateKey, publicKey } = generatePrivateKey();

		expect(
			readTimerAlertVapidConfig({
				VAPID_PRIVATE_KEY: privateKey,
				VAPID_SUBJECT: 'https://example.com/contact'
			})
		).toMatchObject({
			enabled: true,
			config: {
				privateKey,
				subject: 'https://example.com/contact',
				publicKey
			}
		});
	});

	it('rejects a base64url scalar that is not exactly 32 bytes', () => {
		expect(
			readTimerAlertVapidConfig({
				VAPID_PRIVATE_KEY: Buffer.alloc(31, 1).toString('base64url'),
				VAPID_SUBJECT: 'mailto:timers@example.com'
			})
		).toEqual({ enabled: false, reason: 'invalid' });
	});
});
