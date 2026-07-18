// Thread — single-line set. Each glyph is (as near as possible) ONE unbroken
// stroke, the way you'd draw it without lifting the pen: loops become knobs,
// retraced segments vanish into themselves, ends stay visibly open. Small
// satellite marks (a dot, a tick) are allowed where physics demands.
// New metaphors: recipes = balloon whisk, settings = looped sliders,
// planning = week frame with a check, steam = pen curls.
// Convention: `pot`'s LAST TWO paths are the steam curls (Spinner contract).

import type { IconDef, IconName } from '../paths';

export const THREAD = {
	// One stroke: down, retrace to centre, out both arms.
	plus: { viewBox: '0 0 24 24', sw: 1.6, paths: ['M12 4.4V19.6 12H4.4h15.2'] },
	minus: { viewBox: '0 0 24 24', sw: 1.6, paths: ['M4.8 12h14.4'] },
	check: { viewBox: '0 0 24 24', sw: 1.6, paths: ['m4.8 13.1 4.3 4.5L19.2 6.4'] },
	x: { viewBox: '0 0 24 24', sw: 1.6, paths: ['M5.4 5.4 18.6 18.6 12 12l6.6-6.6L5.4 18.6'] },
	trash: {
		viewBox: '0 0 24 24',
		sw: 1.6,
		paths: [
			'M4.4 6.4h3.9l1.1-2.1h5.2l1.1 2.1h3.9l-1.3 13.1a1.6 1.6 0 0 1-1.6 1.4H8.3a1.6 1.6 0 0 1-1.6-1.4L5.4 6.4',
			'M10.1 10.3v6M13.9 10.3v6'
		]
	},
	warn: {
		viewBox: '0 0 24 24',
		sw: 1.6,
		paths: ['M12 4.1 20.6 19H3.4L12 4.1', 'M12 9.7v4.4', 'M12 16.8v.01']
	},
	clock: {
		viewBox: '0 0 24 24',
		sw: 1.6,
		paths: ['M12 4.3a7.7 7.7 0 1 0 .01 0', 'M12 7.5V12l3.5 2.1']
	},
	chevronLeft: { viewBox: '0 0 24 24', sw: 1.6, paths: ['M14.3 5.5 7.8 12l6.5 6.5'] },
	chevronRight: { viewBox: '0 0 24 24', sw: 1.6, paths: ['M9.7 5.5 16.2 12l-6.5 6.5'] },
	// One stroke: left clip base, over the clip bump, around the whole board.
	clipboard: {
		viewBox: '0 0 24 24',
		sw: 1.6,
		paths: [
			'M9 4.7a3 3 0 0 1 6 0h2.6A1.4 1.4 0 0 1 19 6.1v13.8a1.4 1.4 0 0 1-1.4 1.4H6.4A1.4 1.4 0 0 1 5 19.9V6.1a1.4 1.4 0 0 1 1.4-1.4H9',
			'M8.6 11.2h6.8M8.6 14.8h4.6'
		]
	},
	copy: {
		viewBox: '0 0 24 24',
		sw: 1.6,
		paths: ['M9.6 9.6h9.6v9.6H9.6V9.6', 'M5.2 14.6V6.4a1.2 1.2 0 0 1 1.2-1.2h8.2']
	},
	cart: {
		viewBox: '0 0 24 24',
		sw: 1.6,
		paths: [
			'M3.2 4.6h2.3l2.4 10.9a1.4 1.4 0 0 0 1.4 1.1h8a1.4 1.4 0 0 0 1.4-1.1l1.6-7.7H6.4',
			'M9.6 18.6a1.3 1.3 0 1 0 .01 0Zm7.4 0a1.3 1.3 0 1 0 .01 0Z'
		]
	},
	// Plan slot: week frame drawn in one sweep (ends by underlining the header),
	// pins, and a satellite check for "planned".
	calendar: {
		viewBox: '0 0 24 24',
		sw: 1.6,
		paths: [
			'M4.6 9.9V7.3a1.7 1.7 0 0 1 1.7-1.7h11.4a1.7 1.7 0 0 1 1.7 1.7v11.2a1.7 1.7 0 0 1-1.7 1.7H6.3a1.7 1.7 0 0 1-1.7-1.7V9.9h14.8',
			'M8.5 3.5v3.2M15.5 3.5v3.2',
			'm9.3 14.3 1.9 1.9 3.5-4'
		]
	},
	// One stroke: floor → roof → floor, sweeping through the door arch.
	home: {
		viewBox: '0 0 24 24',
		sw: 1.6,
		paths: ['M4.8 20.2V10.5L12 4.3l7.2 6.2v9.7h-4.7v-3.7a2.5 2.5 0 0 0-5 0v3.7H4.8']
	},
	// One stroke (single pen-lift): outline, top seams, drop the front seam.
	box: {
		viewBox: '0 0 24 24',
		sw: 1.6,
		paths: ['M4.6 8.4 12 4.4l7.4 4v7.2L12 19.6l-7.4-4V8.4l7.4 4 7.4-4m-7.4 4v7.2']
	},
	// One stroke: around both pages, ending down the spine.
	book: {
		viewBox: '0 0 24 24',
		sw: 1.6,
		paths: [
			'M12 19.4c-1.5-1-3.3-1.5-5.2-1.5-1.2 0-2.3.2-3.3.6V5.3c1-.4 2.1-.6 3.3-.6 1.9 0 3.7.6 5.2 1.6 1.5-1 3.3-1.6 5.2-1.6 1.2 0 2.3.2 3.3.6v13.2c-1-.4-2.1-.6-3.3-.6-1.9 0-3.7.5-5.2 1.5V6.3'
		]
	},
	// Sliders whose knobs are loops in the line itself.
	settings: {
		viewBox: '0 0 24 24',
		sw: 1.6,
		paths: [
			'M4.6 8h5.2a1.8 1.8 0 1 0 3.6 0 1.8 1.8 0 0 0-3.6 0m3.6 0h6',
			'M4.6 16h8.2a1.8 1.8 0 1 0 3.6 0 1.8 1.8 0 0 0-3.6 0m3.6 0h3'
		]
	},
	// Recipes slot: balloon whisk — handle, balloon, and two inner wires.
	chefHat: {
		viewBox: '0 0 24 24',
		sw: 1.6,
		paths: [
			'M12 2.8v3.4c-3 .2-5.3 2.8-5.3 6 0 2.3 1.2 4.3 3 5.2l.5 3.8h3.6l.5-3.8c1.8-.9 3-2.9 3-5.2 0-3.2-2.3-5.8-5.3-6',
			'M10 17.2c-.8-3.3-.7-7.3.7-10.6M14 17.2c.8-3.3.7-7.3-.7-10.6'
		]
	},
	cutlery: {
		viewBox: '0 0 24 24',
		sw: 1.6,
		paths: [
			'M6.6 3.6v4.3a2.5 2.5 0 0 0 1.3 2.2l-.4 10.3h1.8L8.9 10.1a2.5 2.5 0 0 0 1.3-2.2V3.6m-1.6.2v4',
			'M16.4 3.4c-1.7 0-3.1 1.9-3.1 4.2 0 1.9.9 3.4 2.2 3.9l-.4 8.9h2.6l-.4-8.9c1.3-.5 2.2-2 2.2-3.9 0-2.3-1.4-4.2-3.1-4.2'
		]
	},
	// Shopping slot: market basket, handle drawn as its own arc.
	basket: {
		viewBox: '0 0 24 24',
		sw: 1.6,
		paths: [
			'M6.9 9.2c0-3 2.2-5.4 5.1-5.4s5.1 2.4 5.1 5.4',
			'M3.9 9.4h16.2l-1.5 8.7a1.9 1.9 0 0 1-1.9 1.6H7.3a1.9 1.9 0 0 1-1.9-1.6L3.9 9.4',
			'M9.7 12.7l.3 3.4M14.3 12.7l-.3 3.4'
		]
	},
	// Stock slot: mason jar — lid loop first, then the glass in one sweep.
	jar: {
		viewBox: '0 0 24 24',
		sw: 1.6,
		paths: [
			'M8.1 6.3V3.7h7.8v2.6H8.1c-.7 1-1.6 2-1.6 3.4v7.5a3.4 3.4 0 0 0 3.4 3.4h4.2a3.4 3.4 0 0 0 3.4-3.4V9.7c0-1.4-.9-2.4-1.6-3.4',
			'M8.7 13.4h6.6'
		]
	},
	// Body paths first; the LAST TWO are steam (Spinner contract) — pen curls.
	pot: {
		viewBox: '0 0 24 24',
		sw: 1.6,
		paths: [
			'M2.9 10.5h18.2',
			'M5.4 10.5v5.8a3.6 3.6 0 0 0 3.6 3.6h6a3.6 3.6 0 0 0 3.6-3.6v-5.8',
			'M9.5 8.2C8.4 7.5 8.6 6 9.8 5.5c.9-.4 1.1-1.5.4-2.2',
			'M14.5 8.2c1.1-.7.9-2.2-.3-2.7-.9-.4-1.1-1.5-.4-2.2'
		]
	},
	// One stroke ending in a hanging-hole loop on the handle.
	pan: {
		viewBox: '0 0 24 24',
		sw: 1.6,
		paths: ['M15.9 12.3a6.6 6.6 0 1 0-.1 1.1', 'M15.9 12.3h3.4a1.4 1.4 0 1 1-1.2 2.2']
	},
	spoon: {
		viewBox: '0 0 24 24',
		sw: 1.6,
		paths: ['M12 21.2V11c-1.5-.4-2.6-2-2.6-4.1C9.4 4.6 10.6 3 12 3s2.6 1.6 2.6 3.9c0 2.1-1.1 3.7-2.6 4.1']
	},
	carrot: {
		viewBox: '0 0 24 24',
		sw: 1.6,
		paths: [
			'M3.6 20.4c.5-4 2.2-8.9 5.4-12l6.6 6.6c-3.1 3.2-8 4.9-12 5.4Z',
			'M15.8 8.2c-.2-2 .8-3.9 2.6-5.2m-2.6 5.2c2 .2 3.9-.8 5.2-2.6'
		]
	},
	// Egg with the shine drawn as a trailing inner arc.
	egg: {
		viewBox: '0 0 24 24',
		sw: 1.6,
		paths: [
			'M17.9 13.5c0 4-2.6 7-5.9 7s-5.9-3-5.9-7 2.6-9.8 5.9-9.8 5.9 5.8 5.9 9.8Z',
			'M9 12.4c.1-2.1.9-4.3 2.1-5.8'
		]
	},
	flame: {
		viewBox: '0 0 24 24',
		sw: 1.6,
		paths: [
			'M12 3.4c.6 2.9 3.7 4.7 4.8 7.7.9 2.6-.1 5.5-2.2 7.2-1.5 1.2-3.7 1.2-5.2 0-2.1-1.7-3.1-4.6-2.2-7.2 1.1-3 4.2-4.8 4.8-7.7Z',
			'M12 19.5c-1.4-.3-2.4-1.5-2.4-2.9 0-1.4 1-2.2 2.4-3.8 1.4 1.6 2.4 2.4 2.4 3.8 0 1.1-.7 2.1-1.6 2.6'
		]
	},
	// One stroke: all six arms without lifting the pen (retraces through centre).
	snowflake: {
		viewBox: '0 0 24 24',
		sw: 1.6,
		paths: ['M12 3v18L12 12 4.2 7.5l15.6 9L12 12l-7.8 4.5 15.6-9']
	},
	// One stroke: outline, then sweeps back as the vein.
	leaf: {
		viewBox: '0 0 24 24',
		sw: 1.6,
		paths: [
			'M4.8 19.2c0-8.9 6-14.3 15-15 .7 9-4.7 15-13.6 15H4.8c2.2-5.9 5.9-10.1 11.1-12.3'
		]
	},
	plate: {
		viewBox: '0 0 24 24',
		sw: 1.6,
		paths: ['M12 3.2a8.8 8.8 0 1 0 .01 0', 'M12 7.7a4.3 4.3 0 1 0 .01 0']
	},
	bread: {
		viewBox: '0 0 24 24',
		sw: 1.6,
		paths: [
			'M6.5 12.3c-1-.6-1.7-1.7-1.7-3 0-2 1.6-3.6 3.6-3.6h7.2c2 0 3.6 1.6 3.6 3.6 0 1.3-.7 2.4-1.7 3v6.5a1 1 0 0 1-1 1H7.5a1 1 0 0 1-1-1v-6.5',
			'M9.8 9.6l-.5 2.9M14.7 9.6l-.5 2.9'
		]
	},
	// One stroke that starts as the stem and never lifts.
	apple: {
		viewBox: '0 0 24 24',
		sw: 1.6,
		paths: [
			'M13.8 3.2c-1.2 1-1.8 2.3-1.8 4 1.2-1 2.8-1.4 4.2-.9 2.6.8 3.6 3.6 3 6.3-.7 3.3-2.7 6.2-4.7 7.3-.8.4-1.6.3-2.5-.3-.9.6-1.7.7-2.5.3-2-1.1-4-4-4.7-7.3-.6-2.7.4-5.5 3-6.3 1.4-.5 3-.1 4.2.9'
		]
	}
} as const satisfies Record<IconName, IconDef>;
