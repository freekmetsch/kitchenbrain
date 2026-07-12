import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import { db } from '$lib/server/db/index';
import {
	scrapeRecipeFromUrl,
	insertScrapedRecipe,
	RecipeIngestError
} from '$lib/server/ai/recipe_ingest';
import { readJsonBody } from '$lib/server/api_body';

// HTTP status per ingest failure mode (blocked URL / fetch upstream / AI extraction / no title).
const INGEST_STATUS: Record<RecipeIngestError['code'], number> = {
	blocked_url: 400,
	fetch: 502,
	extract: 500,
	no_title: 422
};

const schema = z.object({ url: z.string().url() });

export const POST: RequestHandler = async ({ request, locals, fetch }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const { url } = await readJsonBody(request, schema);

	let recipeData;
	try {
		recipeData = await scrapeRecipeFromUrl(url, fetch);
	} catch (err) {
		if (err instanceof RecipeIngestError) throw error(INGEST_STATUS[err.code], err.message);
		throw err;
	}

	const saved = insertScrapedRecipe(db, recipeData);
	return json({ slug: saved.slug, title: saved.title });
};
