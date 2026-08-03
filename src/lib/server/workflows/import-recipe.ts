import { db as appDb } from '$lib/server/db/index';
import type { Db } from '$lib/server/db/types';
import {
	createImportedRecipe,
	type ImportedRecipeInput
} from '$lib/server/domains/recipes/create';
import { getAutoTranslateOnImport } from '$lib/server/recipes/prefs';

type ImportRecipeBackground = {
	getAutoTranslateOnImport?: () => boolean;
	kickTranslateOnImport?: (slug: string) => void;
};

const APP_BACKGROUND: ImportRecipeBackground = {
	getAutoTranslateOnImport,
	kickTranslateOnImport(slug) {
		void import('$lib/server/ai/translate_recipe').then(({ kickTranslateOnImport }) => {
			kickTranslateOnImport(slug);
		});
	}
};

export function createImportRecipeService(
	db: Db,
	background: ImportRecipeBackground = db === appDb ? APP_BACKGROUND : {}
) {
	return {
		save(data: ImportedRecipeInput) {
			const { recipe, review } = db.transaction((tx) => createImportedRecipe(tx, data));

			if (background.getAutoTranslateOnImport?.()) {
				background.kickTranslateOnImport?.(recipe.slug);
			}

			return { slug: recipe.slug, title: recipe.title, ...review };
		}
	};
}

export function saveImportedRecipe(db: Db, data: ImportedRecipeInput) {
	return createImportRecipeService(db).save(data);
}

const appImportRecipeService = createImportRecipeService(appDb, APP_BACKGROUND);

export function saveImportedRecipeForApp(data: ImportedRecipeInput) {
	return appImportRecipeService.save(data);
}
