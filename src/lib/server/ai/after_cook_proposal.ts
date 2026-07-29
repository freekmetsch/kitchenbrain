import { randomBytes } from 'node:crypto';
import type { Db, DbOrTx } from '$lib/server/db/types';
import { getMealPlanMeal } from '$lib/server/domains/meal-plan/queries';
import { listInventory } from '$lib/server/domains/inventory/queries';
import { getRecipeBySlug } from '$lib/server/domains/recipes';
import {
	undoOp,
	undoOps,
	type WriteCtx
} from '$lib/server/domains/inventory/commands';
import {
	cookMealInTransaction,
	uncookMealInTransaction
} from '$lib/server/workflows/meal-plan';
import { consumeRecipeInTransaction } from '$lib/server/workflows/consume-recipe';
import { todayIso } from '$lib/week';

type Status =
	| 'active'
	| 'applying'
	| 'applied'
	| 'undone'
	| 'rejected'
	| 'superseded'
	| 'expired';

export type AfterCookProposal = {
	token: string;
	status: Status;
	mealId: number;
	meal: string;
	cookedDate: string;
	availablePortions: number;
	defaultEatenPortions: number;
	atomicity: {
		kind: 'atomic';
		consequence: string;
	};
	recommendation: {
		whyNow: string;
		evidence: string[];
		confidence: 'high' | 'low';
		uncertainty: string | null;
		consequence: string;
		alternatives: string[];
	};
};

type StoredProposal = Omit<AfterCookProposal, 'token'> & {
	userId: number;
	recipeSlug: string | null;
	expiresAt: number;
	mealBefore: NonNullable<ReturnType<typeof getMealPlanMeal>>;
	leftoversBefore: ReturnType<typeof linkedLeftovers>;
	applied?: {
		eatenPortions: number;
		remainingPortions: number;
		inventoryOpIds: number[];
		mealAfter: NonNullable<ReturnType<typeof getMealPlanMeal>>;
	};
};

const TTL_MS = 10 * 60 * 1000;
const MAX_PROPOSALS = 100;
const proposals = new Map<string, StoredProposal>();

function linkedLeftovers(db: DbOrTx, recipeSlug: string) {
	const recipe = getRecipeBySlug(db, recipeSlug);
	if (!recipe) return [];
	return listInventory(db, { section: 'freezer', sort: 'oldest_added' })
		.filter(
			(item) =>
				item.kind === 'leftover' &&
				item.madeFromRecipeId === recipe.id &&
				(item.qtyNum ?? 0) > 0
		)
		.sort(
			(left, right) =>
				left.createdAt.getTime() - right.createdAt.getTime() || left.id - right.id
		);
}

function fingerprint(value: unknown): string {
	return JSON.stringify(value);
}

function clean(now: number): void {
	for (const proposal of proposals.values()) {
		if (proposal.status === 'active' && proposal.expiresAt <= now) {
			proposal.status = 'expired';
		}
	}
	while (proposals.size >= MAX_PROPOSALS) proposals.delete(proposals.keys().next().value!);
}

function publicProposal(token: string, proposal: StoredProposal): AfterCookProposal {
	return {
		token,
		status: proposal.status,
		mealId: proposal.mealId,
		meal: proposal.meal,
		cookedDate: proposal.cookedDate,
		availablePortions: proposal.availablePortions,
		defaultEatenPortions: proposal.defaultEatenPortions,
		atomicity: proposal.atomicity,
		recommendation: proposal.recommendation
	};
}

