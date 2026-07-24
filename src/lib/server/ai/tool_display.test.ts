import { describe, expect, it } from 'vitest';
import { toolEntityHref } from '$lib/tool_display';
import { buildToolDisplay } from './tool_display';

describe('recipe tool display actions', () => {
	it('links a recipe that needs review directly to its app view', () => {
		const display = buildToolDisplay(
			null as never,
			'edit_recipe',
			{},
			{ ok: true, slug: 'weeknight-curry', needs_review: true }
		);

		expect(display.entityAction).toEqual({
			kind: 'recipe',
			id: 'weeknight-curry',
			intent: 'review'
		});
		expect(toolEntityHref(display.entityAction!, '/kitchen')).toBe(
			'/kitchen/recipes/weeknight-curry'
		);
	});

	it('uses a view action for an ordinary recipe result', () => {
		const display = buildToolDisplay(
			null as never,
			'add_recipe',
			{},
			{ ok: true, slug: 'soup', title: 'Soup', needs_review: false }
		);

		expect(display.entityAction?.intent).toBe('view');
	});

	it('keeps arbitrary entity text inside an encoded local path', () => {
		expect(
			toolEntityHref(
				{ kind: 'recipe', id: 'https://example.com/../../settings', intent: 'view' },
				''
			)
		).toBe('/recipes/https%3A%2F%2Fexample.com%2F..%2F..%2Fsettings');
	});

	it('keeps legacy displays without entity metadata valid', () => {
		expect(toolEntityHref(undefined, '')).toBeNull();
	});
});
