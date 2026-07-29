import { db } from '$lib/server/db/index';
import {
	applyStockActionProposal,
	getStockActionProposal,
	rejectStockActionProposal,
	undoStockActionProposal
} from '$lib/server/ai/stock_action_proposal';

export function getStockActionProposalForApp(input: { token: string; userId: number }) {
	const proposal = getStockActionProposal(input);
	if (!proposal) throw new Error('Stock proposal unavailable');
	return proposal;
}

export function applyStockActionProposalForApp(input: {
	token: string;
	userId: number;
	operationIds: string[];
}) {
	return applyStockActionProposal(db, input);
}

export function undoStockActionProposalForApp(input: { token: string; userId: number }) {
	return undoStockActionProposal(db, input);
}

export function rejectStockActionProposalForApp(input: { token: string; userId: number }) {
	rejectStockActionProposal(input);
	return { status: 'rejected' as const };
}
