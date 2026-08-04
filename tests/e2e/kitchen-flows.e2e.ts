import { expect, test, type Locator, type Page } from '@playwright/test';
import Database from 'better-sqlite3';
import { E2E_DATABASE } from './config';
import { kitchenFixtureFor } from './fixtures';
import { addDays } from '../../src/lib/week';

async function expectSettledSourceControl(control: Locator) {
	await expect
		.poll(() =>
			control.evaluateAll((elements) => ({
				count: elements.length,
				enabled: elements.filter(
					(element) =>
						(element instanceof HTMLButtonElement || element instanceof HTMLSelectElement) &&
						!element.disabled
				).length
			}))
		)
		.toEqual({ count: 1, enabled: 1 });
}

async function expectAppHydrated(page: Page) {
	await expect(page.locator('.app-shell[data-hydrated="true"]')).toBeVisible({ timeout: 30_000 });
}

function needCombobox(scope: Page | Locator, name: string | RegExp): Locator {
	return scope.getByRole('combobox', { name, exact: typeof name === 'string' });
}

test('Stock quantity, delete, and undo stay recoverable', async ({ page }, testInfo) => {
	const fixture = kitchenFixtureFor(testInfo);

	await page.goto('/inventory');
	await page.waitForLoadState('networkidle');
	await expect(page.getByRole('heading', { name: 'Stock', level: 1 })).toBeVisible();

	const quantity = page.getByRole('button', {
		name: `Edit quantity for ${fixture.inventoryName}`
	});
	await expect(quantity).toHaveText(/2/);

	const quantitySaved = page.waitForResponse(
		(response) =>
			response.request().method() === 'PATCH' && response.url().includes('/api/inventory/')
	);
	const increase = page.getByRole('button', { name: `Increase ${fixture.inventoryName}` });
	await increase.click();
	expect((await quantitySaved).ok()).toBe(true);
	await expect(quantity).toHaveText(/3/);
	await expect(increase).toBeFocused();

	await page.getByRole('button', { name: `Edit ${fixture.inventoryName}` }).click();
	await page.getByRole('button', { name: 'Remove', exact: true }).click();

	await expect(page.getByRole('button', { name: `Edit ${fixture.inventoryName}` })).toBeHidden();
	const removed = page.getByRole('status').filter({ hasText: `Removed ${fixture.inventoryName}` });
	await expect(removed).toBeVisible();
	await removed.getByRole('button', { name: 'Undo' }).click();

	await expect(page.getByRole('button', { name: `Edit ${fixture.inventoryName}` })).toBeVisible();
	await expect(
		page.getByRole('button', { name: `Edit quantity for ${fixture.inventoryName}` })
	).toHaveText(/3/);
});

test('Meal Plan serving edits and remove undo stay recoverable', async ({ page }, testInfo) => {
	const fixture = kitchenFixtureFor(testInfo);

	await page.goto('/meal-plan');
	await page.waitForLoadState('networkidle');
	await expect(page.getByRole('heading', { name: 'Meal plan', level: 1 })).toBeVisible();
	await expect(page.getByRole('link', { name: fixture.recipeTitle, exact: true })).toBeVisible();

	const servingsSaved = page.waitForResponse(
		(response) =>
			response.request().method() === 'PUT' && response.url().includes('/api/meal-plan/')
	);
	await page.getByRole('button', { name: `Increase portions for ${fixture.recipeTitle}` }).click();
	expect((await servingsSaved).ok()).toBe(true);
	const mealRow = page
		.getByRole('link', { name: fixture.recipeTitle, exact: true })
		.locator('xpath=ancestor::li[1]');
	await expect(mealRow.getByText('5 portions', { exact: true })).toBeVisible();

	const cookedCheckbox = page.getByRole('checkbox', {
		name: `Mark ${fixture.recipeTitle} cooked`
	});
	const cookedSaved = page.waitForResponse(
		(response) =>
			response.request().method() === 'PUT' && response.url().includes('/api/meal-plan/')
	);
	await cookedCheckbox.check();
	expect((await cookedSaved).ok()).toBe(true);
	await expect(cookedCheckbox).toBeChecked();
	const freezeDialog = page.getByRole('dialog').filter({
		has: page.getByRole('heading', { name: 'Freeze leftovers?' })
	});
	await expect(freezeDialog).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(freezeDialog).toBeHidden();

	const plannedSaved = page.waitForResponse(
		(response) =>
			response.request().method() === 'PUT' && response.url().includes('/api/meal-plan/')
	);
	await cookedCheckbox.uncheck();
	expect((await plannedSaved).ok()).toBe(true);
	await expect(cookedCheckbox).not.toBeChecked();

	await page.getByRole('button', { name: `Remove ${fixture.recipeTitle}` }).click();
	const removed = page.getByText(`Removed ${fixture.recipeTitle}`, { exact: true });
	await expect(removed).toBeVisible({ timeout: 15_000 });
	const restored = page.waitForResponse(
		(response) =>
			response.request().method() === 'POST' && response.url().endsWith('/api/meal-plan')
	);
	await page.getByRole('button', { name: 'Undo' }).click();
	expect((await restored).ok()).toBe(true);

	const restoredMeal = page.getByRole('link', { name: fixture.recipeTitle, exact: true });
	await expect(restoredMeal.first()).toBeVisible();
	await expect(restoredMeal).toHaveCount(1);
	await expect(
		restoredMeal.locator('xpath=ancestor::li[1]').getByText('5 portions', { exact: true })
	).toBeVisible();
});

