import { createECDH } from 'node:crypto';
import type { TimerAlertVapidConfig } from './push';

type TimerAlertEnvironment = Record<string, string | undefined>;

export type TimerAlertConfigResult =
	| { enabled: true; config: TimerAlertVapidConfig }
	| { enabled: false; reason: 'missing' | 'invalid' };

const BASE64URL = /^[A-Za-z0-9_-]+$/;

export function readTimerAlertVapidConfig(
	env: TimerAlertEnvironment = process.env
): TimerAlertConfigResult {
	const publicKey = env.VAPID_PUBLIC_KEY?.trim();
	const privateKey = env.VAPID_PRIVATE_KEY?.trim();
	const subject = env.VAPID_SUBJECT?.trim();
	if (!privateKey || !subject) return { enabled: false, reason: 'missing' };
	if (
		privateKey.length < 40 ||
		privateKey.length > 50 ||
		!BASE64URL.test(privateKey) ||
		!validSubject(subject)
	) {
		return { enabled: false, reason: 'invalid' };
	}
	try {
		const privateKeyBytes = Buffer.from(privateKey, 'base64url');
		if (privateKeyBytes.length !== 32) {
			return { enabled: false, reason: 'invalid' };
		}
		const key = createECDH('prime256v1');
		key.setPrivateKey(privateKeyBytes);
		const derivedPublicKey = key.getPublicKey().toString('base64url');
		if (
			publicKey &&
			(publicKey.length < 80 ||
				publicKey.length > 100 ||
				!BASE64URL.test(publicKey) ||
				Buffer.from(publicKey, 'base64url').length !== 65 ||
				publicKey !== derivedPublicKey)
		) {
			return { enabled: false, reason: 'invalid' };
		}
		return {
			enabled: true,
			config: { publicKey: publicKey ?? derivedPublicKey, privateKey, subject }
		};
	} catch {
		return { enabled: false, reason: 'invalid' };
	}
}

function validSubject(subject: string): boolean {
	if (subject.startsWith('mailto:')) {
		return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(subject.slice('mailto:'.length));
	}
	try {
		return new URL(subject).protocol === 'https:';
	} catch {
		return false;
	}
}
