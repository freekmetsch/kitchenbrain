// Shared "where did this effective value come from" vocabulary for the Settings
// AI/Advanced panels — household_prefs (UI) → env var → hardcoded default.
// Mirrors ai/config.ts's ConfigSource; kept separate so client components don't
// import the server-only config module.
export type ConfigSource = 'ui' | 'env' | 'default';

export const SOURCE_LABEL: Record<ConfigSource, string> = {
	ui: 'saved',
	env: 'env var',
	default: 'default'
};
