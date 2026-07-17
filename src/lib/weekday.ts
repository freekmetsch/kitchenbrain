// Locale-aware weekday labels for the meal-planning prefs, which count days
// from Monday (0 = Monday … 6 = Sunday, matching lib/week.ts helpers).
import { getLocale } from '$lib/paraglide/runtime';

// 2024-01-01 is a Monday; rendering in UTC keeps the offset arithmetic exact.
export function weekdayName(dayFromMonday: number, style: 'long' | 'short' = 'long'): string {
	const d = new Date(Date.UTC(2024, 0, 1 + dayFromMonday));
	return d.toLocaleDateString(getLocale() === 'nl' ? 'nl-NL' : 'en-GB', {
		weekday: style,
		timeZone: 'UTC'
	});
}

export const WEEKDAY_OFFSETS = [0, 1, 2, 3, 4, 5, 6] as const;
