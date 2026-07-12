import { redirect } from '@sveltejs/kit';
import { base } from '$app/paths';
import { db } from '$lib/server/db/index';
import { prefs } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, url }) => {
	if (!locals.user && url.pathname !== base + '/login') {
		redirect(303, base + '/login');
	}
	let theme = 'light';
	let recipeLang: 'en' | 'nl' = 'en';
	if (locals.user) {
		const userPrefs = db
			.select({ key: prefs.key, value: prefs.value })
			.from(prefs)
			.where(eq(prefs.userId, locals.user.id))
			.all();
		const themePref = userPrefs.find((p) => p.key === 'theme')?.value;
		const recipeLangPref = userPrefs.find((p) => p.key === 'recipe_view_language')?.value;
		theme = themePref ?? 'light';
		if (recipeLangPref === 'nl' || recipeLangPref === 'en') {
			recipeLang = recipeLangPref;
		} else {
			db.insert(prefs)
				.values({
					userId: locals.user.id,
					key: 'recipe_view_language',
					value: recipeLang,
					updatedAt: new Date()
				})
				.onConflictDoNothing()
				.run();
		}
	}
	return { user: locals.user, theme, recipeLang };
};
