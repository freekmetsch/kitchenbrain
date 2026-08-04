import type { Ingredient } from '$lib/recipe_ingredient';

export type RecipeQualityWarning = {
	code: 'quantity_conflict' | 'fractional_whole' | 'duplicate_utility';
	ingredient: string;
	message: string;
};

type Measurement = { dimension: 'mass' | 'volume'; factor: number; label: string };

const UTILITY_INGREDIENTS = new Set([
	'water',
	'zout',
	'salt',
	'olie',
	'oil',
	'olijfolie',
	'olive oil',
	'peper',
	'pepper'
]);
const PARTITIVE_WORDS = /\b(?:half|helft|deel|rest|remaining|remainder)\b/;
const CONTAINER_WORDS = /^(?:pan|pot|bowl|schaal|kom|ovenschaal)\b/;
const UNIT_PATTERN =
	'kilograms?|kilogrammen?|kilos?|kg|grams?|grammen?|g|milliliters?|millilitres?|milliliter|millilitre|ml|centiliters?|centilitres?|centiliter|centilitre|cl|deciliters?|decilitres?|deciliter|decilitre|dl|liters?|litres?|liter|litre|l';

function normalize(value: string | undefined): string {
	return (value ?? '')
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9.,/]+/g, ' ')
		.trim()
		.replace(/\s+/g, ' ');
}

function parseAmount(raw: string): number | null {
	const vulgar = raw
		.replace(/½/g, ' 1/2')
		.replace(/¼/g, ' 1/4')
		.replace(/¾/g, ' 3/4')
		.trim()
		.replace(',', '.');
	const mixed = vulgar.match(/^(\d+(?:\.\d+)?)\s+(\d+)\/(\d+)$/);
	if (mixed) {
		const denominator = Number(mixed[3]);
		return denominator ? Number(mixed[1]) + Number(mixed[2]) / denominator : null;
	}
	const fraction = vulgar.match(/^(\d+)\/(\d+)$/);
	if (fraction) {
		const denominator = Number(fraction[2]);
		return denominator ? Number(fraction[1]) / denominator : null;
	}
	const value = Number(vulgar);
	return Number.isFinite(value) ? value : null;
}

function measurement(unit: string | undefined): Measurement | null {
	const normalized = normalize(unit);
	if (/^(?:kg|kilo|kilos|kilogram|kilograms|kilogrammen)$/.test(normalized)) {
		return { dimension: 'mass', factor: 1000, label: 'g' };
	}
	if (/^(?:g|gram|grams|grammen)$/.test(normalized)) {
		return { dimension: 'mass', factor: 1, label: 'g' };
	}
	if (/^(?:ml|milliliter|milliliters|millilitre|millilitres)$/.test(normalized)) {
		return { dimension: 'volume', factor: 1, label: 'ml' };
	}
	if (/^(?:cl|centiliter|centiliters|centilitre|centilitres)$/.test(normalized)) {
		return { dimension: 'volume', factor: 10, label: 'ml' };
	}
	if (/^(?:dl|deciliter|deciliters|decilitre|decilitres)$/.test(normalized)) {
		return { dimension: 'volume', factor: 100, label: 'ml' };
	}
	if (/^(?:l|liter|liters|litre|litres)$/.test(normalized)) {
		return { dimension: 'volume', factor: 1000, label: 'ml' };
	}
	return null;
}

function directionConflict(
	ingredient: Ingredient,
	ingredientAmount: number,
	ingredientMeasurement: Measurement,
	directions: string[]
): string | null {
	const ingredientName = normalize(ingredient.name);
	if (!ingredientName) return null;
	const quantityPattern = new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*(${UNIT_PATTERN})\\b`, 'gi');

	for (const direction of directions) {
		for (const rawSentence of direction.split(/[.!?;\n]+/)) {
			const sentence = normalize(rawSentence);
			if (!sentence || PARTITIVE_WORDS.test(sentence)) continue;
			const nameStart = ` ${sentence} `.indexOf(` ${ingredientName} `);
			if (nameStart < 0) continue;
			const nameEnd = nameStart + ingredientName.length;
			const candidates: Array<{ amount: number; distance: number }> = [];
			for (const match of sentence.matchAll(quantityPattern)) {
				const parsed = parseAmount(match[1]);
				const foundMeasurement = measurement(match[2]);
				if (parsed == null || foundMeasurement?.dimension !== ingredientMeasurement.dimension) continue;
				const start = match.index ?? 0;
				const end = start + match[0].length;
				if (CONTAINER_WORDS.test(sentence.slice(end).trimStart())) continue;
				const distance = end <= nameStart ? nameStart - end : start >= nameEnd ? start - nameEnd : 0;
				if (distance <= 24) {
					candidates.push({ amount: parsed * foundMeasurement.factor, distance });
				}
			}
			const closest = candidates.sort((a, b) => a.distance - b.distance)[0];
			const expected = ingredientAmount * ingredientMeasurement.factor;
			if (closest && Math.abs(closest.amount - expected) > 0.001) {
				return `${closest.amount} ${ingredientMeasurement.label}`;
			}
		}
	}
	return null;
}

export function reviewRecipeQuality(
	ingredients: Ingredient[],
	directions: string[]
): RecipeQualityWarning[] {
	const warnings: RecipeQualityWarning[] = [];

	for (const ingredient of ingredients) {
		const amount = parseAmount(ingredient.amount);
		const unit = measurement(ingredient.unit);
		if (amount == null || !unit) continue;
		const conflict = directionConflict(ingredient, amount, unit, directions);
		if (conflict) {
			warnings.push({
				code: 'quantity_conflict',
				ingredient: ingredient.name,
				message: `Direction quantity for ${ingredient.name} (${conflict}) conflicts with the ingredient amount (${ingredient.amount} ${ingredient.unit}).`
			});
		}
	}

	for (const ingredient of ingredients) {
		const amount = parseAmount(ingredient.amount);
		if (
			ingredient.scale === 'whole' &&
			!measurement(ingredient.unit) &&
			amount != null &&
			!Number.isInteger(amount) &&
			Math.floor(amount) >= 2
		) {
			warnings.push({
				code: 'fractional_whole',
				ingredient: ingredient.name,
				message: `${ingredient.name} has an impractical whole-item amount (${ingredient.amount}).`
			});
		}
	}

	const seenUtility = new Set<string>();
	for (const ingredient of ingredients) {
		const name = normalize(ingredient.name);
		if (!UTILITY_INGREDIENTS.has(name)) continue;
		const key = [
			name,
			normalize(ingredient.unit),
			normalize(ingredient.component),
			normalize(ingredient.preparation),
			normalize(ingredient.role)
		].join('|');
		if (seenUtility.has(key)) {
			warnings.push({
				code: 'duplicate_utility',
				ingredient: ingredient.name,
				message: `${ingredient.name} appears more than once with the same unit, component, preparation, and role.`
			});
		} else {
			seenUtility.add(key);
		}
	}

	return warnings;
}
