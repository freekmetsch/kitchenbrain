import { z } from 'zod';
import type { ExecutorFn } from './shared';
import { getMealPlanMeal } from '$lib/server/domains/meal-plan/queries';
import { getInventoryItem } from '$lib/server/domains/inventory/queries';
import { getRecipeBySlug } from '$lib/server/domains/recipes';
import { stageAfterCookProposal } from '$lib/server/ai/after_cook_proposal';
import {
	stageDefrostCookingAction,
	stageRescueCookingAction,
	stageTimerCookingAction
} from '$lib/server/ai/cooking_action';
import { isoDateSchema } from '$lib/date_schema';
import { todayIso } from '$lib/week';

const CookingActionSchema = z.union([
	z
		.object({
			action: z.literal('after_cook'),
			meal_id: z.number().int().positive(),
			cooked_date: isoDateSchema.optional(),
			eaten_portions: z.number().int().nonnegative().max(99).optional()
		})
		.strict(),
	z
		.object({
			action: z.literal('timer'),
			timer_operation: z.enum(['start', 'extend', 'rename', 'cancel']),
			seconds: z.number().int().positive().max(43_200).optional(),
			label: z.string().trim().min(1).max(80).optional(),
			target_label: z.string().trim().min(1).max(80).optional()
		})
		.strict()
		.superRefine((input, ctx) => {
			if (
				(input.timer_operation === 'start' || input.timer_operation === 'extend') &&
				input.seconds == null
			) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ['seconds'],
					message: 'Timer seconds are required'
				});
			}
			if (
				(input.timer_operation === 'start' || input.timer_operation === 'rename') &&
				!input.label
			) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ['label'],
					message: 'A timer label is required'
				});
			}
		}),
	z
		.object({
			action: z.literal('rescue'),
			recipe_slug: z.string().trim().min(1).max(160),
			step_index: z.number().int().min(0).max(99).optional(),
			issue: z.enum(['too_salty', 'too_thin', 'not_browning'])
		})
		.strict(),
	z
		.object({
			action: z.literal('defrost'),
			inventory_id: z.number().int().positive(),
			reminder_seconds: z.number().int().min(60).max(43_200).optional()
		})
		.strict()
]);

export const cookingExecutors: Record<string, ExecutorFn> = {
	async prepare_cooking_action(raw, db, userId) {
		const input = CookingActionSchema.parse(raw);
		if (input.action === 'after_cook') {
			const meal = getMealPlanMeal(db, input.meal_id);
			if (!meal) return { ok: false, error: 'Meal not found' };
			return {
				ok: true,
				kind: 'after_cook_proposal',
				...stageAfterCookProposal(db, {
					userId,
					mealId: input.meal_id,
					cookedDate: input.cooked_date ?? todayIso(),
					eatenPortions: input.eaten_portions
				})
			};
		}
		if (input.action === 'timer') {
			return stageTimerCookingAction({
				operation: input.timer_operation,
				seconds: input.seconds,
				label: input.label,
				targetLabel: input.target_label
			});
		}
		if (input.action === 'rescue') {
			const recipe = getRecipeBySlug(db, input.recipe_slug);
			if (!recipe) return { ok: false, error: 'Recipe not found' };
			return stageRescueCookingAction(recipe, {
				issue: input.issue,
				stepIndex: input.step_index
			});
		}
		const item = getInventoryItem(db, input.inventory_id);
		if (!item) return { ok: false, error: 'Inventory item not found' };
		return stageDefrostCookingAction(item, {
			reminderSeconds: input.reminder_seconds
		});
	}
};
