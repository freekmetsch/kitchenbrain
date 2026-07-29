import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import { readJsonBody } from '$lib/server/api_body';
import { ShoppingMutationError } from '$lib/server/domains/shopping';
import {
	chooseShoppingSourceNeed,
	chooseShoppingSourceTerm
} from '$lib/server/workflows/choose-shopping-source';

const SourceSchema = {
	entryId: z.number().int().positive(),
	expectedEntryRevision: z.number().int().positive()
} as const;

const BodySchema = z.discriminatedUnion('action', [
	z.object({
		action: z.literal('term'),
		...SourceSchema,
		term: z.string().min(1).max(256)
	}),
	z.object({
		action: z.literal('need'),
		...SourceSchema,
		expectedRecipeRevision: z.number().int().positive(),
		need: z.enum(['required', 'optional', 'stocked'])
	})
]);

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) error(401, 'Unauthorized');
	const input = await readJsonBody(request, BodySchema);
	try {
		const actor = { actor: locals.user.username, userId: locals.user.id };
		return json(
			input.action === 'term'
				? chooseShoppingSourceTerm({ ...input, ...actor })
				: chooseShoppingSourceNeed({ ...input, ...actor })
		);
	} catch (cause) {
		if (!(cause instanceof ShoppingMutationError)) throw cause;
		error(cause.code === 'stale' ? 409 : cause.code === 'not_found' ? 404 : 400, cause.message);
	}
};
