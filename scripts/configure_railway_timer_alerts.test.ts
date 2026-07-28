import { createECDH } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
	configureRailwayTimerAlerts,
	type RailwayRunner
} from './configure_railway_timer_alerts';

const options = {
	project: 'project-id',
	environment: 'production',
	service: 'service-id',
	subject: 'https://example.com'
};

describe('Railway timer-alert configuration', () => {
	it('passes a canonical private scalar through stdin only', () => {
		const key = createECDH('prime256v1');
		key.generateKeys();
		const privateKey = key.getPrivateKey().toString('base64url');
		const calls: Array<{ args: string[]; input?: Buffer; env: NodeJS.ProcessEnv }> = [];
		const runner: RailwayRunner = ({ args, input, env }) => {
			calls.push({ args, input: input ? Buffer.from(input) : undefined, env });
			return { status: 0, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) };
		};
		const environment = {
			VAPID_PRIVATE_KEY: privateKey,
			APPDATA: process.env.APPDATA,
			PATH: process.env.PATH,
			OP_SERVICE_ACCOUNT_TOKEN: 'must-not-reach-railway'
		};

		configureRailwayTimerAlerts(options, environment, runner);

		expect(calls).toHaveLength(2);
		if (process.platform === 'win32') {
			expect(calls[0]?.args[0]).toMatch(/@railway[\\/]cli[\\/]bin[\\/]railway\.js$/);
		}
		expect(calls[0]?.args).toContain('VAPID_SUBJECT=https://example.com');
		expect(calls[1]?.args).toContain('VAPID_PRIVATE_KEY');
		expect(calls[1]?.args).toContain('--stdin');
		expect(calls.flatMap((call) => call.args)).not.toContain(privateKey);
		expect(calls[1]?.input?.toString('utf8')).toBe(privateKey);
		expect(calls.every((call) => call.env.VAPID_PRIVATE_KEY === undefined)).toBe(true);
		expect(calls.every((call) => call.env.OP_SERVICE_ACCOUNT_TOKEN === undefined)).toBe(true);
		expect(environment.VAPID_PRIVATE_KEY).toBeUndefined();
	});

	it('does not expose child output when Railway fails', () => {
		const key = createECDH('prime256v1');
		key.generateKeys();
		const privateKey = key.getPrivateKey().toString('base64url');
		const secretOutput = Buffer.from(privateKey);
		const runner: RailwayRunner = () => ({
			status: 1,
			stdout: secretOutput,
			stderr: Buffer.from(privateKey)
		});

		expect(() =>
			configureRailwayTimerAlerts(
				options,
				{ VAPID_PRIVATE_KEY: privateKey, APPDATA: process.env.APPDATA },
				runner
			)
		).toThrow('Railway timer-alert configuration failed.');
		expect(secretOutput.every((byte) => byte === 0)).toBe(true);
	});

	it('rejects invalid keys and unsafe routing arguments before invoking Railway', () => {
		const runner: RailwayRunner = () => {
			throw new Error('should not run');
		};

		expect(() =>
			configureRailwayTimerAlerts(options, { VAPID_PRIVATE_KEY: 'not-a-key' }, runner)
		).toThrow('VAPID_PRIVATE_KEY is missing or invalid.');
		expect(() =>
			configureRailwayTimerAlerts(
				{ ...options, service: 'service;Remove-Item' },
				{ VAPID_PRIVATE_KEY: 'unused' },
				runner
			)
		).toThrow('simple identifiers');
	});
});
