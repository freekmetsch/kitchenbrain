import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const stableRoots = [
	'src/lib/components/inventory',
	'src/lib/components/meal-plan',
	'src/lib/components/shopping',
	'src/lib/components/recipe-detail',
	'src/lib/components/recipe-edit',
	'src/lib/components/settings',
	'src/lib/components/ui',
	'src/routes/inventory',
	'src/routes/meal-plan',
	'src/routes/shopping',
	'src/routes/recipes',
	'src/routes/settings',
	'src/routes/login'
];

function stableSvelteFiles(): string[] {
	return stableRoots.flatMap((root) =>
		readdirSync(root, { recursive: true, withFileTypes: true })
			.filter((entry) => entry.isFile() && entry.name.endsWith('.svelte'))
			.map((entry) => path.join(entry.parentPath, entry.name))
	);
}

function stableSource(): string {
	return [
		readFileSync('src/app.css', 'utf8'),
		...stableSvelteFiles().map((file) => readFileSync(file, 'utf8'))
	].join('\n');
}

describe('stable app house-style source contract', () => {
	it('does not restore retired same-role visual dialects', () => {
		const source = stableSource();
		for (const retired of [
			'ui-chip',
			'ui-list-card',
			'ui-kitchen-header-action',
			'ui-kitchen-search',
			'ui-kitchen-select-on-dark'
		]) {
			expect(source, retired).not.toContain(retired);
		}
	});

	it('keeps leading markers exclusive to Recipe category cards', () => {
		const source = stableSource();
		expect(source).not.toMatch(/\bborder-left\s*:|\bborder-l-(?:\d|\[)/);
		expect(source.match(/ui-recipe-card::before/g)).toHaveLength(1);

		const categoryMarkerOwners = stableSvelteFiles().filter((file) =>
			readFileSync(file, 'utf8').includes('data-category-accent')
		);
		expect(categoryMarkerOwners.map((file) => path.relative('.', file).replaceAll(path.sep, '/'))).toEqual([
			'src/routes/recipes/+page.svelte'
		]);
	});

	it('keeps selection and passive status semantics separate', () => {
		const filterChip = readFileSync('src/lib/components/ui/FilterChip.svelte', 'utf8');
		const statusBadge = readFileSync('src/lib/components/ui/StatusBadge.svelte', 'utf8');

		expect(filterChip).toContain('<button');
		expect(filterChip).toContain('aria-pressed={selected}');
		expect(statusBadge).toContain('<span');
		expect(statusBadge).not.toContain('aria-pressed');
		expect(statusBadge).not.toContain('tabindex');
	});
});
