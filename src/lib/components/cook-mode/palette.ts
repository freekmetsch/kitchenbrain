// Color palette for production cook-mode beat cards.
//
// CookModeRecipe carries `streams[]` and per-step `stream_id`. When the recipe
// has ≥2 streams, color by stream identity via streamPalette() so cards in the
// same stream share a hue (matches the V9-V1 shotgun reference). For
// single-stream recipes (or legacy rows without a streams field) we fall back
// to paletteFor(index) — cycling hues by step order for visual rhythm.

export type BeatPalette = {
	soft: string;   // tailwind bg- class for the horizontal tint behind the card
	bar: string;    // tailwind bg- class for the side color band + top bar
	border: string; // tailwind border- class for ingredient pills
	text: string;   // tailwind text- class for accents
};

export const PALETTES: BeatPalette[] = [
	{ soft: 'bg-amber-50',    bar: 'bg-amber-500',    border: 'border-amber-300',    text: 'text-amber-700' },
	{ soft: 'bg-sky-50',      bar: 'bg-sky-500',      border: 'border-sky-300',      text: 'text-sky-700' },
	{ soft: 'bg-emerald-50',  bar: 'bg-emerald-500',  border: 'border-emerald-300',  text: 'text-emerald-700' },
	{ soft: 'bg-rose-50',     bar: 'bg-rose-500',     border: 'border-rose-300',     text: 'text-rose-700' },
	{ soft: 'bg-violet-50',   bar: 'bg-violet-500',   border: 'border-violet-300',   text: 'text-violet-700' },
	{ soft: 'bg-orange-50',   bar: 'bg-orange-500',   border: 'border-orange-300',   text: 'text-orange-700' }
];

export function paletteFor(index: number): BeatPalette {
	return PALETTES[index % PALETTES.length];
}

// Map each stream to a stable palette by stream order. Cycles PALETTES if a
// recipe declares more streams than the palette has entries.
export function streamPalette(streams: { id: string }[]): Record<string, BeatPalette> {
	const map: Record<string, BeatPalette> = {};
	streams.forEach((s, i) => {
		map[s.id] = PALETTES[i % PALETTES.length];
	});
	return map;
}

export function fmtClock(sec: number): string {
	const m = Math.floor(sec / 60);
	const s = sec % 60;
	return `${m}:${s.toString().padStart(2, '0')}`;
}
