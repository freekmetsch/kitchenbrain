import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { BENCH_SHEET_RATINGS, type BenchSheetRating } from '$lib/types';
import { recordManualRecipeCook } from '$lib/server/workflows/record-recipe-cook';

function parseBenchSheetRating(value: unknown): BenchSheetRating | null {
	return BENCH_SHEET_RATINGS.includes(value as BenchSheetRating)
		? (value as BenchSheetRating)
		: null;
}

export const POST: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	let benchSheetRating: BenchSheetRating | null = null;
	if (request.headers.get('content-type')?.includes('application/json')) {
		try {
			const body = (await request.json()) as { benchSheetRating?: unknown };
			benchSheetRating = parseBenchSheetRating(body?.benchSheetRating);
		} catch {
			// Empty / non-JSON bodies are fine.
		}
	}
	const result = recordManualRecipeCook(params.slug, benchSheetRating);
	if (result.status === 'not_found') throw error(404, 'Recipe not found');
	return json(result.result);
};
