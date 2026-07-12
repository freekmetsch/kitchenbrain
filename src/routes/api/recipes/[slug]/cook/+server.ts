import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db/index';
import { cookLog, recipes } from '$lib/server/db/schema';
import { recordCook } from '$lib/server/cook_log';
import { BENCH_SHEET_RATINGS, type BenchSheetRating } from '$lib/types';
import { todayIso } from '$lib/week';

function parseBenchSheetRating(value: unknown): BenchSheetRating | null {
	return BENCH_SHEET_RATINGS.includes(value as BenchSheetRating) ? (value as BenchSheetRating) : null;
}

export const POST: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const recipe = db.select({ id: recipes.id }).from(recipes).where(eq(recipes.slug, params.slug)).get();
	if (!recipe) throw error(404, 'Recipe not found');

	const cookedDate = todayIso();

	const existing = db
		.select({ id: cookLog.id })
		.from(cookLog)
		.where(and(eq(cookLog.recipeSlug, params.slug), eq(cookLog.cookedDate, cookedDate), eq(cookLog.source, 'manual')))
		.get();
	if (existing) return json({ logged: false, reason: 'already_logged_today' });

	let benchSheetRating: BenchSheetRating | null = null;
	if (request.headers.get('content-type')?.includes('application/json')) {
		try {
			const body = (await request.json()) as { benchSheetRating?: unknown };
			benchSheetRating = parseBenchSheetRating(body?.benchSheetRating);
		} catch {
			// Empty / non-JSON bodies are fine — rating stays null.
		}
	}

	const result = recordCook(db, {
		recipeSlug: params.slug,
		cookedDate,
		source: 'manual',
		benchSheetRating
	});
	return json(result);
};
