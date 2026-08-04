import { describe, expect, it } from 'vitest';
import type { PreviewItem, PreviewProduct } from '$lib/shopping_ah';
import type { Decision } from './types';
import { reconcileAhReview } from './ah_review_state';

const product = (id: string): PreviewProduct => ({
	id,
	name: `AH ${id}`,
	price: 1,
	regularPrice: 1,
	isBonus: false,
	bonusMechanism: null,
	salesUnitSize: null,
	unitPrice: null,
	imageUrl: null,
	isPreviouslyBought: false,
	qty: 1,
	pricePerCount: null
});

const item = (ref: string, candidates = [product(`${ref}-a`), product(`${ref}-b`)]): PreviewItem => ({
	ref,
	sourceName: ref,
	term: ref,
	amount: '1',
	unit: 'stuks',
	incompatibleQuantities: false,
	quantitySources: [],
	status: 'product',
	candidates,
	lowConfidence: true
});

describe('AH review reconciliation', () => {
	it('preserves decisions for unchanged rows and follows a selected product across reordered matches', () => {
		const oldItems = [item('mint'), item('parsley')];
		const decisions: Record<string, Decision> = {
			mint: { mode: 'product', pick: 1, qty: 2, quantityConfirmed: true },
			parsley: { mode: 'exclude', pick: 0, qty: 1, quantityConfirmed: true }
		};
		const nextItems = [
			item('mint', [product('mint-b'), product('mint-a')]),
			item('parsley')
		];

		const state = reconcileAhReview(nextItems, {
			items: oldItems,
			decisions,
			reviewed: { mint: true, parsley: true },
			searchTerms: { mint: 'muntplant', parsley: 'peterselie' }
		});

		expect(state.decisions.mint).toEqual({ mode: 'product', pick: 0, qty: 2, quantityConfirmed: true });
		expect(state.decisions.parsley?.mode).toBe('exclude');
		expect(state.reviewed).toMatchObject({ mint: true, parsley: true });
		expect(state.searchTerms).toMatchObject({ mint: 'muntplant', parsley: 'peterselie' });
	});

	it('rematches only a changed row or a row whose selected product disappeared', () => {
		const oldItems = [item('mint'), item('parsley'), item('pasta')];
		const selected: Decision = { mode: 'product', pick: 1, qty: 2, quantityConfirmed: true };
		const changedMint = { ...item('mint'), amount: '2' };
		const missingParsley = item('parsley', [product('parsley-a')]);
		const state = reconcileAhReview([changedMint, missingParsley, item('pasta')], {
			items: oldItems,
			decisions: { mint: selected, parsley: selected, pasta: selected },
			reviewed: { mint: true, parsley: true, pasta: true },
			searchTerms: { mint: 'mint search', parsley: 'parsley search', pasta: 'pasta search' }
		});

		expect(state.decisions.mint?.pick).toBe(0);
		expect(state.reviewed.mint).toBe(false);
		expect(state.decisions.parsley?.pick).toBe(0);
		expect(state.reviewed.parsley).toBe(false);
		expect(state.decisions.pasta).toEqual(selected);
		expect(state.reviewed.pasta).toBe(true);
	});
});
