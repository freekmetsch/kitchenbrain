// Icon path registry — one source for cross-file icon reuse (Svelte snippets
// can't cross module boundaries). Kills the triplicated AH cart SVG. Each icon
// is expressed purely as <path> `d` strings so Icon.svelte can render them
// without {@html} / SVG-namespace pitfalls. 16×16 stroke style mirrors the
// specimen's inline icon snippets (inventory/+page.svelte:579-593); the cart
// keeps its native 24×24 heroicons geometry.
//
// This file holds the *Classic* set (the shipped default) plus the shared
// types. Alternate full sets live in ./sets/ — every set covers the same
// IconName inventory, so any of them can be swapped in app-wide at runtime
// (see active.svelte.ts and the /design/icons picker).

/** A path is either a bare stroke `d` string or an object with per-path
 *  overrides. `fill: true` renders the path as a currentColor fill with no
 *  stroke (duotone sets use this for soft backdrops and solid accent dots). */
export interface IconPathDef {
	d: string;
	fill?: boolean;
	opacity?: number;
	/** Per-path stroke-width override (stroke paths only). */
	sw?: number;
}

export type IconPath = string | IconPathDef;

export interface IconDef {
	viewBox: string;
	sw: number;
	/** Stroke linecap/linejoin flavor; 'round' unless a set says otherwise. */
	cap?: 'round' | 'square' | 'butt';
	paths: readonly IconPath[];
}

/** Normalize a path entry to its object form (shared by Icon + Spinner). */
export const toPathDef = (p: IconPath): IconPathDef => (typeof p === 'string' ? { d: p } : p);

