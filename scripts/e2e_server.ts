import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'vite';

const manual = process.argv.slice(2).includes('--manual');
const unsupportedArguments = process.argv.slice(2).filter((argument) => argument !== '--manual');
if (unsupportedArguments.length > 0) {
	throw new Error(`Unsupported E2E server argument: ${unsupportedArguments[0]}`);
}
if (manual && !process.env.E2E_PORT) {
	process.env.E2E_PORT = '4174';
}

const { E2E_DATA_DIR, E2E_SERVER_ENV, E2E_SERVER_PORT, TEST_LOGIN } = await import(
	'../tests/e2e/config'
);

if (manual) {
	for (const [name, expected] of Object.entries(E2E_SERVER_ENV)) {
		process.env[name] = expected;
	}
}

for (const [name, expected] of Object.entries(E2E_SERVER_ENV)) {
	if (process.env[name] !== expected) {
		throw new Error(`Refusing to start without the isolated E2E value for ${name}`);
	}
}
delete process.env.ANTHROPIC_API_KEY;

const { seedKitchenFixtures } = await import('../tests/e2e/fixtures');

const workspaceRoot = process.cwd();
const relativeDataDir = path.relative(workspaceRoot, E2E_DATA_DIR);
const expectedDataDir = path.join(
	'.test-data',
	E2E_SERVER_PORT === 4173 ? 'e2e' : `e2e-${E2E_SERVER_PORT}`
);
if (relativeDataDir !== expectedDataDir) {
	throw new Error(`Refusing to reset unexpected E2E directory: ${E2E_DATA_DIR}`);
}

await rm(E2E_DATA_DIR, { recursive: true, force: true });
await mkdir(E2E_DATA_DIR, { recursive: true });
if (process.env.E2E_AH_CONNECTED === '1') {
	await writeFile(
		E2E_SERVER_ENV.AH_TOKEN_FILE,
		JSON.stringify({
			v: 2,
			member: true,
			access_token: 'e2e-connected-access-not-a-secret',
			refresh_token: 'e2e-connected-refresh-not-a-secret',
			member_name: 'E2E household'
		}),
		'utf8'
	);
}
seedKitchenFixtures(E2E_SERVER_ENV.DATABASE_URL);

const server = await createServer({
	envDir: false,
	server: {
		host: 'localhost',
		port: E2E_SERVER_PORT,
		strictPort: true
	}
});

await server.listen();
server.printUrls();
if (manual) {
	console.log(`Use the Test: ${TEST_LOGIN.label} button on the sign-in page.`);
}

let closing = false;
async function closeServer() {
	if (closing) return;
	closing = true;
	await server.close();
	process.exit(0);
}

process.once('SIGINT', () => void closeServer());
process.once('SIGTERM', () => void closeServer());
