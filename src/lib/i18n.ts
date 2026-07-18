import { getLocale } from '$lib/paraglide/runtime';

export type AppLocale = 'en' | 'nl';

export function localeTag(locale: AppLocale = getLocale()): 'en-GB' | 'nl-NL' {
	return locale === 'nl' ? 'nl-NL' : 'en-GB';
}

export function formatNumber(value: number, locale: AppLocale = getLocale()): string {
	return new Intl.NumberFormat(localeTag(locale), { maximumFractionDigits: 2 }).format(value);
}

export function formatDate(
	value: Date | string | number,
	options: Intl.DateTimeFormatOptions,
	locale: AppLocale = getLocale()
): string {
	return new Date(value).toLocaleDateString(localeTag(locale), options);
}
