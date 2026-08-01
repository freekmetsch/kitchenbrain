import { expect, test, type Page, type Request, type Route } from '@playwright/test';
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

async function expectShoppingFocusInAppViewport(page: Page): Promise<void> {
	const state = await page.evaluate(() => {
		const focused = document.activeElement as HTMLElement | null;
		const row = focused?.closest<HTMLElement>('.market-run-row') ?? focused;
		const rowRect = row?.getBoundingClientRect();
		const mainRect = document.querySelector<HTMLElement>('main.app-main')?.getBoundingClientRect();
		const dockTop =
			document.querySelector<HTMLElement>('.shopping-market-dock')?.getBoundingClientRect().top ??
			window.innerHeight;
		return {
			windowScrollY: window.scrollY,
			focusedKey: focused?.dataset.shoppingKey ?? null,
			top: rowRect?.top ?? null,
			bottom: rowRect?.bottom ?? null,
			mainTop: mainRect?.top ?? 0,
			visibleBottom: Math.min(mainRect?.bottom ?? window.innerHeight, dockTop)
		};
	});
	expect(state.windowScrollY).toBe(0);
	expect(state.focusedKey).not.toBeNull();
	expect(state.top ?? -1).toBeGreaterThanOrEqual(state.mainTop);
	expect(state.bottom ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(state.visibleBottom);
}

function nextWeek(weekStart: string): string {
	const date = new Date(`${weekStart}T12:00:00Z`);
	date.setUTCDate(date.getUTCDate() + 7);
	return date.toISOString().slice(0, 10);
}

function needCombobox(page: Page, name: string | RegExp) {
	return page.getByRole('combobox', { name, exact: typeof name === 'string' });
}

test('Shopping keeps source order, focus, and singleton reflow local', async ({ page }, testInfo) => {
	test.setTimeout(180_000);
	const fixture = kitchenFixtureFor(testInfo);
	await page.setViewportSize({ width: 375, height: 812 });
	await page.goto('/shopping');
	await page.waitForLoadState('networkidle');

	const appMain = page.locator('main.app-main');
	const filterRail = page.getByRole('radiogroup', { name: 'Filter shopping list' });
	const filterOrder = async () =>
		filterRail.getByRole('radio').evaluateAll((buttons) =>
			buttons.map((button) => button.textContent?.trim() ?? '')
		);
	const recipeTarget = page.getByRole('checkbox', {
		name: `Mark ${fixture.shoppingName} bought`
	});
	const recipeTargetHit = recipeTarget.locator('xpath=ancestor::label[1]');
	const beforeFilters = await filterOrder();

	const visibleTarget = page.getByRole('checkbox', {
		name: `Mark ${fixture.longShoppingNames[fixture.longShoppingNames.length - 1]} bought`
	});
	await visibleTarget.evaluate((element) => {
		element.scrollIntoView({ block: 'center' });
		window.scrollTo({ top: 0 });
	});
	const beforeScrollTop = await appMain.evaluate((element) => element.scrollTop);
	expect(beforeScrollTop).toBeGreaterThanOrEqual(600);
	const visibleKey = await visibleTarget.getAttribute('data-shopping-key');
	expect(visibleKey).not.toBeNull();
	const visibleTargetHit = visibleTarget.locator('xpath=ancestor::label[1]');

	const checked = page.waitForResponse(
		(response) =>
			response.request().method() === 'POST' && response.url().endsWith('/api/shopping')
	);
	await visibleTargetHit.click();
	expect((await checked).ok()).toBe(true);
	await expect
		.poll(() =>
			page.evaluate(
				() => (document.activeElement as HTMLElement | null)?.dataset.shoppingKey ?? null
			)
		)
		.not.toBeNull();

	const pointerState = await page.evaluate(() => {
		const focused = document.activeElement as HTMLElement | null;
		const dock = document.querySelector<HTMLElement>('.shopping-market-dock');
		const focusRect = focused?.getBoundingClientRect();
		return {
			windowScrollY: window.scrollY,
			appScrollTop: document.querySelector<HTMLElement>('main.app-main')?.scrollTop ?? -1,
			focusedKey: focused?.dataset.shoppingKey ?? null,
			focusTop: focusRect?.top ?? null,
			focusBottom: focusRect?.bottom ?? null,
			dockTop: dock?.getBoundingClientRect().top ?? window.innerHeight
		};
	});
	expect.soft(pointerState.windowScrollY).toBe(0);
	expect.soft(pointerState.appScrollTop).toBe(beforeScrollTop);
	expect.soft(pointerState.focusedKey).not.toBeNull();
	expect.soft(pointerState.focusTop ?? -1).toBeGreaterThanOrEqual(0);
	expect.soft(pointerState.focusBottom ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(
		pointerState.dockTop
	);

	const restored = page.waitForResponse(
		(response) =>
			response.request().method() === 'POST' && response.url().endsWith('/api/shopping')
	);
	await page.getByRole('button', { name: 'Undo' }).click();
	expect((await restored).ok()).toBe(true);
	await expect(visibleTarget).toBeVisible();
	await expect(visibleTarget).toBeEnabled();

	await visibleTarget.evaluate((element) => {
		element.scrollIntoView({ block: 'center' });
		window.scrollTo({ top: 0 });
	});
	const keyboardChecked = page.waitForResponse(
		(response) =>
			response.request().method() === 'POST' && response.url().endsWith('/api/shopping')
	);
	await visibleTarget.evaluate((element) => element.focus({ preventScroll: true }));
	await page.keyboard.press('Space');
	expect((await keyboardChecked).ok()).toBe(true);
	await expect
		.poll(() =>
			page.evaluate(
				() => (document.activeElement as HTMLElement | null)?.dataset.shoppingKey ?? null
			)
		)
		.not.toBeNull();
	const keyboardState = await page.evaluate(() => ({
		windowScrollY: window.scrollY,
		appScrollTop: document.querySelector<HTMLElement>('main.app-main')?.scrollTop ?? -1,
		focusedKey: (document.activeElement as HTMLElement | null)?.dataset.shoppingKey ?? null
	}));
	expect.soft(keyboardState.windowScrollY).toBe(0);
	expect.soft(keyboardState.appScrollTop).toBeGreaterThan(0);
	expect.soft(keyboardState.focusedKey).not.toBeNull();
	await expectShoppingFocusInAppViewport(page);

	const keyboardRestored = page.waitForResponse(
		(response) =>
			response.request().method() === 'POST' && response.url().endsWith('/api/shopping')
	);
	await page.getByRole('button', { name: 'Undo' }).click();
	expect((await keyboardRestored).ok()).toBe(true);
	await expect(visibleTarget).toBeVisible();
	await expect(visibleTarget).toBeEnabled();

	const recipeChecked = page.waitForResponse(
		(response) =>
			response.request().method() === 'POST' && response.url().endsWith('/api/shopping')
	);
	await recipeTarget.evaluate((element) => {
		if (element instanceof HTMLElement) element.click();
	});
	expect((await recipeChecked).ok()).toBe(true);
	const afterRecipeFilters = await filterOrder();
	expect.soft(afterRecipeFilters).toEqual(beforeFilters);
	const recipeRestored = page.waitForResponse(
		(response) =>
			response.request().method() === 'POST' && response.url().endsWith('/api/shopping')
	);
	await page.getByRole('button', { name: 'Undo' }).click();
	expect((await recipeRestored).ok()).toBe(true);
	await expect(recipeTarget).toBeVisible();
	await expect(recipeTarget).toBeEnabled();

	await page.setViewportSize({ width: 1280, height: 800 });
	await page.goto('/shopping');
	await page.waitForLoadState('networkidle');
	await page.locator('main.app-main').evaluate((element) => {
		element.scrollTop = 0;
		window.scrollTo({ top: 0 });
	});
	const targetSection = recipeTarget.locator('xpath=ancestor::section[1]');
	const nextSection = targetSection.locator('xpath=following-sibling::section[1]');
	const beforeNextSection = await nextSection.boundingBox();
	expect(beforeNextSection).not.toBeNull();
	const nextSectionHeading = (await nextSection.locator('h2').textContent())?.trim();
	expect(nextSectionHeading).toBeTruthy();
	await page.evaluate(
		({ heading, beforeY }) => {
			const state = window as Window & { __shoppingMotionSamples?: number[] };
			state.__shoppingMotionSamples = [];
			const startedAt = performance.now();
			const sample = () => {
				const section = [...document.querySelectorAll<HTMLElement>('.shopping-ledger-section')].find(
					(candidate) => candidate.querySelector('h2')?.textContent?.trim() === heading
				);
				if (section) {
					state.__shoppingMotionSamples?.push(beforeY - section.getBoundingClientRect().y);
				}
				if (performance.now() - startedAt < 800) requestAnimationFrame(sample);
			};
			requestAnimationFrame(sample);
		},
		{ heading: nextSectionHeading!, beforeY: beforeNextSection!.y }
	);

	const desktopChecked = page.waitForResponse(
		(response) =>
			response.request().method() === 'POST' && response.url().endsWith('/api/shopping')
	);
	await recipeTarget.evaluate((element) => {
		if (element instanceof HTMLElement) element.click();
	});
	expect((await desktopChecked).ok()).toBe(true);
	await page.waitForTimeout(850);
	const settledNextSection = await page
		.locator('.shopping-ledger-section')
		.filter({ has: page.getByRole('heading', { name: nextSectionHeading!, exact: true }) })
		.boundingBox();
	const settledShift = (beforeNextSection?.y ?? 0) - (settledNextSection?.y ?? 0);
	const motionSamples = await page.evaluate(
		() =>
			(window as Window & { __shoppingMotionSamples?: number[] }).__shoppingMotionSamples ?? []
	);
	const intermediateShift = motionSamples.find(
		(shift) => shift > 0 && shift < settledShift - 8
	);
	expect.soft(settledShift).toBeGreaterThan(48);
	expect.soft(intermediateShift).toBeDefined();

	const desktopRestored = page.waitForResponse(
		(response) =>
			response.request().method() === 'POST' && response.url().endsWith('/api/shopping')
	);
	await page.getByRole('button', { name: 'Undo' }).click();
	expect((await desktopRestored).ok()).toBe(true);
	await expect(recipeTarget).toBeVisible();
	await expect(recipeTarget).toBeEnabled();

	let shoppingPosts = 0;
	const countShoppingPost = (request: Request) => {
		if (request.method() === 'POST' && request.url().endsWith('/api/shopping')) {
			shoppingPosts += 1;
		}
	};
	page.on('request', countShoppingPost);
	const doubleChecked = page.waitForResponse(
		(response) =>
			response.request().method() === 'POST' && response.url().endsWith('/api/shopping')
	);
	await recipeTargetHit.evaluate((element) => {
		if (!(element instanceof HTMLElement)) return;
		element.click();
		element.click();
	});
	expect((await doubleChecked).ok()).toBe(true);
	await page.waitForTimeout(100);
	expect(shoppingPosts).toBe(1);
	page.off('request', countShoppingPost);
	const doubleRestored = page.waitForResponse(
		(response) =>
			response.request().method() === 'POST' && response.url().endsWith('/api/shopping')
	);
	await page.getByRole('button', { name: 'Undo' }).click();
	expect((await doubleRestored).ok()).toBe(true);
});

test('Shopping settles without an invisible delay under reduced motion', async ({ page }, testInfo) => {
	const fixture = kitchenFixtureFor(testInfo);
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.setViewportSize({ width: 1280, height: 800 });
	await page.goto('/shopping');
	await page.waitForLoadState('networkidle');

	const target = page.getByRole('checkbox', {
		name: `Mark ${fixture.shoppingName} bought`
	});
	const targetSection = target.locator('xpath=ancestor::section[1]');
	await expect(targetSection).toHaveCount(1);
	const checked = page.waitForResponse(
		(response) =>
			response.request().method() === 'POST' && response.url().endsWith('/api/shopping')
	);
	await target.evaluate((element) => {
		if (element instanceof HTMLElement) element.click();
	});
	expect((await checked).ok()).toBe(true);
	await expect(targetSection).toHaveCount(0);
	await expect(page.locator('.market-run-row[aria-busy="true"]')).toHaveCount(0);

	const restored = page.waitForResponse(
		(response) =>
			response.request().method() === 'POST' && response.url().endsWith('/api/shopping')
	);
	await page.getByRole('button', { name: 'Undo' }).click();
	expect((await restored).ok()).toBe(true);
	await expect(target).toBeVisible();
});

test('Shopping connected dock keeps Review contextual without contacting AH', async (
	{ page },
	testInfo
) => {
	test.skip(process.env.E2E_AH_CONNECTED !== '1', 'Runs in the opt-in connected-AH fixture.');
	const fixture = kitchenFixtureFor(testInfo);
	let ahRequests = 0;
	page.on('request', (request) => {
		if (/\/api\/shopping\/ah-(preview|push)/.test(request.url())) ahRequests += 1;
	});

	await page.setViewportSize({ width: 375, height: 812 });
	await page.goto('/shopping');
	await page.waitForLoadState('networkidle');
	await expect(page.getByText('AH connected', { exact: true })).toBeVisible();
	const activeReview = page
		.locator('.shopping-market-dock')
		.getByRole('button', { name: 'Review AH order' });
	await expect(activeReview).toBeVisible();
	await expect(activeReview).toBeEnabled();
	await expect(page.locator('.shopping-market-dock').getByRole('link')).toHaveCount(0);
	await expect(page.locator('.market-side-card')).toHaveCount(0);
	expect(ahRequests).toBe(0);

	await page.goto(`/shopping?week=${nextWeek(fixture.weekStart)}`);
	await page.waitForLoadState('networkidle');
	const emptyReview = page
		.locator('.shopping-market-dock')
		.getByRole('button', { name: 'Review AH order' });
	await expect(emptyReview).toBeVisible();
	await expect(emptyReview).toBeDisabled();
	expect(ahRequests).toBe(0);
});

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
		const compactRow = page
			.getByRole('button', { name: `Edit ${fixture.longInventoryNames[0]}` })
			.locator('xpath=ancestor::li[1]');
		expect((await compactRow.boundingBox())?.height ?? Number.POSITIVE_INFINITY).toBeLessThan(112);
		await expect(
			compactRow.getByRole('button', { name: `Decrease ${fixture.longInventoryNames[0]}` })
		).toBeVisible();
		await expect(
			compactRow.getByRole('button', { name: `Increase ${fixture.longInventoryNames[0]}` })
		).toBeVisible();
		await expectResponsiveSurface(page, '/inventory (long)', viewport.width);

		const relationshipReview = page.getByRole('button', { name: /\d+ to decide/ });
		if (await relationshipReview.count()) {
			await relationshipReview.click();
			await expect(page.getByRole('button', { name: 'Close recipe review' })).toBeVisible();
			await expect(page.getByRole('button', { name: /Recipe needed/ }).first()).toBeVisible();
			await page.getByRole('button', { name: 'Close recipe review' }).click();
		}

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
		await expect(editor).toBeVisible({ timeout: 15_000 });
		await expect(editor.getByRole('heading', { name: mutationTarget })).toBeVisible();
		await expect(editor.getByLabel('Name')).toHaveValue(mutationTarget);
		await expect(row).toBeVisible();
		await expectResponsiveSurface(page, '/inventory?item=…', viewport.width);
	});

	test(`Joined Stock and Recipe headers stay compact and complete at ${viewport.name}`, async ({
		page
	}, testInfo) => {
		const fixture = kitchenFixtureFor(testInfo);

		await page.setViewportSize(viewport);
		await page.goto('/inventory');
		const stockHeader = page.getByTestId('inventory-command-header');
		await expect(stockHeader).toBeVisible();
		const stockFilterTrigger = stockHeader
			.locator('.stock-command-mobile')
			.locator('.combined-filter-trigger');
		await expect(stockFilterTrigger).toHaveAttribute('data-ready', 'true', {
			timeout: 15_000
		});
		await expect(page.getByRole('button', { name: 'Recent activity', exact: true })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Add', exact: true })).toBeVisible();
		await expect(page.locator('.stock-quick-view')).toHaveCount(0);

		if (viewport.name === 'phone') {
			const stockFilters = stockFilterTrigger;
			await expect(stockFilters).toContainText('Meals');
			await stockFilters.click();
			const stockPanel = page.getByRole('dialog', { name: 'Stock filters' });
			await expect(stockPanel).toBeVisible();
			await stockPanel.getByRole('button', { name: 'Ingredients', exact: true }).click();
			await expect(stockFilters).toContainText('Ingredients');
			await stockPanel.getByRole('button', { name: 'Meals', exact: true }).click();
			await stockPanel.getByRole('button', { name: 'Show results', exact: true }).click();
			await expect(stockFilters).toHaveAttribute('aria-expanded', 'false');
		} else {
			const desktopStock = stockHeader.locator('.stock-command-desktop');
			await expect(desktopStock).toBeVisible();
			await desktopStock.getByRole('button', { name: 'Ingredients', exact: true }).click();
			await expect(desktopStock.getByRole('button', { name: 'Ingredients', exact: true })).toHaveAttribute(
				'aria-pressed',
				'true'
			);
			await desktopStock.getByRole('button', { name: 'Meals', exact: true }).click();
		}
		await expectResponsiveSurface(page, '/inventory command header', viewport.width);

		await page.goto('/recipes');
		const recipeHeader = page.getByTestId('recipes-command-header');
		await expect(recipeHeader).toBeVisible();
		const recipeFilterTrigger = recipeHeader
			.locator('.recipe-command-mobile')
			.locator('.combined-filter-trigger');
		await expect(recipeFilterTrigger).toHaveAttribute('data-ready', 'true', {
			timeout: 15_000
		});
		await expect(page.getByRole('button', { name: '+ Meal', exact: true })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Import', exact: true })).toBeVisible();
		await expect(page.locator('.recipe-filter-shell')).toHaveCount(0);

		if (viewport.name === 'phone') {
			const recipeFilters = recipeFilterTrigger;
			await expect(recipeFilters).toContainText('No filters');
			await recipeFilters.click();
			const recipePanel = page.getByRole('dialog', { name: 'Recipe filters' });
			await expect(recipePanel).toBeVisible();
			await recipePanel.getByLabel('Food type').selectOption('meat');
			await expect(page).toHaveURL(/class=meat/);
			await expect(recipeFilters).toContainText('Meat');
			await recipePanel.getByRole('button', { name: 'Clear filters', exact: true }).click();
			await expect(page).toHaveURL(/\/recipes$/);
		} else {
			const desktopRecipes = recipeHeader.locator('.recipe-command-desktop');
			await expect(desktopRecipes).toBeVisible();
			await desktopRecipes.getByLabel('Food type').selectOption('vegetarian');
			await expect(page).toHaveURL(/class=vegetarian/);
			const rowTops = await recipeHeader.evaluate((header) =>
				Array.from(
					header.querySelectorAll<HTMLElement>(
						'.recipe-quick-filters, .recipe-type-selects, .recipe-sort'
					)
				)
					.filter((element) => element.offsetParent !== null)
					.map((element) => Math.round(element.getBoundingClientRect().top))
			);
			expect(Math.max(...rowTops) - Math.min(...rowTops)).toBeLessThanOrEqual(2);
		}
		await expectResponsiveSurface(page, '/recipes command header', viewport.width);

		await page.goto(`/recipes/${fixture.cookRecipeSlug}`);
		const detailHeader = page.getByTestId('recipe-detail-command-header');
		await expect(detailHeader).toBeVisible();
		const viewFilterTrigger = detailHeader
			.locator('.recipe-view-mobile')
			.locator('.combined-filter-trigger');
		await expect(viewFilterTrigger).toHaveAttribute('data-ready', 'true', {
			timeout: 15_000
		});
		await expect(page.getByRole('button', { name: 'Edit recipe', exact: true })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Plan', exact: true })).toBeVisible();
		const detailTitleLayout = await page.getByRole('heading', { level: 1 }).evaluate((heading) => {
			const style = getComputedStyle(heading);
			const parsedLineHeight = Number.parseFloat(style.lineHeight);
			const lineHeight = Number.isNaN(parsedLineHeight)
				? Number.parseFloat(style.fontSize) * 1.2
				: parsedLineHeight;
			return {
				whiteSpace: style.whiteSpace,
				height: heading.getBoundingClientRect().height,
				maxTwoLines: lineHeight * 2 + 1
			};
		});
		expect(detailTitleLayout.whiteSpace).not.toBe('nowrap');
		expect(detailTitleLayout.height).toBeLessThanOrEqual(detailTitleLayout.maxTwoLines);

		if (viewport.name === 'phone') {
			const viewFilters = detailHeader
				.locator('.recipe-view-mobile')
				.getByRole('button', { name: /^View/ });
			await expect(viewFilters).toContainText('Cooking view');
			await viewFilters.click();
			const viewPanel = page.getByRole('dialog', { name: 'Recipe view and language' });
			await viewPanel.getByRole('button', { name: 'Original recipe', exact: true }).click();
			await expect(viewFilters).toContainText('Original recipe');
			await viewPanel.getByRole('button', { name: 'Done', exact: true }).click();
		} else {
			const desktopView = detailHeader.locator('.recipe-view-desktop');
			await desktopView.getByRole('button', { name: 'Original recipe', exact: true }).click();
			await expect(desktopView.getByRole('button', { name: 'Original recipe', exact: true })).toHaveAttribute(
				'aria-pressed',
				'true'
			);
		}
		await expectResponsiveSurface(page, '/recipes/[slug] command header', viewport.width);
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
		await expect(increase).toHaveAttribute('aria-disabled', 'false');
		releaseFailure();
		await expect(page.getByRole('alert')).toContainText('Could not update the portions.');
		await expect(servings).toHaveText(`${beforeCount} portions`);
		await expectResponsiveSurface(page, '/meal-plan (pending failure)', viewport.width);

		const mealRow = increase.locator('xpath=ancestor::li[1]');
		const batchSize = mealRow.getByRole('button', {
			name: `Choose batch size for ${fixture.recipeTitle}`
		});
		await batchSize.click();
		const batchPopover = page.locator('.compact-popover-panel:popover-open');
		await expect(batchPopover).toBeVisible();
		await expect(
			batchPopover.getByRole('radiogroup', { name: 'Whole recipe batches' })
		).toBeVisible();
		expect((await batchPopover.boundingBox())?.width ?? Number.POSITIVE_INFINITY).toBeLessThan(220);
		await page.keyboard.press('Escape');
		await expect(batchPopover).toBeHidden();
		await expect(batchSize).toBeFocused();

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
		test.setTimeout(90_000);
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
		const filterRail = shoppingControls.getByRole('radiogroup', { name: 'Filter shopping list' });
		await expect(filterRail.getByRole('radio', { name: 'All', exact: true })).toBeVisible();
		await expect(filterRail.getByRole('radio', { name: 'Weekly items', exact: true })).toBeVisible();
		await expect(filterRail.getByRole('radio', { name: fixture.recipeTitle, exact: true })).toBeVisible();
		await expect(page.getByRole('combobox', { name: 'Sort shopping list' })).toHaveCount(0);
		await expect(page.getByRole('button', { name: 'List options' })).toHaveCount(0);
		expect(await filterRail.evaluate((element) => getComputedStyle(element).maskImage)).toBe('none');
		await expect(page.locator('.shopping-ledger-section.weekly')).toHaveCount(0);
		await expect(page.locator('.market-side-card')).toHaveCount(0);
		await expect(
			page.getByText("Albert Heijn isn't connected — lists can't be sent to the AH app yet.", {
				exact: true
			})
		).toHaveCount(0);
		const ahDockAction = page
			.locator('.shopping-market-dock')
			.getByRole('link', { name: 'Connect it in Settings' });
		await expect(ahDockAction).toBeVisible();
		await expect(ahDockAction).toHaveAttribute('href', /\/settings\/connections$/);

		const visibleHistory = page.getByRole('region', { name: 'Sent to AH' });
		await expect(visibleHistory).toHaveCount(1);
		await expect(visibleHistory.getByText('AH result unknown', { exact: true })).toBeVisible();
		await expect(visibleHistory).toContainText('Check in AH');
		await expect(visibleHistory.getByRole('link', { name: 'Open AH' })).toBeVisible();
		await expect(visibleHistory.getByRole('button', { name: /retry/i })).toHaveCount(0);
		const moreProductDetails = visibleHistory.getByText('View more product details (1)', {
			exact: true
		});
		await expect(moreProductDetails).toBeVisible();
		await expect(visibleHistory.getByText(/E2E AH almonds/)).toBeHidden();
		const previousSends = visibleHistory.getByText('Previous sends (1)', { exact: true });
		await expect(previousSends).toHaveCount(0);
		const historyBox = await visibleHistory.boundingBox();
		const ledgerBox = await page.locator('.shopping-ledger-section').first().boundingBox();
		expect(historyBox?.y).toBeLessThan(ledgerBox?.y ?? 0);
		if (viewport.name === 'phone') {
			const overlappingRows = await page
				.locator('.shopping-ledger-section .market-run-row')
				.evaluateAll((rows) => {
					const dock = document.querySelector<HTMLElement>('.shopping-market-dock');
					const dockRect = dock?.getBoundingClientRect();
					if (!dockRect) return [];
					return rows
						.map((row) => row.getBoundingClientRect())
						.filter((row) => row.top < dockRect.bottom && row.bottom > dockRect.top)
						.map((row) => ({ top: row.top, bottom: row.bottom }));
				});
			expect(overlappingRows).toEqual([]);
		} else {
			expect(Math.abs((historyBox?.x ?? 0) - (ledgerBox?.x ?? Number.POSITIVE_INFINITY))).toBeLessThan(
				2
			);
		}
		await moreProductDetails.focus();
		await moreProductDetails.press('Enter');
		await expect(visibleHistory.getByText(/E2E AH almonds/)).toBeVisible();
		await page.getByRole('button', { name: 'Sent to AH', exact: true }).click();
		const historySheet = page.getByRole('dialog', { name: 'Sent to AH' });
		await expect(historySheet).toBeVisible();
		await expect(historySheet.getByText('Previous sends (1)', { exact: true })).toBeVisible();
		await expect(historySheet.getByText('2 sent to shopping list', { exact: true })).toBeHidden();
		await historySheet.getByRole('button', { name: 'Close' }).click();

		await expect(page.getByRole('button', { name: /^Shopping rules/ })).toHaveCount(0);
		const needPill = needCombobox(
			page,
			`Choose future-list need for ${fixture.shoppingName} · ${fixture.recipeTitle}`
		);
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
			page.getByRole('combobox', {
				name: `Choose future-list need for ${fixture.shoppingSibling} · ${fixture.recipeTitle}`,
				exact: true
			})
		).toHaveCount(1);
		await expect(
			page.getByRole('combobox', {
				name: new RegExp(`^Choose what to buy for ${fixture.shoppingSibling}`)
			})
		).toHaveCount(0);
		await expect(
			needCombobox(
				page,
				`Choose future-list need for ${fixture.shoppingSibling} · ${fixture.recipeTitle}`
			)
		).toBeVisible();
		await filterRail.getByRole('radio', { name: fixture.recipeTitle, exact: true }).click();
		await expect(page.getByText('Not this run (1)', { exact: true })).toBeVisible();
		await filterRail.getByRole('radio', { name: 'All', exact: true }).click();

		const weeklyFilter = filterRail.getByRole('radio', { name: 'Weekly items', exact: true });
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
			.getByRole('radiogroup', { name: 'Filter shopping list' })
			.getByRole('radio', { name: fixture.recipeTitle, exact: true });
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
		await expect(filteredItem).toBeFocused();
		await expectShoppingFocusInAppViewport(page);

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
		await expect(filteredItem).toBeEnabled();
		await expect(filteredItem).toBeFocused();
		await expectShoppingFocusInAppViewport(page);

		await page.goto(`/shopping?week=${nextWeek(fixture.weekStart)}`);
		await page.waitForLoadState('networkidle');
		await expect(page.getByText(/^(No meals planned yet|Nothing needed)$/)).toBeVisible();
		const emptyControls = page.getByRole('region', { name: 'Shopping list controls' });
		await expect(emptyControls).toBeVisible();
		await expect(page.getByRole('button', { name: 'List options' })).toHaveCount(0);
		const emptyDock = page.locator('.shopping-market-dock');
		await expect(emptyDock.getByRole('button', { name: 'Add item' })).toBeVisible();
		const emptyAhAction = emptyDock.getByRole('link', { name: 'Connect it in Settings' });
		await expect(emptyAhAction).toBeVisible();
		await expect(emptyAhAction).toHaveAttribute('href', /\/settings\/connections$/);
		await emptyControls
			.getByRole('radio', { name: 'Weekly items', exact: true })
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

		const firstStep = page.getByRole('button', {
			name: 'Read step 1: Simmer until ready.'
		});
		const secondStep = page.getByRole('button', {
			name: 'Read step 2: Serve the stew.'
		});
		await expect(firstStep).toHaveAttribute('aria-current', 'step', { timeout: 15_000 });
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
				'Your earlier cooking session could not be restored safely. Source steps are ready from the beginning.',
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
	const filterRail = page.getByRole('radiogroup', { name: 'Filter shopping list' });
	const controlsBox = await controls.boundingBox();

	expect(controlsBox?.height).toBeLessThanOrEqual(46);
	await expect(page.getByRole('button', { name: 'List options' })).toHaveCount(0);
	await expect(page.getByRole('combobox', { name: 'Sort shopping list' })).toHaveCount(0);
	expect(
		await filterRail.evaluate((element) => element.scrollWidth <= element.clientWidth)
	).toBe(true);
	expect(await filterRail.evaluate((element) => getComputedStyle(element).maskImage)).toBe('none');
	for (const button of await filterRail.getByRole('radio').all()) {
		expect(await button.evaluate((element) => getComputedStyle(element).opacity)).toBe('1');
	}
	await expect(page.locator('.shopping-ledger-section.weekly')).toHaveCount(0);
	const connectAh = page
		.locator('.shopping-market-dock')
		.getByRole('link', { name: 'Connect it in Settings' });
	await expect(connectAh).toBeVisible();
	expect((await connectAh.boundingBox())?.height).toBeGreaterThanOrEqual(44);
	const needPill = needCombobox(
		page,
		`Choose future-list need for ${fixture.shoppingName} · ${fixture.recipeTitle}`
	);
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
	const needPill = needCombobox(
		page,
		`Kies behoefte voor toekomstige lijsten voor ${fixture.shoppingName} · ${fixture.recipeTitle}`
	);
	const buyPill = page.getByRole('combobox', {
		name: `Kies wat je deze ronde koopt voor ${fixture.shoppingName} · ${fixture.recipeTitle}`
	});
	await expect(needPill).toBeVisible();
	await expect(buyPill).toBeVisible();
	await expect(
		page.locator('.shopping-market-dock').getByRole('link', {
			name: 'Verbind het in Instellingen'
		})
	).toBeVisible();
	await expect(
		page
			.getByRole('region', { name: 'Verstuurd naar AH' })
			.getByText('Bekijk meer productdetails (1)', { exact: true })
	).toBeVisible();
	expect(await needPill.evaluate((element) => getComputedStyle(element).opacity)).toBe('1');
	expect(await buyPill.evaluate((element) => getComputedStyle(element).opacity)).toBe('1');
	await expectResponsiveSurface(page, '/shopping (Dutch dark)', 375);
});
