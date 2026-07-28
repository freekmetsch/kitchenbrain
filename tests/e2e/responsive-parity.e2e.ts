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

		const rulesTrigger = page.getByRole('button', { name: /^Shopping rules/ });
		await expect(rulesTrigger).toBeVisible();
		await rulesTrigger.click();
		let dialog = page.getByRole('dialog').filter({
			has: page.getByRole('heading', { name: 'Manage shopping rules' })
		});
		await expect(dialog).toBeVisible();
		await expect(page.locator('dialog[open]')).toHaveCount(1);
		await dialog.getByRole('button', { name: new RegExp(fixture.shoppingName) }).click();
		await expect(dialog.getByRole('radio', { name: /Every time/ })).toBeVisible();
		await expect(page.locator('dialog[open]')).toHaveCount(1);
		await page.keyboard.press('Escape');
		await expect(rulesTrigger).toBeFocused();

		const directRuleTrigger = page.getByRole('button', {
			name: `Edit shopping rule for ${fixture.shoppingName}`
		});
		await directRuleTrigger.click();
		dialog = page.getByRole('dialog').filter({
			has: page.getByRole('heading', { name: 'Edit shopping rule' })
		});
		await expect(dialog.getByRole('radio', { name: /Every time/ })).toBeVisible();
		await expect(dialog.getByRole('combobox', { name: 'Buy this week' })).toBeVisible();
		await expect(page.locator('dialog[open]')).toHaveCount(1);
		await page.keyboard.press('Escape');
		await expect(directRuleTrigger).toBeFocused();

		const weeklyFilter = filterRail.getByRole('button', { name: 'Weekly items', exact: true });
		await weeklyFilter.click();
		await expect(page.getByText('No weekly items are included in this run.')).toBeVisible();
		const manageWeekly = page.getByRole('button', { name: 'Manage', exact: true });
		await manageWeekly.click();
		dialog = page.getByRole('dialog').filter({
			has: page.getByRole('heading', { name: 'Manage weekly items' })
		});
		await expect(dialog).toBeVisible();
		await expect(page.locator('dialog[open]')).toHaveCount(1);
		await page.keyboard.press('Escape');
		await expect(manageWeekly).toBeFocused();

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
		await page.getByRole('button', { name: 'Manage', exact: true }).click();
		const emptyDialog = page.getByRole('dialog').filter({
			has: page.getByRole('heading', { name: 'Manage weekly items' })
		});
		await expect(emptyDialog).toBeVisible();
		await page.keyboard.press('Escape');
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

test('Shopping keeps its controls to one row at the narrow mobile boundary', async ({ page }) => {
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
	await expect(page.getByRole('progressbar')).toHaveCount(0);
	await expectResponsiveSurface(page, '/shopping (320px compact controls)', 320);
});
