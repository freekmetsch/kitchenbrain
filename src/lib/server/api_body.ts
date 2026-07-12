import { error } from '@sveltejs/kit';
import type { ZodType } from 'zod';

/**
 * Parse + validate a JSON request body behind a single zod schema:
 * 400 'Invalid JSON' on malformed JSON, 400 with the zod message on
 * schema failure. Shared by every route with a one-schema body gate.
 */
export async function readJsonBody<T>(request: Request, schema: ZodType<T>): Promise<T> {
	let raw: unknown;
	try {
		raw = await request.json();
	} catch {
		throw error(400, 'Invalid JSON');
	}
	const parsed = schema.safeParse(raw);
	if (!parsed.success) throw error(400, parsed.error.message);
	return parsed.data;
}
