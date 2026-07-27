import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import {
	InvalidRecipeImageFilenameError,
	readRecipeImage,
	RecipeImageNotFoundError
} from '$lib/server/workflows/recipe-image';

export const GET: RequestHandler = async ({ params }) => {
	let image;
	try {
		image = await readRecipeImage(params.file);
	} catch (cause) {
		if (cause instanceof InvalidRecipeImageFilenameError) {
			throw error(400, cause.message);
		}
		if (cause instanceof RecipeImageNotFoundError) {
			throw error(404, cause.message);
		}
		throw cause;
	}

	return new Response(new Uint8Array(image.data), {
		headers: {
			'Content-Type': image.contentType,
			'Content-Length': image.contentLength.toString(),
			'Cache-Control': image.cacheControl
		}
	});
};
