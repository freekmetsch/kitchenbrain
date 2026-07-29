export type HandsBusyCommand = 'next' | 'repeat' | 'current' | 'timer' | 'unknown';

function normalized(value: string): string {
	return value
		.normalize('NFKD')
		.toLocaleLowerCase('nl-NL')
		.replace(/[^\p{L}\p{N}]+/gu, ' ')
		.trim();
}

export function parseHandsBusyCommand(transcript: string): HandsBusyCommand {
	const value = normalized(transcript);
	if (
		/\b(read )?next( step)?\b/u.test(value) ||
		/\b(volgende|lees volgende|volgende stap)\b/u.test(value)
	) {
		return 'next';
	}
	if (/\b(repeat|say that again|herhaal|nog een keer)\b/u.test(value)) return 'repeat';
	if (/\b(what now|what next|wat nu|wat moet ik nu)\b/u.test(value)) return 'current';
	if (
		/\b(start|set|begin).*\btimer\b/u.test(value) ||
		/\b(start|zet).*\btimer\b/u.test(value)
	) {
		return 'timer';
	}
	return 'unknown';
}
