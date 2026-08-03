import { expect, test } from '@playwright/test';
import { E2E_ORIGIN, TEST_ACCOUNTS, TEST_LOGIN, type TestAccountName } from './config';

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
		await page.locator('form:has(input[name="username"]) button[type="submit"]').click();

		await expect(page).toHaveURL(new URL('/login', E2E_ORIGIN).toString(), {
			timeout: 30_000
		});
		await expect(page.getByRole('alert')).toHaveText(
			'That username or password is not correct.',
			{ timeout: 30_000 }
		);
		await page.evaluate(() => {
			document.cookie = 'PARAGLIDE_LOCALE=nl; path=/';
		});
		await page.goto('/login');
		await page.locator('input[name="username"]').fill(TEST_ACCOUNTS.primary.username);
		await page.locator('input[name="password"]').fill('nog-steeds-onjuist');
		await page.locator('form:has(input[name="username"]) button[type="submit"]').click();
		await expect(page.getByRole('alert')).toHaveText(
			'Die gebruikersnaam of dat wachtwoord klopt niet.',
			{ timeout: 30_000 }
		);
		expect((await context.cookies(E2E_ORIGIN)).some((cookie) => cookie.name === 'session_id')).toBe(
			false
		);
	});

	test('accepts the test username with mixed case and surrounding spaces', async ({ page }) => {
		await page.goto('/login');
		await page.locator('input[name="username"]').fill(`  ${TEST_LOGIN.label}  `);
		await page.locator('input[name="password"]').fill(TEST_LOGIN.password);
		await page.locator('form:has(input[name="username"]) button[type="submit"]').click();

		await expect(page.getByRole('navigation')).toBeVisible();
		expect(new URL(page.url()).pathname).toBe('/');
	});

	test('offers one-click sign-in for the isolated test account', async ({ page }) => {
		await page.goto('/login');
		await page.getByRole('button', { name: `Test: ${TEST_LOGIN.label}` }).click();

		await expect(page.getByRole('navigation')).toBeVisible();
		expect(new URL(page.url()).pathname).toBe('/');
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
	const passwordManagerUsername = page.locator('form input[name="username"]');
	await expect(passwordManagerUsername).toHaveValue(account.username);
	await expect(passwordManagerUsername).toHaveAttribute('autocomplete', 'username');
	await expect(passwordManagerUsername).toHaveAttribute('aria-hidden', 'true');
	await expect(passwordManagerUsername).toHaveAttribute('tabindex', '-1');
	const usernameBox = await passwordManagerUsername.boundingBox();
	expect(usernameBox?.width ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(1);
	expect(usernameBox?.height ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(1);
	await expect(page.getByRole('navigation')).toBeVisible();
	expect((await context.cookies(E2E_ORIGIN)).some((cookie) => cookie.name === 'session_id')).toBe(true);
});
