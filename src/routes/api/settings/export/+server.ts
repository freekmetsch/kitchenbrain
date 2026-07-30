import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db/index';
import { buildHouseholdExport } from '$lib/server/settings/export';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	// Keep the backup surface explicit so it contains only restorable household data.
	const data = buildHouseholdExport(db);

	const filename = `household-brain-export-${new Date().toISOString().slice(0, 10)}.json`;

	return new Response(JSON.stringify(data, null, 2), {
		headers: {
			'Content-Type': 'application/json',
			'Content-Disposition': `attachment; filename="${filename}"`
		}
	});
};
