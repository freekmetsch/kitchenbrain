import { redirect } from '@sveltejs/kit';
import { base } from '$app/paths';
import { getVisionModel, getBackgroundModel } from '$lib/server/ai/config';
import { getTemperature } from '$lib/server/ai/tuning';
import { modelShortcuts, USD_TO_EUR } from '$lib/server/ai/pricing';
import type { PageServerLoad } from './$types';

// Env-only knobs deliberately left off the UI (infra or dangerous enough that a
// form control isn't worth the risk) — see FEATURE_LIST_SETTINGS_MENU.md Phase 2.
// Shown read-only here so a forker can discover them without reading source.
const ENV_KNOBS = [
	{
		name: 'DATABASE_URL',
		description: 'SQLite file path.',
		default: './dev.db'
	},
	{
		name: 'RECIPE_IMAGES_DIR',
		description: 'Where uploaded recipe photos are stored on disk.',
		default: './data/recipe_images'
	},
	{
		name: 'AH_TOKEN_FILE',
		description:
			'Where the Albert Heijn connect flow stores its session tokens — written by Settings -> Connections, never set directly.',
		default: './ah_tokens.json'
	},
	{
		name: 'LITESTREAM_ENABLED',
		description:
			"Set to '1' when Litestream owns WAL checkpointing (continuous backup to object storage). Leave unset for plain local SQLite.",
		default: 'unset'
	},
	{
		name: 'USD_TO_EUR',
		description: "Conversion rate used to show OpenRouter's USD usage cost as EUR spend on this page.",
		default: String(USD_TO_EUR)
	}
] as const;

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(303, base + '/login');

	return {
		visionModel: getVisionModel(),
		backgroundModel: getBackgroundModel(),
		temperature: getTemperature(),
		// Vision models aren't a distinct pricing category — they're priced as
		// 'chat' rows (client.ts's getVisionModel default is glm-4.6v) — so the
		// vision picker reuses the chat shortcut list.
		visionModelShortcuts: modelShortcuts('chat'),
		backgroundModelShortcuts: modelShortcuts('background'),
		envKnobs: ENV_KNOBS.map((k) => ({ ...k, current: process.env[k.name] ?? null }))
	};
};
