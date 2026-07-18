// Coin — stamped-token set. Every glyph is knocked out of a solid disc, like
// a pressed market token; interior details flip back to solid via even-odd
// nesting. Two shapes break the mold on purpose: `warn` is a triangle badge,
// and `pot` sits low so its steam dots can rise above the coin edge.
// Convention: `pot`'s LAST TWO paths are the steam dots (Spinner contract).

import type { IconDef, IconName } from '../paths';

// The standard coin blank; each glyph appends knockout subpaths after it.
const COIN = 'M12 2.7a9.3 9.3 0 1 1 0 18.6 9.3 9.3 0 0 1 0-18.6Z';
const F = (knock: string) => [{ d: COIN + knock, fill: true }] as const;

export const COIN_SET = {
	plus: { viewBox: '0 0 24 24', sw: 2, paths: F('M10.8 7.3h2.4v3.5h3.5v2.4h-3.5v3.5h-2.4v-3.5H7.3v-2.4h3.5V7.3Z') },
	minus: { viewBox: '0 0 24 24', sw: 2, paths: F('M7.3 10.8h9.4v2.4H7.3Z') },
	check: { viewBox: '0 0 24 24', sw: 2, paths: F('M10.7 16.4 6.7 12.4l1.7-1.7 2.3 2.3 5-5.4 1.7 1.6-6.7 7.2Z') },
	x: {
		viewBox: '0 0 24 24',
		sw: 2,
		paths: F('M12 10.3l2.7-2.7 1.7 1.7-2.7 2.7 2.7 2.7-1.7 1.7-2.7-2.7-2.7 2.7-1.7-1.7 2.7-2.7-2.7-2.7 1.7-1.7 2.7 2.7Z')
	},
	trash: {
		viewBox: '0 0 24 24',
		sw: 2,
		paths: F('M10.6 6h2.8l.4.9h2.4v1.6H7.8V6.9h2.4l.4-.9ZM8.5 9.6h7l-.6 7.5a1 1 0 0 1-1 .9h-3.8a1 1 0 0 1-1-.9L8.5 9.6Z')
	},
	// Triangle badge instead of a disc — hazard reads as its own shape.
	warn: {
		viewBox: '0 0 24 24',
		sw: 2,
		paths: [
			{
				d: 'M12 2.4c.5 0 1 .3 1.3.8l8.6 15c.6 1-.2 2.3-1.3 2.3H3.4c-1.1 0-1.9-1.3-1.3-2.3l8.6-15c.3-.5.8-.8 1.3-.8Zm-1.1 6.4.4 5.6h1.4l.4-5.6h-2.2Zm1.1 7.2a1.4 1.4 0 1 0 0 2.8 1.4 1.4 0 0 0 0-2.8Z',
				fill: true
			}
		]
	},
	clock: { viewBox: '0 0 24 24', sw: 2, paths: F('M11 6.8h2v5.7l3.8 2.2-1 1.7-4.8-2.8V6.8Z') },
	chevronLeft: { viewBox: '0 0 24 24', sw: 2, paths: F('M13.2 7.2l1.7 1.6-3.2 3.2 3.2 3.2-1.7 1.6-4.8-4.8 4.8-4.8Z') },
	chevronRight: { viewBox: '0 0 24 24', sw: 2, paths: F('M10.8 7.2 9.1 8.8l3.2 3.2-3.2 3.2 1.7 1.6 4.8-4.8-4.8-4.8Z') },
	clipboard: {
		viewBox: '0 0 24 24',
		sw: 2,
		paths: F('M8.2 6.6h7.6V18H8.2V6.6Zm2-1.4h3.6v2.8h-3.6V5.2Zm-.4 4.8v1.4h4.8V10H9.8Zm0 3.2v1.4h3.2v-1.4H9.8Z')
	},
	copy: { viewBox: '0 0 24 24', sw: 2, paths: F('M10.4 10.4h6v6h-6v-6ZM7.6 13V7.6H13v1.8H9.4V13H7.6Z') },
	cart: {
		viewBox: '0 0 24 24',
		sw: 2,
		paths: F('M6.2 6.8h2.1l.4 1.7h9.1l-1.4 5.5H9.2L7.7 8.4h-1.5V6.8Zm4 8.6a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4Zm5 0a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4Z')
	},
	// Plan slot: week page with header band and a planned-day block.
	calendar: {
		viewBox: '0 0 24 24',
		sw: 2,
		paths: F('M7.4 7h9.2v10H7.4V7Zm0 0v2.4h9.2V7H7.4Zm1.5 4v2h2v-2h-2Zm4.2 0v2h2v-2h-2Z')
	},
	home: { viewBox: '0 0 24 24', sw: 2, paths: F('M12 6.2l5.8 5h-1.3v6.2H7.5V11.2H6.2l5.8-5Zm-1.3 7v4.2h2.6v-4.2h-2.6Z') },
	box: { viewBox: '0 0 24 24', sw: 2, paths: F('M7 7.6h10v9.2H7V7.6Zm1.4 1.4v1.2h7.2V9Zm0 3.2v1.2h7.2v-1.2Z') },
	book: {
		viewBox: '0 0 24 24',
		sw: 2,
		paths: F(
			'M12 7.3c-1-.7-2.2-1-3.5-1-.8 0-1.6.1-2.3.4v9.7c.7-.3 1.5-.4 2.3-.4 1.3 0 2.5.3 3.5 1 1-.7 2.2-1 3.5-1 .8 0 1.6.1 2.3.4V6.7c-.7-.3-1.5-.4-2.3-.4-1.3 0-2.5.3-3.5 1Zm-.6 1.5v7.4h1.2V8.8h-1.2Z'
		)
	},
	settings: {
		viewBox: '0 0 24 24',
		sw: 2,
		paths: F(
			'M12 8.6a3.4 3.4 0 1 1 0 6.8 3.4 3.4 0 0 1 0-6.8Zm0 2.3a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2ZM11.1 5.9h1.8v2.7h-1.8V5.9Zm0 9.5h1.8v2.7h-1.8v-2.7ZM5.9 11.1h2.7v1.8H5.9v-1.8Zm9.5 0h2.7v1.8h-2.7v-1.8Z'
		)
	},
	chefHat: {
		viewBox: '0 0 24 24',
		sw: 2,
		paths: F(
			'M12 5.8c-1.2 0-2.3.6-2.8 1.6-1.6.1-2.9 1.4-2.9 3 0 1.3.8 2.4 1.9 2.8v4h7.6v-4c1.1-.4 1.9-1.5 1.9-2.8 0-1.6-1.3-2.9-2.9-3-.5-1-1.6-1.6-2.8-1.6Zm-3.4 8.6v1.1h6.8v-1.1H8.6Z'
		)
	},
	cutlery: {
		viewBox: '0 0 24 24',
		sw: 2,
		paths: F(
			'M8.2 6.6h1v3h.6v-3h1v3.8c0 .6-.3 1.1-.8 1.4v5.6H9v-5.6c-.5-.3-.8-.8-.8-1.4V6.6Zm7.8 0v10.8h-1.2v-4.9h-1.2v-1.9c0-1.7.9-3.2 2.4-4Z'
		)
	},
	// Shopping slot: woven basket with ribs.
	basket: {
		viewBox: '0 0 24 24',
		sw: 2,
		paths: F(
			'M6.6 9.8h10.8l-1 6.2a1.2 1.2 0 0 1-1.2 1H8.8a1.2 1.2 0 0 1-1.2-1l-1-6.2Zm3.2-1.4c0-1.6 1-2.8 2.2-2.8s2.2 1.2 2.2 2.8h-1.4c0-.9-.4-1.4-.8-1.4s-.8.5-.8 1.4H9.8Zm.3 3 .3 2.8h1.1l-.3-2.8h-1.1Zm3 0-.3 2.8h1.1l.3-2.8h-1.1Z'
		)
	},
	// Stock slot: labelled jar.
	jar: {
		viewBox: '0 0 24 24',
		sw: 2,
		paths: F(
			'M9 5.6h6v1.6H9V5.6Zm-.4 2.6h6.8c.6.7 1 1.5 1 2.5v3.6a2.7 2.7 0 0 1-2.7 2.7h-3.4a2.7 2.7 0 0 1-2.7-2.7v-3.6c0-1 .4-1.8 1-2.5Zm.8 3.2v2.6h5.2v-2.6H9.4Z'
		)
	},
	// Coin sits low; steam dots rise above the rim. LAST TWO paths are steam.
	pot: {
		viewBox: '0 0 24 24',
		sw: 2,
		paths: [
			{
				d: 'M12 5.4a8.2 8.2 0 1 1 0 16.4 8.2 8.2 0 0 1 0-16.4Zm-5.4 6v1.4h1.2v2a3 3 0 0 0 3 3h2.4a3 3 0 0 0 3-3v-2h1.2v-1.4H6.6Z',
				fill: true
			},
			{ d: 'M9.5 2.9v.01', sw: 2.4 },
			{ d: 'M14.5 2.9v.01', sw: 2.4 }
		]
	},
	pan: {
		viewBox: '0 0 24 24',
		sw: 2,
		paths: F('M10 8.6a3.9 3.9 0 1 1 0 7.8 3.9 3.9 0 0 1 0-7.8Zm0 2.4a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm4.5.2h3.4v1.6h-3.4v-1.6Z')
	},
	spoon: {
		viewBox: '0 0 24 24',
		sw: 2,
		paths: F('M12 6.2c1.3 0 2.3 1.3 2.3 2.9 0 1.4-.7 2.5-1.6 2.8v5.9h-1.4v-5.9c-.9-.3-1.6-1.4-1.6-2.8 0-1.6 1-2.9 2.3-2.9Z')
	},
	carrot: {
		viewBox: '0 0 24 24',
		sw: 2,
		paths: F(
			'M6.8 17.2c.3-2.7 1.4-5.8 3.4-7.8l4.4 4.4c-2 2-5.1 3.1-7.8 3.4Zm8.6-8.3c.1-1.3.9-2.4 2.1-3 .2 1.4-.4 2.7-1.5 3.4l-.6-.4Zm-1.5-.9c-.6-1.1-.5-2.5.3-3.6 1.1.7 1.6 2 1.4 3.3l-1.7.3Z'
		)
	},
	egg: { viewBox: '0 0 24 24', sw: 2, paths: F('M16 13.6c0 2.7-1.8 4.8-4 4.8s-4-2.1-4-4.8 1.8-6.6 4-6.6 4 3.9 4 6.6Z') },
	flame: {
		viewBox: '0 0 24 24',
		sw: 2,
		paths: F(
			'M12 5.8c.4 2 2.6 3.3 3.4 5.4.8 2.1-.1 4.5-1.9 5.7a2.9 2.9 0 0 1-3 0c-1.8-1.2-2.7-3.6-1.9-5.7.8-2.1 3-3.4 3.4-5.4Zm0 6.6c-.9 1-1.7 1.6-1.7 2.6a1.7 1.7 0 0 0 3.4 0c0-1-.8-1.6-1.7-2.6Z'
		)
	},
	// Frost sparkle knockout.
	snowflake: {
		viewBox: '0 0 24 24',
		sw: 2,
		paths: F('M12 5.8c.5 3 1.7 4.2 6.2 6.2-4.5 2-5.7 3.2-6.2 6.2-.5-3-1.7-4.2-6.2-6.2 4.5-2 5.7-3.2 6.2-6.2Z')
	},
	leaf: {
		viewBox: '0 0 24 24',
		sw: 2,
		paths: F('M7 16.8c0-6 4.1-9.6 10-10-.4 6-4 10-10 10Zm1.5-1.6c1.3-3.3 3.4-5.6 6.3-6.9-2.9.5-5.6 3-6.9 6.6l.6.3Z')
	},
	plate: {
		viewBox: '0 0 24 24',
		sw: 2,
		paths: F('M12 6.4a6.1 6.1 0 1 1 0 12.2 6.1 6.1 0 0 1 0-12.2Zm0 2.6a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z')
	},
	bread: {
		viewBox: '0 0 24 24',
		sw: 2,
		paths: F(
			'M7.4 12.2c0-1.9 1.5-3.4 3.4-3.4h2.4c1.9 0 3.4 1.5 3.4 3.4 0 .9-.4 1.7-1 2.3v2.7c0 .4-.3.8-.8.8H9.2c-.5 0-.8-.4-.8-.8v-2.7c-.6-.6-1-1.4-1-2.3Z'
		)
	},
	apple: {
		viewBox: '0 0 24 24',
		sw: 2,
		paths: F(
			'M12 8.6c.8-.7 1.9-1 2.9-.7 1.8.6 2.5 2.5 2.1 4.4-.5 2.3-2 4.3-3.3 5-.6.3-1.1.2-1.7-.1-.6.3-1.1.4-1.7.1-1.3-.7-2.8-2.7-3.3-5-.4-1.9.3-3.8 2.1-4.4 1-.3 2.1 0 2.9.7Zm-.5-.2c-.1-1.2.3-2.2 1.2-3l.8.9c-.6.6-.9 1.2-.9 2l-1.1.1Z'
		)
	}
} as const satisfies Record<IconName, IconDef>;
