import { isIsoDate, isoDateInAppTimeZone } from '$lib/week';

const DAY_MS = 86_400_000;

export function parseDateOnly(value: string | null | undefined): Date | undefined {
	if (!value) return undefined;
	if (!isIsoDate(value)) {
		throw new Error('Expected a valid date in YYYY-MM-DD format');
	}
	const [year, month, day] = value.split('-').map(Number);
	return new Date(Date.UTC(year, month - 1, day));
}

function asDate(value: string | Date | null | undefined): Date | null {
	if (!value) return null;
	const date = value instanceof Date ? value : new Date(value);
	return Number.isNaN(date.getTime()) ? null : date;
}

export function dateInputValue(value: string | Date | null | undefined): string {
	const date = asDate(value);
	return date ? date.toISOString().slice(0, 10) : '';
}

export function daysSinceDate(
	value: string | Date | null | undefined,
	now: Date = new Date()
): number | null {
	const dateText = dateInputValue(value);
	if (!dateText) return null;
	const date = parseDateOnly(dateText)!;
	const today = parseDateOnly(isoDateInAppTimeZone(now))!;
	return Math.max(0, Math.floor((today.getTime() - date.getTime()) / DAY_MS));
}
