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

async function expectGreenRibbon(page: Page, width: number): Promise<void> {
	const ribbon = page.locator('[data-house-style="green-ribbon"]');
	await expect(ribbon).toBeVisible();
	expect((await ribbon.boundingBox())?.height ?? 0).toBeCloseTo(width < 768 ? 64 : 72, 0);
	expect(await ribbon.evaluate((element) => getComputedStyle(element).backgroundImage)).toBe('none');
	expect(
		await ribbon.locator('h1').evaluate((element) => getComputedStyle(element).fontFamily)
	).not.toMatch(/Georgia|Times/i);
	expect(await ribbon.locator('.kitchen-page-header-action .ui-action').count()).toBeLessThanOrEqual(
		1
	);
	await expect(ribbon.locator('.kitchen-page-header-payload')).toHaveCount(0);
	expect(await ribbon.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe(
		GROVE_RGB
	);
}

test('house-style roles hold across stable routes and target viewports', async ({ page }) => {
	test.setTimeout(90_000);

	for (const viewport of VIEWPORTS) {
		await page.setViewportSize(viewport);

		await page.goto('/');
		await page.waitForLoadState('networkidle');
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
		const inventoryGroup = page.locator('.ui-list-group').first();
		await expect(inventoryGroup).toBeVisible();
		expect(await inventoryGroup.evaluate((element) => getComputedStyle(element).borderLeftWidth)).toBe(
			'1px'
		);
		expect(await inventoryGroup.evaluate((element) => getComputedStyle(element).borderRadius)).toBe(
			'14px'
		);
		expect(await inventoryGroup.evaluate((element) => getComputedStyle(element).boxShadow)).not.toBe(
			'none'
		);
		if (viewport.width === 1280) {
			const focusedContent = page.locator('.stock-ledger > *').first();
			expect((await focusedContent.boundingBox())?.width ?? 0).toBeLessThanOrEqual(832);
		}

		await expectRouteFrame(page, '/meal-plan', viewport.width);
		await expectGreenRibbon(page, viewport.width);

		await expectRouteFrame(page, '/shopping', viewport.width);
		await expectGreenRibbon(page, viewport.width);
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
		const chips = page.locator('[data-house-style="filter-chip"]:visible');
		expect(await chips.count()).toBeGreaterThan(0);
		for (const chip of await chips.all()) {
			const hit = await chip.boundingBox();
			const visual = await chip.locator('.ui-filter-chip-visual').boundingBox();
			expect(hit?.height ?? 0).toBe(44);
			expect(visual?.height ?? 0).toBe(32);
			await expect(chip).toHaveAttribute('aria-pressed', /true|false/);
		}

		await expectRouteFrame(page, '/recipes', viewport.width);
		await expectGreenRibbon(page, viewport.width);
		const recipeCard = page.locator('.ui-recipe-card').first();
		await expect(recipeCard).toBeVisible();
		const expectedColumns = viewport.width < 768 ? 1 : viewport.width < 1088 ? 2 : 3;
		expect(
			(await page.locator('.recipe-grid').evaluate((element) =>
				getComputedStyle(element).gridTemplateColumns.split(' ').length
			))
		).toBe(expectedColumns);
		await expect(recipeCard.locator('.recipe-card-main:not(.has-image) figure')).toHaveCount(0);

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
		const action = ribbon.locator('.kitchen-page-header-action');
		await expect(leading).toBeVisible();
		await expect(action).toBeVisible();

		const leadingBox = await leading.boundingBox();
		const actionBox = await action.boundingBox();
		expect(Math.abs((leadingBox?.y ?? 0) - (actionBox?.y ?? 0))).toBeLessThan(1);
		expect(actionBox?.height ?? 0).toBeGreaterThanOrEqual(44);
		expect(
			await page.evaluate(
				() => document.documentElement.scrollWidth - document.documentElement.clientWidth
			)
		).toBe(0);
	}

	await page.goto(`/recipes/${fixture.recipeSlug}/edit`);
	const recipeRibbon = page.locator('[data-house-style="green-ribbon"]');
	await expect(recipeRibbon.locator('h1')).toContainText('E2E');
	await expect(recipeRibbon.locator('p')).toContainText(/Edit|Bewerk/);

	await page.evaluate(() => {
		document.cookie = 'PARAGLIDE_LOCALE=nl; path=/';
	});
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

	const firstChip = page.locator('[data-house-style="filter-chip"]').first();
	await firstChip.focus();
	await expect(firstChip).toBeFocused();
	expect(
		await firstChip
			.locator('.ui-filter-chip-visual')
			.evaluate((element) => getComputedStyle(element).outlineStyle)
	).toBe('solid');
	const beforePressed = await firstChip.getAttribute('aria-pressed');
	await firstChip.press('Space');
	await expect(firstChip).toHaveAttribute('aria-pressed', beforePressed === 'true' ? 'false' : 'true');
	if (beforePressed !== 'true') {
		await expect
			.poll(() =>
				firstChip
					.locator('.ui-filter-chip-visual')
					.evaluate((element) => getComputedStyle(element).backgroundColor)
			)
			.toBe(GROVE_RGB);
	}

	await page.goto('/shopping');
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
