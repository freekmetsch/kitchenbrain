import { db as appDb } from '$lib/server/db/index';
import type { Db } from '$lib/server/db/types';
import { getInventoryPageData } from '$lib/server/domains/inventory/page';
import { getWeekStartDay } from '$lib/server/meal_plan/prefs';
import { todayIso, weekStartFor } from '$lib/week';

export function loadInventoryPage(db: Db = appDb) {
	const today = todayIso();
	return {
		...getInventoryPageData(db),
		todayIso: today,
		currentWeekStart: weekStartFor(today, getWeekStartDay(db))
	};
}
