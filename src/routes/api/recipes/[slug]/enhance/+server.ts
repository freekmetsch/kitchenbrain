import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import { readJsonBody } from '$lib/server/api_body';
import {
	applyRecipeEnhancementForApp,
	generateRecipeEnhancementForApp,
	getRecipeEnhancementStatusForApp
} from '$lib/server/workflows/recipe-enhancement';

const BodySchema = z.discriminatedUnion('action', [
	z.object({ action: z.literal('generate') }),
	z.object({
		action: z.literal('apply'),
		token: z.string().min(20).max(256),
		operationIds: z.array(z.string().uuid()).max(30),
		productSelections: z
			.array(
				z.object({
					groupId: z.string().uuid(),
					candidateId: z.string().uuid()
				})
			)
			.max(10)
			.optional()
	})
]);

export const GET: RequestHandler = ({ url, locals, params }) => {
	if (!locals.user) error(401, 'Unauthorized');
	const token = z.string().min(20).max(256).parse(url.searchParams.get('token'));
	return json({
		status: getRecipeEnhancementStatusForApp({
			token,
			userId: locals.user.id,
			recipeSlug: params.slug
		})
	});
};

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
				userId: locals.user.id
			})
		);
	} catch (cause) {
		const message = cause instanceof Error ? cause.message : 'Recipe enhancement failed';
		error(message.includes('changed') || message.includes('expired') ? 409 : message === 'Recipe not found' ? 404 : 400, message);
	}
};
