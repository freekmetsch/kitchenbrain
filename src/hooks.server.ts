import type { Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { dev } from '$app/environment';
import { validateSession } from '$lib/server/auth';
import { base } from '$app/paths';
import { db } from '$lib/server/db/index';
import { runTaxonomyGuardianSweep } from '$lib/server/inventory_guardian';
import { paraglideMiddleware } from '$lib/paraglide/server';
import { getTextDirection } from '$lib/paraglide/runtime';

// Brute-force protection: max 10 login POSTs per IP per 15 minutes
const loginAttempts = new Map<string, { count: number; resetAt: number }>();

function isLoginRateLimited(ip: string): boolean {
	const now = Date.now();
	const windowMs = 15 * 60 * 1000;
	const entry = loginAttempts.get(ip);
	if (!entry || now > entry.resetAt) {
		loginAttempts.set(ip, { count: 1, resetAt: now + windowMs });
		return false;
	}
	entry.count++;
	return entry.count > 10;
}

const authHandle: Handle = async ({ event, resolve }) => {
	if (
		event.request.method === 'POST' &&
		event.url.pathname === base + '/login'
	) {
		const ip =
			event.request.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
			event.getClientAddress();
		if (isLoginRateLimited(ip)) {
			return new Response('Too many login attempts. Try again in 15 minutes.', { status: 429 });
		}
	}

	const sessionId = event.cookies.get('session_id');
	event.locals.user = sessionId ? validateSession(sessionId) : null;
	return resolve(event);
};

// Resolves the UI locale (cookie, falling back to Accept-Language, then
// English) for every request — including pre-auth /login — and rewrites the
// %lang%/%dir% placeholders in app.html so <html> always matches.
const localeHandle: Handle = ({ event, resolve }) =>
	paraglideMiddleware(event.request, ({ request: localizedRequest, locale }) => {
		event.request = localizedRequest;
		return resolve(event, {
			transformPageChunk: ({ html }) =>
				html.replace('%lang%', locale).replace('%dir%', getTextDirection(locale))
		});
	});

export const handle: Handle = sequence(authHandle, localeHandle);

// Start background jobs once on server startup — skipped in dev to avoid HMR duplicates
if (!dev) {
	startTaxonomyGuardian();
}

// ── Taxonomy guardian (P3.2) ─────────────────────────────────────────────────

function runGuardianSweep() {
	try {
		const { classified, flagged } = runTaxonomyGuardianSweep(db);
		console.log(`[guardian] classified ${classified}, flagged ${flagged}`);
	} catch (e) {
		console.error('[guardian] Taxonomy sweep failed:', e);
	}
}

function startTaxonomyGuardian() {
	setTimeout(runGuardianSweep, 60_000);
	setInterval(runGuardianSweep, 6 * 60 * 60 * 1000);
}
