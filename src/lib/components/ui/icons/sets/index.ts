// Icon set registry — every set covers the full IconName inventory (enforced
// per-set via `satisfies Record<IconName, IconDef>`), so the active set can be
// swapped app-wide without touching call sites. Pick one at /design/icons.
//
// The five candidates are designed from a blank page: each has its own
// construction (carved fills / one line / pixels / collage / knockout coins)
// and chooses its own metaphors — none inherit drawings from Classic.

import type { IconDef, IconName } from '../paths';
import { ICONS as CLASSIC } from '../paths';
import { LINOCUT } from './linocut';
import { THREAD } from './thread';
import { BITMAP } from './bitmap';
import { CUTOUT } from './cutout';
import { COIN_SET } from './coin';

export interface IconSetMeta {
	name: string;
	tagline: string;
	icons: Record<IconName, IconDef>;
}

const SETS = {
	classic: {
		name: 'Classic',
		tagline: 'The current set — heroicons-matched outlines.',
		icons: CLASSIC
	},
	linocut: {
		name: 'Linocut',
		tagline: 'Hand-carved stamps: solid silhouettes, detail cut out in white.',
		icons: LINOCUT
	},
	thread: {
		name: 'Thread',
		tagline: 'Every icon one unbroken line, loops and all — drawn without lifting the pen.',
		icons: THREAD
	},
	bitmap: {
		name: 'Bitmap',
		tagline: '12×12 pixel kitchen — pure 8-bit squares.',
		icons: BITMAP
	},
	cutout: {
		name: 'Cutout',
		tagline: 'Paper collage: layered flat shapes in two tones, no outlines.',
		icons: CUTOUT
	},
	coin: {
		name: 'Coin',
		tagline: 'Stamped tokens: glyphs knocked out of solid discs.',
		icons: COIN_SET
	}
} as const satisfies Record<string, IconSetMeta>;

export type IconSetId = keyof typeof SETS;

// Widened view (icons: Record<IconName, IconDef>) so consumers see optional
// fields like `cap` even on sets that don't use them.
export const ICON_SETS: Record<IconSetId, IconSetMeta> = SETS;

export const DEFAULT_ICON_SET: IconSetId = 'classic';

export const isIconSetId = (v: unknown): v is IconSetId =>
	typeof v === 'string' && v in SETS;
