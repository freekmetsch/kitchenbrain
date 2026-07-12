// Per-ingredient portion scaler. Default is linear with smart formatting;
// specific ingredient classes get non-linear rules so 4× a 2-egg recipe
// doesn't display "8.0 eggs" or quadruple the salt.

type ScaleRule = 'linear' | 'integer' | 'sqrt' | 'pinch';

const INTEGER_KEYWORDS = [
	// Dutch
	'ei', 'eieren', 'eierdooier', 'eidooier', 'eiwit',
	'ui', 'uien', 'sjalot', 'sjalotten',
	'teen knoflook', 'tenen knoflook',
	'paprika', 'tomaten', 'tomaat',
	'aardappel', 'aardappelen', 'wortel', 'wortels',
	'courgette', 'aubergine', 'komkommer', 'venkel',
	'plak', 'plakken', 'snee', 'sneetje', 'sneetjes',
	'blik', 'blikje', 'pak', 'pakje', 'pot', 'potje', 'fles', 'flesje',
	// English
	'egg', 'eggs', 'yolk', 'yolks', 'egg white',
	'onion', 'onions', 'shallot', 'shallots',
	'clove', 'cloves',
	'pepper', 'peppers', 'bell pepper',
	'tomato', 'tomatoes',
	'potato', 'potatoes', 'carrot', 'carrots',
	'zucchini', 'eggplant', 'cucumber', 'fennel',
	'slice', 'slices', 'can', 'cans', 'jar', 'jars', 'bottle', 'pack', 'packet'
];

const SQRT_KEYWORDS = [
	// salt + pepper + spices scale sub-linearly: 4× recipe ≈ 2× spice
	'zout', 'peper', 'salt', 'pepper',
	'kaneel', 'cinnamon', 'kruidnagel', 'clove',
	'kerrie', 'curry', 'paprikapoeder', 'paprika powder',
	'oregano', 'thijm', 'thyme', 'rozemarijn', 'rosemary',
	'basilicum', 'basil', 'peterselie', 'parsley',
	'koriander', 'coriander', 'cilantro',
	'komijn', 'cumin', 'kurkuma', 'turmeric',
	'gember', 'ginger', 'mosterd', 'mustard',
	'nootmuskaat', 'nutmeg', 'kardemom', 'cardamom',
	'chilipoeder', 'chili powder', 'chili', 'cayenne',
	'gedroogde', 'dried', 'gemalen', 'ground',
	'kruiden', 'herbs', 'specerijen', 'spices', 'seasoning'
];

const PINCH_TOKENS = [
	'snufje', 'snuf', 'mespunt', 'pinch', 'dash', 'to taste', 'naar smaak'
];

function classify(name: string, amount: string): ScaleRule {
	const haystack = `${name} ${amount}`.toLowerCase();

	if (PINCH_TOKENS.some((t) => haystack.includes(t))) return 'pinch';

	const tokens = haystack.split(/[\s,/.-]+/).filter(Boolean);
	const hasWord = (kw: string) => {
		if (kw.includes(' ')) return haystack.includes(kw);
		return tokens.includes(kw);
	};

	if (INTEGER_KEYWORDS.some(hasWord)) return 'integer';
	if (SQRT_KEYWORDS.some(hasWord)) return 'sqrt';
	return 'linear';
}

function parseAmount(amount: string): { num: number | null; suffix: string } {
	if (!amount) return { num: null, suffix: '' };
	const match = amount.replace(',', '.').match(/^\s*(\d+(?:\.\d+)?)(.*)$/);
	if (!match) return { num: null, suffix: amount };
	return { num: parseFloat(match[1]), suffix: match[2] };
}

function formatNumber(n: number, integer: boolean): string {
	if (integer) return Math.max(1, Math.round(n)).toString();
	if (n >= 10) return Math.round(n).toString();
	if (Number.isInteger(n)) return n.toString();
	return n.toFixed(1).replace(/\.?0+$/, '');
}

export function scaleAmount(
	amount: string,
	name: string,
	multiplier: number
): string {
	if (!amount || multiplier === 1) return amount;

	const rule = classify(name, amount);
	if (rule === 'pinch') return amount;

	const { num, suffix } = parseAmount(amount);
	if (num === null) return amount;

	let scaled: number;
	switch (rule) {
		case 'integer':
			scaled = num * multiplier;
			return formatNumber(scaled, true) + suffix;
		case 'sqrt':
			scaled = num * Math.sqrt(multiplier);
			return formatNumber(scaled, false) + suffix;
		default:
			scaled = num * multiplier;
			return formatNumber(scaled, false) + suffix;
	}
}
