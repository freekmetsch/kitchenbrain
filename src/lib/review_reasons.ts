// Review-reason wire format + ownership taxonomy, shared by the write boundary
// (sticky-vs-rule split in inventory_writes.ts) and the stock page (fix
// affordances). Reasons join with '; '; each token may carry a ':detail' suffix.

// Codes the taxonomy rules own. These are recomputed from item state on every
// update: set while the violation exists, auto-cleared once the offending fact
// is fixed. Everything else (undo_conflict, manual_check, unclassified, merge
// warnings) is sticky until an explicit resolve — otherwise Resolve loses every
// argument with a deterministic rule (UX-STOCK-1).
export const RULE_REVIEW_CODES = new Set([
	'unknown_kind',
	'unknown_food_class',
	'non_canonical_unit',
	'leftover_non_portion_unit',
	'leftover_non_integer_portions'
]);

export function reasonTokens(reason: string | null | undefined): string[] {
	return (reason ?? '')
		.split(';')
		.map((t) => t.trim())
		.filter(Boolean);
}

export function isRuleReason(token: string): boolean {
	return RULE_REVIEW_CODES.has(token.split(':')[0]);
}
