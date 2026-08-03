import { beforeEach, describe, expect, it, vi } from 'vitest';

const dependencies = vi.hoisted(() => ({
	getRecipeForEdit: vi.fn(),
	saveRecipeEdit: vi.fn(),
	kickCookModeGeneration: vi.fn()
}));

vi.mock('$lib/server/workflows/recipe-edit', () => ({
	getRecipeForEdit: dependencies.getRecipeForEdit,
	saveRecipeEdit: dependencies.saveRecipeEdit
}));

vi.mock('$lib/server/ai/cook_mode', () => ({
	kickCookModeGeneration: dependencies.kickCookModeGeneration
}));

import { actions } from './+page.server';

function recipe() {
	return {
		id: 1,
		slug: 'soep',
		title: 'Soep',
		language: 'nl',
		notes: null,
		sourceUrl: null,
		servings: 4,
		contentRevision: 1,
		ingredients: [{ id: 'ing-ui', name: 'ui', amount: '1' }],
		directions: ['Snijd de ui.'],
		directionIdsJson: ['dir-old'],
		structureDraft: null,
		structureDraftSourceUpdatedAt: null,
		updatedAt: new Date('2026-01-01T00:00:00.000Z')
	};
}

describe('recipe edit action', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		const current = recipe();
		dependencies.getRecipeForEdit.mockReturnValue(current);
		dependencies.saveRecipeEdit.mockReturnValue({ ...current, contentRevision: 2 });
	});

	it('invalidates changed cooking structure without requesting cooking details', async () => {
		const form = new FormData();
		form.set('title', 'Soep');
		form.set('language', 'nl');
		form.set('notes', '');
		form.set('sourceUrl', '');
		form.set('servings', '4');
		form.set('contentRevision', '1');
		form.set('ingredients', JSON.stringify(recipe().ingredients));
		form.set('directions', JSON.stringify(['Snijd de ui.']));
		form.set('directionIds', JSON.stringify(['dir-new']));

		const action = actions.default;
		if (!action) throw new Error('expected default action');
		await expect(
			action({
				request: new Request('http://localhost/recipes/soep/edit', {
					method: 'POST',
					body: form
				}),
				params: { slug: 'soep' },
				locals: { user: { id: 1 } }
			} as never)
		).rejects.toMatchObject({ status: 303 });

		expect(dependencies.saveRecipeEdit).toHaveBeenCalledWith(
			expect.objectContaining({
				changes: expect.objectContaining({ cookModeJson: null, cookModeGeneratedAt: null })
			})
		);
		expect(dependencies.kickCookModeGeneration).not.toHaveBeenCalled();
	});
});
