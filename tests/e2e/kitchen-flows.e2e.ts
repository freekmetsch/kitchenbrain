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

	const buyTerm = page.getByRole('combobox', {
		name: `Choose what to buy for ${fixture.shoppingName} · ${fixture.recipeTitle} this run`
	});
	await expect(buyTerm).toBeVisible();
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
		page.getByRole('combobox', {
			name: `Choose what to buy for ${fixture.shoppingName} · ${fixture.recipeTitle} this run`
		})
	).toHaveValue(fixture.shoppingAlternative);
	const termRestored = page.waitForResponse(
		(response) =>
			response.request().method() === 'POST' &&
			response.url().endsWith('/api/shopping/recipe-choice')
	);
	await page
		.getByRole('combobox', {
			name: `Choose what to buy for ${fixture.shoppingName} · ${fixture.recipeTitle} this run`
		})
		.selectOption(fixture.shoppingName);
	expect((await termRestored).ok()).toBe(true);

	const needButton = page.getByRole('button', {
		name: `Change need for ${fixture.shoppingName} · ${fixture.recipeTitle}. Current: Always`
	});
	await page.getByText('Not this run (2)', { exact: true }).click();
	const siblingNeed = page.getByRole('button', {
		name: `Change need for ${fixture.shoppingSibling} · ${fixture.recipeTitle}. Current: Nice to have`
	});
	await expect(siblingNeed).toBeVisible();
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
	await needButton.click();
	await expect(siblingNeed).toBeDisabled();
	const excludedResponse = await sourceExcluded;
	expect(excludedResponse.ok()).toBe(true);
	expect(excludedResponse.request().postDataJSON()).toMatchObject({
		action: 'need',
		need: 'optional'
	});
	await expect(page.getByText('Not this run (3)', { exact: true })).toBeVisible();
	await expect(
		page.getByRole('button', {
			name: `Change need for ${fixture.shoppingName} · ${fixture.recipeTitle}. Current: Nice to have`
		})
	).toBeVisible();
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

	for (const state of [
		{ current: 'Always', next: 'optional' },
		{ current: 'Nice to have', next: 'stocked' },
		{ current: 'Usually stocked', next: 'required' }
	] as const) {
		const changed = page.waitForResponse(
			(response) =>
				response.request().method() === 'POST' &&
				response.url().endsWith('/api/shopping/recipe-choice')
		);
		await page
			.getByRole('button', {
				name: `Change need for ${fixture.shoppingName} · ${fixture.recipeTitle}. Current: ${state.current}`
			})
			.click();
		const response = await changed;
		expect(response.ok()).toBe(true);
		expect(response.request().postDataJSON()).toMatchObject({
			action: 'need',
			need: state.next
		});
	}
	await expect(
		page.getByRole('checkbox', { name: `Mark ${fixture.shoppingName} bought` })
	).toBeVisible();

	const otherRecipeTitle =
		fixture.account === 'primary' ? 'E2E Secondary Stew' : 'E2E Primary Stew';
	for (const recipeTitle of [fixture.recipeTitle, otherRecipeTitle]) {
		for (const transition of [
			{ current: 'Nice to have', next: 'stocked' },
			{ current: 'Usually stocked', next: 'required' }
		] as const) {
			const changed = page.waitForResponse(
				(response) =>
					response.request().method() === 'POST' &&
					response.url().endsWith('/api/shopping/recipe-choice')
			);
			await page
				.getByRole('button', {
					name: `Change need for ${fixture.shoppingSibling} · ${recipeTitle}. Current: ${transition.current}`
				})
				.click();
			const response = await changed;
			expect(response.ok()).toBe(true);
			expect(response.request().postDataJSON()).toMatchObject({
				action: 'need',
				need: transition.next
			});
		}
	}
	await expect(
		page.getByRole('checkbox', { name: `Mark ${fixture.shoppingSibling} bought` })
	).toBeVisible();
	for (const recipeTitle of [fixture.recipeTitle, otherRecipeTitle]) {
		await expect(
			page.getByRole('button', {
				name: `Change need for ${fixture.shoppingSibling} · ${recipeTitle}. Current: Always`
			})
		).toBeVisible();
		const excluded = page.waitForResponse(
			(response) =>
				response.request().method() === 'POST' &&
				response.url().endsWith('/api/shopping/recipe-choice')
		);
		await page
			.getByRole('button', {
				name: `Change need for ${fixture.shoppingSibling} · ${recipeTitle}. Current: Always`
			})
			.click();
		expect((await excluded).ok()).toBe(true);
	}
	await expect(
		page.getByRole('checkbox', { name: `Mark ${fixture.shoppingSibling} bought` })
	).toHaveCount(0);
	await expect(page.getByRole('button', { name: /^Shopping rules/ })).toHaveCount(0);
	await expect(page.getByRole('dialog')).toHaveCount(0);

	await page.getByRole('button', { name: 'Weekly items', exact: true }).click();
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
