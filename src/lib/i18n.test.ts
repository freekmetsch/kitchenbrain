import { describe, expect, it } from 'vitest';
import { formatDate, formatNumber, localeTag } from './i18n';

describe('locale display helpers', () => {
	it('maps app locales to regional format tags', () => {
		expect(localeTag('en')).toBe('en-GB');
		expect(localeTag('nl')).toBe('nl-NL');
	});

	it('formats decimal quantities for the active language', () => {
		expect(formatNumber(1.5, 'en')).toBe('1.5');
		expect(formatNumber(1.5, 'nl')).toBe('1,5');
	});

	it('formats dates without hard-coding English', () => {
		const value = '2026-07-18T12:00:00Z';
		expect(formatDate(value, { month: 'short', timeZone: 'UTC' }, 'en').toLowerCase()).toContain('jul');
		expect(formatDate(value, { month: 'long', timeZone: 'UTC' }, 'nl').toLowerCase()).toContain('juli');
	});
});
