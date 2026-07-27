import path from 'node:path';

export const E2E_ORIGIN = 'http://localhost:4173';
export const E2E_DATA_DIR = path.resolve(process.cwd(), '.test-data', 'e2e');
export const E2E_DATABASE = path.join(E2E_DATA_DIR, 'e2e.db');
export const E2E_AUTH_DIR = path.join(E2E_DATA_DIR, 'auth');

export const TEST_ACCOUNTS = {
	primary: {
		username: 'e2e-primary',
		password: 'local-primary-password',
		storageState: path.join(E2E_AUTH_DIR, 'primary.json')
	},
	secondary: {
		username: 'e2e-secondary',
		password: 'local-secondary-password',
		storageState: path.join(E2E_AUTH_DIR, 'secondary.json')
	}
} as const;

export type TestAccountName = keyof typeof TEST_ACCOUNTS;

export const E2E_HOUSEHOLD_USERS = Object.values(TEST_ACCOUNTS)
	.map(({ username, password }) => `${username}:${password}`)
	.join(',');

export const E2E_SERVER_ENV = {
	DATABASE_URL: E2E_DATABASE,
	HOUSEHOLD_USERS: E2E_HOUSEHOLD_USERS,
	OPENROUTER_API_KEY: 'test-only-no-network',
	ORIGIN: E2E_ORIGIN,
	RECIPE_IMAGES_DIR: path.join(E2E_DATA_DIR, 'recipe-images'),
	AH_TOKEN_FILE: path.join(E2E_DATA_DIR, 'ah-tokens.json'),
	LITESTREAM_ENABLED: '0'
} satisfies Record<string, string>;
