import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import { readJsonBody } from '$lib/server/api_body';
import { db } from '$lib/server/db/index';
import { RESET_GROUP_KEYS, RESET_GROUPS, resetGroup, type ResetGroupKey } from '$lib/server/settings/reset';

const schema = z.object({
	group: z.enum(RESET_GROUP_KEYS as [ResetGroupKey, ...ResetGroupKey[]]),
	confirm: z.string()
});

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const body = await readJsonBody(request, schema);
	const group = RESET_GROUPS[body.group];

	// Re-checked server-side — a disabled submit button is not a security
	// boundary (Correctness Req #4).
	if (body.confirm !== group.label) {
		return json({ ok: false, error: `Type "${group.label}" exactly to confirm.` }, { status: 400 });
	}

	try {
		const result = resetGroup(db, body.group);
		console.log(
			`[settings-data] reset group=${body.group} user=${locals.user.username} deleted=${JSON.stringify(result.deleted)}`
		);
		return json({ ok: true, deleted: result.deleted });
	} catch (e) {
		console.log(
			`[settings-data] reset group=${body.group} user=${locals.user.username} FAILED: ${e instanceof Error ? e.message : e}`
		);
		throw error(500, 'Reset failed.');
	}
};
