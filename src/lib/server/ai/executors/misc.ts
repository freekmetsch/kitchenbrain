import { z } from 'zod';
import type { ExecutorFn } from './shared';

export const miscExecutors: Record<string, ExecutorFn> = {
	async present_plan(raw) {
		const input = z
			.object({ title: z.string().optional(), steps: z.array(z.string()).min(1).max(12) })
			.parse(raw);
		// A UI affordance, not a write: the checklist renders from this result;
		// the model gets a plain ack so it proceeds to execute the steps.
		return { ok: true, title: input.title, steps: input.steps };
	}
};
