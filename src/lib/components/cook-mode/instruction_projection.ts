export type InstructionSegment = {
	kind: 'text' | 'action';
	text: string;
};

export type InstructionLine = {
	segments: InstructionSegment[];
};

const LEADING_CONNECTORS = [
	'then',
	'next',
	'now',
	'meanwhile',
	'daarna',
	'vervolgens',
	'nu',
	'ondertussen'
].join('|');

const LEADING_ACTION = new RegExp(
	`^(\\s*)((?:(?:${LEADING_CONNECTORS})\\b[\\s,;:–—-]*))?(\\p{L}[\\p{L}\\p{M}'’–-]*)`,
	'iu'
);

export function splitSentences(value: string): string[] {
	if (!value) return [];
	const sentences = value.match(/[^.!?]*[.!?]+\s*|[^.!?]+$/gu)?.filter(Boolean) ?? [value];
	return sentences.join('') === value ? sentences : [value];
}

export function projectSentence(value: string): InstructionSegment[] {
	const match = LEADING_ACTION.exec(value);
	if (!match) return [{ kind: 'text', text: value }];

	const segments: InstructionSegment[] = [];
	const prefix = `${match[1]}${match[2] ?? ''}`;
	if (prefix) segments.push({ kind: 'text', text: prefix });
	segments.push({ kind: 'action', text: match[3] });
	const remainder = value.slice(match[0].length);
	if (remainder) segments.push({ kind: 'text', text: remainder });
	return segments;
}

export function projectInstruction(value: string): InstructionLine[] {
	return splitSentences(value).map((sentence) => ({ segments: projectSentence(sentence) }));
}
