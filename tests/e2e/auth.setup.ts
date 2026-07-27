import { mkdir } from 'node:fs/promises';
import { expect, test as setup } from '@playwright/test';
import { E2E_AUTH_DIR, E2E_ORIGIN, TEST_ACCOUNTS } from './config';

setup('authenticate the isolated test accounts', async ({ browser }) => {
	await mkdir(E2E_AUTH_DIR, { recursive: true });

	for (const account of Object.values(TEST_ACCOUNTS)) {
		const context = await browser.newContext({ baseURL: E2E_ORIGIN });
		const page = await context.newPage();

		await page.goto('/login');
		await page.locator('input[name="username"]').fill(account.username);
		await page.locator('input[name="password"]').fill(account.password);
		await page.locator('form button[type="submit"]').click();

		await expect(page.getByRole('navigation')).toBeVisible({ timeout: 15_000 });
		expect(new URL(page.url()).pathname).toBe('/');
		const sessionCookie = (await context.cookies(E2E_ORIGIN)).find(
			(cookie) => cookie.name === 'session_id'
		);
		expect(sessionCookie).toMatchObject({
			httpOnly: true,
			secure: true,
			sameSite: 'Lax'
		});

		await context.storageState({ path: account.storageState });
		await context.close();
	}
});
