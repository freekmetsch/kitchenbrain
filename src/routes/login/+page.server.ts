import { fail, redirect } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { base } from '$app/paths';
import { validateCredentials, createSession } from '$lib/server/auth';
import type { Actions, PageServerLoad } from './$types';

function getTestLogin() {
	if (!dev || process.env.TEST_LOGIN_ENABLED !== '1') return null;

	const username = process.env.TEST_LOGIN_USERNAME?.trim();
	const password = process.env.TEST_LOGIN_PASSWORD;
	if (!username || !password) return null;

	return {
		username,
		password,
		label: process.env.TEST_LOGIN_LABEL?.trim() || username
	};
}

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) {
		redirect(303, base + '/');
	}

	const testLogin = getTestLogin();
	return { testLogin: testLogin ? { label: testLogin.label } : null };
};

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		const data = await request.formData();
		const requestedTestLogin = data.get('test_login') === '1';
		const testLogin = requestedTestLogin ? getTestLogin() : null;
		if (requestedTestLogin && !testLogin) {
			return fail(400, { error: 'invalid_credentials' as const });
		}

		const username = testLogin?.username ?? String(data.get('username') ?? '');
		const password = testLogin?.password ?? String(data.get('password') ?? '');

		const user = await validateCredentials(username, password);
		if (!user) {
			return fail(400, { error: 'invalid_credentials' as const });
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
