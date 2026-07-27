import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { E2E_DATA_DIR, E2E_ORIGIN, E2E_SERVER_ENV, TEST_ACCOUNTS } from './tests/e2e/config';

export default defineConfig({
	testDir: './tests/e2e',
	fullyParallel: false,
	workers: 1,
	forbidOnly: Boolean(process.env.CI),
	retries: process.env.CI ? 1 : 0,
	outputDir: path.join(E2E_DATA_DIR, 'results'),
	reporter: [
		['list'],
		['html', { open: 'never', outputFolder: path.join(E2E_DATA_DIR, 'report') }]
	],
	use: {
		baseURL: E2E_ORIGIN,
		screenshot: 'only-on-failure',
		trace: 'retain-on-failure'
	},
	webServer: {
		command: 'npm run test:e2e:server',
		url: `${E2E_ORIGIN}/login`,
		reuseExistingServer: false,
		timeout: 120_000,
		env: E2E_SERVER_ENV
	},
	projects: [
		{
			name: 'auth-setup',
			testMatch: '**/auth.setup.ts'
		},
		{
			name: 'chromium-primary',
			testMatch: '**/*.e2e.ts',
			use: {
				...devices['Desktop Chrome'],
				storageState: TEST_ACCOUNTS.primary.storageState
			},
			dependencies: ['auth-setup']
		},
		{
			name: 'chromium-secondary',
			testMatch: '**/*.e2e.ts',
			use: {
				...devices['Desktop Chrome'],
				storageState: TEST_ACCOUNTS.secondary.storageState
			},
			dependencies: ['auth-setup']
		}
	]
});