export const ICONS = {
	plus: { viewBox: '0 0 16 16', sw: 1.75, paths: ['M8 3.25v9.5M3.25 8h9.5'] },
	minus: { viewBox: '0 0 16 16', sw: 1.75, paths: ['M3.25 8h9.5'] },
	check: { viewBox: '0 0 16 16', sw: 1.75, paths: ['m3.5 8.5 3 3 6-7'] },
	x: { viewBox: '0 0 16 16', sw: 1.75, paths: ['M4 4l8 8M12 4l-8 8'] },
	trash: {
		viewBox: '0 0 16 16',
		sw: 1.5,
		paths: ['M3 4.5h10M6.5 4.5V3.2h3V4.5M4.7 4.5l.4 8h5.8l.4-8M6.6 6.7v3.6M9.4 6.7v3.6']
	},
	warn: {
		viewBox: '0 0 16 16',
		sw: 1.5,
		paths: ['M8 2.75 14.25 13.25H1.75L8 2.75Z', 'M8 6.75v2.75', 'M8 11.9v.01']
	},
	clock: {
		viewBox: '0 0 16 16',
		sw: 1.5,
		paths: ['M14 8a6 6 0 1 1-12 0 6 6 0 0 1 12 0Z', 'M8 4.75V8l2.25 1.5']
	},
	chevronLeft: { viewBox: '0 0 16 16', sw: 1.75, paths: ['M10 4l-4 4 4 4'] },
	chevronRight: { viewBox: '0 0 16 16', sw: 1.75, paths: ['M6 4l4 4-4 4'] },
	// Clipboard with a top clip — the "paste token" action.
	clipboard: {
		viewBox: '0 0 16 16',
		sw: 1.5,
		paths: [
			'M6 3.25H4.5a1 1 0 0 0-1 1v8.5a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1v-8.5a1 1 0 0 0-1-1H10',
			'M6 3.25a2 2 0 0 1 4 0V4H6v-.75Z'
		]
	},
	// Two stacked sheets — the "copy command" action.
	copy: {
		viewBox: '0 0 16 16',
		sw: 1.5,
		paths: [
			'M6.5 6.5h6a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-6a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1Z',
			'M3.5 10V3.5a1 1 0 0 1 1-1H10'
		]
	},
	// Albert Heijn shopping cart — native 24×24 heroicons outline cart.
	cart: {
		viewBox: '0 0 24 24',
		sw: 2,
		paths: [
			'M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z'
		]
	},
	// Calendar — native 24×24 heroicons outline, mirrors the bottom-nav Meals icon.
	calendar: {
		viewBox: '0 0 24 24',
		sw: 2,
		paths: [
			'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z'
		]
	},
	// ── Bottom-nav destinations (native 24×24 heroicons outline). Home / Stock /
	//    Recipes / Settings; Meals reuses `calendar`, Shopping reuses `cart`.
	home: {
		viewBox: '0 0 24 24',
		sw: 2,
		paths: [
			'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6'
		]
	},
	box: {
		viewBox: '0 0 24 24',
		sw: 2,
		paths: [
			'M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4'
		]
	},
	book: {
		viewBox: '0 0 24 24',
		sw: 2,
		paths: [
			'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253'
		]
	},
	settings: {
		viewBox: '0 0 24 24',
		sw: 2,
		paths: [
			'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z',
			'M15 12a3 3 0 11-6 0 3 3 0 016 0z'
		]
	},
	// ── Food set (UX icon pass): the app's own food-themed icon family, drawn on
	//    the 24-grid at sw 2 to optically match the nav heroicons. Minimalist
	//    single-weight outlines; nav + empty states + feature accents share these.
	chefHat: {
		viewBox: '0 0 24 24',
		sw: 2,
		paths: [
			'M17 20a1 1 0 0 0 1-1v-4.3c0-.4.3-.8.7-1a4 4 0 0 0-2.1-7.6 5 5 0 0 0-9.2 0 4 4 0 0 0-2.1 7.6c.4.2.7.6.7 1V19a1 1 0 0 0 1 1Z',
			'M6.9 16.5h10.2'
		]
	},
	cutlery: {
		viewBox: '0 0 24 24',
		sw: 2,
		paths: [
			'M4.5 3.5v5a2.5 2.5 0 0 0 2.5 2.5h1a2.5 2.5 0 0 0 2.5-2.5v-5',
			'M7.5 3.5v17',
			'M19.5 13.5V3.25A4.25 4.25 0 0 0 15.25 7.5v4a2 2 0 0 0 2 2h2.25Z',
			'M19.5 13.5v7'
		]
	},
	basket: {
		viewBox: '0 0 24 24',
		sw: 2,
		paths: [
			'M4.9 9.5 8.2 4.5',
			'M19.1 9.5 15.8 4.5',
			'M3.5 9.5h17l-1.63 8.4a2 2 0 0 1-1.96 1.6H7.1a2 2 0 0 1-1.96-1.6L3.5 9.5Z',
			'M12 13v3.2',
			'M8.7 13l.45 3.2',
			'M15.3 13l-.45 3.2'
		]
	},
	jar: {
		viewBox: '0 0 24 24',
		sw: 2,
		paths: [
			'M8.3 3.5h7.4',
			'M7.6 6.4h8.8',
			'M8.6 6.4v.7c0 1.1-2.1 1.7-2.1 3.6v6.6A3.2 3.2 0 0 0 9.7 20.5h4.6a3.2 3.2 0 0 0 3.2-3.2v-6.6c0-1.9-2.1-2.5-2.1-3.6v-.7',
			'M6.5 12.6h11'
		]
	},
	// Rim first, body second, then the two steam wisps — Spinner.svelte animates
	// paths[2..3] by index, so keep the order stable.
	pot: {
		viewBox: '0 0 24 24',
		sw: 2,
		paths: [
			'M3.5 10h17',
			'M5 10h14v6.3a3.2 3.2 0 0 1-3.2 3.2H8.2A3.2 3.2 0 0 1 5 16.3V10Z',
			'M9 3.2c-.7.8-.7 1.9 0 2.7s.7 1.9 0 2.7',
			'M15 3.2c-.7.8-.7 1.9 0 2.7s.7 1.9 0 2.7'
		]
	},
	pan: {
		viewBox: '0 0 24 24',
		sw: 2,
		paths: [
			'M16.6 12a6.8 6.8 0 1 1-13.6 0 6.8 6.8 0 0 1 13.6 0Z',
			'M16.6 12h4.9',
			'M12.1 12a2.3 2.3 0 1 1-4.6 0 2.3 2.3 0 0 1 4.6 0Z'
		]
	},
	spoon: {
		viewBox: '0 0 24 24',
		sw: 2,
		paths: [
			'M14.6 6.8c0 2.3-1.2 4.1-2.6 4.1S9.4 9.1 9.4 6.8 10.6 2.8 12 2.8s2.6 1.7 2.6 4Z',
			'M12 10.9v10.3'
		]
	},
	carrot: {
		viewBox: '0 0 24 24',
		sw: 2,
		paths: [
			'M3.7 20.3c.5-3.7 2.1-8.6 5.2-11.7l6.5 6.5c-3.1 3.1-8 4.7-11.7 5.2Z',
			'M8.3 13.9l1.7 1.7',
			'M15.4 8.6c.2-1.9 1.3-3.6 3-4.7',
			'M15.4 8.6c1.9-.2 3.6-1.3 4.7-3'
		]
	},
	egg: {
		viewBox: '0 0 24 24',
		sw: 2,
		paths: ['M18.3 13.2c0 4.2-2.8 7.3-6.3 7.3s-6.3-3.1-6.3-7.3S8.5 3.5 12 3.5s6.3 5.5 6.3 9.7Z']
	},
	flame: {
		viewBox: '0 0 24 24',
		sw: 2,
		paths: [
			'M12 3.5c.8 2.8 3.9 4.6 5 7.6 1 2.8-.3 6-2.6 7.6A7 7 0 0 1 12 20a7 7 0 0 1-2.4-1.3C7.3 17.1 6 13.9 7 11.1c1.1-3 4.2-4.8 5-7.6Z',
			'M12 20c-1.7 0-3-1.3-3-2.9 0-1.7 1.6-2.5 3-4.3 1.4 1.8 3 2.6 3 4.3 0 1.6-1.3 2.9-3 2.9Z'
		]
	},
	snowflake: {
		viewBox: '0 0 24 24',
		sw: 2,
		paths: [
			'M12 3v18',
			'M4.2 7.5l15.6 9',
			'M4.2 16.5l15.6-9',
			'M12 3l-2 2M12 3l2 2',
			'M12 21l-2-2M12 21l2-2'
		]
	},
	leaf: {
		viewBox: '0 0 24 24',
		sw: 2,
		paths: [
			'M5.3 18.7C5.3 10.2 11 5.1 19.6 4.4c.7 8.6-4.4 14.3-12.9 14.3H5.3Z',
			'M5.3 18.7c2.1-5.7 5.7-9.8 10.7-11.9'
		]
	},
	plate: {
		viewBox: '0 0 24 24',
		sw: 2,
		paths: [
			'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
			'M16.3 12a4.3 4.3 0 1 1-8.6 0 4.3 4.3 0 0 1 8.6 0Z'
		]
	},
	bread: {
		viewBox: '0 0 24 24',
		sw: 2,
		paths: [
			'M5 9.2c0-2.1 1.6-3.7 3.7-3.7h6.6c2.1 0 3.7 1.6 3.7 3.7 0 1.2-.6 2.2-1.5 2.8v6.5a1 1 0 0 1-1 1H7.5a1 1 0 0 1-1-1V12c-.9-.6-1.5-1.6-1.5-2.8Z',
			'M9.9 9.5l-.6 3.2',
			'M14.7 9.5l-.6 3.2'
		]
	},
	apple: {
		viewBox: '0 0 24 24',
		sw: 2,
		paths: [
			'M12 7.6c-1.1-1-2.6-1.4-4-1C5.4 7.4 4.4 10.1 5 12.8c.7 3.3 2.7 6.2 4.6 7.3.8.5 1.6.3 2.4-.2.8.5 1.6.7 2.4.2 1.9-1.1 3.9-4 4.6-7.3.6-2.7-.4-5.4-3-6.2-1.4-.4-2.9 0-4 1Z',
			'M12 7.6c0-1.7.7-2.9 1.9-3.9'
		]
	}
} as const satisfies Record<string, IconDef>;

export type IconName = keyof typeof ICONS;