export function stageAfterCookProposal(
	db: Db,
	input: {
		userId: number;
		mealId: number;
		cookedDate?: string;
		eatenPortions?: number;
	},
	now = Date.now()
): AfterCookProposal {
	clean(now);
	const meal = getMealPlanMeal(db, input.mealId);
	if (!meal) throw new Error('Meal not found');
	if (meal.status !== 'planned') throw new Error('Only a planned meal can be checked out');
	const recipeSlug = meal.source === 'freezer' ? meal.recipeSlug : null;
	const leftovers = recipeSlug ? linkedLeftovers(db, recipeSlug) : [];
	const undoableLots = leftovers.slice(0, 10);
	const availablePortions = undoableLots.reduce(
		(total, item) => total + (item.qtyNum ?? 0),
		0
	);
	const requested =
		input.eatenPortions ??
		meal.servings ??
		(recipeSlug && availablePortions > 0 ? 1 : 0);
	const defaultEatenPortions =
		availablePortions > 0
			? Math.max(1, Math.min(availablePortions, Math.round(requested)))
			: 0;
	for (const stored of proposals.values()) {
		if (
			stored.userId === input.userId &&
			stored.mealId === input.mealId &&
			stored.status === 'active'
		) {
			stored.status = 'superseded';
		}
	}
	const cookedDate = input.cookedDate ?? todayIso();
	const token = randomBytes(24).toString('base64url');
	const uncertainty =
		recipeSlug && availablePortions === 0
			? 'No linked freezer portions are currently recorded, so only the meal can be marked cooked.'
			: leftovers.length > 10
				? 'Only the ten oldest freezer lots are included so the whole action remains undoable.'
				: null;
	const proposal: StoredProposal = {
		status: 'active',
		userId: input.userId,
		mealId: meal.id,
		meal: meal.dinner,
		recipeSlug,
		cookedDate,
		availablePortions,
		defaultEatenPortions,
		expiresAt: now + TTL_MS,
		mealBefore: meal,
		leftoversBefore: leftovers,
		atomicity: {
			kind: 'atomic',
			consequence:
				recipeSlug
					? 'Marking the meal cooked and consuming the oldest linked freezer portions commit together or not at all.'
					: 'Marking the meal cooked commits as one reviewed local action.'
		},
		recommendation: {
			whyNow: recipeSlug
				? `${meal.dinner} was served from the freezer and its linked stock still needs checkout.`
				: `${meal.dinner} is still planned and can now be closed as cooked.`,
			evidence:
				recipeSlug && leftovers.length > 0
					? leftovers.slice(0, 10).map(
							(item) =>
								`${item.name}: ${item.qtyNum} ${item.unit ?? 'portions'} recorded`
						)
					: recipeSlug
						? ['No linked freezer leftover is recorded for this recipe.']
						: ['The planned meal is still open; no freezer stock change is needed.'],
			confidence: !recipeSlug || availablePortions > 0 ? 'high' : 'low',
			uncertainty,
			consequence:
				recipeSlug && availablePortions > 0
					? 'The meal is marked cooked and the selected number of portions is consumed oldest first.'
					: 'The meal is marked cooked; freezer stock does not change.',
			alternatives: [
				...(recipeSlug ? ['Adjust the eaten portion count before applying.'] : []),
				'Choose Not now to leave both the meal and freezer stock unchanged.'
			]
		}
	};
	proposals.set(token, proposal);
	return publicProposal(token, proposal);
}

function requireProposal(
	input: { token: string; userId: number },
	now = Date.now()
): StoredProposal {
	const proposal = proposals.get(input.token);
	if (!proposal || proposal.userId !== input.userId) {
		throw new Error('After-cook review expired or belongs to another user');
	}
	if (proposal.status === 'active' && proposal.expiresAt <= now) proposal.status = 'expired';
	return proposal;
}

