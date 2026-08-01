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

	it('keeps Green Ribbon ownership compact and explicitly command-capable', () => {
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
		expect(header).toContain("variant?: 'standard' | 'command'");
		expect(header).toContain('actions?: Snippet');
		expect(header).toContain('children?: Snippet');
		expect(header).toContain("data-variant={variant}");
		expect(header).not.toContain('linear-gradient');
		expect(header).not.toContain('radial-gradient');
		expect(header).not.toContain('::after');
		expect(recipeDetail).toContain('layout="contextual"');
		expect(recipeDetail).toContain('variant="command"');
		expect(recipeDetail).toContain('CombinedFilterMenu');
		expect(recipeEdit).toContain('layout="contextual"');
		expect(recipeEdit).toContain('kitchen-page-header-action-label');
		expect(recipeEdit).toContain(
			'eyebrow={m.recipes_edit_heading()} title={data.recipe.title}'
		);
	});

	it('does not restore full-height recipe category markers', () => {
		const source = stableSource();
		expect(source).not.toMatch(/\bborder-left\s*:|\bborder-l-(?:\d|\[)/);
		expect(source).not.toContain('ui-recipe-card::before');
		expect(source).not.toContain('data-category-accent');
	});

	it('keeps selection and passive status semantics separate', () => {
		const filterChip = readFileSync('src/lib/components/ui/FilterChip.svelte', 'utf8');
		const segmentedControl = readFileSync(
			'src/lib/components/ui/SegmentedControl.svelte',
			'utf8'
		);
		const statusBadge = readFileSync('src/lib/components/ui/StatusBadge.svelte', 'utf8');

		expect(filterChip).toContain('<button');
		expect(filterChip).toContain('aria-pressed={selected}');
		expect(statusBadge).toContain('<span');
		expect(statusBadge).toContain('class="ui-status-dot"');
		expect(statusBadge).not.toContain('aria-pressed');
		expect(statusBadge).not.toContain('tabindex');
		expect(segmentedControl).toContain('role="radiogroup"');
		expect(segmentedControl).toContain('role="radio"');
		expect(segmentedControl).toContain('aria-checked=');
		expect(segmentedControl).toContain('ResizeObserver');
		expect(segmentedControl).not.toContain('aria-controls');
		expect(existsSync('src/lib/components/ui/SegmentedTabs.svelte')).toBe(false);
	});

	it('keeps one exact Grove chassis token and shared surface contract', () => {
		const css = readFileSync('src/app.css', 'utf8');
		const nav = readFileSync('src/lib/components/NavBar.svelte', 'utf8');
		const shoppingHeader = readFileSync(
			'src/lib/components/shopping/WeekNav.svelte',
			'utf8'
		);

		expect(css).toContain('--kitchen-grove: #344f3e');
		expect(css).toContain('--kitchen-surface-radius: 0.875rem');
		expect(css).toContain('.ui-grove-surface::before');
		expect(nav).toContain('background: var(--kitchen-paper)');
		expect(shoppingHeader).toContain('onDark');
	});

	it('keeps the refined household work surfaces compact and explicit', () => {
		const mealPlan = readFileSync('src/routes/meal-plan/+page.svelte', 'utf8');
		const recipes = readFileSync('src/routes/recipes/+page.svelte', 'utf8');
		const inventory = readFileSync('src/routes/inventory/+page.svelte', 'utf8');
		const inventoryController = readFileSync(
			'src/lib/components/inventory/controller.svelte.ts',
			'utf8'
		);
		const stockFacets = readFileSync(
			'src/lib/components/inventory/FacetChips.svelte',
			'utf8'
		);
		const ahSheet = readFileSync('src/lib/components/shopping/AhSheet.svelte', 'utf8');
		const ahItem = readFileSync('src/lib/components/shopping/AhPreviewItem.svelte', 'utf8');

		expect(mealPlan).toContain('plan-header-actions');
		expect(mealPlan).toContain('plan-shopping-action');
		expect(mealPlan.indexOf('meal-serving-stepper')).toBeLessThan(
			mealPlan.indexOf('meal-details')
		);
		expect(mealPlan).toContain('grid-template-rows: minmax(2.75rem, auto) minmax(2.75rem, auto)');
		expect(mealPlan).toContain('rotation-lane-heading');
		expect(mealPlan).not.toContain('plan-actions');

		expect(recipes).toContain('recipe-command-toolbar');
		expect(recipes).toContain('recipe-quick-filters');
		expect(recipes).toContain('recipe-type-selects');
		expect(recipes).toContain('CombinedFilterMenu');
		expect(recipes).toContain('recipe-card-actions');
		expect(recipes).not.toContain('ui-scroll-rail');
		expect(recipes).not.toContain('scrollRail');

		expect(inventory).toContain('stock-command-toolbar');
		expect(inventory).toContain('stock-filter-selects');
		expect(inventory).toContain('CombinedFilterMenu');
		expect(inventory).not.toContain('FiltersSheet');
		expect(inventoryController).not.toContain('filtersOpen');
		expect(existsSync('src/lib/components/inventory/FiltersSheet.svelte')).toBe(false);
		expect(stockFacets).not.toContain('StatusBadge');
		expect(stockFacets).not.toMatch(/[🧊🥫🍲🥩🐟🫘🥚🥛🫙🍚]/u);

		expect(ahSheet).toContain('attentionItems');
		expect(ahSheet).toContain('confirmedItems');
		expect(ahSheet).toContain('ah-review-footer');
		expect(ahItem).toContain('compact?: boolean');
		expect(ahItem).toContain('ah-compact-row');
	});
});
