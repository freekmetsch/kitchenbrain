import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import { readJsonBody } from '$lib/server/api_body';
import { createMessage } from '$lib/server/ai/client';
import { getModel, setModel, resetModel, type ModelRole } from '$lib/server/ai/config';

const ROLES = ['chat', 'chat_fallback', 'vision', 'background'] as const satisfies readonly ModelRole[];
type Role = (typeof ROLES)[number];

const schema = z
	.object({
		role: z.enum(ROLES),
		model: z.string().trim().min(1).max(200).optional(),
		reset: z.boolean().optional()
	})
	.refine((b) => b.reset || (b.model && b.model.length > 0), {
		message: 'model is required unless reset is true'
	});

// 1x1 transparent PNG — the vision role's test-on-save exercises the real image
// code path so a non-vision model saved here fails now, not on the first real
// photo days later (Guardrails, FEATURE_LIST_SETTINGS_MENU.md).
const TEST_PNG_BASE64 =
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

// Fire a 1-token request against the model before persisting it. Catches a bad
// model id, a missing provider key, or (vision) a model that can't read images —
// surfaced verbatim instead of a silent save that 500s on the next real turn.
async function testModel(model: string, role: Role): Promise<void> {
	await createMessage({
		model,
		system: 'You are a connectivity test. Reply with only the word OK.',
		messages:
			role === 'vision'
				? [
						{
							role: 'user',
							content: [
								{ type: 'text', text: 'What is in this image? Reply with one word.' },
								{ type: 'image', mediaType: 'image/png', base64: TEST_PNG_BASE64 }
							]
						}
					]
				: [{ role: 'user', content: 'Reply with only the word OK.' }],
		maxTokens: 5
	});
}

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const body = await readJsonBody(request, schema);

	if (body.reset) {
		resetModel(body.role);
		return json({ ok: true, effective: getModel(body.role) });
	}

	const model = body.model!.trim();
	try {
		await testModel(model, body.role);
	} catch (e) {
		return json(
			{ ok: false, error: e instanceof Error ? e.message : 'Model test failed.' },
			{ status: 400 }
		);
	}

	setModel(body.role, model);
	return json({ ok: true, effective: { value: model, source: 'ui' } });
};
