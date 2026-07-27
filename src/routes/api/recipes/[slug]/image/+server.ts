import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { isSafeImagePathSegment, MAX_IMAGE_BYTES } from '$lib/server/domains/recipes';
import {
	deleteRecipeImageForApp,
	getRecipeImageTargetForApp,
	InvalidRecipeImageError,
	RecipeImageStoreError,
	storeRecipeImageForApp
} from '$lib/server/workflows/recipe-image';

export const POST: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	if (!isSafeImagePathSegment(params.slug)) throw error(400, 'Invalid slug');

	const recipe = getRecipeImageTargetForApp(params.slug);
	if (!recipe) throw error(404, 'Recipe not found');

	let form: FormData;
	try {
		form = await request.formData();
	} catch {
		throw error(400, 'Invalid form data');
	}
	const file = form.get('image');
	if (!(file instanceof File)) throw error(400, 'No image uploaded');
	if (file.size === 0) throw error(400, 'Empty file');
	if (file.size > MAX_IMAGE_BYTES) throw error(413, 'Image larger than 5MB');

	let imageUrl: string;
	try {
		imageUrl = await storeRecipeImageForApp(recipe, Buffer.from(await file.arrayBuffer()));
	} catch (cause) {
		if (cause instanceof InvalidRecipeImageError) {
			throw error(415, cause.message);
		}
		if (cause instanceof RecipeImageStoreError) {
			throw error(500, cause.message);
		}
		throw cause;
	}

	return json({ imageUrl });
};

export const DELETE: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	if (!isSafeImagePathSegment(params.slug)) throw error(400, 'Invalid slug');

	const recipe = getRecipeImageTargetForApp(params.slug);
	if (!recipe) throw error(404, 'Recipe not found');

	await deleteRecipeImageForApp(recipe);

	return json({ ok: true });
};

