import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { db } from '$lib/server/db/index';
import { users } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { readJsonBody } from '$lib/server/api_body';

const schema = z.object({
	current_password: z.string().min(1),
	new_password: z.string().min(8)
});

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const body = await readJsonBody(request, schema);

	const user = db.select().from(users).where(eq(users.id, locals.user.id)).get();
	if (!user) throw error(404, 'Not found');

	const valid = await bcrypt.compare(body.current_password, user.passwordHash);
	if (!valid) return json({ ok: false, error: 'Current password incorrect' }, { status: 400 });

	const newHash = await bcrypt.hash(body.new_password, 12);
	db.update(users)
		.set({ passwordHash: newHash, credsVersion: user.credsVersion + 1 })
		.where(eq(users.id, locals.user.id))
		.run();

	return json({ ok: true });
};
