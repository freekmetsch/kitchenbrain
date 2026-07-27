import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import { readJsonBody } from '$lib/server/api_body';
import {
	applyRecipeEnhancementForApp,
	generateRecipeEnhancementForApp
} from '$lib/server/workflows/recipe-enhancement';

const BodySchema = z.discriminatedUnion('action', [
	z.object({ action: z.literal('generate') }),
	z.object({
		action: z.literal('apply'),
		token: z.string().min(20).max(256),
		additions: z.array(z.object({ id: z.string().uuid(), need: z.enum(['required', 'optional', 'stocked']) })).max(20),
		substituteIds: z.array(z.string().uuid()).max(30)
	})
]);

export const POST: RequestHandler = async ({ request, locals, params }) => {
	if (!locals.user) error(401, 'Unauthorized');
	const body = await readJsonBody(request, BodySchema);
	try {
		if (body.action === 'generate') {
			return json(
				await generateRecipeEnhancementForApp({
					recipeSlug: params.slug,
					userId: locals.user.id
				})
			);
		}
		return json(
			applyRecipeEnhancementForApp({
				...body,
				userId: locals.user.id,
				actor: locals.user.username
			})
		);
	} catch (cause) {
		const message = cause instanceof Error ? cause.message : 'Recipe enhancement failed';
		error(message.includes('changed') || message.includes('expired') ? 409 : message === 'Recipe not found' ? 404 : 400, message);
	}
};
