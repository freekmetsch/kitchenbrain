import { expect, test, type Page } from '@playwright/test';
import { kitchenFixtureFor } from './fixtures';

const VIEWPORTS = [
	{ width: 320, height: 900 },
	{ width: 393, height: 900 },
	{ width: 768, height: 900 },
	{ width: 1280, height: 900 }
] as const;
const GROVE_RGB = 'rgb(52, 79, 62)';
const PAPER_RGB = 'rgb(248, 245, 237)';

async function expectRouteFrame(page: Page, route: string, width: number): Promise<void> {
	await page.goto(route);
	await page.waitForLoadState('networkidle');
	await expect(page.locator('h1')).toHaveCount(1);
	expect(
		await page.evaluate(
			() => document.documentElement.scrollWidth - document.documentElement.clientWidth
		),
		`${route} must not overflow at ${width}px`
	).toBe(0);

	const shortActions = page.locator('.ui-action:visible');
	for (const action of await shortActions.all()) {
		expect((await action.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
	}
}

async function expectGroveSurfaceContinuity(page: Page, selector: string): Promise<void> {
	const geometry = await page.locator(selector).evaluate((element) => {
		const surface = element.getBoundingClientRect();
		const main = document.querySelector<HTMLElement>('main.app-main')?.getBoundingClientRect();
		return {
			left: surface.left,
			right: surface.right,
			bottomGap: main ? main.bottom - surface.bottom : null
		};
	});
	expect(geometry.bottomGap).not.toBeNull();
	expect(geometry.bottomGap ?? Number.POSITIVE_INFINITY).toBeLessThan(1);
}

async function expectGreenRibbon(
	page: Page,
	width: number,
	maxActions = 1,
	allowNarrowExpansion = false
): Promise<void> {
	const ribbon = page.locator('[data-house-style="green-ribbon"]');
	await expect(ribbon).toBeVisible();
	const ribbonHeight = (await ribbon.boundingBox())?.height ?? 0;
	const command = (await ribbon.getAttribute('data-variant')) === 'command';
	if (command) {
		expect(ribbonHeight).toBeGreaterThanOrEqual(width < 768 ? 144 : 104);
		expect(ribbonHeight).toBeLessThanOrEqual(width < 768 ? 230 : 190);
	} else if (allowNarrowExpansion && width <= 320) {
		expect(ribbonHeight).toBeGreaterThanOrEqual(64);
		expect(ribbonHeight).toBeLessThanOrEqual(120);
	} else {
		expect(ribbonHeight).toBeCloseTo(width < 768 ? 64 : 72, 0);
	}
	expect(await ribbon.evaluate((element) => getComputedStyle(element).backgroundImage)).toBe('none');
	expect(
		await ribbon.locator('h1').evaluate((element) => getComputedStyle(element).fontFamily)
	).not.toMatch(/Georgia|Times/i);
	if (command) {
		await expect(ribbon.locator('.kitchen-page-header-actions')).toBeVisible();
		await expect(ribbon.locator('.kitchen-page-header-payload')).toBeVisible();
	} else {
		expect(await ribbon.locator('.kitchen-page-header-action .ui-action').count()).toBeLessThanOrEqual(
			maxActions
		);
		await expect(ribbon.locator('.kitchen-page-header-payload')).toHaveCount(0);
	}
	expect(await ribbon.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe(
		GROVE_RGB
	);
}

test('house-style roles hold across stable routes and target viewports', async ({ page }) => {
	test.setTimeout(120_000);

	for (const viewport of VIEWPORTS) {
		await page.setViewportSize(viewport);

		await page.goto('/');
		expect(
			await page.evaluate(
				() => document.documentElement.scrollWidth - document.documentElement.clientWidth
			),
			`/ must not overflow at ${viewport.width}px`
		).toBe(0);
		const assistantSurface = page.locator('.ui-grove-surface');
		expect(
			await assistantSurface.evaluate(
				(element) => getComputedStyle(element, '::before').backgroundColor
			)
		).toBe(PAPER_RGB);

		await expectRouteFrame(page, '/inventory', viewport.width);
		await expectGreenRibbon(page, viewport.width);
		await expectGroveSurfaceContinuity(page, '.stock-ledger');
		const inventoryCard = page.locator('.stock-card').first();
		await expect(inventoryCard).toBeVisible();
		expect(await inventoryCard.evaluate((element) => getComputedStyle(element).borderLeftWidth)).toBe(
			'1px'
		);
		expect(await inventoryCard.evaluate((element) => getComputedStyle(element).borderRadius)).toBe(
			'12px'
		);
		expect(await inventoryCard.evaluate((element) => getComputedStyle(element).boxShadow)).not.toBe(
			'none'
		);
		if (viewport.width < 1024) {
			const stockFilterTrigger = page
				.getByTestId('inventory-command-header')
				.locator('.stock-command-mobile')
				.getByRole('button', { name: /^Filters/ });
			await stockFilterTrigger.press('Enter');
			const stockFilters = page.getByRole('dialog', { name: 'Stock filters' });
			await expect(stockFilters).toBeVisible();
			for (const label of ['Storage', 'Food class', 'Needs review']) {
				await expect(stockFilters.getByRole('combobox', { name: label })).toBeVisible();
			}
			await stockFilters.getByRole('button', { name: 'Show results' }).click();
		} else {
			for (const label of ['Storage', 'Food class', 'Needs review']) {
				await expect(page.getByRole('combobox', { name: label })).toBeVisible();
			}
		}
		await expect(inventoryCard.locator('.ui-status-dot')).toHaveCount(0);
		const stockCards = page.locator('.stock-card');
		if ((await stockCards.count()) > 1) {
			const first = await stockCards.nth(0).boundingBox();
			const second = await stockCards.nth(1).boundingBox();
			expect((second?.y ?? 0) - ((first?.y ?? 0) + (first?.height ?? 0))).toBeGreaterThan(0);
		}
		if (viewport.width === 1280) {
			const focusedContent = page.locator('.stock-ledger > *').first();
			expect((await focusedContent.boundingBox())?.width ?? 0).toBeLessThanOrEqual(832);
		}

		await expectRouteFrame(page, '/meal-plan', viewport.width);
		await expectGreenRibbon(page, viewport.width, 3, true);
		await expectGroveSurfaceContinuity(page, '.plan-ledger');
		await expect(page.getByRole('button', { name: 'Add meal', exact: true })).toBeVisible();
		await expect(page.getByRole('link', { name: /Delivery|Shopping/ })).toBeVisible();
		await expect(page.locator('.plan-more[aria-label="More meal plan options"]')).toBeVisible();
		const mealCards = page.locator('.plan-meal-list > li');
		await expect(mealCards.first()).toBeVisible();
		expect(await mealCards.first().evaluate((element) => getComputedStyle(element).borderRadius)).toBe(
			'14px'
		);
		expect(
			await mealCards.first().evaluate((element) =>
				getComputedStyle(element).gridTemplateRows.split(' ').length
			)
		).toBe(2);

		await expectRouteFrame(page, '/shopping', viewport.width);
		await expectGreenRibbon(page, viewport.width, 1, true);
		const shoppingUtility = page.locator('.ui-page-utility');
		expect(await shoppingUtility.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe(
			GROVE_RGB
		);
		expect(await shoppingUtility.evaluate((element) => getComputedStyle(element).borderTopWidth)).toBe(
			'0px'
		);
		expect(await shoppingUtility.evaluate((element) => getComputedStyle(element).borderBottomWidth)).toBe(
			'0px'
		);
		await expect(
			page.locator('.kitchen-page-header-action [data-house-style="status-badge"]')
		).toHaveCount(1);
		await expect(page.locator('.ui-page-utility [data-house-style="status-badge"]')).toHaveCount(0);
		const shoppingFilters = page.getByRole('radiogroup', { name: 'Filter shopping list' });
		await expect(shoppingFilters).toBeVisible();
		for (const option of await shoppingFilters.getByRole('radio').all()) {
			await expect(option).toHaveAttribute('aria-checked', /true|false/);
		}
		await expect(shoppingFilters.locator('.ui-segmented-indicator')).toHaveClass(/visible/);
		if (viewport.width === 1280) {
			const layout = await page.locator('.shopping-market-layout').boundingBox();
			expect(Math.abs((layout?.x ?? 0) + (layout?.width ?? 0) / 2 - 640)).toBeLessThan(1);
			expect(layout?.width ?? 0).toBeLessThanOrEqual(832);
		}

		await expectRouteFrame(page, '/recipes', viewport.width);
		await expectGreenRibbon(page, viewport.width);
		await expectGroveSurfaceContinuity(page, '.recipe-ledger');
		const recipeCard = page.locator('.ui-recipe-card').first();
		await expect(recipeCard).toBeVisible();
		if (viewport.width < 1024) {
			const recipeFilterTrigger = page
				.getByTestId('recipes-command-header')
				.locator('.recipe-command-mobile')
				.getByRole('button', { name: /^Filters/ });
			await recipeFilterTrigger.press('Enter');
			const recipeFilters = page.getByRole('dialog', { name: 'Recipe filters' });
			await expect(recipeFilters).toBeVisible();
			await expect(recipeFilters.getByRole('group', { name: 'Recipe status filters' })).toBeVisible();
			await expect(recipeFilters.getByRole('combobox', { name: 'Food type' })).toBeVisible();
			await expect(recipeFilters.getByRole('combobox', { name: 'Dish type' })).toBeVisible();
			await recipeFilters.getByRole('button', { name: 'Show results' }).click();
		} else {
			await expect(page.getByRole('group', { name: 'Recipe status filters' })).toBeVisible();
			await expect(page.getByRole('combobox', { name: 'Food type' })).toBeVisible();
			await expect(page.getByRole('combobox', { name: 'Dish type' })).toBeVisible();
		}
		expect(
			await page.locator('.recipe-command-toolbar').evaluate((element) => element.scrollWidth - element.clientWidth)
		).toBe(0);
		expect(await recipeCard.evaluate((element) => getComputedStyle(element).borderRadius)).toBe(
			'14px'
		);
		const expectedColumns = viewport.width < 768 ? 1 : viewport.width < 1088 ? 2 : 3;
		expect(
			(await page.locator('.recipe-grid').evaluate((element) =>
				getComputedStyle(element).gridTemplateColumns.split(' ').length
			))
		).toBe(expectedColumns);
		await expect(recipeCard.locator('.recipe-card-main:not(.has-image) figure')).toHaveCount(0);
		const recipeCards = page.locator('.ui-recipe-card');
		if ((await recipeCards.count()) > 1) {
			const first = await recipeCards.nth(0).boundingBox();
			const second = await recipeCards.nth(1).boundingBox();
			const separated =
				(second?.x ?? 0) > (first?.x ?? 0) + (first?.width ?? 0) ||
				(second?.y ?? 0) > (first?.y ?? 0) + (first?.height ?? 0);
			expect(separated).toBe(true);
		}

		await expectRouteFrame(page, '/settings/data', viewport.width);
		await expectGreenRibbon(page, viewport.width);
		const notice = page.locator('[data-house-style="notice"]').first();
		await expect(notice).toBeVisible();
		await expect(notice).toHaveAttribute('data-tone', 'warning');
		expect(await notice.evaluate((element) => getComputedStyle(element).boxShadow)).toBe('none');
		expect(await notice.evaluate((element) => getComputedStyle(element).borderLeftWidth)).toBe(
			'1px'
		);
		expect(await notice.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe(
			'rgba(0, 0, 0, 0)'
		);

		const passiveStatuses = page.locator('[data-house-style="status-badge"]');
		for (const status of await passiveStatuses.all()) {
			await expect(status).not.toHaveAttribute('tabindex', /.+/);
			await expect(status.locator('.ui-status-dot')).toHaveCount(1);
		}

		const nav = page.getByRole('navigation', { name: /Primary|Primair/ });
		expect(await nav.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe(
			GROVE_RGB
		);
		const activeDestination = nav.locator('[aria-current="page"]');
		await expect(activeDestination).toHaveCount(1);
		expect(
			await activeDestination.evaluate((element) => getComputedStyle(element).backgroundColor)
		).toBe(PAPER_RGB);
	}
});

test('phone chassis joins the paper work surface to the Shopping action shelf', async ({ page }) => {
	await page.setViewportSize({ width: 393, height: 844 });
	await page.goto('/shopping');
	await page.waitForLoadState('networkidle');

	const surface = page.locator('.shopping-market-layout');
	expect(
		await surface.evaluate((element) => getComputedStyle(element, '::before').backgroundColor)
	).toBe(PAPER_RGB);
	expect(
		await surface.evaluate((element) => getComputedStyle(element, '::before').borderRadius)
	).toBe('14px');

	const dock = page.locator('.shopping-market-dock');
	const nav = page.getByRole('navigation', { name: /Primary|Primair/ });
	const dockBox = await dock.boundingBox();
	const navBox = await nav.boundingBox();
	expect(Math.abs((dockBox?.y ?? 0) + (dockBox?.height ?? 0) - (navBox?.y ?? 0))).toBeLessThan(1);
	expect(dockBox?.x ?? 0).toBeCloseTo(6, 0);
	expect(await dock.evaluate((element) => getComputedStyle(element).borderBottomWidth)).toBe('0px');
	expect(await dock.evaluate((element) => getComputedStyle(element).backdropFilter)).toBe('none');
});

test('contextual Recipe ribbons keep the family geometry while fitting Back and action', async ({
	page
}, testInfo) => {
	const fixture = kitchenFixtureFor(testInfo);
	await page.setViewportSize({ width: 320, height: 900 });

	for (const route of [
		`/recipes/${fixture.recipeSlug}`,
		`/recipes/${fixture.recipeSlug}/edit`
	]) {
		await page.goto(route);
		await page.waitForLoadState('networkidle');
		await expectGreenRibbon(page, 320);

		const ribbon = page.locator('[data-house-style="green-ribbon"]');
		await expect(ribbon).toHaveAttribute('data-layout', 'contextual');
		const leading = ribbon.locator('.kitchen-page-header-leading');
		const command = (await ribbon.getAttribute('data-variant')) === 'command';
		const action = ribbon.locator(
			command ? '.kitchen-page-header-actions' : '.kitchen-page-header-action'
		);
		await expect(leading).toBeVisible();
		await expect(action).toBeVisible();

		const leadingBox = await leading.boundingBox();
		const actionBox = await action.boundingBox();
		if (command) {
			expect(actionBox?.y ?? 0).toBeGreaterThan(leadingBox?.y ?? 0);
		} else {
			expect(Math.abs((leadingBox?.y ?? 0) - (actionBox?.y ?? 0))).toBeLessThan(1);
		}
		expect(actionBox?.height ?? 0).toBeGreaterThanOrEqual(44);
		expect(
			await page.evaluate(
				() => document.documentElement.scrollWidth - document.documentElement.clientWidth
			)
		).toBe(0);
	}

	await page.setViewportSize({ width: 1280, height: 900 });
	await page.goto(`/recipes/${fixture.recipeSlug}`);
	await page.waitForLoadState('networkidle');
	const detailSurface = page.locator('.recipe-detail-page > .ui-grove-surface');
	const detailPaper = await detailSurface.evaluate((element) => {
		const rect = element.getBoundingClientRect();
		const style = getComputedStyle(element, '::before');
		return {
			elementLeft: rect.left,
			paperWidth: Number.parseFloat(style.width)
		};
	});
	expect(detailPaper.elementLeft).toBeGreaterThan(6);
	expect(detailPaper.paperWidth).toBeCloseTo(1268, 0);

	await page.goto(`/recipes/${fixture.recipeSlug}/edit`);
	const recipeRibbon = page.locator('[data-house-style="green-ribbon"]');
	await expect(recipeRibbon.locator('h1')).toContainText('E2E');
	await expect(recipeRibbon.locator('p')).toContainText(/Edit|Bewerk/);

	await page.evaluate(() => {
		document.cookie = 'PARAGLIDE_LOCALE=nl; path=/';
	});
	await page.setViewportSize({ width: 320, height: 900 });
	await page.reload();
	await expectGreenRibbon(page, 320);
	expect(
		await page.evaluate(
			() => document.documentElement.scrollWidth - document.documentElement.clientWidth
		)
	).toBe(0);

	const ribbon = page.locator('[data-house-style="green-ribbon"]');
	await page.evaluate(() => {
		document.documentElement.style.fontSize = '200%';
	});
	await expect
		.poll(async () => (await ribbon.boundingBox())?.height ?? 0)
		.toBeGreaterThan(64);
	await expect(ribbon.locator('h1')).toBeVisible();
	await expect(ribbon.locator('.kitchen-page-header-action')).toBeVisible();
	expect(
		await page.evaluate(
			() => document.documentElement.scrollWidth - document.documentElement.clientWidth
		)
	).toBe(0);

	await page.evaluate(() => {
		document.documentElement.style.fontSize = '';
	});
	await page.setViewportSize({ width: 393, height: 900 });
	await page.reload();
	await expectGreenRibbon(page, 393);
	expect((await ribbon.locator('.kitchen-page-header-action').boundingBox())?.width ?? 0).toBeGreaterThan(
		44
	);
	expect(
		(await ribbon.locator('.kitchen-page-header-action-label').boundingBox())?.width ?? 0
	).toBeGreaterThan(1);
});

test('selection, language, theme, and keyboard states remain explicit', async ({ page }) => {
	await page.setViewportSize({ width: 393, height: 900 });
	await page.goto('/recipes');
	await page.waitForLoadState('networkidle');

	const filterTrigger = page.getByRole('button', { name: /^Filters/ });
	await filterTrigger.focus();
	await filterTrigger.press('Enter');
	const firstFilter = page
		.getByRole('dialog', { name: 'Recipe filters' })
		.getByRole('button', { name: 'Have all' });
	await expect(firstFilter).toBeFocused();
	expect(
		await firstFilter.evaluate((element) => getComputedStyle(element).outlineStyle)
	).toBe('solid');
	const beforePressed = await firstFilter.getAttribute('aria-pressed');
	await firstFilter.press('Space');
	await expect(firstFilter).toHaveAttribute('aria-pressed', beforePressed === 'true' ? 'false' : 'true');
	if (beforePressed !== 'true') {
		await expect
			.poll(() => firstFilter.evaluate((element) => getComputedStyle(element).backgroundColor))
			.toBe(GROVE_RGB);
	}

	await page.goto('/shopping');
	const shoppingFilters = page.getByRole('radiogroup', { name: 'Filter shopping list' });
	const allFilter = shoppingFilters.getByRole('radio', { name: 'All', exact: true });
	const weeklyFilter = shoppingFilters.getByRole('radio', { name: 'Weekly items', exact: true });
	const indicator = shoppingFilters.locator('.ui-segmented-indicator');
	await expect(indicator).toHaveClass(/visible/);
	const indicatorStart = await indicator.boundingBox();
	await allFilter.focus();
	await expect(allFilter).toBeFocused();
	await allFilter.press('ArrowRight');
	await expect(weeklyFilter).toBeFocused();
	await expect(weeklyFilter).toHaveAttribute('aria-checked', 'true');
	await expect
		.poll(async () => (await indicator.boundingBox())?.x ?? 0)
		.toBeGreaterThan(indicatorStart?.x ?? 0);
	await page.evaluate(() => {
		document.cookie = 'PARAGLIDE_LOCALE=nl; path=/';
	});
	await page.reload();
	await page.evaluate(() => {
		document.documentElement.setAttribute('data-theme', 'dark');
	});
	await expect(page.getByRole('heading', { name: 'Boodschappen', level: 1 })).toBeVisible();
	expect(
		await page.evaluate(
			() => document.documentElement.scrollWidth - document.documentElement.clientWidth
		)
	).toBe(0);
	const darkField = page.locator('.ui-field').first();
	await expect(darkField).toBeVisible();
	await darkField.focus();
	expect(await darkField.evaluate((element) => getComputedStyle(element).boxShadow)).not.toBe('none');
});

test('fresh recipe edits stay clean while recovered drafts remain explicit', async ({ page }, testInfo) => {
	const fixture = kitchenFixtureFor(testInfo);
	const route = `/recipes/${fixture.recipeSlug}/edit`;
	const key = `kitchenbrain:recipe-draft:${fixture.recipeSlug}`;
	await page.goto(route);
	await page.evaluate((draftKey) => sessionStorage.removeItem(draftKey), key);
	await page.reload();

	const save = page.getByRole('button', { name: 'Save changes' });
	await expect(save).toBeDisabled();
	await expect.poll(() => page.evaluate((draftKey) => sessionStorage.getItem(draftKey), key)).toBeNull();

	const title = page.getByLabel('Title');
	await title.fill(`${fixture.recipeTitle} recovered`);
	await expect(save).toBeEnabled();
	await expect.poll(() => page.evaluate((draftKey) => sessionStorage.getItem(draftKey), key)).not.toBeNull();

	page.once('dialog', (dialog) => dialog.accept());
	await page.reload();
	await expect(page.getByText('Your unsaved draft was restored.', { exact: true })).toBeVisible();
	await expect(save).toBeEnabled();
	await expect(title).toHaveValue(`${fixture.recipeTitle} recovered`);

	await page.getByRole('button', { name: 'Discard draft' }).click();
	await expect(save).toBeDisabled();
	await expect(title).toHaveValue(fixture.recipeTitle);
	await expect.poll(() => page.evaluate((draftKey) => sessionStorage.getItem(draftKey), key)).toBeNull();
});

test.describe('unauthenticated field contract', () => {
	test.use({ storageState: { cookies: [], origins: [] } });

	test('login field keeps 44px focus and invalid states', async ({ page }) => {
		await page.setViewportSize({ width: 320, height: 900 });
		await page.goto('/login');
		await expectGreenRibbon(page, 320);
		const username = page.locator('input[name="username"]');
		await expect(username).toBeVisible();
		expect((await username.boundingBox())?.height).toBe(44);
		await username.focus();
		const focusedBorder = await username.evaluate(
			(element) => getComputedStyle(element).borderColor
		);
		await username.fill('x');
		await username.fill('');
		await page.locator('input[name="password"]').focus();
		expect(await username.evaluate((element) => element.matches(':user-invalid'))).toBe(true);
		expect(await username.evaluate((element) => getComputedStyle(element).borderColor)).not.toBe(
			focusedBorder
		);
		expect(await username.evaluate((element) => getComputedStyle(element).boxShadow)).not.toBe(
			'none'
		);
		expect(
			await page.evaluate(
				() => document.documentElement.scrollWidth - document.documentElement.clientWidth
			)
		).toBe(0);
	});
});
