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

test('Assistant home stays request-driven until a person submits a request', async ({ page }) => {
	let assistantTurns = 0;
	page.on('request', (request) => {
		if (new URL(request.url()).pathname === '/api/chat') assistantTurns += 1;
	});

	for (const viewport of VIEWPORTS) {
		await page.setViewportSize(viewport);
		await page.goto('/');

		await expect(page.getByRole('region', { name: 'Butler brief' })).toHaveCount(0);
		await expect(page.locator('[data-butler-kind]')).toHaveCount(0);
		await expect(page.locator('#home-chat').getByRole('textbox')).toBeVisible();
		expect(
			await page.evaluate(
				() => document.documentElement.scrollWidth > document.documentElement.clientWidth
			),
			`Assistant home must not overflow horizontally at ${viewport.width}px`
		).toBe(false);
	}

	expect(assistantTurns).toBe(0);
});

test('Plan → Shop review is adjustable, atomic, and keeps the AH push behind final confirmation', async ({
	page
}, testInfo) => {
	const fixture = kitchenFixtureFor(testInfo);
	const proposalToken = `e2e-${fixture.account}-meal-plan-proposal`;
	const selectedRequests: string[][] = [];
	let ahPushRequests = 0;

	await page.route('**/api/meal-plan/proposal*', async (route) => {
		if (route.request().method() === 'GET') {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ status: 'active' })
			});
			return;
		}
		if (route.request().method() === 'POST') {
			const body = route.request().postDataJSON() as {
				token: string;
				operationIds: string[];
			};
			expect(body.token).toBe(proposalToken);
			selectedRequests.push(body.operationIds);
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					ok: true,
					receipt: {
						status: 'committed',
						atomicity: 'atomic',
						undoToken: proposalToken
					},
					shopping: { ready: 1, blocked: [{ id: 17, name: 'verse kruiden' }] },
					next: {
						kind: 'ah_review',
						externalEffect: 'read-only',
						previewToken: `e2e-${fixture.account}-ah-preview`,
						items: [
							{
								ref: 'entries:17',
								sourceName: 'linzen',
								term: 'linzen',
								amount: '400',
								unit: 'g',
								incompatibleQuantities: false,
								quantitySources: [],
								status: 'product',
								candidates: [
									{
										id: 'ah-linzen',
										name: 'AH Linzen',
										price: 1.19,
										regularPrice: 1.19,
										isBonus: false,
										bonusMechanism: null,
										salesUnitSize: '400 g',
										unitPrice: '€2.98/kg',
										imageUrl: null,
										isPreviouslyBought: true,
										qty: 1,
										pricePerCount: null
									}
								],
								lowConfidence: false
							}
						]
					}
				})
			});
			return;
		}
		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({ ok: true, status: 'rejected' })
		});
	});
	await page.route('**/api/shopping/ah-push', async (route) => {
		ahPushRequests += 1;
		const body = route.request().postDataJSON() as { previewToken: string };
		expect(body.previewToken).toBe(`e2e-${fixture.account}-ah-preview`);
		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({
				productsPushed: 1,
				freetextPushed: 0,
				destination: 'list',
				accountName: 'Test household',
				markedBoughtRefs: [],
				failed: [],
				uncertain: false
			})
		});
	});

	for (const viewport of VIEWPORTS) {
		const pushCountBeforeReview = ahPushRequests;
		await page.setViewportSize(viewport);
		await page.goto('/');
		const review = page.locator('section[aria-label="Review meal plan"]');
		await expect(review).toBeVisible();
		await expect(
			review.getByRole('heading', {
				name: 'A practical week from what is already available'
			})
		).toBeVisible();
		await expect(review.getByText('Why now', { exact: true })).toBeVisible();
		await expect(review.getByText('What will change', { exact: true })).toBeVisible();
		await expect(review.getByText('Confidence: medium', { exact: true })).toBeVisible();
		await expect(review.getByText(/Atomic: the selected meals and Shopping reconciliation/)).toBeVisible();
		await expect(review.getByText(/Nothing is sent until you press Send to AH/)).toBeVisible();

		const changes = review.getByRole('checkbox');
		await expect(changes).toHaveCount(2);
		await expect(changes.nth(0)).toBeChecked();
		await expect(changes.nth(1)).toBeChecked();
		await changes.nth(1).click();
		await expect(changes.nth(1)).not.toBeChecked();
		await expect(review.getByText('1 selected', { exact: true })).toBeVisible();
		expect(ahPushRequests).toBe(pushCountBeforeReview);

		await review.getByRole('button', { name: 'Apply selected' }).click();
		await expect(review.getByText('Plan and Shopping list updated.', { exact: true })).toBeVisible();
		await expect(
			review.getByText('Shopping sources still needing review: 1.', { exact: true })
		).toBeVisible();
		await expect(review.getByText(/Product choices are prepared from the Dutch Shopping sources/)).toBeVisible();
		await expect(review.getByText('AH Linzen', { exact: true })).toBeVisible();
		expect(ahPushRequests).toBe(pushCountBeforeReview);
		expect(selectedRequests.at(-1)).toEqual([`e2e-${fixture.account}-meal-add`]);

		const send = review.getByRole('button', { name: 'Send to AH' });
		await expect(send).toBeEnabled();
		await send.click();
		await expect(review.getByText('AH is external and will not be undone.', { exact: true })).toBeVisible();
		await expect(review.getByRole('button', { name: 'Undo plan + Shopping' })).toBeVisible();
		expect(ahPushRequests).toBe(pushCountBeforeReview + 1);
		expect(
			await page.evaluate(
				() => document.documentElement.scrollWidth > document.documentElement.clientWidth
			),
			`Plan → Shop review must not overflow horizontally at ${viewport.width}px`
		).toBe(false);
	}
});

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
		const review = page
			.locator('section[aria-label="Review recipe ideas"]')
			.filter({ has: page.getByRole('button', { name: 'Apply selected' }) })
			.last();
		await expect(review.getByText('Before', { exact: true }).first()).toBeVisible();
		await expect(review.getByText('After', { exact: true }).first()).toBeVisible();
		await review.locator('details summary').first().click();
		await expect(
			review.getByText('Checked at AH: AH Tomatenblokjes (400 g)', { exact: true })
		).toBeVisible();
		await expect(review.getByRole('group', { name: fixture.shoppingName })).toBeVisible();
		await expect(
			review.getByRole('group', {
				name: 'Parmezaanse kaas met een bewust lange productomschrijving'
			})
		).toBeVisible();
		await expect(review.getByRole('radio')).toHaveCount(viewport.name === 'phone' ? 3 : 6);
		for (const radio of await review.getByRole('radio').all()) {
			await expect(radio).not.toBeChecked();
		}
		await expect(review.getByRole('button', { name: 'Show 3 more' })).toBeVisible();
		await review.getByRole('radio').first().check();

		const apply = review.getByRole('button', { name: 'Apply selected' });
		await expect(apply).toBeEnabled();
		expect(applyRequests).toBe(viewport.name === 'phone' ? 0 : 1);
		await review.getByRole('checkbox').first().check();
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
	test.slow();
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
		const review = page
			.locator('section[aria-label="Review recipe ideas"]')
			.filter({ has: page.getByRole('button', { name: 'Apply selected' }) })
			.last();
		await expect(
			page.getByText('A newer review replaced these suggestions.', { exact: true })
		).toBeVisible();
		await expect.poll(() => checkedTokens).toContain(newToken);
		await expect(review.getByRole('group', { name: fixture.shoppingName })).toBeVisible();
		await expect(review.getByRole('group', { name: 'Parmezaanse kaas' })).toBeVisible();

		const activity = page
			.locator('details')
			.filter({ hasText: 'Checked the recipe and 2 AH searches' })
			.last();
		await expect(activity).toBeVisible();
		await expect(activity.getByText('See process', { exact: true })).toBeVisible();
		await activity.locator('summary').click();
		await expect(activity.locator('li')).toHaveCount(3);

		const radios = review.getByRole('radio');
		await expect(radios).toHaveCount(viewport.width < 768 ? 3 : 6);
		for (const radio of await radios.all()) {
			await expect(radio).not.toBeChecked();
		}
		await expect(review.getByRole('button', { name: 'Apply selected' })).toBeDisabled();
		await expect(review.getByRole('button', { name: 'Show 3 more' })).toBeVisible();

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
			await review.getByRole('button', { name: 'Show 3 more' }).click();
			await expect(review.getByRole('radio')).toHaveCount(6);
			await expect(
				review
					.getByRole('group', { name: fixture.shoppingName })
					.getByRole('button', { name: 'Find different options' })
			).toBeVisible();
		}
		if (viewport.name === 'phone') {
			await radios.first().focus();
			await page.keyboard.press('Space');
			await expect(radios.first()).toBeChecked();
			await expect(review.getByRole('button', { name: 'Apply selected' })).toBeEnabled();
			await review.getByRole('button', { name: 'Clear choice' }).click();
			await expect(radios.first()).not.toBeChecked();
			await expect(review.getByRole('button', { name: 'Apply selected' })).toBeDisabled();
		}
	}
});
