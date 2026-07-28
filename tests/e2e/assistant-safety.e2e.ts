import { expect, test } from '@playwright/test';
import { kitchenFixtureFor } from './fixtures';

test.use({ serviceWorkers: 'block' });

const VIEWPORTS = [
	{ name: 'phone', width: 375, height: 900 },
	{ name: 'desktop', width: 1280, height: 900 }
] as const;

const CHAT_VIEWPORTS = [
	{ name: 'narrow-phone', width: 320, height: 900 },
	{ name: 'phone', width: 375, height: 900 },
	{ name: 'zoom-200-equivalent', width: 640, height: 900 },
	{ name: 'tablet', width: 768, height: 900 },
	{ name: 'laptop', width: 1024, height: 900 },
	{ name: 'desktop', width: 1280, height: 900 }
] as const;

test('Recipe patch review stays selective and responsive at phone and desktop', async ({
	page
}, testInfo) => {
	const fixture = kitchenFixtureFor(testInfo);
	let applyRequests = 0;
	await page.route(`**/api/recipes/${fixture.recipeSlug}/enhance*`, async (route) => {
		if (route.request().method() === 'GET') {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ status: 'active' })
			});
			return;
		}
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
				token: 'e2e-recipe-patch-0000000000',
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
					},
					{
						id: 'servings-correction',
						kind: 'recipe_field',
						label: 'servings',
						before: '4',
						after: '6',
						reason: 'Match the intended household meal.'
					},
					{
						id: 'notes-correction',
						kind: 'recipe_field',
						label: 'notes',
						before: null,
						after: 'Taste before serving.',
						reason: 'Keep the finish explicit.'
					},
					{
						id: 'unit-correction',
						kind: 'update_ingredient',
						label: 'Vegetable stock with a deliberately long ingredient label',
						before: 'unit: pieces',
						after: 'unit: ml',
						reason: 'Use a measurable cooking quantity.'
					},
					{
						id: 'prep-correction',
						kind: 'update_ingredient',
						label: 'Fresh vegetables with another deliberately long label',
						before: 'preparation: whole',
						after: 'preparation: finely chopped',
						reason: 'The vegetables should cook evenly.'
					},
					{
						id: 'optional-correction',
						kind: 'update_ingredient',
						label: 'Fresh herbs',
						before: 'optional: no',
						after: 'optional: yes',
						reason: 'The garnish is optional.'
					}
				],
				productChoices: [
					{
						id: 'tomato-form',
						ingredientId: `e2e-${fixture.account}-tomatoes`,
						label: fixture.shoppingName,
						reason: 'Choose the form that best suits this recipe.',
						candidates: [
							{
								id: 'tomato-whole',
								formLabel: 'Whole peeled tomatoes',
								productName: 'AH Pomodori pelati',
								packageSize: '400 g',
								price: 1.29
							},
							{
								id: 'tomato-diced',
								formLabel: 'Diced tomatoes',
								productName: 'AH Tomatenblokjes',
								packageSize: '400 g',
								price: 0.89
							},
							{
								id: 'tomato-passata',
								formLabel: 'Smooth passata',
								productName: 'AH Passata di pomodoro',
								packageSize: '500 g',
								price: 1.49
							},
							{
								id: 'tomato-cherry',
								formLabel: 'Whole cherry tomatoes',
								productName: 'Mutti Pomodorini',
								packageSize: '400 g',
								price: 2.49
							},
							{
								id: 'tomato-crushed',
								formLabel: 'Coarsely crushed tomatoes',
								productName: 'Mutti Polpa',
								packageSize: '400 g',
								price: 2.19
							},
							{
								id: 'tomato-concentrate',
								formLabel: 'Concentrated tomato pulp',
								productName: 'AH Tomatenpulp',
								packageSize: '390 g',
								price: 1.19
							}
						]
					},
					{
						id: 'cheese-form',
						ingredientId: `e2e-${fixture.account}-cheese`,
						label: 'Parmezaanse kaas met een bewust lange productomschrijving',
						reason: 'Texture and convenience differ materially by product form.',
						candidates: [
							{
								id: 'cheese-block',
								formLabel: 'Whole block',
								productName: 'AH Parmigiano Reggiano 30+ stuk',
								packageSize: '200 g',
								price: 5.99
							},
							{
								id: 'cheese-grated',
								formLabel: 'Freshly grated',
								productName: 'AH Parmigiano Reggiano geraspt',
								packageSize: '100 g',
								price: 3.49
							},
							{
								id: 'cheese-powder',
								formLabel: 'Shelf-stable grated powder',
								productName: 'Parmesello strooikaas',
								packageSize: '150 g',
								price: 2.79
							}
						]
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
		await page.locator('details summary').first().click();
		await expect(
			page.getByText('Checked at AH: AH Tomatenblokjes (400 g)', { exact: true })
		).toBeVisible();
		await expect(page.getByRole('group', { name: fixture.shoppingName })).toBeVisible();
		await expect(
			page.getByRole('group', {
				name: 'Parmezaanse kaas met een bewust lange productomschrijving'
			})
		).toBeVisible();
		await expect(page.getByRole('radio')).toHaveCount(viewport.name === 'phone' ? 3 : 6);
		for (const radio of await page.getByRole('radio').all()) {
			await expect(radio).not.toBeChecked();
		}
		await expect(page.getByRole('button', { name: 'Show 3 more' })).toBeVisible();
		await page.getByRole('radio').first().check();

		const apply = page.getByRole('button', { name: 'Apply selected' });
		await expect(apply).toBeEnabled();
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

test('Persisted chat keeps only the latest dense recipe decision surface active', async ({
	page
}, testInfo) => {
	const fixture = kitchenFixtureFor(testInfo);
	const oldToken = `e2e-${fixture.account}-recipe-patch-old`;
	const newToken = `e2e-${fixture.account}-recipe-patch-new`;
	const checkedTokens: string[] = [];
	await page.route(new RegExp(`/api/recipes/${fixture.recipeSlug}/enhance(?:\\?.*)?$`), async (route) => {
		if (route.request().method() !== 'GET') {
			await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
			return;
		}
		const token = new URL(route.request().url()).searchParams.get('token');
		if (token) checkedTokens.push(token);
		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({
				status: token === newToken ? 'active' : token === oldToken ? 'active' : 'expired'
			})
		});
	});

	for (const viewport of CHAT_VIEWPORTS) {
		await page.setViewportSize(viewport);
		await page.goto('/');
		await expect(
			page.getByText('A newer review replaced these suggestions.', { exact: true })
		).toBeVisible();
		await expect.poll(() => checkedTokens).toContain(newToken);
		await expect(page.getByRole('group', { name: fixture.shoppingName })).toBeVisible();
		await expect(page.getByRole('group', { name: 'Parmezaanse kaas' })).toBeVisible();

		const activity = page
			.locator('details')
			.filter({ hasText: 'Checked the recipe and 2 AH searches' })
			.last();
		await expect(activity).toBeVisible();
		await activity.locator('summary').click();
		await expect(activity.locator('li')).toHaveCount(3);

		const radios = page.getByRole('radio');
		await expect(radios).toHaveCount(viewport.width < 768 ? 3 : 6);
		for (const radio of await radios.all()) {
			await expect(radio).not.toBeChecked();
		}
		await expect(page.getByRole('button', { name: 'Apply selected' })).toBeDisabled();
		await expect(page.getByRole('button', { name: 'Show 3 more' })).toBeVisible();

		const chatSurface = await page.locator('#home-chat').boundingBox();
		const assistantBubble = await page.locator('.chat-start .chat-bubble').last().boundingBox();
		expect(chatSurface).not.toBeNull();
		expect(assistantBubble).not.toBeNull();
		expect(assistantBubble!.width / chatSurface!.width).toBeGreaterThan(0.82);

		if (viewport.width >= 768) {
			const cards = page
				.getByRole('group', { name: fixture.shoppingName })
				.locator('label');
			const first = await cards.nth(0).boundingBox();
			const second = await cards.nth(1).boundingBox();
			const third = await cards.nth(2).boundingBox();
			expect(first).not.toBeNull();
			expect(second).not.toBeNull();
			expect(third).not.toBeNull();
			expect(Math.abs(first!.y - second!.y)).toBeLessThan(2);
			expect(Math.abs(first!.y - third!.y)).toBeLessThan(2);
		}

		expect(
			await page.evaluate(
				() => document.documentElement.scrollWidth > document.documentElement.clientWidth
			),
			`chat review must not overflow horizontally at ${viewport.width}px`
		).toBe(false);

		if (viewport.name === 'narrow-phone') {
			await page.getByRole('button', { name: 'Show 3 more' }).click();
			await expect(page.getByRole('radio')).toHaveCount(6);
			await expect(
				page
					.getByRole('group', { name: fixture.shoppingName })
					.getByRole('button', { name: 'Find different options' })
			).toBeVisible();
		}
		if (viewport.name === 'phone') {
			await radios.first().focus();
			await page.keyboard.press('Space');
			await expect(radios.first()).toBeChecked();
			await expect(page.getByRole('button', { name: 'Apply selected' })).toBeEnabled();
			await page.getByRole('button', { name: 'Clear choice' }).click();
			await expect(radios.first()).not.toBeChecked();
			await expect(page.getByRole('button', { name: 'Apply selected' })).toBeDisabled();
		}
	}
});
