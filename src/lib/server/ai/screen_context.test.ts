import { describe, expect, it } from 'vitest';
import { blocksDirtyRecipeWrite, parseScreenContext, serializeScreenContext } from './screen_context';

const valid = {
	v: 1 as const,
	routeId: '/recipes/[slug]',
	label: 'Recipe: Curry',
	entity: { kind: 'recipe' as const, id: 'curry', label: 'Curry' },
	facts: [{ key: 'roleCoverage', value: '2/3' }],
	interaction: { mode: 'view' as const, dirty: false }
};

describe('screen context', () => {
	it('accepts a bounded allowlisted context and marks serialization as untrusted', () => {
		expect(parseScreenContext(valid)).toEqual(valid);
		expect(serializeScreenContext(valid)).toContain('<screen_context_untrusted>');
	});

	it.each([
		{ ...valid, extra: true },
		{ ...valid, routeId: '/settings', entity: { kind: 'recipe', id: 'curry' } },
		{ ...valid, facts: [{ key: 'api_token', value: 'nope' }] },
		{ ...valid, facts: Array.from({ length: 13 }, (_, i) => ({ key: `fact${i}`, value: i })) }
	])('rejects malformed, forged, secret-shaped, or excessive context', (context) => {
		expect(() => parseScreenContext(context)).toThrow();
	});

	it('rejects an oversized payload', () => {
		expect(() =>
			parseScreenContext({ ...valid, label: 'x'.repeat(5000) })
		).toThrow('too large');
	});

	it('blocks only writes to the dirty recipe currently being edited', () => {
		const dirty = { ...valid, routeId: '/recipes/[slug]/edit', interaction: { mode: 'edit' as const, dirty: true } };
		expect(blocksDirtyRecipeWrite(dirty, 'edit_recipe', { slug: 'curry' })).toBe(true);
		expect(blocksDirtyRecipeWrite(dirty, 'edit_recipe', { slug: 'soup' })).toBe(false);
		expect(blocksDirtyRecipeWrite(dirty, 'get_recipe', { slug: 'curry' })).toBe(false);
	});
});
