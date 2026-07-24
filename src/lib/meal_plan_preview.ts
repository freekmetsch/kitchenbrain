import {
	addDays,
	deliveryDateForPlanningWeek,
	weekStartFor
} from '$lib/week';

export function buildMealPlanPreview(
	referenceDate: string,
	prefs: { weekStartDay: number; groceryDay: number | null }
) {
	const weekStart = weekStartFor(referenceDate, prefs.weekStartDay);
	return {
		weekStart,
		weekEnd: addDays(weekStart, 6),
		deliveryDate:
			prefs.groceryDay == null
				? null
				: deliveryDateForPlanningWeek(
						weekStart,
						prefs.groceryDay,
						prefs.weekStartDay
					),
		days: Array.from({ length: 7 }, (_, index) => addDays(weekStart, index))
	};
}
