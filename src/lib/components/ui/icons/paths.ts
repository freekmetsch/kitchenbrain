// Icon path registry — one source for cross-file icon reuse (Svelte snippets
// can't cross module boundaries). Kills the triplicated AH cart SVG. Each icon
// is expressed purely as <path> `d` strings so Icon.svelte can render them
// without {@html} / SVG-namespace pitfalls. 16×16 stroke style mirrors the
// specimen's inline icon snippets (inventory/+page.svelte:579-593); the cart
// keeps its native 24×24 heroicons geometry.

export interface IconDef {
	viewBox: string;
	sw: number;
	paths: string[];
}

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
	}
} as const satisfies Record<string, IconDef>;

export type IconName = keyof typeof ICONS;
