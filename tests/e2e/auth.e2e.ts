import { expect, test } from '@playwright/test';
import { E2E_ORIGIN, TEST_ACCOUNTS, type TestAccountName } from './config';

test.describe('logged-out login boundary', () => {
	test.use({ storageState: { cookies: [], origins: [] } });

	test('redirects protected pages to login', async ({ page }) => {
		await page.goto('/inventory');

		await expect(page).toHaveURL(new URL('/login', E2E_ORIGIN).toString());
		await expect(page.locator('input[name="username"]')).toBeVisible();
		await expect(page.locator('input[name="password"]')).toBeVisible();
	});

	test('rejects invalid credentials without creating a session', async ({ page, context }) => {
		await page.goto('/login');
		await page.locator('input[name="username"]').fill(TEST_ACCOUNTS.primary.username);
		await page.locator('input[name="password"]').fill('not-the-test-password');
		await page.locator('form button[type="submit"]').click();

		await expect(page).toHaveURL(new URL('/login', E2E_ORIGIN).toString(), {
			timeout: 30_000
		});
		await expect(page.locator('.alert-error')).toBeVisible({ timeout: 30_000 });
		expect((await context.cookies(E2E_ORIGIN)).some((cookie) => cookie.name === 'session_id')).toBe(
			false
		);
	});
});

test('uses the selected authenticated test account', async ({ page, context }, testInfo) => {
	const accountName: TestAccountName = testInfo.project.name.endsWith('secondary')
		? 'secondary'
		: 'primary';
	const account = TEST_ACCOUNTS[accountName];

	await page.goto('/settings/account');

	await expect(page).toHaveURL(new URL('/settings/account', E2E_ORIGIN).toString());
	await expect(page.getByText(account.username, { exact: false })).toBeVisible();
	await expect(page.getByRole('navigation')).toBeVisible();
	expect((await context.cookies(E2E_ORIGIN)).some((cookie) => cookie.name === 'session_id')).toBe(true);
});