test('Meal Plan keeps recipe language separate from localized present-only filters', async ({
	page
}, testInfo) => {
	test.setTimeout(180_000);
	const fixture = kitchenFixtureFor(testInfo);
	const setRecipeLanguage = (recipeLanguage: 'en' | 'nl') =>
		page.request.post('/api/settings/recipe-prefs', { data: { recipeLanguage } });

	try {
		expect((await setRecipeLanguage('nl')).ok()).toBe(true);
		await page.goto('/meal-plan');
		await expectAppHydrated(page);
		await expect(page.getByRole('link', { name: fixture.recipeTitleNl, exact: true })).toBeVisible();
		await page.getByRole('button', { name: 'Add meal', exact: true }).click();
		let drawer = page.getByRole('dialog', { name: 'Add meal' });
		await drawer.getByRole('button', { name: 'Filters', exact: true }).click();
		await expect(drawer.getByRole('button', { name: 'Soup', exact: true })).toBeVisible();
		await expect(drawer.getByRole('button', { name: 'Meat', exact: true })).toHaveCount(0);
		await page.keyboard.press('Escape');

		expect((await setRecipeLanguage('en')).ok()).toBe(true);
		await page.evaluate(() => {
			document.cookie = 'PARAGLIDE_LOCALE=nl; path=/';
		});
		await page.goto('/meal-plan');
		await expectAppHydrated(page);
		await expect(page.getByRole('link', { name: fixture.recipeTitle, exact: true })).toBeVisible();
		await page.getByRole('button', { name: 'Toevoegen', exact: true }).click();
		drawer = page.getByRole('dialog', { name: 'Maaltijd toevoegen' });
		await drawer.getByRole('button', { name: 'Filters', exact: true }).click();
		await expect(drawer.getByRole('button', { name: 'Soep', exact: true })).toBeVisible();
		await expect(drawer.getByRole('button', { name: 'Vlees', exact: true })).toHaveCount(0);
	} finally {
		await setRecipeLanguage('en');
		await page.evaluate(() => {
			document.cookie = 'PARAGLIDE_LOCALE=en; path=/';
		});
	}
});

test('both planning callers persist freezer 6 and fresh 16 in isolated data', async ({
	page
}, testInfo) => {
	test.setTimeout(120_000);
	const fixture = kitchenFixtureFor(testInfo);

	async function verifyCreatedMeal(
		trigger: () => Promise<void>,
		source: 'freezer' | 'fresh',
		servings: 6 | 16
	) {
		const responsePromise = page.waitForResponse(
			(response) =>
				response.request().method() === 'POST' && response.url().endsWith('/api/meal-plan')
		);
		await trigger();
		const response = await responsePromise;
		expect(response.ok()).toBe(true);
		expect(response.request().postDataJSON()).toMatchObject({
			recipeSlug: fixture.portionRecipeSlug,
			source,
			servings
		});
		const created = (await response.json()) as { id: number };

		await page.goto(`/meal-plan?week=${fixture.weekStart}`);
		const row = page
			.getByRole('link', { name: fixture.portionRecipeTitle, exact: true })
			.last()
			.locator('xpath=ancestor::li[1]');
		await expect(row.getByText(`${servings} portions`, { exact: true })).toBeVisible();
		await expect(
			row.getByRole('radio', {
				name: source === 'freezer' ? 'Serve 6 from freezer' : 'Cook 16 fresh',
				exact: true
			})
		).toHaveAttribute('aria-checked', 'true');

		const removed = await page.request.delete(`/api/meal-plan/${created.id}`);
		expect(removed.ok()).toBe(true);
	}

	async function openMealDrawer() {
		await page.goto(`/meal-plan?week=${fixture.weekStart}`);
		await expectAppHydrated(page);
		await page.getByRole('button', { name: 'Add meal', exact: true }).click();
		const drawer = page.getByRole('dialog', { name: 'Add meal' });
		await expect(drawer).toBeVisible();
		await drawer
			.getByRole('searchbox', { name: 'Search recipes or type a custom dinner' })
			.fill(fixture.portionRecipeTitle);
		return drawer.locator('li').filter({ hasText: fixture.portionRecipeTitle });
	}

	let recipeChoice = await openMealDrawer();
	await verifyCreatedMeal(
		() => recipeChoice.getByRole('button', { name: 'Serve 6 from freezer', exact: true }).click(),
		'freezer',
		6
	);
	recipeChoice = await openMealDrawer();
	await verifyCreatedMeal(
		() => recipeChoice.getByRole('button', { name: 'Cook 16 fresh', exact: true }).click(),
		'fresh',
		16
	);

	async function openRecipePlan() {
		await page.goto(`/recipes/${fixture.portionRecipeSlug}`);
		await expectAppHydrated(page);
		await page.getByRole('button', { name: 'Plan', exact: true }).click();
		const planSheet = page.getByRole('dialog', { name: 'Add to meal plan' });
		await expect(planSheet).toBeVisible();
		return planSheet;
	}

	let planSheet = await openRecipePlan();
	await verifyCreatedMeal(
		() => planSheet.getByRole('button', { name: 'Add', exact: true }).click(),
		'freezer',
		6
	);
	planSheet = await openRecipePlan();
	const freshChoice = planSheet.getByRole('radio', { name: 'Cook 16 fresh', exact: true });
	await freshChoice.click();
	await expect(freshChoice).toHaveAttribute('aria-checked', 'true');
	await expect(planSheet.getByText('16', { exact: true })).toBeVisible();
	await verifyCreatedMeal(
		() => planSheet.getByRole('button', { name: 'Add', exact: true }).click(),
		'fresh',
		16
	);
});

