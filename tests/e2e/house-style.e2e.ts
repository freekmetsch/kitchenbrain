import { expect, test, type Page } from '@playwright/test';
import { kitchenFixtureFor } from './fixtures';

const VIEWPORTS = [
	{ width: 320, height: 900 },
	{ width: 375, height: 900 },
	{ width: 393, height: 900 },
	{ width: 768, height: 900 },
	{ width: 1280, height: 900 }
] as const;
const GROVE_RGB = 'rgb(52, 79, 62)';
const PAPER_RGB = 'rgb(248, 245, 237)';

async function expectRouteFrame(page: Page, route: string, width: number): Promise<void> {
	await page.goto(route);
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
		const actions = ribbon.locator('.kitchen-page-header-actions');
		await expect(actions).toBeVisible();
		expect(await actions.evaluate((element) => getComputedStyle(element).boxShadow)).not.toBe(
			'none'
		);
		await expect(ribbon.locator('.kitchen-page-header-payload')).toBeVisible();
	} else {
		expect(
			await ribbon.locator('.kitchen-page-header-action .ui-action:visible').count()
		).toBeLessThanOrEqual(maxActions);
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
		await expect(page.getByRole('button', { name: 'Recent activity' })).toHaveAttribute(
			'aria-haspopup',
			'dialog'
		);
		await expect(page.getByRole('button', { name: 'Add', exact: true })).toHaveAttribute(
			'aria-haspopup',
			'dialog'
		);
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
			await expect(stockFilterTrigger).toHaveAttribute('data-ready', 'true');
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
		await expect(page.getByRole('button', { name: 'Add meal', exact: true })).toHaveAttribute(
			'aria-haspopup',
			'dialog'
		);
		await expect(page.locator('.plan-shopping-action')).toBeVisible();
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
		await expect(
			page.locator('.kitchen-page-header-action').getByRole('button')
		).toHaveCount(0);
		await expect(
			page.locator('.shopping-market-dock').getByRole('button', { name: 'Add item', exact: true })
		).toHaveAttribute('aria-haspopup', 'dialog');
		const setupAction = page
			.locator('.shopping-market-dock')
			.getByRole('button', { name: 'Shopping setup' });
		await expect(setupAction).toHaveAttribute('aria-haspopup', 'dialog');
		await expect(setupAction).toHaveAttribute('aria-expanded', 'false');
		expect((await setupAction.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
		await expect(page.locator('.shopping-readiness')).toHaveCount(0);
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
		await expect(page.getByRole('button', { name: '+ Meal', exact: true })).toHaveAttribute(
			'aria-haspopup',
			'dialog'
		);
		await expect(page.getByRole('button', { name: 'Import', exact: true })).toHaveAttribute(
			'aria-haspopup',
			'dialog'
		);
		const recipeCard = page.locator('.ui-recipe-card').first();
		await expect(recipeCard).toBeVisible();
		if (viewport.width < 1024) {
			const recipeFilterTrigger = page
				.getByTestId('recipes-command-header')
				.locator('.recipe-command-mobile')
				.getByRole('button', { name: /^Filters/ });
			await expect(recipeFilterTrigger).toHaveAttribute('data-ready', 'true', {
				timeout: 30_000
			});
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
		await expect
			.poll(() =>
				activeDestination.evaluate((element) => getComputedStyle(element).backgroundColor)
			)
			.toBe(PAPER_RGB);
	}
});

test('phone chassis joins the paper work surface to the Shopping action shelf', async ({ page }, testInfo) => {
	const fixture = kitchenFixtureFor(testInfo);
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
	const mainBox = await page.locator('main.app-main').boundingBox();
	expect(Math.abs((dockBox?.y ?? 0) + (dockBox?.height ?? 0) - (navBox?.y ?? 0))).toBeLessThan(1);
	expect(Math.abs((mainBox?.y ?? 0) + (mainBox?.height ?? 0) - (dockBox?.y ?? 0))).toBeLessThan(1);
	expect(dockBox?.x ?? 0).toBeCloseTo(6, 0);
	expect(await dock.evaluate((element) => getComputedStyle(element).borderBottomWidth)).toBe('0px');
	expect(await dock.evaluate((element) => getComputedStyle(element).backdropFilter)).toBe('none');

	const removed = page.waitForResponse(
		(response) =>
			response.request().method() === 'POST' &&
			response.url().endsWith('/api/shopping') &&
			response.request().postDataJSON().action === 'exclude_week_item'
	);
	await page
		.getByRole('button', {
			name: `Remove ${fixture.longShoppingNames[0]} from this week`
		})
		.click();
	expect((await removed).ok()).toBe(true);
	const toast = page.locator('.ui-z-toast');
	await expect(toast).toBeVisible();
	const toastBox = await toast.boundingBox();
	const currentDockBox = await dock.boundingBox();
	expect((toastBox?.y ?? 0) + (toastBox?.height ?? Number.POSITIVE_INFINITY)).toBeLessThan(
		currentDockBox?.y ?? 0
	);

	const restored = page.waitForResponse(
		(response) =>
			response.request().method() === 'POST' &&
			response.url().endsWith('/api/shopping') &&
			response.request().postDataJSON().action === 'restore_week_item'
	);
	await toast.getByRole('button', { name: 'Undo' }).click();
	expect((await restored).ok()).toBe(true);
});

test('Shopping hands one-off and plan setup into the inline weekly editor', async ({ page }) => {
	await page.setViewportSize({ width: 393, height: 844 });
	await page.goto('/shopping');
	await expect(page.locator('.app-shell[data-hydrated="true"]')).toBeVisible();

	await page
		.locator('.shopping-market-dock')
		.getByRole('button', { name: 'Add item', exact: true })
		.click();
	const addSheet = page.getByRole('dialog', { name: 'Add one-off item' });
	await expect(addSheet).toBeVisible();
	await addSheet.getByRole('button', { name: 'Manage weekly items' }).click();
	await expect(addSheet).toBeHidden();
	await expect(page.getByRole('radio', { name: 'Weekly items', exact: true })).toHaveAttribute(
		'aria-checked',
		'true'
	);
	await expect(page.getByRole('button', { name: 'Add weekly item', exact: true })).toBeFocused();

	await page.getByRole('radio', { name: 'All', exact: true }).click();
	await page.getByRole('button', { name: 'Shopping setup' }).click();
	const setupSheet = page.getByRole('dialog', { name: 'Shopping setup' });
	await setupSheet.getByRole('button', { name: 'Manage weekly items' }).click();
	await expect(setupSheet).toBeHidden();
	await expect(page.getByRole('button', { name: 'Add weekly item', exact: true })).toBeFocused();
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
			await expect(page.getByRole('button', { name: 'Plan', exact: true })).toHaveAttribute(
				'aria-haspopup',
				'dialog'
			);
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
	await expect(filterTrigger).toHaveAttribute('data-ready', 'true');
	await filterTrigger.focus();
	await filterTrigger.press('Enter');
	await expect(page.locator('dialog[open]')).toHaveJSProperty('open', true);
	expect(await page.locator('dialog[open]').evaluate((dialog) => dialog.matches(':modal'))).toBe(true);
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
	await shoppingFilters.scrollIntoViewIfNeeded();
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
	await page.goto('/shopping');
	await expect(page.locator('.app-shell[data-hydrated="true"]')).toBeVisible();
	await page.evaluate(() => {
		document.documentElement.setAttribute('data-theme', 'dark');
	});
	await expect(page.getByRole('heading', { name: 'Boodschappen', level: 1 })).toBeVisible();
	const setupAction = page.getByRole('button', { name: 'Boodschappen instellen' });
	await expect(setupAction).toBeVisible();
	await expect(setupAction).toHaveAttribute('aria-haspopup', 'dialog');
	expect(
		await page.evaluate(
			() => document.documentElement.scrollWidth - document.documentElement.clientWidth
		)
	).toBe(0);
	await page.evaluate(() => {
		document.documentElement.style.fontSize = '200%';
	});
	expect(
		await page.evaluate(
			() => document.documentElement.scrollWidth - document.documentElement.clientWidth
		)
	).toBe(0);
	expect((await setupAction.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
	await page.evaluate(() => {
		document.documentElement.style.fontSize = '';
	});
	await page
		.locator('.shopping-market-dock')
		.getByRole('button', { name: 'Item toevoegen', exact: true })
		.click();
	const darkField = page.getByRole('dialog', { name: 'Eenmalig item toevoegen' }).locator('.ui-field').first();
	await expect(darkField).toBeVisible();
	await darkField.focus();
	expect(await darkField.evaluate((element) => getComputedStyle(element).boxShadow)).not.toBe('none');
});

test('Green Ribbon menus become drawers on phone and keyboard popovers on desktop', async ({
	page
}, testInfo) => {
	test.setTimeout(90_000);

	for (const viewport of [
		{ width: 393, height: 900, compact: true },
		{ width: 1280, height: 900, compact: false }
	]) {
		await page.setViewportSize(viewport);
		await page.goto('/meal-plan');
		const mealPlanMore = page.getByRole('button', {
			name: 'More meal plan options',
			exact: true
		});
		await expect(mealPlanMore).toHaveAttribute('data-ready', 'true', { timeout: 30_000 });
		await mealPlanMore.click();
		if (viewport.compact) {
			const sheet = page.getByRole('dialog', { name: 'More meal plan options' });
			await expect(sheet).toBeVisible();
			expect(await sheet.evaluate((dialog) => dialog.matches(':modal'))).toBe(true);
			await expect(sheet.locator('[data-header-menu-item="sheet"]').first()).toBeFocused();
		} else {
			const menu = page.getByRole('menu');
			await expect(menu).toBeVisible();
			await expect(menu.getByRole('menuitem').first()).toBeFocused();
			await page.keyboard.press('Tab');
			await expect(mealPlanMore).toHaveAttribute('aria-expanded', 'false');
			await mealPlanMore.press('ArrowDown');
			await expect(menu).toBeVisible();
			await mealPlanMore.focus();
		}
		await page.keyboard.press('Escape');
		await expect(mealPlanMore).toHaveAttribute('aria-expanded', 'false');
		await expect(mealPlanMore).toBeFocused();
	}

	const fixture = kitchenFixtureFor(testInfo);
	const cookProgressKey = `cookmode-progress:${fixture.recipeSlug}:direct`;
	const seedCookProgress = async () => {
		await page.evaluate((key) => {
			localStorage.setItem(
				key,
				JSON.stringify({
					v: 5,
					sig: 'e2e-header-menu',
					frozenViewLang: 'en',
					currentStepKey: null,
					servings: 4,
					frozenRecipe: {
						signature: 'e2e-header-menu',
						storedCookMode: null,
						directions: ['Simmer until ready.', 'Serve the stew.'],
						directionIds: ['e2e-step-1', 'e2e-step-2'],
						ingredients: [],
						canonicalIngredients: [],
						baselineServings: 4
					},
					counterChecks: {},
					sessionSwaps: {}
				})
			);
		}, cookProgressKey);
		await page.reload();
	};
	await page.setViewportSize({ width: 393, height: 900 });
	await page.goto(`/recipes/${fixture.recipeSlug}`);
	await seedCookProgress();
	const recipeMore = page.getByRole('button', { name: 'More actions', exact: true });
	await expect(recipeMore).toBeVisible({ timeout: 30_000 });
	await recipeMore.click();
	const recipeSheet = page.getByRole('dialog', { name: 'More actions' });
	await expect(recipeSheet).toBeVisible();
	await recipeSheet.getByRole('button', { name: 'Start cooking over' }).click();
	await expect(recipeSheet).not.toBeVisible();
	await expect(page.getByRole('button', { name: 'Edit recipe', exact: true })).toBeFocused();

	await page.setViewportSize({ width: 1280, height: 900 });
	await seedCookProgress();
	await expect(recipeMore).toBeVisible();
	await recipeMore.click();
	const recipeMenu = page.getByRole('menu');
	await expect(recipeMenu).toBeVisible();
	expect(
		await recipeMenu.evaluate((menu) => {
			const rect = menu.getBoundingClientRect();
			const front = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
			return front === menu || (front instanceof Node && menu.contains(front));
		})
	).toBe(true);
	await page.keyboard.press('Escape');
	await expect(recipeMore).toBeFocused();
});

test('fresh recipe edits stay clean while recovered drafts remain explicit', async ({ page }, testInfo) => {
	const fixture = kitchenFixtureFor(testInfo);
	const route = `/recipes/${fixture.recipeSlug}/edit`;
	const key = `kitchenbrain:recipe-draft:${fixture.recipeSlug}`;
	await page.goto(route);
	await page.evaluate((draftKey) => sessionStorage.removeItem(draftKey), key);
	await page.reload();

	const save = page.getByRole('button', { name: 'Save changes' });
	await expect(save).toBeDisabled({ timeout: 15_000 });
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
