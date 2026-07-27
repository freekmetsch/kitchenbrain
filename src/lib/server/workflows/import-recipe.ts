import { db as appDb } from '$lib/server/db/index';
import type { Db } from '$lib/server/db/types';
import {
	createImportedRecipe,
	type ImportedRecipeInput
} from '$lib/server/domains/recipes/create';
import { getAutoTranslateOnImport } from '$lib/server/recipes/prefs';

export function saveImportedRecipe(db: Db, data: ImportedRecipeInput) {
	const { recipe, review } = db.transaction((tx) => createImportedRecipe(tx, data));

	if (db === appDb) {
		void import('$lib/server/ai/cook_mode').then(({ kickCookModeGeneration }) => {
			kickCookModeGeneration(recipe.slug);
		});
		if (getAutoTranslateOnImport()) {
			void import('$lib/server/ai/translate_recipe').then(({ kickTranslateOnImport }) => {
				kickTranslateOnImport(recipe.slug);
			});
		}
	}

	return { slug: recipe.slug, title: recipe.title, ...review };
}

export function saveImportedRecipeForApp(data: ImportedRecipeInput) {
	return saveImportedRecipe(appDb, data);
}
