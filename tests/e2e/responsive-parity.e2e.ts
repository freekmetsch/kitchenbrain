import { expect, test, type Page, type Route } from '@playwright/test';
import { kitchenFixtureFor } from './fixtures';

const VIEWPORTS = [
	{ name: 'phone', width: 375, height: 900 },
	{ name: 'desktop', width: 1280, height: 900 }
] as const;

async function expectResponsiveSurface(page: Page, route: string, width: number): Promise<void> {
	await expect(page.locator('h1')).toHaveCount(1);
	expect(
		await page.evaluate(
			() => document.documentElement.scrollWidth > document.documentElement.clientWidth
		),
		`${route} must not overflow horizontally at ${width}px`
	).toBe(false);
}

function nextWeek(weekStart: string): string {
	const date = new Date(`${weekStart}T12:00:00Z`);
	date.setUTCDate(date.getUTCDate() + 7);
	return date.toISOString().slice(0, 10);
}

for (const viewport of VIEWPORTS) {
	test(`Stock covers empty, long, rollback, and deep-link states at ${viewport.name}`, async ({
		page
	}, testInfo) => {
		const fixture = kitchenFixtureFor(testInfo);
		await page.setViewportSize(viewport);
		await page.goto('/inventory');
		await page.waitForLoadState('networkidle');

		await expect(page.getByRole('heading', { name: 'Stock', level: 1 })).toBeVisible();
		await expect(
			page.getByRole('button', {
				name: `Edit ${fixture.longInventoryNames[0]}`
			})
		).toBeVisible();
		await expect(
			page.getByRole('button', {
				name: `Edit ${fixture.longInventoryNames[fixture.longInventoryNames.length - 1]}`
			})
		).toBeVisible();
		expect(
			await page.getByRole('button', { name: /^Edit E2E .* freezer meal/ }).count()
		).toBeGreaterThanOrEqual(fixture.longInventoryNames.length);
		await expectResponsiveSurface(page, '/inventory (long)', viewport.width);

		const search = page.getByRole('searchbox', { name: 'Search stock' });
		await search.fill('no-e2e-stock-item-has-this-name');
		await expect(
			page.getByText('Nothing matches this search or these filters.', {
				exact: true
			})
		).toBeVisible();
		await expectResponsiveSurface(page, '/inventory (empty search)', viewport.width);
		await page.getByRole('button', { name: 'Clear stock search' }).click();

		const mutationTarget = fixture.longInventoryNames[0];
		const quantity = page.getByRole('button', {
			name: `Edit quantity for ${mutationTarget}`
		});
		const beforeText = (await quantity.textContent()) ?? '';
		const failInventoryPatch = async (route: Route) => {
			if (route.request().method() !== 'PATCH') {
				await route.continue();
				return;
			}
			await route.fulfill({
				status: 500,
				contentType: 'application/json',
				body: '{"message":"intentional responsive rollback test"}'
			});
		};
		await page.route('**/api/inventory/*', failInventoryPatch);
		const failedPatch = page.waitForResponse(
			(response) =>
				response.request().method() === 'PATCH' && response.url().includes('/api/inventory/')
		);
		await page.getByRole('button', { name: `Increase ${mutationTarget}` }).click();
		expect((await failedPatch).status()).toBe(500);
		await expect(page.getByRole('alert')).toContainText('Could not update quantity');
		await page.unroute('**/api/inventory/*', failInventoryPatch);
		await expect(quantity).toHaveText(beforeText.trim());
		await expectResponsiveSurface(page, '/inventory (failed mutation)', viewport.width);

		const row = page
			.getByRole('button', { name: `Edit ${mutationTarget}` })
			.locator('xpath=ancestor::li[1]');
		const rowId = await row.getAttribute('id');
		expect(rowId).toMatch(/^inventory-item-\d+$/);
		const itemId = rowId!.replace('inventory-item-', '');
		await page.goto(`/inventory?item=${itemId}`);
		const editor = page.getByRole('dialog');
		await expect(editor).toBeVisible();
		await expect(editor.getByRole('heading', { name: mutationTarget })).toBeVisible();
		await expect(editor.getByLabel('Name')).toHaveValue(mutationTarget);
		await expect(row).toBeVisible();
		await expectResponsiveSurface(page, '/inventory?item=…', viewport.width);
	});

	test(`Meal Plan covers pending recovery and sheet focus at ${viewport.name}`, async ({
		page
	}, testInfo) => {
		const fixture = kitchenFixtureFor(testInfo);
		await page.setViewportSize(viewport);
		await page.goto('/meal-plan');
		await page.waitForLoadState('networkidle');

		const increase = page
			.getByRole('button', {
				name: `Increase portions for ${fixture.recipeTitle}`
			})
			.first();
		const servings = increase.locator('xpath=preceding-sibling::span[1]');
		const beforeCount = Number.parseInt((await servings.textContent()) ?? '', 10);
		expect(beforeCount).toBeGreaterThan(0);

		let releaseFailure!: () => void;
		const failureGate = new Promise<void>((resolve) => {
			releaseFailure = resolve;
		});
		let markRequestStarted!: () => void;
		const requestStarted = new Promise<void>((resolve) => {
			markRequestStarted = resolve;
		});
		await page.route(
			'**/api/meal-plan/*',
			async (route) => {
				markRequestStarted();
				await failureGate;
				await route.fulfill({
					status: 500,
					contentType: 'application/json',
					body: '{"message":"intentional responsive rollback test"}'
				});
			},
			{ times: 1 }
		);

		await increase.click();
		await requestStarted;
		await expect(servings).toHaveText(`${beforeCount + 1} portions`);
		await expect(increase).toHaveAttribute('aria-disabled', 'true');
		releaseFailure();
		await expect(page.getByRole('alert')).toContainText('Could not update the portions.');
		await expect(servings).toHaveText(`${beforeCount} portions`);
		await expectResponsiveSurface(page, '/meal-plan (pending failure)', viewport.width);

		const addMeal = page.getByRole('button', { name: 'Add meal', exact: true });
		await addMeal.focus();
		await addMeal.click();
		const sheet = page.getByRole('dialog').filter({
			has: page.getByRole('heading', { name: 'Add meal' })
		});
		await expect(sheet).toBeVisible();
		await expect
			.poll(() =>
				page.evaluate(() => {
					const active = document.activeElement;
					const dialog = document.querySelector('dialog[open]');
					return Boolean(active && dialog?.contains(active));
				})
			)
			.toBe(true);
		await page.keyboard.press('Escape');
		await expect(sheet).toBeHidden();
		await expect(addMeal).toBeFocused();
		await expectResponsiveSurface(page, '/meal-plan (sheet closed)', viewport.width);
	});

	test(`Shopping covers empty, long, complete, rollback, and undo states at ${viewport.name}`, async ({
		page
	}, testInfo) => {
		const fixture = kitchenFixtureFor(testInfo);
		await page.setViewportSize(viewport);
		await page.goto('/shopping');
		await page.waitForLoadState('networkidle');

		await expect(page.getByRole('progressbar')).toHaveCount(0);
		await expect(page.locator('.market-progress-track')).toHaveCount(0);
		await expect(page.getByText(/\d+ left$/)).toHaveCount(0);
		await expect(page.getByText(/\d+ in basket$/)).toHaveCount(0);
		await expect(page.getByText(fixture.longShoppingNames[0], { exact: true })).toBeVisible();
		await expect(
			page.getByText(fixture.longShoppingNames[fixture.longShoppingNames.length - 1], {
				exact: true
			})
		).toBeVisible();
		expect(await page.locator('input[data-shopping-key]').count()).toBeGreaterThanOrEqual(
			fixture.longShoppingNames.length
		);
		await expectResponsiveSurface(page, '/shopping (long)', viewport.width);

		const shoppingControls = page.getByRole('region', { name: 'Shopping list controls' });
		const filterRail = shoppingControls.getByRole('toolbar', { name: 'Filter shopping list' });
		await expect(filterRail.getByRole('button', { name: 'All', exact: true })).toBeVisible();
		await expect(filterRail.getByRole('button', { name: 'Weekly items', exact: true })).toBeVisible();
		await expect(filterRail.getByRole('button', { name: fixture.recipeTitle, exact: true })).toBeVisible();
		await expect(page.getByRole('combobox', { name: 'Sort shopping list' })).toHaveCount(0);
		await expect(page.getByRole('button', { name: 'List options' })).toHaveCount(0);
		expect(await filterRail.evaluate((element) => getComputedStyle(element).maskImage)).toBe('none');

		const visibleHistory = page.getByRole('region', { name: 'Sent to AH' });
		await expect(visibleHistory).toHaveCount(1);
		await expect(visibleHistory.getByText('AH result unknown', { exact: true })).toBeVisible();
		await expect(visibleHistory).toContainText('Check in AH');
		await expect(visibleHistory.getByRole('link', { name: 'Open AH' })).toBeVisible();
		const previousSends = visibleHistory.getByText('Previous sends (1)', { exact: true });
		await expect(previousSends).toBeVisible();
		await expect(visibleHistory.getByText('2 sent to shopping list', { exact: true })).toBeHidden();
		const historyBox = await visibleHistory.boundingBox();
		const ledgerBox = await page.locator('.shopping-ledger-section').first().boundingBox();
		if (viewport.name === 'phone') {
			expect(historyBox?.y).toBeLessThan(ledgerBox?.y ?? 0);
		} else {
			expect(historyBox?.x).toBeGreaterThan(ledgerBox?.x ?? Number.POSITIVE_INFINITY);
		}

		await expect(page.getByRole('button', { name: /^Shopping rules/ })).toHaveCount(0);
		const needPill = page.getByRole('button', {
			name: `Change need for ${fixture.shoppingName} · ${fixture.recipeTitle}. Current: Always`
		});
		const buyPill = page.getByRole('combobox', {
			name: `Choose what to buy for ${fixture.shoppingName} · ${fixture.recipeTitle} this run`
		});
		await expect(needPill).toBeVisible();
		await expect(buyPill).toBeVisible();
		await expect(buyPill.locator('option')).toHaveCount(5);
		await expect(page.locator('dialog[open]')).toHaveCount(0);
		const sourceName = page.getByText(fixture.shoppingName, { exact: true }).first();
		const [sourceBox, needBox, buyBox] = await Promise.all([
			sourceName.boundingBox(),
			needPill.boundingBox(),
			buyPill.boundingBox()
		]);
		expect(Math.abs((sourceBox?.y ?? 0) - (needBox?.y ?? 0))).toBeLessThan(20);
		expect(Math.abs((needBox?.y ?? 0) - (buyBox?.y ?? 0))).toBeLessThan(20);
		await page.route(
			'**/api/shopping/recipe-choice',
			(route) =>
				route.fulfill({
					status: 409,
					contentType: 'application/json',
					body: '{"message":"intentional stale source test"}'
				}),
			{ times: 1 }
		);
		await buyPill.selectOption(fixture.shoppingAlternative);
		await expect(
			page.getByRole('alert').filter({
				hasText: 'This item changed elsewhere. The current value has been reloaded.'
			})
		).toBeVisible();
		await expect(buyPill).toHaveValue(fixture.shoppingName);
		await page.getByText('Not this run (2)', { exact: true }).click();
		await expect(
			page.getByRole('button', {
				name: `Change need for ${fixture.shoppingSibling} · ${fixture.recipeTitle}. Current: Nice to have`
			})
		).toBeVisible();
		await filterRail.getByRole('button', { name: fixture.recipeTitle, exact: true }).click();
		await expect(page.getByText('Not this run (1)', { exact: true })).toBeVisible();
		await filterRail.getByRole('button', { name: 'All', exact: true }).click();

		const weeklyFilter = filterRail.getByRole('button', { name: 'Weekly items', exact: true });
		await weeklyFilter.click();
		await expect(page.getByText(/^Not this run/)).toHaveCount(0);
		await expect(page.getByText('No weekly items are included in this run.')).toBeVisible();
		const editWeekly = page.getByRole('button', { name: 'Edit weekly', exact: true });
		await editWeekly.click();
		await expect(page.getByRole('button', { name: 'Add weekly item', exact: true })).toBeVisible();
		await expect(page.locator('dialog[open]')).toHaveCount(0);
		await page.getByRole('button', { name: 'Done editing', exact: true }).click();
		await expect(editWeekly).toBeFocused();

		const mealFilter = page
			.getByRole('toolbar', { name: 'Filter shopping list' })
			.getByRole('button', { name: fixture.recipeTitle, exact: true });
		await expect(mealFilter).toBeVisible();
		await mealFilter.click();
		const filteredItem = page.locator('input[data-shopping-key]').first();
		await expect(filteredItem).toBeVisible();
		await expect(page.locator('input[data-shopping-key]')).toHaveCount(1);

		await page.route(
			'**/api/shopping',
			(route) =>
				route.fulfill({
					status: 500,
					contentType: 'application/json',
					body: '{"message":"intentional responsive rollback test"}'
				}),
			{ times: 1 }
		);
		await filteredItem.focus();
		await filteredItem.press('Space');
		await expect(
			page
				.getByRole('alert')
				.filter({ hasText: 'The shopping list changed. Reload and try again.' })
		).toBeVisible();
		await expect(filteredItem).not.toBeChecked();

		const boughtSaved = page.waitForResponse(
			(response) =>
				response.request().method() === 'POST' && response.url().endsWith('/api/shopping')
		);
		await filteredItem.focus();
		await filteredItem.press('Space');
		expect((await boughtSaved).ok()).toBe(true);
		await expect(page.getByRole('heading', { name: 'Shopping complete' })).toBeVisible();
		await expectResponsiveSurface(page, '/shopping (filtered complete)', viewport.width);

		const restored = page.waitForResponse(
			(response) =>
				response.request().method() === 'POST' && response.url().endsWith('/api/shopping')
		);
		await page.getByRole('button', { name: 'Undo' }).click();
		expect((await restored).ok()).toBe(true);
		await expect(filteredItem).toBeVisible();
		await expect(filteredItem).not.toBeChecked();

		await page.goto(`/shopping?week=${nextWeek(fixture.weekStart)}`);
		await page.waitForLoadState('networkidle');
		await expect(page.getByText(/^(No meals planned yet|Nothing needed)$/)).toBeVisible();
		const emptyControls = page.getByRole('region', { name: 'Shopping list controls' });
		await expect(emptyControls).toBeVisible();
		await expect(page.getByRole('button', { name: 'List options' })).toHaveCount(0);
		const emptyDock = page.locator('.shopping-market-dock');
		await expect(emptyDock.getByRole('button', { name: 'Add item' })).toBeVisible();
		const emptyAhAction = emptyDock.getByRole('button', { name: 'Review AH order' });
		if (viewport.name === 'phone') {
			await expect(emptyAhAction).toBeHidden();
		} else {
			await expect(emptyAhAction).toBeVisible();
			await expect(emptyAhAction).toBeDisabled();
		}
		await emptyControls
			.getByRole('button', { name: 'Weekly items', exact: true })
			.click();
		await expect(page.getByText('No weekly items are included in this run.')).toBeVisible();
		await page.getByRole('button', { name: 'Edit weekly', exact: true }).click();
		await expect(page.getByRole('button', { name: 'Add weekly item', exact: true })).toBeVisible();
		await expect(page.locator('dialog[open]')).toHaveCount(0);
		await page.getByRole('button', { name: 'Done editing', exact: true }).click();
		await expectResponsiveSurface(page, '/shopping (empty week)', viewport.width);
	});

	test(`Cook Mode resumes and recovers malformed progress at ${viewport.name}`, async ({
		page
	}, testInfo) => {
		test.slow();
		const fixture = kitchenFixtureFor(testInfo);
		const route = `/recipes/${fixture.cookRecipeSlug}`;
		const progressKey = `cookmode-progress:${fixture.cookRecipeSlug}:direct`;
		await page.setViewportSize(viewport);
		await page.goto(route);
		await page.evaluate((key) => localStorage.removeItem(key), progressKey);
		await page.reload();
		await page.waitForLoadState('networkidle');

		await expect(
			page.getByText(
				'Background timer alerts are unavailable on this server. Keep this cooking view open.',
				{ exact: true }
			)
		).toBeVisible();
		await page.getByRole('button', { name: 'Start timer for 1:00' }).click();
		await expect(page.getByText('Keep this cooking view open', { exact: true })).toBeVisible();
		await page.getByRole('button', { name: 'Cancel timer' }).click();

		const firstStep = page.getByRole('button', {
			name: 'Read step 1: Simmer until ready.'
		});
		const secondStep = page.getByRole('button', {
			name: 'Read step 2: Serve the stew.'
		});
		await expect(firstStep).toHaveAttribute('aria-current', 'step');
		await secondStep.click();
		await expect(secondStep).toHaveAttribute('aria-current', 'step');
		await expect
			.poll(() =>
				page.evaluate((key) => {
					const stored = localStorage.getItem(key);
					if (!stored) return null;
					return (JSON.parse(stored) as { currentStepKey?: string }).currentStepKey ?? null;
				}, progressKey)
			)
			.toBe('1:pot');
		await page.goto('/recipes');
		await page.goto(route);
		await expect(secondStep).toHaveAttribute('aria-current', 'step', { timeout: 15_000 });
		await expectResponsiveSurface(page, `${route} (resumed)`, viewport.width);

		await page.goto('/recipes');
		await page.evaluate((key) => localStorage.setItem(key, '{"v":2}'), progressKey);
		await page.goto(route);
		await expect(
			page.getByText(
				'Your earlier cooking session could not be restored safely. Source steps are ready, and old timers were cleared.',
				{ exact: true }
			)
		).toBeVisible({ timeout: 15_000 });
		await expect(firstStep).toHaveAttribute('aria-current', 'step');
		await expect
			.poll(() => page.evaluate((key) => localStorage.getItem(key), progressKey))
			.toBeNull();
		await expectResponsiveSurface(page, `${route} (recovered)`, viewport.width);
	});
}

