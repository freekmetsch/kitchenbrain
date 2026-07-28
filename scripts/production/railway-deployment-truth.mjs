import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const PROJECT_ID = 'a8fd74d7-2c0e-4d95-a310-7c13dc1c7936';
const ENVIRONMENT = 'production';
const SERVICE = 'household-brain';

if (process.argv.includes('--validate-only')) {
	process.stdout.write('RAILWAY-DEPLOYMENT-TRUTH-VALID\n');
	process.exit(0);
}

function run(command, args, extraEnv = {}) {
	let executable = command;
	let invocationArgs = args;
	if (process.platform === 'win32' && command === 'railway') {
		const railwayScript = join(
			process.env.APPDATA ?? '',
			'npm',
			'node_modules',
			'@railway',
			'cli',
			'bin',
			'railway.js'
		);
		if (!existsSync(railwayScript)) throw new Error('Railway CLI entry point is missing');
		executable = process.execPath;
		invocationArgs = [railwayScript, ...args];
	}
	const result = spawnSync(executable, invocationArgs, {
		encoding: 'utf8',
		env: { ...process.env, ...extraEnv },
		windowsHide: true,
		timeout: 30_000
	});
	if (result.error || result.status !== 0) {
		throw new Error(`${command} failed`);
	}
	return result.stdout;
}

function findString(value, names, depth = 0) {
	if (!value || typeof value !== 'object' || depth > 8) return null;
	for (const [key, child] of Object.entries(value)) {
		if (names.has(key) && typeof child === 'string' && child.length > 0) return child;
	}
	for (const child of Object.values(value)) {
		const found = findString(child, names, depth + 1);
		if (found) return found;
	}
	return null;
}

try {
	const deployments = JSON.parse(
		run(
			'railway',
			[
				'deployment',
				'list',
				'--project',
				PROJECT_ID,
				'--environment',
				ENVIRONMENT,
				'--service',
				SERVICE,
				'--limit',
				'1',
				'--json'
			],
			{
				RAILWAY_CALLER: 'repo:household-brain/deployment-truth',
				RAILWAY_AGENT_SESSION: 'household-brain-production-verification'
			}
		)
	);
	const deployment = Array.isArray(deployments) ? deployments[0] : null;
	if (!deployment) throw new Error('No deployment found');

	const remoteLine = run('git', ['ls-remote', 'origin', 'refs/heads/main']).trim();
	const remoteMainCommit = remoteLine.split(/\s+/)[0] || null;
	const branch = findString(deployment.meta, new Set(['branch', 'sourceBranch']));
	const deployedCommit = findString(
		deployment.meta,
		new Set(['commitHash', 'commitSha', 'revision', 'sha'])
	);
	const repository = findString(deployment.meta, new Set(['repo', 'repository', 'repositoryName']));
	const exactMain =
		deployment.status === 'SUCCESS' &&
		branch === 'main' &&
		Boolean(remoteMainCommit) &&
		deployedCommit === remoteMainCommit;

	process.stdout.write(
		`${JSON.stringify(
			{
				projectId: PROJECT_ID,
				environment: ENVIRONMENT,
				service: SERVICE,
				deploymentId: deployment.id ?? null,
				status: deployment.status ?? null,
				createdAt: deployment.createdAt ?? null,
				repository,
				branch,
				deployedCommit,
				remoteMainCommit,
				exactMain
			},
			null,
			2
		)}\n`
	);
} catch {
	process.stderr.write('RAILWAY-DEPLOYMENT-TRUTH-ERROR\n');
	process.exit(1);
}
