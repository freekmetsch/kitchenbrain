const INACCESSIBLE_COOK_MODE_TERM_RE =
	/\b(sofrito|mirepoix|aromatics?|bloom(?: the)? spices|sweat(?: the)? onions?|mount(?: the)? sauce)\b/i;

export function inaccessibleCookModeTerm(value: string): string | null {
	return value.match(INACCESSIBLE_COOK_MODE_TERM_RE)?.[0] ?? null;
}