test('Shopping serving controls stay synced with Meal Plan and Recipe', async ({ page }, testInfo) => {
	test.setTimeout(90_000);
	const fixture = kitchenFixtureFor(testInfo);
	await page.goto(`/shopping?week=${fixture.weekStart}`);
	await page.waitForLoadState('networkidle');
	await page.getByRole('button', { name: 'Shopping setup' }).click();
	const setup = page.getByRole('dialog', { name: 'Shopping setup' });

	const increase = setup.getByRole('button', {
		name: `Increase portions for ${fixture.recipeTitle}`
	});
	const shoppingCount = increase.locator('xpath=preceding-sibling::span[1]');
	const before = Number.parseInt((await shoppingCount.textContent()) ?? '', 10);
	const recipeHref = await page.getByRole('link', { name: fixture.recipeTitle }).getAttribute('href');
	expect(recipeHref).toMatch(/\?plan=\d+$/);
	await expect(setup.getByText('Unplanned · Fresh meal', { exact: true }).first()).toBeVisible();

	await page.route(
		'**/api/meal-plan/*',
		(route) =>
			route.fulfill({
				status: 500,
				contentType: 'application/json',
				body: '{"message":"intentional serving failure"}'
			}),
		{ times: 1 }
	);
	const failed = page.waitForResponse(
		(response) =>
			response.request().method() === 'PUT' && /\/api\/meal-plan\/\d+$/.test(response.url())
	);
	await increase.click();
	expect((await failed).status()).toBe(500);
	await expect(shoppingCount).toHaveText(`${before} portions`);
	await expect(setup.getByRole('alert').filter({ hasText: 'Could not update the portions.' })).toBeVisible();
	await expect(
		page.getByRole('status').filter({ hasText: 'Local Shopping changed.' })
	).toHaveCount(0);

	const increased = page.waitForResponse(
		(response) =>
			response.request().method() === 'PUT' && /\/api\/meal-plan\/\d+$/.test(response.url())
	);
	await increase.click();
	expect((await increased).ok()).toBe(true);
	await expect(shoppingCount).toHaveText(`${before + 1} portions`);

	await page.goto(`/meal-plan?week=${fixture.weekStart}`);
	await expectAppHydrated(page);
	await expect(page.getByText(`${before + 1} portions`, { exact: true })).toBeVisible();

	await page.goto(recipeHref!);
	await expectAppHydrated(page);
	const recipeIncrease = page.getByRole('button', { name: 'Increase servings' });
	await expect(recipeIncrease.locator('xpath=preceding-sibling::span[1]')).toHaveText(`${before + 1}`);

	await page.goto(`/shopping?week=${fixture.weekStart}`);
	await expectAppHydrated(page);
	await page.getByRole('button', { name: 'Shopping setup' }).click();
	const restoredSetup = page.getByRole('dialog', { name: 'Shopping setup' });
	const decrease = restoredSetup.getByRole('button', {
		name: `Decrease portions for ${fixture.recipeTitle}`
	});
	const restored = page.waitForResponse(
		(response) =>
			response.request().method() === 'PUT' && /\/api\/meal-plan\/\d+$/.test(response.url())
	);
	await decrease.click();
	expect((await restored).ok()).toBe(true);
	await expect(decrease.locator('xpath=following-sibling::span[1]')).toHaveText(`${before} portions`);
});

test('Shopping keeps week context and exposes complete empty-week setup', async ({ page }, testInfo) => {
	const fixture = kitchenFixtureFor(testInfo);
	const nextWeek = addDays(fixture.weekStart, 7);
	await page.setViewportSize({ width: 375, height: 812 });

	await page.goto(`/meal-plan?week=${nextWeek}`);
	await expectAppHydrated(page);
	await expect(page.getByText('Upcoming week', { exact: true })).toBeVisible();
	const primary = page.getByRole('navigation', { name: 'Primary' });
	const shoppingTab = primary.getByRole('link', { name: 'Shopping' });
	await expect(shoppingTab).toHaveAttribute('href', `/shopping?week=${nextWeek}`);
	await shoppingTab.click();
	await expect(page).toHaveURL(new RegExp(`/shopping\\?week=${nextWeek}$`));
	await expect(page.getByText('Upcoming week', { exact: true })).toBeVisible();

	await page.getByRole('button', { name: 'Shopping setup' }).click();
	const setup = page.getByRole('dialog', { name: 'Shopping setup' });
	await expect(setup.getByRole('link', { name: 'Edit meal plan' })).toHaveAttribute(
		'href',
		`/meal-plan?week=${nextWeek}`
	);
	await expect(setup.getByRole('button', { name: 'Manage weekly items' })).toBeVisible();
	await setup.getByRole('button', { name: 'Close' }).click();

	const planMeals = page.getByRole('link', { name: 'Plan meals' });
	await expect(planMeals).toHaveAttribute('href', `/meal-plan?week=${nextWeek}`);
	await planMeals.click();
	await expect(page).toHaveURL(new RegExp(`/meal-plan\\?week=${nextWeek}$`));
});

