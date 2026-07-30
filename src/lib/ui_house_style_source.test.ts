import { existsSync, readFileSync, readdirSync } from 'node:fs';
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
			'ui-section-frame',
			'ui-kitchen-header-rail',
			'ui-kitchen-header-action',
			'ui-kitchen-search',
			'ui-kitchen-select-on-dark',
			'--kitchen-display',
			'Georgia',
			"'Times New Roman'"
		]) {
			expect(source, retired).not.toContain(retired);
		}
		expect(existsSync('src/lib/components/ui/KitchenHeaderActionRail.svelte')).toBe(false);
	});

	it('keeps Green Ribbon ownership compact and content-free', () => {
		const header = readFileSync('src/lib/components/ui/KitchenPageHeader.svelte', 'utf8');
		const recipeDetail = readFileSync(
			'src/lib/components/recipe-detail/RecipeHeader.svelte',
			'utf8'
		);
		const recipeEdit = readFileSync('src/routes/recipes/[slug]/edit/+page.svelte', 'utf8');

		expect(header).toContain('data-house-style="green-ribbon"');
		expect(header).toContain("layout?: 'standard' | 'contextual'");
		expect(header).toContain('data-layout={layout}');
		expect(header).toContain('leading?: Snippet');
		expect(header).toContain('action?: Snippet');
		expect(header).not.toContain('children');
		expect(header).not.toContain('linear-gradient');
		expect(header).not.toContain('radial-gradient');
		expect(header).not.toContain('::after');
		expect(recipeDetail).toContain('layout="contextual"');
		expect(recipeDetail).toContain('kitchen-page-header-action-label');
		expect(recipeEdit).toContain('layout="contextual"');
		expect(recipeEdit).toContain('kitchen-page-header-action-label');
	});

	it('does not restore full-height recipe category markers', () => {
		const source = stableSource();
		expect(source).not.toMatch(/\bborder-left\s*:|\bborder-l-(?:\d|\[)/);
		expect(source).not.toContain('ui-recipe-card::before');
		expect(source).not.toContain('data-category-accent');
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
