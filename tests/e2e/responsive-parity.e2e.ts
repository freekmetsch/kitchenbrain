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
		await expect(page.getByText(/\d+ left$/).first()).toBeVisible();
		await expect(page.getByText(/\d+ in basket$/).first()).toBeVisible();
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
		const desktopSort = shoppingControls.getByRole('combobox', { name: 'Sort shopping list' });
		const listOptions = page.getByRole('button', { name: 'List options' });
		if (viewport.name === 'phone') {
			await expect(listOptions).toBeVisible();
			await expect(desktopSort).toBeHidden();
			const controlsBox = await shoppingControls.boundingBox();
			expect(controlsBox?.height).toBeLessThanOrEqual(46);
			const firstRowBox = await page.locator('.market-run-row').first().boundingBox();
			expect(firstRowBox?.y).toBeLessThan(300);

			await listOptions.click();
			let dialog = page.getByRole('dialog').filter({
				has: page.getByRole('heading', { name: 'List options' })
			});
			await expect(dialog).toBeVisible();
			await expect(page.locator('dialog[open]')).toHaveCount(1);
			const mobileSort = dialog.getByRole('combobox', { name: 'Sort shopping list' });
			await mobileSort.selectOption('alpha');
			await expect(mobileSort).toHaveValue('alpha');
			await mobileSort.selectOption('list');

			await dialog.getByRole('button', { name: 'Manage weekly items' }).click();
			dialog = page.getByRole('dialog').filter({
				has: page.getByRole('heading', { name: 'Manage weekly items' })
			});
			await expect(dialog).toBeVisible();
			await expect(page.locator('dialog[open]')).toHaveCount(1);
			await page.keyboard.press('Escape');
			await expect(listOptions).toBeFocused();

			await listOptions.click();
			dialog = page.getByRole('dialog').filter({
				has: page.getByRole('heading', { name: 'List options' })
			});
			await dialog.getByRole('button', { name: 'Manage shopping rules' }).click();
			dialog = page.getByRole('dialog').filter({
				has: page.getByRole('heading', { name: 'Manage shopping rules' })
			});
			await expect(dialog).toBeVisible();
			await expect(page.locator('dialog[open]')).toHaveCount(1);
			await page.keyboard.press('Escape');
			await expect(listOptions).toBeFocused();
		} else {
			await expect(listOptions).toBeHidden();
			await expect(desktopSort).toBeVisible();
			await expect(
				shoppingControls.getByRole('button', { name: 'Manage weekly items' })
			).toBeVisible();
			await expect(
				shoppingControls.getByRole('button', { name: 'Manage shopping rules' })
			).toBeVisible();
		}

		const mealFilter = page
			.getByRole('toolbar', { name: 'Filter shopping list' })
			.getByRole('button')
			.nth(1);
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
		await expect(page.getByRole('alert')).toContainText(
			'The shopping list changed. Reload and try again.'
		);
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
		await expect(
			page.getByRole('region', { name: 'Shopping list controls' })
		).toHaveCount(0);
		const emptyListOptions = page.getByRole('button', { name: 'List options' });
		await expect(emptyListOptions).toBeVisible();
		const emptyDock = page.locator('.shopping-market-dock');
		await expect(emptyDock.getByRole('button', { name: 'Add item' })).toBeVisible();
		const emptyAhAction = emptyDock.getByRole('button', { name: 'Review AH order' });
		if (viewport.name === 'phone') {
			await expect(emptyAhAction).toBeHidden();
			await emptyListOptions.click();
			let emptyDialog = page.getByRole('dialog').filter({
				has: page.getByRole('heading', { name: 'List options' })
			});
			await expect(
				emptyDialog.getByRole('combobox', { name: 'Sort shopping list' })
			).toHaveCount(0);
			await emptyDialog.getByRole('button', { name: 'Manage weekly items' }).click();
			emptyDialog = page.getByRole('dialog').filter({
				has: page.getByRole('heading', { name: 'Manage weekly items' })
			});
			await expect(emptyDialog).toBeVisible();
			await expect(page.locator('dialog[open]')).toHaveCount(1);
			await page.keyboard.press('Escape');
			await expect(emptyListOptions).toBeFocused();
		} else {
			await expect(emptyAhAction).toBeVisible();
			await expect(emptyAhAction).toBeDisabled();
		}
		await expectResponsiveSurface(page, '/shopping (empty week)', viewport.width);
	});

	test(`Cook Mode resumes and recovers malformed progress at ${viewport.name}`, async ({
		page
	}, testInfo) => {
		const fixture = kitchenFixtureFor(testInfo);
		const route = `/recipes/${fixture.cookRecipeSlug}`;
		const progressKey = `cookmode-progress:${fixture.cookRecipeSlug}:direct`;
		await page.setViewportSize(viewport);
		await page.goto(route);
		await page.evaluate((key) => localStorage.removeItem(key), progressKey);
		await page.reload();
		await page.waitForLoadState('networkidle');

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
		await expect(secondStep).toHaveAttribute('aria-current', 'step');
		await expectResponsiveSurface(page, `${route} (resumed)`, viewport.width);

		await page.goto('/recipes');
		await page.evaluate((key) => localStorage.setItem(key, '{"v":2}'), progressKey);
		await page.goto(route);
		await expect(
			page.getByText(
				'Your earlier cooking session could not be restored safely. Source steps are ready, and old timers were cleared.',
				{ exact: true }
			)
		).toBeVisible();
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
	const options = page.getByRole('button', { name: 'List options' });
	const filterRail = page.getByRole('toolbar', { name: 'Filter shopping list' });
	const controlsBox = await controls.boundingBox();
	const optionsBox = await options.boundingBox();
	const firstRowBox = await page.locator('.market-run-row').first().boundingBox();

	expect(controlsBox?.height).toBeLessThanOrEqual(46);
	expect(optionsBox?.width).toBeGreaterThanOrEqual(44);
	expect(optionsBox?.height).toBeGreaterThanOrEqual(44);
	expect(firstRowBox?.y).toBeLessThan(300);
	expect(
		await filterRail.evaluate((element) => getComputedStyle(element).overflowX)
	).toBe('auto');
	await expect(page.getByRole('progressbar')).toHaveCount(0);
	await expectResponsiveSurface(page, '/shopping (320px compact controls)', 320);
});