test('Shopping setup shows freezer shortfalls and keeps long meal controls reachable', async ({
	page
}, testInfo) => {
	const fixture = kitchenFixtureFor(testInfo);
	await page.setViewportSize({ width: 1280, height: 800 });
	await page.goto(`/meal-plan?week=${fixture.weekStart}`);
	await expectAppHydrated(page);
	await page.getByRole('button', { name: 'Add meal', exact: true }).click();
	const addMeal = page.getByRole('dialog', { name: 'Add meal' });
	await addMeal
		.getByRole('searchbox', { name: 'Search recipes or type a custom dinner' })
		.fill(fixture.portionRecipeTitle);
	const planned = page.waitForResponse(
		(response) =>
			response.request().method() === 'POST' && response.url().endsWith('/api/meal-plan')
	);
	await addMeal.getByRole('button', { name: 'Serve 6 from freezer', exact: true }).click();
	const plannedResponse = await planned;
	expect(plannedResponse.ok()).toBe(true);
	const plannedMeal = (await plannedResponse.json()) as { id: number };

	await page.goto(`/shopping?week=${fixture.weekStart}`);
	await expectAppHydrated(page);
	await page.getByRole('button', { name: 'Shopping setup' }).click();
	const setup = page.getByRole('dialog', { name: 'Shopping setup' });
	await expect(setup.getByText('Unplanned · From freezer', { exact: true })).toBeVisible();
	const increase = setup.getByRole('button', {
		name: `Increase portions for ${fixture.portionRecipeTitle}`
	});
	const increased = page.waitForResponse(
		(response) =>
			response.request().method() === 'PUT' && response.url().endsWith(`/api/meal-plan/${plannedMeal.id}`)
	);
	await increase.click();
	expect((await increased).ok()).toBe(true);
	await expect(setup.getByText('Frozen stock is 1 short', { exact: true })).toBeVisible();

	const remove = setup.getByRole('button', {
		name: `Remove ${fixture.portionRecipeTitle} from the meal plan`
	});
	const removeBox = await remove.boundingBox();
	const setupBox = await setup.boundingBox();
	expect(removeBox).not.toBeNull();
	expect(setupBox).not.toBeNull();
	expect(removeBox!.x + removeBox!.width).toBeLessThanOrEqual(setupBox!.x + setupBox!.width);
	const removed = page.waitForResponse(
		(response) =>
			response.request().method() === 'DELETE' && response.url().endsWith(`/api/meal-plan/${plannedMeal.id}`)
	);
	await remove.click();
	expect((await removed).ok()).toBe(true);
	const removalStatus = page.getByRole('status').filter({
		hasText: `Removed ${fixture.portionRecipeTitle} from the meal plan. Items already sent to AH did not change.`
	});
	await expect(removalStatus).toBeVisible();
	const restored = page.waitForResponse(
		(response) =>
			response.request().method() === 'POST' && response.url().endsWith('/api/meal-plan')
	);
	await removalStatus.getByRole('button', { name: 'Undo' }).click();
	expect((await restored).ok()).toBe(true);
});

test('Shopping removes any aggregate for one week and restores it with Undo', async ({ page }, testInfo) => {
	const fixture = kitchenFixtureFor(testInfo);
	await page.goto(`/shopping?week=${fixture.weekStart}`);
	await expectAppHydrated(page);
	const checkbox = page.getByRole('checkbox', { name: `Mark ${fixture.shoppingName} bought` });
	await expect(checkbox).toBeVisible();

	await page.getByRole('button', { name: `Actions for ${fixture.shoppingName}` }).click();
	const itemActions = page.getByRole('dialog', { name: fixture.shoppingName, exact: true });
	await expect(itemActions).toBeVisible();
	const removed = page.waitForResponse(
		(response) =>
			response.request().method() === 'POST' &&
			response.url().endsWith('/api/shopping') &&
			response.request().postDataJSON().action === 'exclude_week_item'
	);
	await itemActions.getByRole('button', { name: /^Remove from this week/ }).first().click();
	expect((await removed).ok()).toBe(true);
	await expect(checkbox).toBeHidden();
	await expect(page.getByText('Removed this week (1)', { exact: true })).toBeVisible();
	const workingArea = await page.locator('.shopping-ledger-workspace').boundingBox();
	const recoveryArea = await page.locator('.removed-this-week').boundingBox();
	expect(recoveryArea?.y ?? 0).toBeGreaterThan(
		(workingArea?.y ?? 0) + (workingArea?.height ?? 0)
	);

	const restored = page.waitForResponse(
		(response) =>
			response.request().method() === 'POST' &&
			response.url().endsWith('/api/shopping') &&
			response.request().postDataJSON().action === 'restore_week_item'
	);
	await page.getByRole('button', { name: 'Undo' }).click();
	expect((await restored).ok()).toBe(true);
	await expect(checkbox).toBeVisible();
});

test('Shopping Optional Add is week-only and keeps the recipe optional', async ({ page }, testInfo) => {
	const fixture = kitchenFixtureFor(testInfo);
	await page.goto(`/shopping?week=${fixture.weekStart}`);
	await expectAppHydrated(page);
	const optionalRow = page.locator('.market-optional-list > li').filter({
		hasText: fixture.recipeTitleNl
	});
	const add = optionalRow.getByRole('button', {
		name: `Add ${fixture.shoppingSibling} to this week`,
		exact: true
	});
	await expect(add).toBeVisible();

	const included = page.waitForResponse(
		(response) =>
			response.request().method() === 'POST' &&
			response.url().endsWith('/api/shopping') &&
			response.request().postDataJSON().action === 'update_source' &&
			response.request().postDataJSON().included === true
	);
	await add.click();
	expect((await included).ok()).toBe(true);
	await expect(
		page.getByRole('checkbox', { name: `Mark ${fixture.shoppingSibling} bought` })
	).toBeVisible();

	const sqlite = new Database(E2E_DATABASE, { readonly: true });
	try {
		const row = sqlite
			.prepare('SELECT ingredients FROM recipes WHERE slug = ?')
			.get(fixture.recipeSlug) as { ingredients: string };
		const ingredients = JSON.parse(row.ingredients) as Array<{ name: string; optional?: boolean }>;
		expect(ingredients.find((ingredient) => ingredient.name === fixture.shoppingSibling)?.optional).toBe(
			true
		);
	} finally {
		sqlite.close();
	}

	const excluded = page.waitForResponse(
		(response) =>
			response.request().method() === 'POST' &&
			response.url().endsWith('/api/shopping') &&
			response.request().postDataJSON().action === 'update_source' &&
			response.request().postDataJSON().included === false
	);
	await page.getByRole('button', { name: 'Undo' }).click();
	expect((await excluded).ok()).toBe(true);
	await expect(add).toBeVisible();
});

