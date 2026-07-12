import type { PageServerLoad } from './$types';
import { asc, inArray, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db/index';
import { inventoryItems, recipes } from '$lib/server/db/schema';
import type { Ingredient } from '$lib/server/db/schema';
import { namesMatch } from '$lib/match';
import {
	freezerStapleInfoByRecipe,
	frozenPortionsByRecipe,
	recipeSuggestionsForName,
	recipeTitleRows,
	stapleGhostRows,
	type RecipeSuggestion
} from '$lib/server/recipe_links';
import { isoWeekStart } from '$lib/week';

export type RecipeMatch = { slug: string; title: string; coverage: number; total: number };
export type RecipeLink = {
	title: string;
	// Dutch canonical title — frozen leftovers store it as the item name, so the
	// UI needs it to spot (and drop) the redundant linked-recipe chip text.
	titleNl: string;
	slug: string;
	isFreezerStaple: boolean;
	targetPortions: number | null;
	onHandPortions: number;
};

export const load: PageServerLoad = async () => {
	// Facet model (ADR 0001): kind / foodClass / needsReview / isStaple /
	// madeFromRecipeId / recipeStatus all ship on the row. Legacy `category`
	// is still selected (additive columns) but the UI no longer reads it.
	const items = db
		.select()
		.from(inventoryItems)
		.where(isNull(inventoryItems.deletedAt))
		.orderBy(asc(inventoryItems.name))
		.all();

	// Frozen portions per recipe, scanned once for the linked-recipe chips.
	const onHandByRecipe = frozenPortionsByRecipe(db);

	// Resolve linked-recipe titles + freezer-staple targets for leftovers
	// (English display per app rule; AH Dutch invariant untouched — display-only).
	const linkedIds = [
		...new Set(items.map((i) => i.madeFromRecipeId).filter((v): v is number => v !== null))
	];
	const recipeLinks: Record<number, RecipeLink> = {};
	if (linkedIds.length) {
		const stapleInfo = freezerStapleInfoByRecipe(db, linkedIds, onHandByRecipe);
		const rows = db
			.select({ id: recipes.id, slug: recipes.slug, title: recipes.title, titleEn: recipes.titleEn })
			.from(recipes)
			.where(inArray(recipes.id, linkedIds))
			.all();
		for (const r of rows) {
			const info = stapleInfo.get(r.id);
			recipeLinks[r.id] = {
				title: r.titleEn ?? r.title,
				titleNl: r.title,
				slug: r.slug,
				isFreezerStaple: info?.isFreezerStaple ?? false,
				targetPortions: info?.targetPortions ?? null,
				onHandPortions: info?.onHandPortions ?? 0
			};
		}
	}

	// P4.2 (G10): unlinked leftovers get name-match recipe suggestions so the UI
	// can offer link-existing / plan-to-add / no-recipe. Skip items already
	// dismissed as no_recipe. The full title list also ships as `recipeOptions`
	// so the manual link picker works when zero titles match (UX-STOCK-2).
	const titleRows = recipeTitleRows(db);
	const recipeOptions: RecipeSuggestion[] = titleRows
		.map((r) => ({ id: r.id, slug: r.slug, title: r.titleEn ?? r.title }))
		.sort((a, b) => a.title.localeCompare(b.title, 'en'));
	const leftoverSuggestions: Record<number, RecipeSuggestion[]> = {};
	for (const item of items) {
		if (item.kind !== 'leftover') continue;
		if (item.madeFromRecipeId !== null) continue;
		if (item.recipeStatus === 'no_recipe') continue;
		const suggestions = recipeSuggestionsForName(item.name, titleRows);
		if (suggestions.length) leftoverSuggestions[item.id] = suggestions;
	}

	// "What can I make" — ingredient → recipe coverage (unchanged from the prior page).
	const recipeRows = db
		.select({
			slug: recipes.slug,
			title: recipes.title,
			titleEn: recipes.titleEn,
			ingredients: recipes.ingredients
		})
		.from(recipes)
		.all();

	const itemRecipes = new Map<number, RecipeMatch[]>();
	for (const item of items) itemRecipes.set(item.id, []);

	for (const recipe of recipeRows) {
		const ings = recipe.ingredients as Ingredient[];
		if (!ings.length) continue;
		const matchedItemIds = new Set<number>();
		let covered = 0;
		for (const ing of ings) {
			let hit = false;
			for (const item of items) {
				// Leftovers are cooked dishes, not ingredients — their recipe relation
				// is madeFromRecipeId. Matching them here produced nonsense like
				// "chickpea curry uses chili" on dish rows (UX-STOCK-4).
				if (item.kind === 'leftover') continue;
				if (namesMatch(ing.name, item.name)) {
					matchedItemIds.add(item.id);
					hit = true;
				}
			}
			if (hit) covered++;
		}
		if (matchedItemIds.size === 0) continue;
		const match: RecipeMatch = {
			slug: recipe.slug,
			title: recipe.titleEn ?? recipe.title,
			coverage: covered,
			total: ings.length
		};
		for (const id of matchedItemIds) itemRecipes.get(id)!.push(match);
	}

	const recipeMatches: Record<number, RecipeMatch[]> = {};
	for (const [id, list] of itemRecipes.entries()) {
		recipeMatches[id] = list
			.sort((a, b) => b.coverage / b.total - a.coverage / a.total || b.coverage - a.coverage)
			.slice(0, 8);
	}

	// UX-STOCK-14: keep-stocked recipes with no live meal row become ghost rows
	// in the Meals shelf ("0 / N portions · cook again") — the single restock
	// surface now that the P6.2 strip is gone. Live rows carry their own cue.
	const liveLinkedIds = new Set(
		items
			.filter((i) => i.kind === 'leftover' && i.madeFromRecipeId !== null)
			.map((i) => i.madeFromRecipeId as number)
	);
	const stapleGhosts = stapleGhostRows(db, liveLinkedIds);

	return {
		items,
		recipeLinks,
		recipeMatches,
		leftoverSuggestions,
		recipeOptions,
		stapleGhosts,
		currentWeekStart: isoWeekStart()
	};
};
