import { randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import * as schema from '$lib/server/db/schema';
import type { Db } from '$lib/server/db/types';
import { getRecipeBySlug } from '$lib/server/domains/recipes';
import {
	createMealPlanMeal,
	updateMealPlanMeal
} from '$lib/server/domains/meal-plan/commands';
import {
	getMealPlanMeal,
	listMealsForWeek,
	type MealPlanMeal
} from '$lib/server/domains/meal-plan/queries';
import { getWeekStartDay } from '$lib/server/meal_plan/prefs';
import { reconcileShoppingAfterWrite } from '$lib/server/workflows/reconcile-shopping';
import { isoWeekNumber, weekStartFor } from '$lib/week';

export const RecommendationEnvelopeSchema = z
	.object({
		whyNow: z.string().trim().min(1).max(500).optional(),
		evidence: z.array(z.string().trim().min(1).max(500)).max(12).default([]),
		confidence: z.enum(['high', 'medium', 'low']).optional(),
		uncertainty: z.string().trim().min(1).max(500).nullable().optional(),
		consequence: z.string().trim().min(1).max(500).optional(),
		alternatives: z.array(z.string().trim().min(1).max(500)).max(8).default([])
	})
	.strict();

const AddMealOperationSchema = z
	.object({
		kind: z.literal('add'),
		dinner: z.string().trim().min(1).max(256),
		recipeSlug: z.string().trim().min(1).max(256).nullable(),
		plannedDate: z.string().date().nullable(),
		servings: z.number().int().positive().max(99).nullable(),
		source: z.enum(['fresh', 'freezer']),
		note: z.string().trim().max(1000).nullable(),
		reason: z.string().trim().min(1).max(500)
	})
	.strict();

const UpdateMealChangesSchema = z
	.object({
		weekStartDate: z.string().date().optional(),
		dinner: z.string().trim().min(1).max(256).optional(),
		recipeSlug: z.string().trim().min(1).max(256).nullable().optional(),
		plannedDate: z.string().date().nullable().optional(),
		servings: z.number().int().positive().max(99).nullable().optional(),
		source: z.enum(['fresh', 'freezer']).optional(),
		note: z.string().trim().max(1000).nullable().optional()
	})
	.strict()
	.refine((changes) => Object.keys(changes).length > 0, 'At least one meal field must change');

const UpdateMealOperationSchema = z
	.object({
		kind: z.literal('update'),
		mealId: z.number().int().positive(),
		changes: UpdateMealChangesSchema,
		reason: z.string().trim().min(1).max(500)
	})
	.strict();

const RemoveMealOperationSchema = z
	.object({
		kind: z.literal('remove'),
		mealId: z.number().int().positive(),
		reason: z.string().trim().min(1).max(500)
	})
	.strict();

export const MealPlanOperationSchema = z.discriminatedUnion('kind', [
	AddMealOperationSchema,
	UpdateMealOperationSchema,
	RemoveMealOperationSchema
]);

export const MealPlanProposalInputSchema = z
	.object({
		userId: z.number().int().positive(),
		weekStartDate: z.string().date(),
		title: z.string().trim().min(1).max(160),
		recommendation: RecommendationEnvelopeSchema,
		operations: z.array(MealPlanOperationSchema).min(1).max(14)
	})
	.strict();

export type RecommendationEnvelope = z.infer<typeof RecommendationEnvelopeSchema>;
export type MealPlanProposalInput = z.input<typeof MealPlanProposalInputSchema>;
type ParsedMealPlanProposalInput = z.output<typeof MealPlanProposalInputSchema>;

export type MealPlanProposalOperation = {
	id: string;
	kind: 'add' | 'update' | 'remove';
	label: string;
	before: string | null;
	after: string;
	reason: string;
};

export type MealPlanProposal = {
	token: string;
	status:
		| 'active'
		| 'applying'
		| 'applied'
		| 'undone'
		| 'rejected'
		| 'superseded'
		| 'expired';
	title: string;
	weekStartDate: string;
	atomicity: {
		kind: 'atomic';
		consequence: string;
	};
	recommendation: RecommendationEnvelope;
	operations: MealPlanProposalOperation[];
};

type AppliedMealPlanOperation = {
	operationId: string;
	kind: 'add' | 'update' | 'remove';
	label: string;
	before: MealPlanMeal | null;
	after: MealPlanMeal | null;
};

type StoredMealPlanProposal = Omit<MealPlanProposal, 'token'> & {
	userId: number;
	expiresAt: number;
	input: ParsedMealPlanProposalInput;
	applied?: AppliedMealPlanOperation[];
	weekFingerprints: Record<string, string>;
};

const TTL_MS = 10 * 60 * 1000;
const MAX_PROPOSALS = 100;
const proposals = new Map<string, StoredMealPlanProposal>();

function cleanExpired(now: number): void {
	for (const proposal of proposals.values()) {
		if (proposal.status === 'active' && proposal.expiresAt <= now) proposal.status = 'expired';
	}
	while (proposals.size >= MAX_PROPOSALS) proposals.delete(proposals.keys().next().value!);
}

function weekFingerprint(db: Db, weekStartDate: string): string {
	return JSON.stringify(listMealsForWeek(db, weekStartDate));
}

export function stageMealPlanProposal(
	db: Db,
	rawInput: MealPlanProposalInput,
	now = Date.now()
): MealPlanProposal {
	const input = MealPlanProposalInputSchema.parse(rawInput);
	const weekStartDate = weekStartFor(input.weekStartDate, getWeekStartDay(db));
	const affectedWeeks = new Set([weekStartDate]);
	const operations = input.operations.map((operation): MealPlanProposalOperation => {
		if (operation.kind === 'add') {
			if (operation.recipeSlug && !getRecipeBySlug(db, operation.recipeSlug)) {
				throw new Error(`Recipe ${operation.recipeSlug} not found`);
			}
			if (operation.source === 'freezer' && !operation.recipeSlug) {
				throw new Error('A freezer meal requires a linked recipe');
			}
			if (
				operation.plannedDate &&
				weekStartFor(operation.plannedDate, getWeekStartDay(db)) !== weekStartDate
			) {
				throw new Error('A planned date must be inside the proposal week');
			}
			return {
				id: randomUUID(),
				kind: operation.kind,
				label: operation.dinner,
				before: null,
				after: [
					operation.plannedDate,
					operation.source,
					operation.servings ? `${operation.servings} servings` : null
				]
					.filter(Boolean)
					.join(' · '),
				reason: operation.reason
			};
		}

		const meal = getMealPlanMeal(db, operation.mealId);
		if (!meal) throw new Error(`Meal ${operation.mealId} not found`);
		affectedWeeks.add(meal.weekStartDate);
		if (operation.kind === 'remove') {
			return {
				id: randomUUID(),
				kind: operation.kind,
				label: meal.dinner,
				before: [
					meal.plannedDate,
					meal.dinner,
					meal.source,
					meal.servings ? `${meal.servings} servings` : null
				]
					.filter(Boolean)
					.join(' · '),
				after: 'Removed',
				reason: operation.reason
			};
		}
		const nextWeek = operation.changes.weekStartDate
			? weekStartFor(operation.changes.weekStartDate, getWeekStartDay(db))
			: meal.weekStartDate;
		affectedWeeks.add(nextWeek);
		const nextRecipeSlug =
			operation.changes.recipeSlug === undefined
				? meal.recipeSlug
				: operation.changes.recipeSlug;
		if (nextRecipeSlug && !getRecipeBySlug(db, nextRecipeSlug)) {
			throw new Error(`Recipe ${nextRecipeSlug} not found`);
		}
		const nextSource = operation.changes.source ?? meal.source;
		if (nextSource === 'freezer' && !nextRecipeSlug) {
			throw new Error('A freezer meal requires a linked recipe');
		}
		const nextPlannedDate =
			operation.changes.plannedDate === undefined
				? meal.plannedDate
				: operation.changes.plannedDate;
		if (
			nextPlannedDate &&
			weekStartFor(nextPlannedDate, getWeekStartDay(db)) !== nextWeek
		) {
			throw new Error('A planned date must be inside the meal week');
		}
		return {
			id: randomUUID(),
			kind: operation.kind,
			label: operation.changes.dinner ?? meal.dinner,
			before: [
				meal.plannedDate,
				meal.dinner,
				meal.source,
				meal.servings ? `${meal.servings} servings` : null
			]
				.filter(Boolean)
				.join(' · '),
			after: [
				nextPlannedDate,
				operation.changes.dinner ?? meal.dinner,
				nextSource,
				(operation.changes.servings === undefined
					? meal.servings
					: operation.changes.servings)
					? `${operation.changes.servings === undefined ? meal.servings : operation.changes.servings} servings`
					: null
			]
				.filter(Boolean)
				.join(' · '),
			reason: operation.reason
		};
	});

	cleanExpired(now);
	for (const proposal of proposals.values()) {
		if (
			proposal.userId === input.userId &&
			proposal.weekStartDate === weekStartDate &&
			proposal.status === 'active'
		) {
			proposal.status = 'superseded';
		}
	}

	const token = randomBytes(24).toString('base64url');
	const proposal: StoredMealPlanProposal = {
		userId: input.userId,
		expiresAt: now + TTL_MS,
		status: 'active',
		title: input.title,
		weekStartDate,
		atomicity: {
			kind: 'atomic',
			consequence:
				'The selected meal-plan changes and Shopping reconciliation commit together.'
		},
		recommendation: input.recommendation,
		operations,
		input: { ...input, weekStartDate },
		weekFingerprints: Object.fromEntries(
			[...affectedWeeks].map((week) => [week, weekFingerprint(db, week)])
		)
	};
	proposals.set(token, proposal);
	return {
		token,
		status: proposal.status,
		title: proposal.title,
		weekStartDate: proposal.weekStartDate,
		atomicity: proposal.atomicity,
		recommendation: proposal.recommendation,
		operations: proposal.operations
	};
}

export function applyMealPlanProposal(
	db: Db,
	input: { token: string; userId: number; operationIds: string[] },
	now = Date.now()
) {
	const proposal = proposals.get(input.token);
	if (!proposal || proposal.userId !== input.userId) {
		throw new Error('Meal-plan proposal expired or belongs to another user');
	}
	if (proposal.status === 'active' && proposal.expiresAt <= now) proposal.status = 'expired';
	if (proposal.status !== 'active') {
		throw new Error(`Meal-plan proposal is ${proposal.status}`);
	}
	const selected = new Set(input.operationIds);
	if (selected.size === 0) throw new Error('Choose at least one meal-plan change');
	if (selected.size !== input.operationIds.length) {
		throw new Error('Meal-plan operation IDs must be unique');
	}
	if ([...selected].some((id) => !proposal.operations.some((operation) => operation.id === id))) {
		throw new Error('Unknown meal-plan operation');
	}

	proposal.status = 'applying';
	try {
		const applied = db.transaction((tx) => {
			for (const [week, expected] of Object.entries(proposal.weekFingerprints)) {
				if (weekFingerprint(tx, week) !== expected) {
					throw new Error('The meal plan changed; review a fresh proposal');
				}
			}
			const rows = proposal.operations.flatMap<AppliedMealPlanOperation>((display, index) => {
				if (!selected.has(display.id)) return [];
				const operation = proposal.input.operations[index];
				if (operation.kind === 'remove') {
					const before = getMealPlanMeal(tx, operation.mealId);
					if (!before) throw new Error(`Meal ${operation.mealId} no longer exists`);
					tx.delete(schema.mealPlanMeals)
						.where(eq(schema.mealPlanMeals.id, operation.mealId))
						.run();
					return [
						{
							operationId: display.id,
							kind: 'remove' as const,
							label: display.label,
							before,
							after: null
						}
					];
				}
				if (operation.kind === 'update') {
					const before = getMealPlanMeal(tx, operation.mealId);
					if (!before) throw new Error(`Meal ${operation.mealId} no longer exists`);
					const nextWeek = operation.changes.weekStartDate
						? weekStartFor(operation.changes.weekStartDate, getWeekStartDay(tx))
						: undefined;
					const result = updateMealPlanMeal(tx, operation.mealId, {
						...operation.changes,
						...(nextWeek
							? {
									weekStartDate: nextWeek,
									weekNumber: isoWeekNumber(nextWeek)
								}
							: {})
					});
					if (!result.ok) throw new Error(result.error);
					return [
						{
							operationId: display.id,
							kind: 'update' as const,
							label: display.label,
							before,
							after: result.meal
						}
					];
				}
				const recipe = operation.recipeSlug
					? getRecipeBySlug(tx, operation.recipeSlug)
					: undefined;
				if (operation.recipeSlug && !recipe) {
					throw new Error(`Recipe ${operation.recipeSlug} no longer exists`);
				}
				const meal = createMealPlanMeal(tx, {
					weekNumber: isoWeekNumber(proposal.weekStartDate),
					weekStartDate: proposal.weekStartDate,
					dinner: operation.dinner,
					recipeSlug: operation.recipeSlug,
					servings: operation.servings ?? recipe?.servings ?? null,
					plannedDate: operation.plannedDate,
					source: operation.source,
					note: operation.note
				});
				return [
					{
						operationId: display.id,
						kind: 'add' as const,
						label: display.label,
						before: null,
						after: meal
					}
				];
			});
			reconcileShoppingAfterWrite(tx, Object.keys(proposal.weekFingerprints));
			return rows;
		});
		proposal.applied = applied;
		proposal.status = 'applied';
		return {
			ok: true as const,
			weekStartDate: proposal.weekStartDate,
			receipt: {
				status: 'committed' as const,
				atomicity: 'atomic' as const,
				applied: applied.map(({ kind, label }) => ({ kind, label })),
				undoToken: input.token
			}
		};
	} catch (cause) {
		proposal.status = 'active';
		throw cause;
	}
}

function mealsEqual(left: MealPlanMeal | undefined, right: MealPlanMeal): boolean {
	return Boolean(left) && JSON.stringify(left) === JSON.stringify(right);
}

export function undoMealPlanProposal(
	db: Db,
	input: { token: string; userId: number }
) {
	const proposal = proposals.get(input.token);
	if (!proposal || proposal.userId !== input.userId) {
		throw new Error('Meal-plan receipt expired or belongs to another user');
	}
	if (proposal.status !== 'applied' || !proposal.applied) {
		throw new Error(`Meal-plan proposal is ${proposal.status}`);
	}

	const restored: string[] = [];
	const removed: string[] = [];
	const affectedWeeks = new Set<string>();
	db.transaction((tx) => {
		for (const operation of proposal.applied!) {
			const current = getMealPlanMeal(
				tx,
				operation.after?.id ?? operation.before!.id
			);
			const matches =
				operation.after === null ? current === undefined : mealsEqual(current, operation.after);
			if (!matches) {
				throw new Error('The meal plan changed after apply; Undo is no longer safe');
			}
		}
		for (const operation of [...proposal.applied!].reverse()) {
			if (operation.after) affectedWeeks.add(operation.after.weekStartDate);
			if (operation.kind === 'remove') {
				const before = operation.before!;
				affectedWeeks.add(before.weekStartDate);
				tx.insert(schema.mealPlanMeals).values(before).run();
				restored.unshift(before.dinner);
				continue;
			}
			if (operation.kind === 'add') {
				tx.delete(schema.mealPlanMeals)
					.where(eq(schema.mealPlanMeals.id, operation.after!.id))
					.run();
				removed.unshift(operation.after!.dinner);
				continue;
			}
			const before = operation.before!;
			affectedWeeks.add(before.weekStartDate);
			const { id: _id, ...values } = before;
			tx.update(schema.mealPlanMeals)
				.set(values)
				.where(eq(schema.mealPlanMeals.id, before.id))
				.run();
			restored.unshift(before.dinner);
		}
		reconcileShoppingAfterWrite(tx, [...affectedWeeks]);
	});
	proposal.status = 'undone';
	return {
		ok: true as const,
		receipt: {
			status: 'undone' as const,
			atomicity: 'atomic' as const,
			restored,
			removed
		}
	};
}

export function getMealPlanProposalStatus(
	input: { token: string; userId: number; weekStartDate: string },
	now = Date.now()
) {
	const proposal = proposals.get(input.token);
	if (
		!proposal ||
		proposal.userId !== input.userId ||
		proposal.weekStartDate !== input.weekStartDate
	) {
		throw new Error('Meal-plan proposal expired or belongs to another user');
	}
	if (proposal.status === 'active' && proposal.expiresAt <= now) proposal.status = 'expired';
	return { status: proposal.status };
}

export function rejectMealPlanProposal(input: { token: string; userId: number }) {
	const proposal = proposals.get(input.token);
	if (!proposal || proposal.userId !== input.userId) {
		throw new Error('Meal-plan proposal expired or belongs to another user');
	}
	if (proposal.status !== 'active') {
		throw new Error(`Meal-plan proposal is ${proposal.status}`);
	}
	proposal.status = 'rejected';
	return { ok: true as const, status: proposal.status };
}
