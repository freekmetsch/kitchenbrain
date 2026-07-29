import { describe, expect, it } from 'vitest';
import { parseHandsBusyCommand } from './hands_busy_voice';

describe('hands-busy one-shot commands', () => {
	it.each([
		['read next', 'next'],
		['volgende stap', 'next'],
		['repeat that', 'repeat'],
		['herhaal', 'repeat'],
		['what now', 'current'],
		['wat nu', 'current'],
		['start the timer', 'timer'],
		['start de timer', 'timer']
	] as const)('maps %s to %s', (transcript, expected) => {
		expect(parseHandsBusyCommand(transcript)).toBe(expected);
	});

	it('does not invent a command from unrelated speech', () => {
		expect(parseHandsBusyCommand('the children are home')).toBe('unknown');
	});
});
