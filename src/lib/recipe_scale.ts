import type { Ingredient, IngredientScale } from '$lib/recipe_ingredient';

const VULGAR_FRACTIONS: Record<string, number> = {
	'¼': 1 / 4,
	'½': 1 / 2,
	'¾': 3 / 4,
	'⅓': 1 / 3,
	'⅔': 2 / 3,
	'⅛': 1 / 8,
	'⅜': 3 / 8,
	'⅝': 5 / 8,
	'⅞': 7 / 8
};

const DISPLAY_FRACTIONS: Array<[number, string]> = [
	[1 / 8, '⅛'],
	[1 / 4, '¼'],
	[1 / 3, '⅓'],
	[3 / 8, '⅜'],
	[1 / 2, '½'],
	[5 / 8, '⅝'],
	[2 / 3, '⅔'],
	[3 / 4, '¾'],
	[7 / 8, '⅞']
];

export type QuantityRange = { min: number; max?: number };

function parseNumberToken(raw: string): number | null {
	const token = raw.trim().replace(',', '.');
	if (!token) return null;
	if (VULGAR_FRACTIONS[token] != null) return VULGAR_FRACTIONS[token];

	const mixedVulgar = token.match(/^(\d+)\s*([¼½¾⅓⅔⅛⅜⅝⅞])$/);
	if (mixedVulgar) return Number(mixedVulgar[1]) + VULGAR_FRACTIONS[mixedVulgar[2]];

	const mixedSlash = token.match(/^(\d+)\s+(\d+)\/(\d+)$/);
	if (mixedSlash && Number(mixedSlash[3]) !== 0) {
		return Number(mixedSlash[1]) + Number(mixedSlash[2]) / Number(mixedSlash[3]);
	}

	const slash = token.match(/^(\d+)\/(\d+)$/);
	if (slash && Number(slash[2]) !== 0) return Number(slash[1]) / Number(slash[2]);

	const number = Number(token);
	return Number.isFinite(number) ? number : null;
}

/** Parse a numeric amount or range without guessing at descriptive text. */
export function parseQuantity(amount: string): QuantityRange | null {
	const normalized = amount.trim().replace(/[–—]/g, '-');
	if (!normalized) return null;

	const range = normalized.match(/^(.+?)\s*-\s*(.+)$/);
	if (range) {
		const min = parseNumberToken(range[1]);
		const max = parseNumberToken(range[2]);
		return min != null && max != null ? { min, max } : null;
	}

	const value = parseNumberToken(normalized);
	return value == null ? null : { min: value };
}

function formatDecimal(value: number, locale: 'en' | 'nl'): string {
	if (Number.isInteger(value)) return String(value);
	const whole = Math.floor(value);
	const fraction = value - whole;
	const common = DISPLAY_FRACTIONS.find(([candidate]) => Math.abs(fraction - candidate) < 0.0125);
	if (common) return whole > 0 ? `${whole}${common[1]}` : common[1];
	const decimal = value.toFixed(value < 10 ? 2 : 1).replace(/0+$/, '').replace(/\.$/, '');
	return locale === 'nl' ? decimal.replace('.', ',') : decimal;
}

export function formatQuantity(quantity: QuantityRange, locale: 'en' | 'nl' = 'en'): string {
	const min = formatDecimal(quantity.min, locale);
	return quantity.max == null ? min : `${min}–${formatDecimal(quantity.max, locale)}`;
}

export function occasionMultiplier(baselineServings: number | null | undefined, occasionServings: number | null | undefined): number {
	if (!baselineServings || baselineServings <= 0 || !occasionServings || occasionServings <= 0) return 1;
	return occasionServings / baselineServings;
}

function projectValue(value: number, multiplier: number, rule: IngredientScale): number {
	if (rule === 'fixed') return value;
	if (rule === 'whole') return Math.max(1, Math.round(value * multiplier));
	return value * multiplier;
}

/**
 * The only baseline-to-occasion quantity projection. Unknown text remains
 * unchanged; callers must not invent a second parser or multiplier.
 */
export function scaleAmount(
	amount: string,
	_name: string,
	multiplier: number,
	rule: IngredientScale = 'linear',
	locale: 'en' | 'nl' = 'en'
): string {
	if (!amount || multiplier === 1 || rule === 'fixed') return amount;
	const parsed = parseQuantity(amount);
	if (!parsed) return amount;
	return formatQuantity({
		min: projectValue(parsed.min, multiplier, rule),
		max: parsed.max == null ? undefined : projectValue(parsed.max, multiplier, rule)
	}, locale);
}

export function projectIngredient(
	ingredient: Ingredient,
	baselineServings: number | null | undefined,
	occasionServings: number | null | undefined
): Ingredient {
	return {
		...ingredient,
		amount: scaleAmount(
			ingredient.amount,
			ingredient.name,
			occasionMultiplier(baselineServings, occasionServings),
			ingredient.scale ?? 'linear'
		)
	};
}

function normalizedUnit(unit: string | undefined): string {
	return (unit ?? '').trim().toLocaleLowerCase('nl-NL').replace(/\.$/, '');
}

export type QuantitySum = { amount: string; unit?: string } | null;

/** Sum only quantities with a provably identical unit and numeric shape. */
export function sumCompatibleQuantities(items: Array<{ amount: string; unit?: string }>): QuantitySum {
	if (items.length === 0) return null;
	const unit = normalizedUnit(items[0].unit);
	if (items.some((item) => normalizedUnit(item.unit) !== unit)) return null;

	let min = 0;
	let max: number | undefined;
	for (const item of items) {
		const parsed = parseQuantity(item.amount);
		if (!parsed) return null;
		min += parsed.min;
		if (parsed.max != null || max != null) max = (max ?? min - parsed.min) + (parsed.max ?? parsed.min);
	}

	return { amount: formatQuantity({ min, max }), unit: items[0].unit };
}
