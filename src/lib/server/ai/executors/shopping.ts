import { z } from 'zod';
import { isoDateSchema } from '$lib/date_schema';
import { generateShoppingList } from '$lib/server/workflows/reconcile-shopping';
import type { ExecutorFn } from './shared';

export const shoppingExecutors: Record<string, ExecutorFn> = {
	async generate_shopping_list(raw, db) {
		const input = z.object({ week_start_date: isoDateSchema.optional() }).parse(raw);
		return generateShoppingList(db, input.week_start_date);
	}
};