export function applyAfterCookProposal(
	db: Db,
	input: { token: string; userId: number; eatenPortions: number },
	now = Date.now()
) {
	const proposal = requireProposal(input, now);
	if (proposal.status !== 'active') throw new Error(`After-cook review is ${proposal.status}`);
	if (
		!Number.isInteger(input.eatenPortions) ||
		input.eatenPortions < (proposal.availablePortions > 0 ? 1 : 0) ||
		input.eatenPortions > proposal.availablePortions
	) {
		throw new Error('Choose an eaten portion count within the reviewed stock');
	}
	proposal.status = 'applying';
	try {
		const applied = db.transaction((tx) => {
			if (fingerprint(getMealPlanMeal(tx, proposal.mealId)) !== fingerprint(proposal.mealBefore)) {
				throw new Error('The meal changed; prepare a fresh after-cook review');
			}
			if (
				fingerprint(proposal.recipeSlug ? linkedLeftovers(tx, proposal.recipeSlug) : []) !==
				fingerprint(proposal.leftoversBefore)
			) {
				throw new Error('The linked freezer stock changed; prepare a fresh after-cook review');
			}
			const cooked = cookMealInTransaction(tx, proposal.mealId, proposal.cookedDate);
			if (!cooked.ok) throw new Error(cooked.error);
			const consumed =
				proposal.recipeSlug && input.eatenPortions > 0
					? consumeRecipeInTransaction(
							tx,
							{ slug: proposal.recipeSlug, portions: input.eatenPortions },
							{ actor: 'user', userId: input.userId }
						)
					: {
							ok: true as const,
							consumed: 0,
							remaining: 0,
							opIds: []
						};
			if (!consumed || consumed.consumed !== input.eatenPortions) {
				throw new Error('The reviewed freezer portions are no longer available');
			}
			const mealAfter = getMealPlanMeal(tx, proposal.mealId);
			if (!mealAfter) throw new Error('The cooked meal receipt could not be read');
			return {
				eatenPortions: consumed.consumed,
				remainingPortions: consumed.remaining,
				inventoryOpIds: consumed.opIds,
				mealAfter
			};
		});
		proposal.applied = applied;
		proposal.status = 'applied';
		return {
			ok: true as const,
			receipt: {
				status: 'committed' as const,
				atomicity: 'atomic' as const,
				meal: proposal.meal,
				eatenPortions: applied.eatenPortions,
				remainingPortions: applied.remainingPortions,
				undoToken: input.token
			}
		};
	} catch (cause) {
		proposal.status = 'active';
		throw cause;
	}
}

export function undoAfterCookProposal(
	db: Db,
	input: { token: string; userId: number }
) {
	const proposal = requireProposal(input);
	if (proposal.status !== 'applied' || !proposal.applied) {
		throw new Error(`After-cook review is ${proposal.status}`);
	}
	const applied = proposal.applied;
	db.transaction((tx) => {
		if (fingerprint(getMealPlanMeal(tx, proposal.mealId)) !== fingerprint(applied.mealAfter)) {
			throw new Error('The meal changed after checkout; Undo is no longer safe');
		}
		const ctx: WriteCtx = { actor: 'user', userId: input.userId };
		if (applied.inventoryOpIds.length === 1) {
			const result = undoOp(tx, applied.inventoryOpIds[0], ctx);
			if (!result.ok) throw new Error(result.error);
		} else if (applied.inventoryOpIds.length > 1) {
			undoOps(tx, [...applied.inventoryOpIds].reverse(), ctx);
		}
		const uncooked = uncookMealInTransaction(tx, proposal.mealId);
		if (!uncooked.ok) throw new Error(uncooked.error);
	});
	proposal.status = 'undone';
	return {
		ok: true as const,
		receipt: {
			status: 'undone' as const,
			atomicity: 'atomic' as const,
			meal: proposal.meal,
			restoredPortions: applied.eatenPortions
		}
	};
}

export function rejectAfterCookProposal(input: { token: string; userId: number }) {
	const proposal = requireProposal(input);
	if (proposal.status !== 'active') throw new Error(`After-cook review is ${proposal.status}`);
	proposal.status = 'rejected';
	return { ok: true as const, status: proposal.status };
}

export function getAfterCookProposalStatus(input: {
	token: string;
	userId: number;
	mealId: number;
}) {
	const proposal = requireProposal(input);
	if (proposal.mealId !== input.mealId) throw new Error('After-cook review target changed');
	return { status: proposal.status };
}

export function clearAfterCookProposalsForTest(): void {
	proposals.clear();
}
