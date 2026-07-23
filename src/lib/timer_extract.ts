// Timer extraction from saved recipe direction prose. This keeps ordinary
// cooking mode deterministic while retaining tap-to-start timer chips.
//
// Patterns: matches `\d+ min`, `\d+ minutes`, `\d+ uur`, etc., as long as
// the resulting duration is ≥ 30s (filters trivially short matches that
// don't deserve a timer button).

export type ExtractedTimer = { key: string; label: string; seconds: number };

const RE = /(\d+)\s*(uur|minuten?|min\.?|hours?|minutes?)/gi;

export function extractTimers(text: string): ExtractedTimer[] {
	const results: ExtractedTimer[] = [];
	let match: RegExpExecArray | null;
	const re = new RegExp(RE.source, RE.flags);
	while ((match = re.exec(text)) !== null) {
		const num = parseInt(match[1]);
		const unit = match[2].toLowerCase();
		const seconds = unit.startsWith('uur') || unit.startsWith('hour') ? num * 3600 : num * 60;
		if (seconds >= 30) {
			results.push({ key: `${text.slice(0, 20)}-${seconds}`, label: match[0], seconds });
		}
	}
	return results;
}
