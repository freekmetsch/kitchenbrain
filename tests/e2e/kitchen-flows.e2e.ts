import { expect, test, type Locator, type Page } from '@playwright/test';
import Database from 'better-sqlite3';
import { E2E_DATABASE } from './config';
import { kitchenFixtureFor } from './fixtures';

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
	await page.getByRole('button', { name: `Increase ${fixture.inventoryName}` }).click();
	expect((await quantitySaved).ok()).toBe(true);
	await expect(quantity).toHaveText(/3/);

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

test('Shopping serving controls stay synced with Meal Plan and Recipe', async ({ page }, testInfo) => {
	test.setTimeout(90_000);
	const fixture = kitchenFixtureFor(testInfo);
	await page.goto(`/shopping?week=${fixture.weekStart}`);
	await page.waitForLoadState('networkidle');
	await page.getByRole('button', { name: 'Adjust plan' }).click();
	const setup = page.getByRole('dialog', { name: 'Shopping setup' });

	const increase = setup.getByRole('button', {
		name: `Increase portions for ${fixture.recipeTitle}`
	});
	const shoppingCount = increase.locator('xpath=preceding-sibling::span[1]');
	const before = Number.parseInt((await shoppingCount.textContent()) ?? '', 10);
	const recipeHref = await page.getByRole('link', { name: fixture.recipeTitle }).getAttribute('href');
	expect(recipeHref).toMatch(/\?plan=\d+$/);

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
	await page.getByRole('button', { name: 'Adjust plan' }).click();
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

test('Shopping removes any aggregate for one week and restores it with Undo', async ({ page }, testInfo) => {
	const fixture = kitchenFixtureFor(testInfo);
	await page.goto(`/shopping?week=${fixture.weekStart}`);
	await page.waitForLoadState('networkidle');
	const checkbox = page.getByRole('checkbox', { name: `Mark ${fixture.shoppingName} bought` });
	await expect(checkbox).toBeVisible();

	await page.getByRole('button', { name: `Actions for ${fixture.shoppingName}` }).click();
	const removed = page.waitForResponse(
		(response) =>
			response.request().method() === 'POST' &&
			response.url().endsWith('/api/shopping') &&
			response.request().postDataJSON().action === 'exclude_week_item'
	);
	await page.getByRole('button', { name: 'Remove from this week' }).first().click();
	expect((await removed).ok()).toBe(true);
	await expect(checkbox).toBeHidden();

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

	await page.getByText('Not this run (2)', { exact: true }).click();
	await page.getByRole('button', { name: `Actions for ${fixture.shoppingName}` }).click();
	const itemDetails = page.locator('dialog[open]');
	const buyTerm = itemDetails.getByRole('combobox', {
		name: `Choose what to buy for ${fixture.shoppingName} · ${fixture.recipeTitle} this run`
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
			name: `Choose what to buy for ${fixture.shoppingName} · ${fixture.recipeTitle} this run`
		})
	).toHaveValue(fixture.shoppingAlternative);
	const termRestored = page.waitForResponse(
		(response) =>
			response.request().method() === 'POST' &&
			response.url().endsWith('/api/shopping/recipe-choice')
	);
	await itemDetails
		.getByRole('combobox', {
			name: `Choose what to buy for ${fixture.shoppingName} · ${fixture.recipeTitle} this run`
		})
		.selectOption(fixture.shoppingName);
	expect((await termRestored).ok()).toBe(true);

	const needButton = needCombobox(
		itemDetails,
		`Choose future-list need for ${fixture.shoppingName} · ${fixture.recipeTitle}`
	);
	const siblingNeed = needCombobox(
		page,
		`Choose future-list need for ${fixture.shoppingSibling} · ${fixture.recipeTitle}`
	);
	await expect(siblingNeed).toBeEnabled();
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
	await expect(siblingNeed).toBeDisabled();
	const excludedResponse = await sourceExcluded;
	expect(excludedResponse.ok()).toBe(true);
	expect(excludedResponse.request().postDataJSON()).toMatchObject({
		action: 'need',
		need: 'optional'
	});
	await expect(page.getByText('Not this run (3)', { exact: true })).toBeVisible();
	await expect(itemDetails).toBeHidden();
	const movedNeedControl = needCombobox(
		page.locator('details.not-this-run[open]'),
		`Choose future-list need for ${fixture.shoppingName} · ${fixture.recipeTitle}`
	);
	await expectSettledSourceControl(movedNeedControl);
	await expect(movedNeedControl).toBeFocused();
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
	await page.getByRole('button', { name: `Actions for ${fixture.shoppingName}` }).click();

	for (const next of ['optional', 'stocked', 'required'] as const) {
		const needControl = needCombobox(
			next === 'optional' ? itemDetails : page.locator('details.not-this-run[open]'),
			`Choose future-list need for ${fixture.shoppingName} · ${fixture.recipeTitle}`
		);
		await expectSettledSourceControl(needControl);
		const changed = page.waitForResponse(
			(response) =>
				response.request().method() === 'POST' &&
				response.url().endsWith('/api/shopping/recipe-choice')
		);
		await needControl.selectOption(next);
		const response = await changed;
		expect(response.ok()).toBe(true);
		expect(response.request().postDataJSON()).toMatchObject({
			action: 'need',
			need: next
		});
		if (next === 'optional') await expect(itemDetails).toBeHidden();
	}
	await expect(
		page.getByRole('checkbox', { name: `Mark ${fixture.shoppingName} bought` })
	).toBeVisible();

	const otherRecipeTitle =
		fixture.account === 'primary' ? 'E2E Secondary Stew' : 'E2E Primary Stew';
	for (const recipeTitle of [fixture.recipeTitle, otherRecipeTitle]) {
		const needControl = page.locator('details.not-this-run[open]').getByRole('combobox', {
			name: `Choose future-list need for ${fixture.shoppingSibling} · ${recipeTitle}`,
			exact: true
		});
		await expectSettledSourceControl(needControl);
		const changed = page.waitForResponse(
			(response) =>
				response.request().method() === 'POST' &&
				response.url().endsWith('/api/shopping/recipe-choice')
		);
		await needControl.selectOption('required');
		const response = await changed;
		expect(response.ok()).toBe(true);
		expect(response.request().postDataJSON()).toMatchObject({
			action: 'need',
			need: 'required'
		});
	}
	await expect(
		page.getByRole('checkbox', { name: `Mark ${fixture.shoppingSibling} bought` })
	).toBeVisible();
	await page.getByRole('button', { name: `Actions for ${fixture.shoppingSibling}` }).click();
	const siblingDetails = page.getByRole('dialog', { name: fixture.shoppingSibling });
	for (const recipeTitle of [fixture.recipeTitle, otherRecipeTitle]) {
		const needControl = siblingDetails.getByRole('combobox', {
			name: `Choose future-list need for ${fixture.shoppingSibling} · ${recipeTitle}`,
			exact: true
		});
		await expectSettledSourceControl(needControl);
		const excluded = page.waitForResponse(
			(response) =>
				response.request().method() === 'POST' &&
				response.url().endsWith('/api/shopping/recipe-choice')
		);
		await needControl.selectOption('optional');
		expect((await excluded).ok()).toBe(true);
	}
	await expect(
		page.getByRole('checkbox', { name: `Mark ${fixture.shoppingSibling} bought` })
	).toHaveCount(0);
	await expect(siblingDetails).toBeHidden();
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
	await expect(page.getByRole('button', { name: `Edit ${fixture.recipeTitle}` })).toBeVisible();
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
