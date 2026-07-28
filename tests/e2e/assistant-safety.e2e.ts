import { expect, test } from '@playwright/test';
import { kitchenFixtureFor } from './fixtures';

const VIEWPORTS = [
	{ name: 'phone', width: 375, height: 900 },
	{ name: 'desktop', width: 1280, height: 900 }
] as const;

test('Recipe patch review stays selective and responsive at phone and desktop', async ({
	page
}, testInfo) => {
	const fixture = kitchenFixtureFor(testInfo);
	let applyRequests = 0;
	await page.route(`**/api/recipes/${fixture.recipeSlug}/enhance`, async (route) => {
		const body = route.request().postDataJSON() as { action?: string };
		if (body.action === 'apply') {
			applyRequests += 1;
			await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
			return;
		}
		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({
				token: 'e2e-recipe-patch',
				recipeSlug: fixture.recipeSlug,
				recipeRevision: 1,
				operations: [
					{
						id: 'amount-correction',
						kind: 'update_ingredient',
						label: fixture.shoppingName,
						before: 'amount: 2 cans',
						after: 'amount: 3 cans',
						reason: 'The tested recipe needs one extra can.',
						evidence: {
							key: 'ah-evidence',
							source: 'ah',
							query: 'tomatenblokjes',
							productName: 'AH Tomatenblokjes',
							packageSize: '400 g',
							price: 0.89
						}
					},
					{
						id: 'direction-correction',
						kind: 'recipe_field',
						label: 'directions',
						before: 'Simmer until ready.',
						after: 'Simmer gently until the sauce is thick, then taste before serving.',
						reason: 'The finish should be explicit.'
					}
				]
			})
		});
	});

	for (const viewport of VIEWPORTS) {
		await page.setViewportSize(viewport);
		await page.goto(`/recipes/${fixture.recipeSlug}`);
		await page.waitForLoadState('networkidle');
		await page.getByRole('button', { name: 'AI suggestions' }).click();
		await expect(page.getByRole('heading', { name: 'Review recipe ideas' })).toBeVisible();
		await expect(page.getByText('Before', { exact: true }).first()).toBeVisible();
		await expect(page.getByText('After', { exact: true }).first()).toBeVisible();
		await expect(
			page.getByText('Checked at AH: AH Tomatenblokjes (400 g)', { exact: true })
		).toBeVisible();

		const apply = page.getByRole('button', { name: 'Apply selected' });
		await expect(apply).toBeDisabled();
		expect(applyRequests).toBe(viewport.name === 'phone' ? 0 : 1);
		await page.getByRole('checkbox').first().check();
		await expect(apply).toBeEnabled();

		expect(
			await page.evaluate(
				() => document.documentElement.scrollWidth > document.documentElement.clientWidth
			),
			`recipe patch review must not overflow horizontally at ${viewport.width}px`
		).toBe(false);

		if (viewport.name === 'phone') {
			await apply.click();
			await expect(page.getByRole('heading', { name: 'Review recipe ideas' })).toBeHidden();
			expect(applyRequests).toBe(1);
		} else {
			expect(applyRequests).toBe(1);
		}
	}
});
