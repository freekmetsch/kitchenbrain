import type { PreviewItem } from '$lib/shopping_ah';
import type { Decision } from './types';

export type AhReviewDraft = {
	items: PreviewItem[];
	decisions: Record<string, Decision>;
	reviewed: Record<string, boolean>;
	searchTerms: Record<string, string>;
};

type AhReviewState = Omit<AhReviewDraft, 'items'>;

function startsNeedingAttention(item: PreviewItem): boolean {
	return Boolean(
		item.requiresExplicitDecision ||
		item.status !== 'product' ||
		item.lowConfidence ||
		item.incompatibleQuantities
	);
}

function seedDecision(item: PreviewItem): Decision | undefined {
	if (item.requiresExplicitDecision) return undefined;
	return {
		mode: item.status === 'product' ? 'product' : 'freetext',
		pick: 0,
		qty: item.candidates[0]?.qty ?? 1,
		quantityConfirmed: !item.incompatibleQuantities
	};
}

function bindingSignature(item: PreviewItem): string {
	return JSON.stringify({
		sourceName: item.sourceName,
		term: item.term,
		amount: item.amount,
		unit: item.unit,
		incompatibleQuantities: item.incompatibleQuantities,
		quantitySources: item.quantitySources,
		purchaseForm: item.purchaseForm,
		requiresExplicitDecision: item.requiresExplicitDecision,
		preferenceState: item.preferenceState
	});
}

function preserveDecision(
	oldItem: PreviewItem,
	newItem: PreviewItem,
	decision: Decision | undefined
): Decision | undefined {
	if (!decision || bindingSignature(oldItem) !== bindingSignature(newItem)) return undefined;
	if (decision.mode !== 'product') return { ...decision };
	const selectedId = oldItem.candidates[decision.pick]?.id;
	const pick = newItem.candidates.findIndex((candidate) => candidate.id === selectedId);
	return pick < 0 ? undefined : { ...decision, pick };
}

/** Keeps valid row choices when a stale preview is safely rebound to current shopping data. */
export function reconcileAhReview(items: PreviewItem[], draft?: AhReviewDraft): AhReviewState {
	const decisions: Record<string, Decision> = {};
	const reviewed: Record<string, boolean> = {};
	const searchTerms: Record<string, string> = {};
	const oldByRef = new Map((draft?.items ?? []).map((item) => [item.ref, item]));

	for (const item of items) {
		const oldItem = oldByRef.get(item.ref);
		const oldDecision = oldItem
			? preserveDecision(oldItem, item, draft?.decisions[item.ref])
			: undefined;
		const decision = oldDecision ?? seedDecision(item);
		if (decision) decisions[item.ref] = decision;
		searchTerms[item.ref] = oldItem ? (draft?.searchTerms[item.ref] ?? item.term) : item.term;

		if (!oldItem) {
			reviewed[item.ref] = !startsNeedingAttention(item);
		} else if (oldDecision) {
			reviewed[item.ref] = draft?.reviewed[item.ref] ?? false;
		} else {
			reviewed[item.ref] = false;
		}
	}

	return { decisions, reviewed, searchTerms };
}
