// Linocut — hand-carved stamp set. Built from solid silhouettes with detail
// *carved out* as white (even-odd holes): no outlines anywhere. New metaphors
// throughout: stock = pantry shelf, planning = ring-bound week page, shopping
// = tote bag, settings = mixer sliders, egg = fried egg from above.
// Convention: `pot`'s LAST TWO paths are the steam wisps (Spinner contract) —
// here two rising puff-arcs, stroked at the set's sw.

import type { IconDef, IconName } from '../paths';

const F = (d: string) => ({ d, fill: true }) as const;

export const LINOCUT = {
	plus: { viewBox: '0 0 24 24', sw: 2, paths: [F('M9.7 3.4h4.6v6.3h6.3v4.6h-6.3v6.3H9.7v-6.3H3.4V9.7h6.3V3.4Z')] },
	minus: { viewBox: '0 0 24 24', sw: 2, paths: [F('M3.4 9.7h17.2v4.6H3.4Z')] },
	check: { viewBox: '0 0 24 24', sw: 2, paths: [F('M9.4 20.6 2.6 13.4l3.3-3.1 3.4 3.6 8.7-9.5 3.4 3.1L9.4 20.6Z')] },
	x: {
		viewBox: '0 0 24 24',
		sw: 2,
		paths: [
			F('M12 8.8l4.9-4.9 3.2 3.2L15.2 12l4.9 4.9-3.2 3.2L12 15.2l-4.9 4.9-3.2-3.2L8.8 12 3.9 7.1l3.2-3.2L12 8.8Z')
		]
	},
	trash: {
		viewBox: '0 0 24 24',
		sw: 2,
		paths: [
			F('M9.6 2.8h4.8l.9 1.7h4.1v3H4.6v-3h4.1l.9-1.7Z'),
			F('M5.4 9.1h13.2l-1.1 11.5H6.5L5.4 9.1Zm3.9 2.6.35 6.3h1.5l-.35-6.3H9.3Zm4.4 0-.35 6.3h1.5l.35-6.3h-1.5Z')
		]
	},
	warn: {
		viewBox: '0 0 24 24',
		sw: 2,
		paths: [
			F('M12 2.6 22.2 20.4H1.8L12 2.6Zm-1.2 6.6.4 5.4h1.6l.4-5.4h-2.4Zm1.2 7a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z')
		]
	},
	clock: {
		viewBox: '0 0 24 24',
		sw: 2,
		paths: [F('M12 2.7a9.3 9.3 0 1 1 0 18.6 9.3 9.3 0 0 1 0-18.6Zm-1 3.1v7l5.3 3.1 1-1.7-4.3-2.5V5.8h-2Z')]
	},
	chevronLeft: { viewBox: '0 0 24 24', sw: 2, paths: [F('M15 2.9l3.3 3.3L12.5 12l5.8 5.8-3.3 3.3L5.9 12 15 2.9Z')] },
	chevronRight: { viewBox: '0 0 24 24', sw: 2, paths: [F('M9 2.9 5.7 6.2 11.5 12l-5.8 5.8L9 21.1 18.1 12 9 2.9Z')] },
	clipboard: {
		viewBox: '0 0 24 24',
		sw: 2,
		paths: [
			F('M4.8 4.6h14.4V21.4H4.8V4.6Zm2.8 5.4v1.8h8.8V10H7.6Zm0 3.8v1.8h8.8v-1.8H7.6Zm0 3.8v1.8h5.4v-1.8H7.6Z'),
			F('M9.2 2.4h5.6v4.4H9.2Z')
		]
	},
	copy: {
		viewBox: '0 0 24 24',
		sw: 2,
		paths: [F('M3.6 3.2h11.6v3H6.6v8.6h-3V3.2Z'), F('M8.4 8.2h12V20.8h-12V8.2Z')]
	},
	cart: {
		viewBox: '0 0 24 24',
		sw: 2,
		paths: [
			F('M2.6 3.4h3.8l.5 2.4h14.5l-2.1 9.3H7.6L5.5 5.6h-2.9V3.4Z'),
			F('M9.4 17.9a2 2 0 1 1 0 4 2 2 0 0 1 0-4Zm7.6 0a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z')
		]
	},
	// Plan slot: ring-bound week page with two filled day blocks.
	calendar: {
		viewBox: '0 0 24 24',
		sw: 2,
		paths: [
			F('M4.2 5.2h15.6V21H4.2V5.2Zm2.4 4.6v8.8h10.8V9.8H6.6Zm1.7 1.7h2.4v2.4H8.3Zm5 0h2.4v2.4h-2.4Zm-5 4h2.4v2.4H8.3Z'),
			F('M7.1 2.6h2.4v3.6H7.1Zm7.4 0h2.4v3.6h-2.4Z')
		]
	},
	home: {
		viewBox: '0 0 24 24',
		sw: 2,
		paths: [F('M12 2.7 21.8 11.2h-2v9.9H4.2V11.2h-2L12 2.7Zm-1.7 9.3v6.2h3.4V12h-3.4Z')]
	},
	// Slatted produce crate: inset lid band + two vertical slats.
	box: {
		viewBox: '0 0 24 24',
		sw: 2,
		paths: [
			F('M3.8 5.2h16.4v15.6H3.8V5.2Zm2 2v1.6h12.4V7.2H5.8Zm2.6 3.8v7.6h1.6V11Zm5.6 0v7.6h1.6V11Z')
		]
	},
	book: {
		viewBox: '0 0 24 24',
		sw: 2,
		paths: [
			F('M2.9 4.9c2.7-.9 5.6-.8 8.1.5v14.2c-2.5-1.3-5.4-1.4-8.1-.5V4.9Zm2 3.2v1.6c1.4-.2 2.9-.1 4.2.3V8.4c-1.3-.4-2.8-.5-4.2-.3Z'),
			F('M21.1 4.9c-2.7-.9-5.6-.8-8.1.5v14.2c2.5-1.3 5.4-1.4 8.1-.5V4.9Zm-2 3.2c-1.4-.2-2.9-.1-4.2.3v1.6c1.3-.4 2.8-.5 4.2-.3V8.1Z')
		]
	},
	// Mixer sliders with carved-out knob centers.
	settings: {
		viewBox: '0 0 24 24',
		sw: 2,
		paths: [
			F('M3.4 6.6h2.2v2H3.4Zm9 0h8.2v2h-8.2Z'),
			F('M8.9 4.2a3.4 3.4 0 1 1 0 6.8 3.4 3.4 0 0 1 0-6.8Zm0 2.1a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6Z'),
			F('M3.4 15.4h8.2v2H3.4Zm15 0h2.2v2h-2.2Z'),
			F('M15.1 13a3.4 3.4 0 1 1 0 6.8 3.4 3.4 0 0 1 0-6.8Zm0 2.1a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6Z')
		]
	},
	chefHat: {
		viewBox: '0 0 24 24',
		sw: 2,
		paths: [
			F('M12 2.9c-2 0-3.7 1.1-4.5 2.7-2.6.2-4.6 2.3-4.6 4.8 0 2 1.3 3.8 3.1 4.5v6.2h12v-6.2c1.8-.7 3.1-2.5 3.1-4.5 0-2.5-2-4.6-4.6-4.8-.8-1.6-2.5-2.7-4.5-2.7ZM7 16.5v1.7h10v-1.7H7Z')
		]
	},
	cutlery: {
		viewBox: '0 0 24 24',
		sw: 2,
		paths: [
			F('M5.8 2.9h5.8v5c0 1.5-.9 2.7-2.1 3.1v10.1H7.9V11c-1.2-.4-2.1-1.6-2.1-3.1v-5Zm1.7 1.5v3.2h.9V4.4h-.9Zm2.4 0v3.2h.9V4.4h-.9Z'),
			F('M18.6 2.9c-2.7 1.5-4.2 4.3-4.2 7.5v3.6h3v7.1h2.4v-7.1h-1.2V2.9Z')
		]
	},
	// Shopping slot: tote bag with carved rim scallop.
	basket: {
		viewBox: '0 0 24 24',
		sw: 2,
		paths: [
			F('M12 2.9c2.4 0 4.3 1.9 4.3 4.3v1h-2v-1a2.3 2.3 0 0 0-4.6 0v1h-2v-1c0-2.4 1.9-4.3 4.3-4.3Z'),
			F('M4.4 8.2h15.2l-1.3 12.9H5.7L4.4 8.2Zm5.3 2.9a2.3 2.3 0 0 0 4.6 0h2a4.3 4.3 0 0 1-8.6 0h2Z')
		]
	},
	// Stock slot: pantry shelf with a jar and a bottle standing on it.
	jar: {
		viewBox: '0 0 24 24',
		sw: 2,
		paths: [
			F('M3.2 18.8h17.6v2.2H3.2Z'),
			F('M6.6 6.7h3.8v1.7H6.6Zm-.4 2.1h4.6v10H6.2v-10Zm1.1 2.2v1.4h2.4V11H7.3Z'),
			F('M14.4 4.6h2.2v2.9c1.1.6 1.8 1.8 1.8 3.1v8.2h-5.8v-8.2c0-1.3.7-2.5 1.8-3.1V4.6Z')
		]
	},
	// Body paths first; the LAST TWO are steam (Spinner contract) — puff arcs.
	pot: {
		viewBox: '0 0 24 24',
		sw: 2,
		paths: [
			F('M4.2 10.2h15.6v5.8a4.6 4.6 0 0 1-4.6 4.6H8.8a4.6 4.6 0 0 1-4.6-4.6v-5.8Zm2.4 2.2V14h10.8v-1.6H6.6Z'),
			F('M1.8 11.3h2v2.4h-2Zm18.4 0h2v2.4h-2Z'),
			'M9.1 8.1a1.8 1.8 0 1 1 1.5-2.9',
			'M14.6 8.1a1.8 1.8 0 1 1 1.5-2.9'
		]
	},
	pan: {
		viewBox: '0 0 24 24',
		sw: 2,
		paths: [
			F('M9.5 4.6a7.4 7.4 0 1 1 0 14.8 7.4 7.4 0 0 1 0-14.8Zm0 5.3a2.1 2.1 0 1 0 0 4.2 2.1 2.1 0 0 0 0-4.2Z'),
			F('M16.3 10.8h5.5v2.4h-5.5Z')
		]
	},
	spoon: {
		viewBox: '0 0 24 24',
		sw: 2,
		paths: [
			F('M12 2.6c2 0 3.6 2 3.6 4.5 0 2.2-1.2 4-2.7 4.4v9a.9.9 0 0 1-1.8 0v-9C9.6 11.1 8.4 9.3 8.4 7.1c0-2.5 1.6-4.5 3.6-4.5Zm-1.2 2.2c-.4.6-.6 1.4-.6 2.2h1c0-.6.2-1.2.5-1.7l-.9-.5Z')
		]
	},
	carrot: {
		viewBox: '0 0 24 24',
		sw: 2,
		paths: [
			F('M3.2 20.8c.5-4.3 2.3-9.6 5.7-12.8l7.1 7.1c-3.2 3.4-8.5 5.2-12.8 5.7Zm5.5-8.2 1.3 1.3-1.4 1.4-1.3-1.3 1.4-1.4Z'),
			F('M16.9 6.9c.2-2.1 1.6-3.9 3.7-4.9.4 2.3-.7 4.4-2.7 5.4l-1-.5Z'),
			F('M15.5 5.5c-1.6-1.3-2.4-3.3-2.1-5.6 2.3.5 3.9 2.1 4.3 4.3l-2.2 1.3Z')
		]
	},
	// Fried egg, top view: wobbly white with a carved yolk ring.
	egg: {
		viewBox: '0 0 24 24',
		sw: 2,
		paths: [
			F('M12.3 2.9c2.6-.3 4.9.8 6.3 2.7 1.5 2 1.9 4.7 1 7.1-.8 2.2-.6 4.8-2.4 6.3-1.7 1.5-4.3 1.6-6.5 1.1-2.3-.5-4.5-1.7-5.6-3.8-1.1-2-.9-4.5.1-6.6.9-2 1.4-4.3 3.2-5.6 1.1-.8 2.5-1.1 3.9-1.2Zm-.3 6.1a3.2 3.2 0 1 0 0 6.4 3.2 3.2 0 0 0 0-6.4Zm0 1.7a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Z')
		]
	},
	flame: {
		viewBox: '0 0 24 24',
		sw: 2,
		paths: [
			F('M12 2.6c.5 3.1 3.8 5 5 8.2 1.2 3.1-.2 6.6-2.8 8.4a4.7 4.7 0 0 1-4.4 0C7.2 17.4 5.8 13.9 7 10.8c1.2-3.2 4.5-5.1 5-8.2Zm0 9.8c-1.3 1.6-2.6 2.4-2.6 3.9a2.6 2.6 0 0 0 5.2 0c0-1.5-1.3-2.3-2.6-3.9Z')
		]
	},
	snowflake: {
		viewBox: '0 0 24 24',
		sw: 2,
		paths: [
			F('M10.9 2.4h2.2v19.2h-2.2Z'),
			F('M4.2 4.8 20.9 14.4l-1.1 1.9L3.1 6.7l1.1-1.9Z'),
			F('M19.8 4.8l1.1 1.9-16.7 9.6-1.1-1.9 16.7-9.6Z')
		]
	},
	leaf: {
		viewBox: '0 0 24 24',
		sw: 2,
		paths: [
			F('M4.4 19.6C4.4 9.9 11 4.1 20.5 3.5c.7 9.5-5.1 16.1-14.8 16.1H4.4Zm2.5-2.2c2.3-5.2 5.8-9 10.3-11.4l.5.9c-4.3 2.3-7.6 5.9-9.8 10.9l-1-.4Z')
		]
	},
	plate: {
		viewBox: '0 0 24 24',
		sw: 2,
		paths: [F('M12 2.8a9.2 9.2 0 1 1 0 18.4 9.2 9.2 0 0 1 0-18.4Zm0 4.4a4.8 4.8 0 1 0 0 9.6 4.8 4.8 0 0 0 0-9.6Z')]
	},
	bread: {
		viewBox: '0 0 24 24',
		sw: 2,
		paths: [
			F('M4 12.1c0-2.7 2.1-4.8 4.7-4.8h6.6c2.6 0 4.7 2.1 4.7 4.8 0 1.3-.5 2.5-1.4 3.3v5.2H5.4v-5.2c-.9-.8-1.4-2-1.4-3.3Zm4.6-1.9v3.4h1.4v-3.4H8.6Zm5.4 0v3.4h1.4v-3.4H14Z')
		]
	},
	apple: {
		viewBox: '0 0 24 24',
		sw: 2,
		paths: [
			F('M12 7.1c1.2-1.1 2.9-1.5 4.4-1 2.8.9 3.8 3.8 3.2 6.7-.8 3.5-3 6.6-5.1 7.7-.9.5-1.8.3-2.5-.2-.7.5-1.6.7-2.5.2-2.1-1.1-4.3-4.2-5.1-7.7-.6-2.9.4-5.8 3.2-6.7 1.5-.5 3.2-.1 4.4 1Zm-4.3 3.2c-.6 1-.8 2.2-.5 3.5l1.5-.3c-.2-1 0-1.9.4-2.6l-1.4-.6Z'),
			F('M11.2 7.3c-.1-1.8.6-3.2 2-4.3l1 1.3c-1 .8-1.5 1.8-1.4 3h-1.6Z')
		]
	}
} as const satisfies Record<IconName, IconDef>;
