const DAY_MS = 24 * 60 * 60 * 1000;
// AH (Albert Heijn) is a Netherlands-only retailer and "meal week" boundaries are
// inherently NL-anchored, so the app deliberately defaults to Amsterdam time rather
// than reading the server's local zone. Exported so every date-formatting call site
// shares one source of truth instead of re-literaling the zone string.
export const APP_TIME_ZONE = 'Europe/Amsterdam';

const appDateFormatter = new Intl.DateTimeFormat('sv-SE', { timeZone: APP_TIME_ZONE });

export function isoDateInAppTimeZone(date: Date): string {
	return appDateFormatter.format(date);
}

function parseIsoDate(date: string): { year: number; month: number; day: number } {
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
	if (!m) throw new Error(`Invalid ISO date: ${date}`);
	return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

function utcDateFromIso(date: string): Date {
	const { year, month, day } = parseIsoDate(date);
	return new Date(Date.UTC(year, month - 1, day));
}

function isoFromUtc(date: Date): string {
	return date.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
	return isoFromUtc(new Date(utcDateFromIso(date).getTime() + days * DAY_MS));
}

export function todayIso(): string {
	return isoDateInAppTimeZone(new Date());
}

export function isoWeekStart(date: Date | string = new Date()): string {
	return weekStartFor(date, 0);
}

/**
 * Start of the planning week containing `date`, for a configurable start day.
 * `startDay` counts from Monday: 0 = Monday … 6 = Sunday (the household's
 * "plan from delivery to delivery" boundary). `weekStartFor(date, 0)` is the
 * classic ISO Monday week start.
 */
export function weekStartFor(date: Date | string = new Date(), startDay: number): string {
	const iso = typeof date === 'string' ? date : isoDateInAppTimeZone(date);
	const d = utcDateFromIso(iso);
	// getUTCDay is Sunday-based; shift so 0 = Monday, then back up to the most
	// recent occurrence of startDay (0 when the date already is that weekday).
	const dayFromMonday = (d.getUTCDay() + 6) % 7;
	const diff = (dayFromMonday - startDay + 7) % 7;
	return addDays(iso, -diff);
}

export function offsetIsoWeek(weekStart: string, offset: number): string {
	return addDays(isoWeekStart(weekStart), offset * 7);
}

/**
 * ISO date of a weekday within the planning week starting at `weekStart`.
 * `dayFromMonday` is 0 = Monday … 6 = Sunday regardless of where the planning
 * week starts; used to place the grocery-delivery day inside a shown week.
 */
export function dateOfWeekday(weekStart: string, dayFromMonday: number, weekStartDay: number): string {
	return addDays(weekStart, (dayFromMonday - weekStartDay + 7) % 7);
}

/**
 * Bucket a stored meal-plan week key into the current planning-week convention.
 * Keys written before a week-start-day change no longer equal any bucket start;
 * assigning by the key's midpoint (+3 days) puts the old 7-day span in the new
 * week it overlaps most, so "this week's" meals stay in this week after the
 * boundary moves. A key that already is a bucket start maps to itself.
 */
export function nearestWeekBucket(weekKey: string, startDay: number): string {
	return weekStartFor(addDays(weekKey, 3), startDay);
}

/**
 * SQL-friendly half-open key range [from, to) matching nearestWeekBucket: a
 * stored week key buckets into `weekStart` exactly when key+3 lands inside
 * [weekStart, weekStart+7), i.e. key ∈ [weekStart−3, weekStart+4).
 */
export function weekKeyRange(weekStart: string): { from: string; to: string } {
	return { from: addDays(weekStart, -3), to: addDays(weekStart, 4) };
}

export function isoWeekNumber(date: string): number {
	const d = utcDateFromIso(date);
	d.setUTCDate(d.getUTCDate() + 3 - ((d.getUTCDay() + 6) % 7));
	const week1 = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
	return 1 + Math.round(((d.getTime() - week1.getTime()) / DAY_MS - 3 + ((week1.getUTCDay() + 6) % 7)) / 7);
}
