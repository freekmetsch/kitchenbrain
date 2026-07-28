import { spawnSync } from 'node:child_process';
import { createECDH } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

type Environment = Record<string, string | undefined>;

type RailwayInvocation = {
	command: string;
	args: string[];
	input?: Buffer;
	env: NodeJS.ProcessEnv;
};

type RailwayResult = {
	status: number | null;
	stdout?: Buffer | string | null;
	stderr?: Buffer | string | null;
	error?: Error;
};

export type RailwayRunner = (invocation: RailwayInvocation) => RailwayResult;

export type TimerAlertRailwayOptions = {
	project: string;
	environment: string;
	service: string;
	subject: string;
};

const SAFE_IDENTIFIER = /^[A-Za-z0-9._-]{1,128}$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;

export function configureRailwayTimerAlerts(
	options: TimerAlertRailwayOptions,
	sourceEnvironment: Environment = process.env,
	runRailway: RailwayRunner = executeRailway
): void {
	validateOptions(options);
	const rawPrivateKey = sourceEnvironment.VAPID_PRIVATE_KEY?.trim();
	delete sourceEnvironment.VAPID_PRIVATE_KEY;
	if (!rawPrivateKey || !BASE64URL.test(rawPrivateKey)) {
		throw new Error('VAPID_PRIVATE_KEY is missing or invalid.');
	}

	let privateBytes: Buffer | undefined;
	let canonicalPrivateKey: Buffer | undefined;
	try {
		privateBytes = Buffer.from(rawPrivateKey, 'base64url');
		if (privateBytes.length !== 32) {
			throw new Error('VAPID_PRIVATE_KEY is missing or invalid.');
		}
		const key = createECDH('prime256v1');
		key.setPrivateKey(privateBytes);
		canonicalPrivateKey = Buffer.from(privateBytes.toString('base64url'), 'utf8');

		const commonArguments = [
			'--project',
			options.project,
			'--environment',
			options.environment,
			'--service',
			options.service,
			'--skip-deploys'
		];
		const childEnvironment = buildChildEnvironment(sourceEnvironment);
		const railway = resolveRailwayInvocation(sourceEnvironment);

		requireSuccess(
			runRailway({
				command: railway.command,
				args: [
					...railway.args,
					'variable',
					'set',
					`VAPID_SUBJECT=${options.subject}`,
					...commonArguments
				],
				env: childEnvironment
			})
		);
		requireSuccess(
			runRailway({
				command: railway.command,
				args: [
					...railway.args,
					'variable',
					'set',
					'VAPID_PRIVATE_KEY',
					'--stdin',
					...commonArguments
				],
				input: canonicalPrivateKey,
				env: childEnvironment
			})
		);
	} finally {
		privateBytes?.fill(0);
		canonicalPrivateKey?.fill(0);
	}
}

function validateOptions(options: TimerAlertRailwayOptions): void {
	for (const value of [options.project, options.environment, options.service]) {
		if (!SAFE_IDENTIFIER.test(value)) {
			throw new Error('Railway project, environment, and service must be simple identifiers.');
		}
	}
	if (!isValidSubject(options.subject)) {
		throw new Error('VAPID subject must be an HTTPS URL or mailto address.');
	}
}

function isValidSubject(subject: string): boolean {
	if (subject.startsWith('mailto:')) {
		return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(subject.slice('mailto:'.length));
	}
	try {
		return new URL(subject).protocol === 'https:';
	} catch {
		return false;
	}
}

function buildChildEnvironment(source: Environment): NodeJS.ProcessEnv {
	const child: NodeJS.ProcessEnv = {};
	const allowed = [
		'PATH',
		'Path',
		'PATHEXT',
		'SystemRoot',
		'SYSTEMROOT',
		'WINDIR',
		'COMSPEC',
		'TEMP',
		'TMP',
		'USERPROFILE',
		'HOME',
		'APPDATA',
		'LOCALAPPDATA',
		'RAILWAY_CALLER',
		'RAILWAY_AGENT_SESSION',
		'NO_COLOR',
		'FORCE_COLOR'
	];
	for (const name of allowed) {
		if (source[name] !== undefined) child[name] = source[name];
	}
	return child;
}

function resolveRailwayInvocation(
	source: Environment
): Pick<RailwayInvocation, 'command' | 'args'> {
	if (process.platform !== 'win32') {
		return { command: 'railway', args: [] };
	}
	const appData = source.APPDATA;
	if (!appData) throw new Error('Railway CLI installation could not be resolved.');
	const railwayEntry = join(
		appData,
		'npm',
		'node_modules',
		'@railway',
		'cli',
		'bin',
		'railway.js'
	);
	if (!existsSync(railwayEntry)) {
		throw new Error('Railway CLI installation could not be resolved.');
	}
	return { command: process.execPath, args: [railwayEntry] };
}

function executeRailway(invocation: RailwayInvocation): RailwayResult {
	const result = spawnSync(invocation.command, [...invocation.args], {
		input: invocation.input,
		env: invocation.env,
		windowsHide: true,
		stdio: ['pipe', 'pipe', 'pipe']
	});
	return {
		status: result.status,
		stdout: result.stdout,
		stderr: result.stderr,
		error: result.error
	};
}

function requireSuccess(result: RailwayResult): void {
	const failed = result.error || result.status !== 0;
	wipe(result.stdout);
	wipe(result.stderr);
	if (failed) throw new Error('Railway timer-alert configuration failed.');
}

function wipe(value: Buffer | string | null | undefined): void {
	if (Buffer.isBuffer(value)) value.fill(0);
}

function parseArguments(args: string[]): TimerAlertRailwayOptions {
	const values = new Map<string, string>();
	for (let index = 0; index < args.length; index += 2) {
		const flag = args[index];
		const value = args[index + 1];
		if (!flag || !value || !['--project', '--environment', '--service', '--subject'].includes(flag)) {
			throw new Error(
				'Usage: --project <id> --environment <name-or-id> --service <id> --subject <url>'
			);
		}
		if (values.has(flag)) throw new Error(`Duplicate option: ${flag}`);
		values.set(flag, value);
	}
	return {
		project: values.get('--project') ?? '',
		environment: values.get('--environment') ?? '',
		service: values.get('--service') ?? '',
		subject: values.get('--subject') ?? ''
	};
}

const isMain =
	process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
	try {
		configureRailwayTimerAlerts(parseArguments(process.argv.slice(2)));
		console.log('Railway timer-alert variables configured.');
	} catch (error) {
		console.error(error instanceof Error ? error.message : 'Railway timer-alert configuration failed.');
		process.exitCode = 1;
	}
}
