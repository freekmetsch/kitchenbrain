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

const paletteName = new Map<BeatPalette, string>([
	[PALETTES[0], 'amber'],
	[PALETTES[1], 'sky'],
	[PALETTES[2], 'emerald'],
	[PALETTES[3], 'rose'],
	[PALETTES[4], 'violet'],
	[PALETTES[5], 'orange']
]);

function blendedPalette(sources: BeatPalette[], occupied: BeatPalette[]): BeatPalette {
	const names = [...new Set(sources.map((palette) => paletteName.get(palette)))].filter(Boolean).sort();
	const key = names.join('+');
	const preferred =
		key === 'amber+sky'
			? PALETTES[2]
			: key === 'amber+rose'
				? PALETTES[5]
				: names.length >= 3
					? PALETTES[4]
					: undefined;
	if (preferred && !sources.includes(preferred)) return preferred;
	return (
		PALETTES.find((palette) => !sources.includes(palette) && !occupied.includes(palette)) ??
		PALETTES.find((palette) => !sources.includes(palette)) ??
		PALETTES[0]
	);
}

export type CookPaletteAssignment = {
	result: BeatPalette;
	sources: BeatPalette[];
};

/** Assign colours in graph order so a merged stream keeps its mixed colour. */
export function cookPaletteGraph(
	streams: { id: string }[],
	steps: { stream_id: string; merges_from?: string[] }[]
): CookPaletteAssignment[] {
	const current = streamPalette(streams);
	return steps.map((step) => {
		const sources = (step.merges_from ?? []).map((id) => current[id]).filter(Boolean);
		if (sources.length >= 2) current[step.stream_id] = blendedPalette(sources, Object.values(current));
		return { result: current[step.stream_id] ?? PALETTES[0], sources };
	});
}

export function fmtClock(sec: number): string {
	const m = Math.floor(sec / 60);
	const s = sec % 60;
	return `${m}:${s.toString().padStart(2, '0')}`;
}
