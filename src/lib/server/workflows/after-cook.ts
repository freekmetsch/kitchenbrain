import { db as appDb } from '$lib/server/db/index';
import {
	applyAfterCookProposal,
	getAfterCookProposalStatus,
	rejectAfterCookProposal,
	undoAfterCookProposal
} from '$lib/server/ai/after_cook_proposal';

export function applyAfterCookProposalForApp(input: {
	token: string;
	userId: number;
	eatenPortions: number;
}) {
	return applyAfterCookProposal(appDb, input);
}

export function undoAfterCookProposalForApp(input: { token: string; userId: number }) {
	return undoAfterCookProposal(appDb, input);
}

export function rejectAfterCookProposalForApp(input: { token: string; userId: number }) {
	return rejectAfterCookProposal(input);
}

export function getAfterCookProposalStatusForApp(input: {
	token: string;
	userId: number;
	mealId: number;
}) {
	return getAfterCookProposalStatus(input);
}
