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
	const iso = typeof date === 'string' ? date : isoDateInAppTimeZone(date);
	const d = utcDateFromIso(iso);
	const day = d.getUTCDay();
	const diff = day === 0 ? -6 : 1 - day;
	return addDays(iso, diff);
}

export function offsetIsoWeek(weekStart: string, offset: number): string {
	return addDays(isoWeekStart(weekStart), offset * 7);
}

export function isoWeekNumber(date: string): number {
	const d = utcDateFromIso(date);
	d.setUTCDate(d.getUTCDate() + 3 - ((d.getUTCDay() + 6) % 7));
	const week1 = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
	return 1 + Math.round(((d.getTime() - week1.getTime()) / DAY_MS - 3 + ((week1.getUTCDay() + 6) % 7)) / 7);
}
