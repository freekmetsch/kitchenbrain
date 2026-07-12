import { fail, redirect } from '@sveltejs/kit';
import { base } from '$app/paths';
import { validateCredentials, createSession } from '$lib/server/auth';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) {
		redirect(303, base + '/');
	}
};

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		const data = await request.formData();
		const username = String(data.get('username') ?? '');
		const password = String(data.get('password') ?? '');

		const user = await validateCredentials(username, password);
		if (!user) {
			return fail(400, { error: 'Ongeldige inloggegevens' });
		}

		const sessionId = createSession(user.id);
		cookies.set('session_id', sessionId, {
			path: base || '/',
			httpOnly: true,
			secure: true,
			sameSite: 'lax',
			maxAge: 60 * 60 * 24 * 365
		});

		redirect(303, base + '/');
	}
};
