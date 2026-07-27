import { and, eq } from 'drizzle-orm';
import { db as appDb } from '$lib/server/db/index';
import { cookLog } from '$lib/server/db/schema';
import { getRecipeBySlug } from '$lib/server/domains/recipes';
import { recordCook } from '$lib/server/cook_log';
import type { BenchSheetRating } from '$lib/types';
import { todayIso } from '$lib/week';

export function recordManualRecipeCook(
	slug: string,
	benchSheetRating: BenchSheetRating | null
) {
	const recipe = getRecipeBySlug(appDb, slug);
	if (!recipe) return { status: 'not_found' as const };
	const cookedDate = todayIso();
	const existing = appDb
		.select({ id: cookLog.id })
		.from(cookLog)
		.where(
			and(
				eq(cookLog.recipeSlug, slug),
				eq(cookLog.cookedDate, cookedDate),
				eq(cookLog.source, 'manual')
			)
		)
		.get();
	if (existing) {
		return {
			status: 'ok' as const,
			result: { logged: false as const, reason: 'already_logged_today' as const }
		};
	}
	return {
		status: 'ok' as const,
		result: recordCook(appDb, {
			recipeSlug: slug,
			cookedDate,
			source: 'manual',
			benchSheetRating
		})
	};
}
