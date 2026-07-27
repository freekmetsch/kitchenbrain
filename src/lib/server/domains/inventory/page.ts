import { asc, inArray, isNull } from 'drizzle-orm';
import type { Ingredient } from '$lib/server/db/schema';
import * as schema from '$lib/server/db/schema';
import type { DbOrTx } from '$lib/server/db/types';
import { namesMatch } from '$lib/match';
import {
	freezerStapleInfoByRecipe,
	frozenPortionsByRecipe,
	recipeTitleRows,
	stapleGhostRows,
	type RecipeSuggestion
} from './freezer';

export type RecipeMatch = { slug: string; title: string; coverage: number; total: number };
export type RecipeLink = {
	title: string;
	titleNl: string;
	slug: string;
	isFreezerStaple: boolean;
	targetPortions: number | null;
	onHandPortions: number;
};

export function getInventoryPageData(db: DbOrTx) {
	const items = db
		.select()
		.from(schema.inventoryItems)
		.where(isNull(schema.inventoryItems.deletedAt))
		.orderBy(asc(schema.inventoryItems.name))
		.all();
	const onHandByRecipe = frozenPortionsByRecipe(db);
	const linkedIds = [
		...new Set(items.map((item) => item.madeFromRecipeId).filter((value): value is number => value !== null))
	];
	const recipeLinks: Record<number, RecipeLink> = {};
	if (linkedIds.length) {
		const stapleInfo = freezerStapleInfoByRecipe(db, linkedIds, onHandByRecipe);
		const rows = db
			.select({
				id: schema.recipes.id,
				slug: schema.recipes.slug,
				title: schema.recipes.title,
				titleEn: schema.recipes.titleEn
			})
			.from(schema.recipes)
			.where(inArray(schema.recipes.id, linkedIds))
			.all();
		for (const recipe of rows) {
			const info = stapleInfo.get(recipe.id);
			recipeLinks[recipe.id] = {
				title: recipe.titleEn ?? recipe.title,
				titleNl: recipe.title,
				slug: recipe.slug,
				isFreezerStaple: info?.isFreezerStaple ?? false,
				targetPortions: info?.targetPortions ?? null,
				onHandPortions: info?.onHandPortions ?? 0
			};
		}
	}

	const titleRows = recipeTitleRows(db);
	const recipeOptions: RecipeSuggestion[] = titleRows
		.map((recipe) => ({ id: recipe.id, slug: recipe.slug, title: recipe.titleEn ?? recipe.title }))
		.sort((a, b) => a.title.localeCompare(b.title, 'en'));
	const recipeRows = db
		.select({
			slug: schema.recipes.slug,
			title: schema.recipes.title,
			titleEn: schema.recipes.titleEn,
			ingredients: schema.recipes.ingredients
		})
		.from(schema.recipes)
		.all();
	const itemRecipes = new Map<number, RecipeMatch[]>();
	for (const item of items) itemRecipes.set(item.id, []);
	for (const recipe of recipeRows) {
		const ingredients = recipe.ingredients as Ingredient[];
		if (!ingredients.length) continue;
		const matchedItemIds = new Set<number>();
		let covered = 0;
		for (const ingredient of ingredients) {
			let hit = false;
			for (const item of items) {
				if (item.kind === 'leftover') continue;
				if (namesMatch(ingredient.name, item.name)) {
					matchedItemIds.add(item.id);
					hit = true;
				}
			}
			if (hit) covered++;
		}
		if (!matchedItemIds.size) continue;
		const match: RecipeMatch = {
			slug: recipe.slug,
			title: recipe.titleEn ?? recipe.title,
			coverage: covered,
			total: ingredients.length
		};
		for (const id of matchedItemIds) itemRecipes.get(id)!.push(match);
	}
	const recipeMatches: Record<number, RecipeMatch[]> = {};
	for (const [id, matches] of itemRecipes) {
		recipeMatches[id] = matches
			.sort((a, b) => b.coverage / b.total - a.coverage / a.total || b.coverage - a.coverage)
			.slice(0, 8);
	}
	const liveLinkedIds = new Set(
		items
			.filter((item) => item.kind === 'leftover' && item.madeFromRecipeId !== null)
			.map((item) => item.madeFromRecipeId as number)
	);
	return {
		items,
		recipeLinks,
		recipeMatches,
		recipeOptions,
		stapleGhosts: stapleGhostRows(db, liveLinkedIds)
	};
}
