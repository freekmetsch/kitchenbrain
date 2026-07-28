import { db as appDb } from '$lib/server/db/index';
import type { Db } from '$lib/server/db/types';
import {
	applyMealPlanProposal,
	getMealPlanProposalStatus,
	rejectMealPlanProposal,
	undoMealPlanProposal
} from '$lib/server/ai/meal_plan_proposal';
import { getShoppingWeekView } from '$lib/server/domains/shopping';
import { isAhEligibleShoppingRow } from '$lib/server/ah/preview_tokens';
import {
	getShoppingAhStatus,
	previewShoppingForAh
} from '$lib/server/workflows/push-shopping-to-ah';

type FinishDependencies = {
	getAhStatus: typeof getShoppingAhStatus;
	preview: typeof previewShoppingForAh;
};

const DEFAULT_FINISH_DEPENDENCIES: FinishDependencies = {
	getAhStatus: getShoppingAhStatus,
	preview: previewShoppingForAh
};

export async function finishMealPlanProposal(
	db: Db,
	input: {
		token: string;
		userId: number;
		operationIds: string[];
	},
	dependencies: FinishDependencies = DEFAULT_FINISH_DEPENDENCIES
) {
	const applied = applyMealPlanProposal(db, input);
	const shopping = getShoppingWeekView(db, applied.weekStartDate);
	const blocked = shopping.sources
		.filter((source) => source.needsReview)
		.map((source) => ({
			id: source.id,
			name: source.name,
			recipeTitle: source.recipeTitle
		}));
	const readyRows = shopping.toBuy.filter(isAhEligibleShoppingRow);
	const summary = { ready: readyRows.length, blocked };
	if (readyRows.length === 0) {
		return {
			...applied,
			shopping: summary,
			next: {
				kind: 'nothing_to_push' as const,
				consequence: 'The meal plan and Shopping list were committed; no AH-eligible items remain.'
			}
		};
	}
	try {
		if (!dependencies.getAhStatus().connected) {
			return {
				...applied,
				shopping: summary,
				next: {
					kind: 'blocked' as const,
					reason: 'not_connected' as const,
					consequence: 'The meal plan and Shopping list were committed; AH was not changed.'
				}
			};
		}
		const preview = await dependencies.preview({
			userId: input.userId,
			weekStart: applied.weekStartDate,
			entryIds: readyRows.flatMap((row) => row.entryIds)
		});
		return {
			...applied,
			shopping: summary,
			next: {
				kind: 'ah_review' as const,
				externalEffect: 'read-only' as const,
				...preview
			}
		};
	} catch {
		return {
			...applied,
			shopping: summary,
			next: {
				kind: 'blocked' as const,
				reason: 'preview_failed' as const,
				consequence:
					'The meal plan and Shopping list were committed; the AH review could not be prepared.'
			}
		};
	}
}

export function applyMealPlanProposalForApp(input: {
	token: string;
	userId: number;
	operationIds: string[];
}) {
	return finishMealPlanProposal(appDb, input);
}

export function undoMealPlanProposalForApp(input: {
	token: string;
	userId: number;
}) {
	return undoMealPlanProposal(appDb, input);
}

export function getMealPlanProposalStatusForApp(input: {
	token: string;
	userId: number;
	weekStartDate: string;
}) {
	return getMealPlanProposalStatus(input);
}

export function rejectMealPlanProposalForApp(input: {
	token: string;
	userId: number;
}) {
	return rejectMealPlanProposal(input);
}