test('Shopping keeps source controls compact at 320, 768, and 200% text', async (
	{ page },
	testInfo
) => {
	const fixture = kitchenFixtureFor(testInfo);
	await page.setViewportSize({ width: 320, height: 900 });
	await page.goto('/shopping');
	await page.waitForLoadState('networkidle');

	const controls = page.getByRole('region', { name: 'Shopping list controls' });
	const filterRail = page.getByRole('toolbar', { name: 'Filter shopping list' });
	const controlsBox = await controls.boundingBox();

	expect(controlsBox?.height).toBeLessThanOrEqual(46);
	await expect(page.getByRole('button', { name: 'List options' })).toHaveCount(0);
	await expect(page.getByRole('combobox', { name: 'Sort shopping list' })).toHaveCount(0);
	expect(
		await filterRail.evaluate((element) => getComputedStyle(element).overflowX)
	).toBe('auto');
	expect(
		await filterRail.evaluate((element) => getComputedStyle(element).scrollbarWidth)
	).toBe('none');
	expect(await filterRail.evaluate((element) => getComputedStyle(element).maskImage)).toBe('none');
	for (const button of await filterRail.getByRole('button').all()) {
		expect(await button.evaluate((element) => getComputedStyle(element).opacity)).toBe('1');
	}
	const needPill = page.getByRole('button', {
		name: `Change need for ${fixture.shoppingName} · ${fixture.recipeTitle}. Current: Always`
	});
	const buyPill = page.getByRole('combobox', {
		name: `Choose what to buy for ${fixture.shoppingName} · ${fixture.recipeTitle} this run`
	});
	await expect(needPill).toBeVisible();
	await expect(buyPill).toBeVisible();
	expect(
		Math.abs(
			((await needPill.boundingBox())?.y ?? 0) - ((await buyPill.boundingBox())?.y ?? 0)
		)
	).toBeLessThan(20);
	await expect(page.getByRole('progressbar')).toHaveCount(0);
	await expectResponsiveSurface(page, '/shopping (320px compact controls)', 320);

	await page.setViewportSize({ width: 768, height: 900 });
	await page.evaluate(() => {
		document.documentElement.style.fontSize = '200%';
	});
	await expect(needPill).toBeVisible();
	await expect(buyPill).toBeVisible();
	expect(
		Math.abs(
			((await needPill.boundingBox())?.y ?? 0) - ((await buyPill.boundingBox())?.y ?? 0)
		)
	).toBeLessThan(36);
	await expectResponsiveSurface(page, '/shopping (768px at 200% text)', 768);
});

