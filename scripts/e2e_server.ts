import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'vite';
import { E2E_DATA_DIR, E2E_SERVER_ENV, E2E_SERVER_PORT } from '../tests/e2e/config';
import { seedKitchenFixtures } from '../tests/e2e/fixtures';

for (const [name, expected] of Object.entries(E2E_SERVER_ENV)) {
	if (process.env[name] !== expected) {
		throw new Error(`Refusing to start without the isolated E2E value for ${name}`);
	}
}
delete process.env.ANTHROPIC_API_KEY;

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

let closing = false;
async function closeServer() {
	if (closing) return;
	closing = true;
	await server.close();
	process.exit(0);
}

process.once('SIGINT', () => void closeServer());
process.once('SIGTERM', () => void closeServer());
