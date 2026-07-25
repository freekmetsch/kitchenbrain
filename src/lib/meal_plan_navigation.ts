export interface MealPlanWeekRef {
	weekStartDate: string;
}

export function selectedMealPlanWeek<T extends MealPlanWeekRef>(
	weeks: readonly T[],
	focusWeek: string | null,
	currentWeekStart: string
): T | undefined {
	const requested = focusWeek ?? currentWeekStart;
	return (
		weeks.find((week) => week.weekStartDate === requested) ??
		weeks.find((week) => week.weekStartDate === currentWeekStart) ??
		weeks[0]
	);
}

export function adjacentMealPlanWeeks<T extends MealPlanWeekRef>(
	weeks: readonly T[],
	selectedWeekStart: string | null
): { previous: T | null; next: T | null } {
	const index = selectedWeekStart
		? weeks.findIndex((week) => week.weekStartDate === selectedWeekStart)
		: -1;
	if (index < 0) return { previous: null, next: null };
	return {
		previous: index > 0 ? weeks[index - 1] : null,
		next: index + 1 < weeks.length ? weeks[index + 1] : null
	};
}

export function mealPlanWeekHref(
	basePath: string,
	weekStartDate: string,
	showPastWeeks: boolean
): string {
	const params = new URLSearchParams({ week: weekStartDate });
	if (showPastWeeks) params.set('past', '1');
	return `${basePath}/meal-plan?${params.toString()}`;
}