test('Shopping source controls remain legible in Dutch dark mode', async ({ page }, testInfo) => {
	const fixture = kitchenFixtureFor(testInfo);
	await page.setViewportSize({ width: 375, height: 900 });
	await page.goto('/shopping');
	await page.evaluate(() => {
		document.cookie = 'PARAGLIDE_LOCALE=nl; path=/';
	});
	await page.reload();
	await page.evaluate(() => {
		document.documentElement.setAttribute('data-theme', 'dark');
	});

	await expect(page.getByRole('heading', { name: 'Boodschappen', level: 1 })).toBeVisible();
	const needPill = page.getByRole('button', {
		name: `Wijzig behoefte voor ${fixture.shoppingName} · ${fixture.recipeTitle}. Huidig: Altijd nodig`
	});
	const buyPill = page.getByRole('combobox', {
		name: `Kies wat je deze ronde koopt voor ${fixture.shoppingName} · ${fixture.recipeTitle}`
	});
	await expect(needPill).toBeVisible();
	await expect(buyPill).toBeVisible();
	expect(await needPill.evaluate((element) => getComputedStyle(element).opacity)).toBe('1');
	expect(await buyPill.evaluate((element) => getComputedStyle(element).opacity)).toBe('1');
	await expectResponsiveSurface(page, '/shopping (Dutch dark)', 375);
});
