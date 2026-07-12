// Fuzzy match between recipe ingredient names and inventory item names.
// AH-INVARIANT: both sides remain Dutch (recipe ingredients, AH product names).

const MATCH_STOP_WORDS = new Set([
	'verse', 'vers', 'biologische', 'bio', 'vol', 'magere', 'halfvolle',
	'fijne', 'fijn', 'grof', 'grove', 'rode', 'witte', 'groene', 'gele', 'zwarte',
	'grote', 'kleine', 'extra', 'jonge', 'oude', 'gemalen', 'gehakt', 'gehakte',
	'gesneden', 'geraspte', 'gedroogd', 'gedroogde', 'gekookt', 'gekookte', 'rauwe',
	'de', 'het', 'een', 'en', 'of', 'van', 'met', 'voor', 'op', 'naar'
]);

const NAME_KEY_STOP_WORDS = new Set([
	'biologische', 'bio',
	'de', 'het', 'een', 'en', 'of', 'van', 'met', 'voor', 'op', 'naar'
]);

function stem(token: string): string {
	if (token.length <= 3) return token;
	if (token.endsWith('en')) return token.slice(0, -2);
	if (token.endsWith('s')) return token.slice(0, -1);
	return token;
}

function tokenizeWithStopWords(name: string, stopWords: Set<string>): string[] {
	const tokens = name
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^a-z\s]/g, ' ')
		.split(/\s+/)
		.filter((t) => t.length >= 2);
	const filtered = tokens
		.filter((t) => !stopWords.has(t))
		.map(stem);
	return filtered.length ? filtered : tokens.map(stem);
}

export function tokenize(name: string): string[] {
	return tokenizeWithStopWords(name, MATCH_STOP_WORDS);
}

export function tokenizeNameKey(name: string): string[] {
	return tokenizeWithStopWords(name, NAME_KEY_STOP_WORDS);
}

export function normalizeNameKey(name: string): string {
	return [...new Set(tokenizeNameKey(name))].sort().join(' ');
}

export function namesMatch(a: string, b: string): boolean {
	const aTokens = tokenize(a);
	const bTokens = tokenize(b);
	if (aTokens.length === 0 || bTokens.length === 0) return false;
	for (const at of aTokens) {
		for (const bt of bTokens) {
			if (at === bt) return true;
			// Dutch compounds: short token contained in long compound (e.g. "bess" in "bosbessencake").
			if (at.length >= 4 && bt.includes(at)) return true;
			if (bt.length >= 4 && at.includes(bt)) return true;
		}
	}
	return false;
}

// Title ↔ dish-name match: every significant token of the shorter name must
// match one of the longer name's tokens (exact stem, or Dutch-compound
// containment for tokens ≥4 chars). Stricter than namesMatch's any-shared-token
// rule — one stray token ("curry") must not suggest an unrelated dish.
export function titlesMatch(a: string, b: string): boolean {
	const aTokens = tokenize(a);
	const bTokens = tokenize(b);
	if (aTokens.length === 0 || bTokens.length === 0) return false;
	const [small, big] = aTokens.length <= bTokens.length ? [aTokens, bTokens] : [bTokens, aTokens];
	return small.every((st) =>
		big.some(
			(bt) =>
				st === bt ||
				(st.length >= 4 && bt.includes(st)) ||
				(bt.length >= 4 && st.includes(bt))
		)
	);
}
