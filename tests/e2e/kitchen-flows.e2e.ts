import { expect, test } from '@playwright/test';
import { kitchenFixtureFor } from './fixtures';

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
	await expect(page.getByText('5 portions', { exact: true })).toBeVisible();

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
});

test('Shopping bought undo and recipe-source choice stay recoverable', async ({
	page
}, testInfo) => {
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
	await page.getByRole('button', { name: /Edit shopping rule/ }).click();

	const ruleDialog = page.getByRole('dialog').filter({
		has: page.getByRole('heading', { name: 'Edit shopping rule' })
	});
	await expect(ruleDialog).toBeVisible();
	await ruleDialog.getByRole('radio', { name: /Nice to have/ }).check();
	await ruleDialog.getByLabel('Buy this week').selectOption(fixture.shoppingAlternative);

	const sourceSaved = page.waitForResponse(
		(response) =>
			response.request().method() === 'POST' &&
			response.url().endsWith('/api/shopping/recipe-choice')
	);
	await ruleDialog.getByRole('button', { name: 'Save choice' }).click();
	expect((await sourceSaved).ok()).toBe(true);
	await expect(page.getByText('Shopping choice saved.', { exact: true })).toBeVisible({
		timeout: 15_000
	});
});

test('Recipes can be planned, marked made, and frozen without providers', async ({
	page
}, testInfo) => {
	const fixture = kitchenFixtureFor(testInfo);

	await page.goto('/recipes');
	await page.waitForLoadState('networkidle');
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
	await page.waitForLoadState('networkidle');
	await expect(page.getByRole('button', { name: `Edit ${fixture.recipeTitle}` })).toBeVisible();
});

test('Cook Mode resumes its active step and safely resets a broken session without providers', async ({
	page
}, testInfo) => {
	const fixture = kitchenFixtureFor(testInfo);
	const progressKey = `cookmode-progress:${fixture.cookRecipeSlug}:direct`;

	await page.goto(`/recipes/${fixture.cookRecipeSlug}`);
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
		.poll(() => page.evaluate((key) => localStorage.getItem(key), progressKey))
		.not.toBeNull();

	await page.reload();
	await expect(secondStep).toHaveAttribute('aria-current', 'step');

	await page.evaluate((key) => localStorage.setItem(key, '{"v":2}'), progressKey);
	await page.reload();
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
});