test('Recipe archive leaves history intact and restores from Undo', async ({ page }, testInfo) => {
	test.setTimeout(90_000);
	const fixture = kitchenFixtureFor(testInfo);
	await page.goto(`/recipes/${fixture.cookRecipeSlug}`);
	await expectAppHydrated(page);
	const archived = page.waitForResponse(
		(response) =>
			response.request().method() === 'PATCH' &&
			response.url().endsWith(`/api/recipes/${fixture.cookRecipeSlug}`) &&
			response.request().postDataJSON().archived === true
	);
	page.once('dialog', (dialog) => dialog.accept());
	await page.getByRole('button', { name: 'Archive recipe' }).click();
	expect((await archived).ok()).toBe(true);
	await expect(page).toHaveURL(/\/recipes$/, { timeout: 30_000 });
	const restoredRecipeHeading = page.getByRole('heading', {
		name: fixture.cookRecipeTitle,
		level: 2,
		exact: true
	});
	await expect(restoredRecipeHeading).toHaveCount(0);

	const restored = page.waitForResponse(
		(response) =>
			response.request().method() === 'PATCH' &&
			response.url().endsWith(`/api/recipes/${fixture.cookRecipeSlug}`) &&
			response.request().postDataJSON().archived === false
	);
	await page.getByRole('button', { name: 'Undo' }).click();
	expect((await restored).ok()).toBe(true);
	await expect(restoredRecipeHeading).toBeVisible();

	await page.goto(`/recipes/${fixture.cookRecipeSlug}`);
	await expectAppHydrated(page);
	page.once('dialog', (dialog) => dialog.accept());
	await page.getByRole('button', { name: 'Archive recipe' }).click();
	await expect(page).toHaveURL(/\/recipes$/, { timeout: 30_000 });

	await page.goto(`/recipes/${fixture.cookRecipeSlug}`);
	await expectAppHydrated(page);
	const restoredFromDetail = page.waitForResponse(
		(response) =>
			response.request().method() === 'PATCH' &&
			response.url().endsWith(`/api/recipes/${fixture.cookRecipeSlug}`) &&
			response.request().postDataJSON().archived === false
	);
	await page.getByRole('button', { name: 'Restore recipe' }).click();
	expect((await restoredFromDetail).ok()).toBe(true);
	await expect(page.getByRole('button', { name: 'Archive recipe' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Plan', exact: true })).toBeEnabled();
});

test('Recipe rhythm creates a deterministic Cook shortlist without the old Suggest action', async ({
	page
}, testInfo) => {
	const fixture = kitchenFixtureFor(testInfo);

	await page.setViewportSize({ width: 393, height: 852 });
	await page.goto(`/recipes/${fixture.cookRecipeSlug}`);
	await page.waitForLoadState('networkidle');
	await page.getByRole('button', { name: 'Edit routine and freezer target' }).click();
	const rhythmDialog = page.getByRole('dialog').filter({
		has: page.getByRole('heading', { name: 'Routine & freezer' })
	});
	await expect(rhythmDialog).toBeVisible();
	await rhythmDialog.getByLabel('How often to cook').selectOption('seasonal');
	const seasonGroup = rhythmDialog.getByRole('group', { name: 'Only in these seasons' });
	await seasonGroup.getByLabel('Winter').check();
	await rhythmDialog.getByLabel('How often to cook').selectOption('');
	await rhythmDialog.getByLabel('How often to cook').selectOption('weekly');
	await expect(seasonGroup.getByLabel('Winter')).not.toBeChecked();
	await rhythmDialog.getByLabel('Keep stocked').check();
	const saved = page.waitForResponse(
		(response) =>
			response.request().method() === 'PATCH' &&
			response.url().endsWith(`/api/recipes/${fixture.cookRecipeSlug}`)
	);
	await rhythmDialog.getByRole('button', { name: 'Save routine' }).click();
	const savedResponse = await saved;
	expect(savedResponse.ok()).toBe(true);
	expect(savedResponse.request().postDataJSON()).toMatchObject({
		rotation_policy: 'weekly',
		rotation_seasons: [],
		is_freezer_staple: true
	});
	await expect(rhythmDialog).toBeHidden();

	await page.goto('/meal-plan');
	await page.waitForLoadState('networkidle');
	await expect(page.getByRole('button', { name: 'Suggest', exact: true })).toHaveCount(0);
	const shortlist = page.getByRole('complementary', { name: 'Recommended shortlist' });
	const shortlistRow = shortlist.getByRole('listitem').filter({ hasText: fixture.cookRecipeTitle });
	await expect(shortlistRow).toContainText('Due in your rhythm');
	const planned = page.waitForResponse(
		(response) =>
			response.request().method() === 'POST' &&
			response.url().endsWith('/api/meal-plan/rotation')
	);
	await shortlistRow.getByRole('button', { name: 'Cook', exact: true }).click();
	expect((await planned).ok()).toBe(true);
	const plannedMeal = page.getByRole('link', { name: fixture.cookRecipeTitle, exact: true });
	await expect(plannedMeal).toHaveCount(1);
	await expect(plannedMeal).toBeVisible();
	const plannedToast = page.getByRole('status').filter({
		hasText: `Planned ${fixture.cookRecipeTitle}`
	});
	await expect(plannedToast).toBeVisible();
	const removed = page.waitForResponse(
		(response) =>
			response.request().method() === 'DELETE' &&
			response.url().includes('/api/meal-plan/')
	);
	await plannedToast.getByRole('button', { name: 'Undo' }).click();
	expect((await removed).ok()).toBe(true);
	await expect(plannedMeal).toHaveCount(0);
	await expect(shortlist).toContainText(fixture.cookRecipeTitle);
});

test('Shopping bought undo and recipe-source choice stay recoverable', async ({
	page
}, testInfo) => {
	test.setTimeout(120_000);
	const fixture = kitchenFixtureFor(testInfo);

	await page.goto('/shopping');
	await page.waitForLoadState('networkidle');
	await expect(page.getByRole('heading', { name: 'Shopping', level: 1 })).toBeVisible();
	await expect(
		page.getByRole('checkbox', { name: `Mark ${fixture.shoppingName} bought` })
	).toBeVisible();
	await expect(page.getByText(fixture.shoppingNameEn, { exact: true })).toHaveCount(0);

	const boughtSaved = page.waitForResponse(
		(response) =>
			response.request().method() === 'POST' && response.url().endsWith('/api/shopping')
	);
	const shoppingCheckbox = page.getByRole('checkbox', {
		name: `Mark ${fixture.shoppingName} bought`
	});
	await shoppingCheckbox.focus();
	await shoppingCheckbox.press('Space');
	expect((await boughtSaved).ok()).toBe(true);

	const boughtStatus = page
		.getByRole('status')
		.filter({ hasText: `${fixture.shoppingName} moved to the basket` });
	await expect(boughtStatus).toBeVisible({ timeout: 15_000 });
	const boughtUndone = page.waitForResponse(
		(response) =>
			response.request().method() === 'POST' && response.url().endsWith('/api/shopping')
	);
	await boughtStatus.getByRole('button', { name: 'Undo' }).click();
	expect((await boughtUndone).ok()).toBe(true);
	await expect(
		page.getByRole('checkbox', { name: `Mark ${fixture.shoppingName} bought` })
	).toBeVisible();

	await page.getByRole('button', { name: `Actions for ${fixture.shoppingName}` }).click();
	const itemDetails = page.locator('dialog[open]');
	const buyTerm = itemDetails.getByRole('combobox', {
		name: `Choose what to buy for ${fixture.shoppingName} · ${fixture.recipeTitleNl} this run`
	});
	await expect(buyTerm).toBeVisible();
	await expect(itemDetails.getByRole('heading', { name: 'Recipe choices' })).toBeVisible();
	const termSaved = page.waitForResponse(
		(response) =>
			response.request().method() === 'POST' &&
			response.url().endsWith('/api/shopping/recipe-choice')
	);
	await buyTerm.selectOption(fixture.shoppingAlternative);
	const termResponse = await termSaved;
	expect(termResponse.ok()).toBe(true);
	expect(termResponse.request().postDataJSON()).toMatchObject({
		action: 'term',
		term: fixture.shoppingAlternative
	});
	await expect(
		itemDetails.getByRole('combobox', {
			name: `Choose what to buy for ${fixture.shoppingName} · ${fixture.recipeTitleNl} this run`
		})
	).toHaveValue(fixture.shoppingAlternative);
	const termRestored = page.waitForResponse(
		(response) =>
			response.request().method() === 'POST' &&
			response.url().endsWith('/api/shopping/recipe-choice')
	);
	await itemDetails
		.getByRole('combobox', {
			name: `Choose what to buy for ${fixture.shoppingName} · ${fixture.recipeTitleNl} this run`
		})
		.selectOption(fixture.shoppingName);
	expect((await termRestored).ok()).toBe(true);

	const needButton = needCombobox(
		itemDetails,
		`Choose future-list need for ${fixture.shoppingName} · ${fixture.recipeTitleNl}`
	);
	const siblingOptionalAdd = page
		.locator('.market-optional-list > li')
		.filter({ hasText: fixture.recipeTitleNl })
		.getByRole('button', {
			name: `Add ${fixture.shoppingSibling} to this week`,
			exact: true
		});
	await expect(siblingOptionalAdd).toBeEnabled();
	await page.route(
		'**/api/shopping/recipe-choice',
		async (route) => {
			await new Promise((resolve) => setTimeout(resolve, 300));
			await route.continue();
		},
		{ times: 1 }
	);
	const sourceExcluded = page.waitForResponse(
		(response) =>
			response.request().method() === 'POST' &&
			response.url().endsWith('/api/shopping/recipe-choice')
	);
	await needButton.selectOption('optional');
	const excludedResponse = await sourceExcluded;
	expect(excludedResponse.ok()).toBe(true);
	expect(excludedResponse.request().postDataJSON()).toMatchObject({
		action: 'need',
		need: 'optional'
	});
	await expect(page.getByRole('region', { name: 'Optional · 3', exact: true })).toBeVisible();
	await expect(itemDetails).toBeHidden();
	const movedOptionalAdd = page.getByRole('button', {
		name: `Add ${fixture.shoppingName} to this week`,
		exact: true
	});
	await expect(movedOptionalAdd).toBeFocused();
	await expect(
		page.getByRole('checkbox', { name: `Mark ${fixture.shoppingName} bought` })
	).toHaveCount(0);

	const sourceUndone = page.waitForResponse(
		(response) =>
			response.request().method() === 'POST' &&
			response.url().endsWith('/api/shopping/recipe-choice')
	);
	await page.getByRole('button', { name: 'Undo' }).click();
	expect((await sourceUndone).ok()).toBe(true);
	await expect(
		page.getByRole('checkbox', { name: `Mark ${fixture.shoppingName} bought` })
	).toBeVisible();
	await expect(page.getByRole('button', { name: /^Shopping rules/ })).toHaveCount(0);
	await expect(page.getByRole('dialog')).toHaveCount(0);

	await page.getByRole('radio', { name: 'Weekly items', exact: true }).click();
	await page.getByRole('button', { name: 'Edit weekly', exact: true }).click();
	await expect(page.getByRole('dialog')).toHaveCount(0);
	await page.getByRole('button', { name: 'Add weekly item', exact: true }).click();
	const weeklyEditor = page.locator('.weekly-editor');
	const weeklyName = `E2E ${fixture.account} weekly milk`;
	const weeklyNameInput = weeklyEditor.getByLabel('Item');
	await weeklyNameInput.fill(weeklyName);
	await weeklyEditor.getByLabel('Amount').fill('2');
	await weeklyEditor.getByLabel('Unit').fill('packs');

	await page.route(
		'**/api/shopping',
		(route) =>
			route.fulfill({
				status: 500,
				contentType: 'application/json',
				body: '{"message":"intentional inline weekly draft test"}'
			}),
		{ times: 1 }
	);
	const weeklyDraftRejected = page.waitForResponse(
		(response) =>
			response.request().method() === 'POST' && response.url().endsWith('/api/shopping')
	);
	await page.getByRole('button', { name: 'Add weekly item', exact: true }).last().click();
	expect((await weeklyDraftRejected).status()).toBe(500);
	await expect(weeklyNameInput).toHaveValue(weeklyName);

	const weeklyAdded = page.waitForResponse(
		(response) =>
			response.request().method() === 'POST' && response.url().endsWith('/api/shopping')
	);
	await page.getByRole('button', { name: 'Add weekly item', exact: true }).last().click();
	expect((await weeklyAdded).ok()).toBe(true);
	const weeklyRow = page.getByRole('button', { name: new RegExp(weeklyName) }).first();
	await expect(weeklyRow).toBeVisible();
	await expect(weeklyRow).toBeFocused();
	await expect(
		page.getByRole('checkbox', { name: `Mark ${weeklyName} bought` })
	).toHaveCount(0);
	await page.getByRole('button', { name: 'Done editing', exact: true }).click();
	await expect(
		page.getByRole('checkbox', { name: `Mark ${weeklyName} bought` })
	).toBeVisible();
	await page.getByRole('button', { name: 'Edit weekly', exact: true }).click();
	await expect(
		page.getByRole('checkbox', { name: `Mark ${weeklyName} bought` })
	).toHaveCount(0);

	const weeklySkipped = page.waitForResponse(
		(response) =>
			response.request().method() === 'POST' && response.url().endsWith('/api/shopping')
	);
	await page.getByRole('button', { name: /Change .* Current: This week/ }).click();
	expect((await weeklySkipped).ok()).toBe(true);
	const weeklyRestored = page.waitForResponse(
		(response) =>
			response.request().method() === 'POST' && response.url().endsWith('/api/shopping')
	);
	await page.getByRole('button', { name: /Change .* Current: Skipped/ }).click();
	expect((await weeklyRestored).ok()).toBe(true);

	await page.getByRole('button', { name: new RegExp(weeklyName) }).first().click();
	const renamedWeekly = `${weeklyName} updated`;
	await weeklyEditor.getByLabel('Item').fill(renamedWeekly);
	const weeklyEdited = page.waitForResponse(
		(response) =>
			response.request().method() === 'POST' && response.url().endsWith('/api/shopping')
	);
	await page.getByRole('button', { name: 'Save choice', exact: true }).click();
	expect((await weeklyEdited).ok()).toBe(true);
	await expect(page.getByRole('button', { name: new RegExp(renamedWeekly) }).first()).toBeFocused();

	await page.getByRole('button', { name: 'Stop from this week', exact: true }).click();
	await expect(page.getByText(`Stop ${renamedWeekly} from this week onward?`, { exact: true })).toBeVisible();
	const weeklyStopped = page.waitForResponse(
		(response) =>
			response.request().method() === 'POST' && response.url().endsWith('/api/shopping')
	);
	await page
		.locator('.weekly-stop-confirm')
		.getByRole('button', { name: 'Stop from this week', exact: true })
		.click();
	expect((await weeklyStopped).ok()).toBe(true);
	await expect(page.getByText(renamedWeekly, { exact: true })).toHaveCount(0);
	await page.getByRole('button', { name: 'Done editing', exact: true }).click();
	await expect(page.getByText('No weekly items are included in this run.', { exact: true })).toBeVisible();
});

test('Recipes can be planned, marked made, and frozen without providers', async ({
	page
}, testInfo) => {
	test.setTimeout(90_000);
	const fixture = kitchenFixtureFor(testInfo);

	await page.goto('/recipes');
	await expectAppHydrated(page);
	await expect(page.getByRole('heading', { name: 'Recipes', level: 1 })).toBeVisible();

	const recipeCard = page.getByRole('article').filter({
		has: page.getByRole('heading', { name: fixture.recipeTitle, level: 2 })
	});
	await expect(recipeCard).toBeVisible();

	await recipeCard.getByRole('button', { name: 'Plan' }).click();
	const planDialog = page.getByRole('dialog').filter({
		has: page.getByRole('heading', { name: 'Add to meal plan' })
	});
	await expect(planDialog).toBeVisible();
	const planned = page.waitForResponse(
		(response) =>
			response.request().method() === 'POST' && response.url().endsWith('/api/meal-plan')
	);
	await planDialog.getByRole('button', { name: 'Add', exact: true }).click();
	expect((await planned).ok()).toBe(true);
	await expect(page.getByText('Added to meal plan', { exact: true })).toBeVisible({
		timeout: 15_000
	});

	await recipeCard.getByRole('button', { name: 'Make' }).click();
	const makeDialog = page.getByRole('dialog').filter({
		has: page.getByRole('heading', { name: 'Make this recipe' })
	});
	await expect(makeDialog).toBeVisible();
	const cooked = page.waitForResponse(
		(response) =>
			response.request().method() === 'POST' &&
			response.url().endsWith(`/api/recipes/${fixture.recipeSlug}/cook`)
	);
	await makeDialog.getByRole('button', { name: 'Already cooked' }).click();
	expect((await cooked).ok()).toBe(true);

	const freezeDialog = page.getByRole('dialog').filter({
		has: page.getByRole('heading', { name: 'Freeze leftovers?' })
	});
	await expect(freezeDialog).toBeVisible();
	const frozen = page.waitForResponse(
		(response) =>
			response.request().method() === 'POST' &&
			response.url().endsWith(`/api/recipes/${fixture.recipeSlug}/freeze`)
	);
	await freezeDialog.getByRole('button', { name: 'Freeze 4' }).click();
	expect((await frozen).ok()).toBe(true);
	await expect(freezeDialog).toBeHidden();

	await page.goto('/inventory');
	await expectAppHydrated(page);
	await expect(page.getByRole('button', { name: `Edit ${fixture.recipeTitleNl}` })).toBeVisible();
});

test('Cook Mode resumes its active step and safely resets a broken session without providers', async ({
	page
}, testInfo) => {
	const fixture = kitchenFixtureFor(testInfo);
	const progressKey = `cookmode-progress:${fixture.cookRecipeSlug}:direct`;

	await page.goto(`/recipes/${fixture.cookRecipeSlug}`);

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
	await page.reload();
	await page.goto(`/recipes/${fixture.cookRecipeSlug}`);
	await expect(secondStep).toHaveAttribute('aria-current', 'step', { timeout: 15_000 });

	await page.goto('/recipes');
	await page.evaluate((key) => localStorage.setItem(key, '{"v":2}'), progressKey);
	await page.goto(`/recipes/${fixture.cookRecipeSlug}`);
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
});

test('Recipe cooking details are opt-in and portions stay interactive while they load', async ({ page }, testInfo) => {
	const fixture = kitchenFixtureFor(testInfo);
	const database = new Database(E2E_DATABASE);
	const cached = database
		.prepare('SELECT cook_mode_json AS cookModeJson FROM recipes WHERE slug = ?')
		.get(fixture.cookRecipeSlug) as { cookModeJson: string | null } | undefined;
	database.prepare('UPDATE recipes SET cook_mode_json = NULL WHERE slug = ?').run(fixture.cookRecipeSlug);
	database.close();

	let releaseRequest = () => {};
	let markRequestStarted = () => {};
	const requestStarted = new Promise<void>((resolve) => {
		markRequestStarted = resolve;
	});
	const heldRequest = new Promise<void>((resolve) => {
		releaseRequest = resolve;
	});
	const cookModePattern = `**/api/recipes/${fixture.cookRecipeSlug}/cook-mode?**`;
	let requestCount = 0;

	try {
		await page.route(cookModePattern, async (route) => {
			requestCount += 1;
			markRequestStarted();
			await heldRequest;
			await route.abort().catch(() => {
				// The page may release the route while failed-test cleanup is already unhooking it.
			});
		});
		await page.goto(`/recipes/${fixture.cookRecipeSlug}`);
		await expectAppHydrated(page);
		const addCookingDetails = page.getByRole('button', { name: 'Add cooking details', exact: true });
		await expect(addCookingDetails).toBeVisible();
		expect(requestCount).toBe(0);

		const decrease = page.getByRole('button', { name: 'Decrease servings' });
		const increase = page.getByRole('button', { name: 'Increase servings' });
		const servings = increase.locator('xpath=preceding-sibling::span[1]');

		await expect(decrease).toBeEnabled();
		await expect(increase).toBeEnabled();
		await expect(servings).toHaveText('4');
		await decrease.click();
		await expect(servings).toHaveText('3');
		await increase.click();
		await expect(servings).toHaveText('4');

		await addCookingDetails.click();
		await requestStarted;
		expect(requestCount).toBe(1);
		await expect(page.getByText(/Adding cooking details/)).toBeVisible();
	} finally {
		releaseRequest();
		await page.unroute(cookModePattern);
		const restoreDatabase = new Database(E2E_DATABASE);
		restoreDatabase
			.prepare('UPDATE recipes SET cook_mode_json = ? WHERE slug = ?')
			.run(cached?.cookModeJson ?? null, fixture.cookRecipeSlug);
		restoreDatabase.close();
	}
});

test('Recipe merge steps keep the result color left and split incoming colors across the top', async ({
	page
}, testInfo) => {
	const fixture = kitchenFixtureFor(testInfo);
	const database = new Database(E2E_DATABASE);
	const cached = database
		.prepare('SELECT cook_mode_json AS cookModeJson FROM recipes WHERE slug = ?')
		.get(fixture.cookRecipeSlug) as { cookModeJson: string };
	const cookMode = JSON.parse(cached.cookModeJson) as {
		version: number;
		generation_id: string;
		baseline_servings: number;
		prep_tasks: unknown[];
		streams: Array<{ id: string; name: { en: string; nl: string } }>;
		steps: Array<Record<string, unknown>>;
	};
	const merged = {
		...cookMode,
		streams: [
			{ id: 'pot', name: { en: 'Pot', nl: 'Pan' } },
			{ id: 'garnish', name: { en: 'Garnish', nl: 'Garnering' } },
			{ id: 'plate', name: { en: 'Finished dish', nl: 'Gerecht' } }
		],
		steps: [
			{ ...cookMode.steps[0], stream_id: 'pot', merges_from: [] },
			{ ...cookMode.steps[0], stream_id: 'garnish', ingredient_indexes: [1], merges_from: [] },
			{ ...cookMode.steps[1], stream_id: 'plate', merges_from: ['pot', 'garnish'] }
		]
	};
	database
		.prepare('UPDATE recipes SET cook_mode_json = ? WHERE slug = ?')
		.run(JSON.stringify(merged), fixture.cookRecipeSlug);
	database.close();

	try {
		await page.goto(`/recipes/${fixture.cookRecipeSlug}`);
		await expectAppHydrated(page);
		const mergeStep = page.locator('#cook-step-2');
		const incomingBand = mergeStep.getByTestId('merge-source-band');
		await expect(incomingBand.locator('span')).toHaveCount(2);
		await expect(mergeStep).toContainText('← Pot + Garnish');
		await expect(mergeStep.getByTestId('result-stream-bar')).toBeVisible();
		const widths = await incomingBand.locator('span').evaluateAll((segments) =>
			segments.map((segment) => segment.getBoundingClientRect().width)
		);
		expect(Math.abs(widths[0] - widths[1])).toBeLessThanOrEqual(1);
		const selectMerge = mergeStep.locator('button').first();
		await selectMerge.click();
		await expect(selectMerge).toHaveAttribute('aria-current', 'step');
		await selectMerge.focus();
		await expect(selectMerge).toBeFocused();
	} finally {
		const restoreDatabase = new Database(E2E_DATABASE);
		restoreDatabase
			.prepare('UPDATE recipes SET cook_mode_json = ? WHERE slug = ?')
			.run(cached.cookModeJson, fixture.cookRecipeSlug);
		restoreDatabase.close();
	}
});
