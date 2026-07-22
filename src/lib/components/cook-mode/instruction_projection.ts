export type InstructionSegment = {
	kind: 'text' | 'action' | 'ingredient';
	text: string;
};

export type InstructionLine = {
	segments: InstructionSegment[];
};

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function splitSentences(value: string): string[] {
	if (!value) return [];
	const sentences = value.match(/[^.!?]*[.!?]+\s*|[^.!?]+$/gu)?.filter(Boolean) ?? [value];
	return sentences.join('') === value ? sentences : [value];
}

export function segmentIngredients(value: string, ingredientNames: string[]): InstructionSegment[] {
	const candidates = ingredientNames
		.map((name) => name.trim())
		.filter(Boolean)
		.flatMap((name) => {
			const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(name)}(?![\\p{L}\\p{N}])`, 'giu');
			return [...value.matchAll(pattern)].map((match) => ({
				start: match.index ?? 0,
				end: (match.index ?? 0) + match[0].length
			}));
		})
		.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));

	const ranges: Array<{ start: number; end: number }> = [];
	let occupiedUntil = -1;
	for (const candidate of candidates) {
		if (candidate.start < occupiedUntil) continue;
		ranges.push(candidate);
		occupiedUntil = candidate.end;
	}
	if (!ranges.length) return [{ kind: 'text', text: value }];

	const segments: InstructionSegment[] = [];
	let cursor = 0;
	for (const range of ranges) {
		if (range.start > cursor) segments.push({ kind: 'text', text: value.slice(cursor, range.start) });
		segments.push({ kind: 'ingredient', text: value.slice(range.start, range.end) });
		cursor = range.end;
	}
	if (cursor < value.length) segments.push({ kind: 'text', text: value.slice(cursor) });
	return segments;
}

export function projectGoal(value: string): InstructionSegment[] {
	const separator = value.indexOf(' — ');
	if (separator < 1) return [{ kind: 'text', text: value }];
	return [
		{ kind: 'action', text: value.slice(0, separator) },
		{ kind: 'text', text: value.slice(separator) }
	];
}

export function projectBody(value: string, ingredientNames: string[]): InstructionLine[] {
	return splitSentences(value).map((sentence) => ({ segments: segmentIngredients(sentence, ingredientNames) }));
}
