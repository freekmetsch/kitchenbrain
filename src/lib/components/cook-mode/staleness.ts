// Cook-mode cached-payload staleness predicate.
//
// `cookModeJson` is generated once per recipe by `lib/server/ai/cook_mode.ts`
// and cached on the recipes row. When the schema shape evolves (pre-DAG → DAG
// → bench-sheet → action-led + timer pill labels), every existing cached row
// is "stale" relative to the new shape and needs a one-shot force-regen on
// next open. This module collects every such version check in one predicate
// so future schema bumps add a single clause.
//
// The regex + violatesActionState helpers also gate the AI's emit at
// validation time (see `cook_mode.ts`). Sharing the helpers here keeps the
// renderer's "is this old?" check and the server's "is this acceptable?"
// check in lockstep.

import type { CookModeRecipe } from '$lib/types';

// Action-led form: capitalized verb-led action, em-dash separator (` — `, U+2014),
// then a target state. Up to 8 words total, with ≥ 2 words before the em-dash
// (verb + object/subject). Hyphen-minus is rejected.
// Examples: "Sweat shallots — translucent", "Reduce sauce — coats spoon",
// "Roast chicken — 74°C in thigh", "Bake top — set with crackle".
export const ACTION_STATE_RE = /^[A-Z][^—.,;:!?]+\s+—\s+\S/;

export function violatesActionState(value: string): string | null {
	if (!ACTION_STATE_RE.test(value)) {
		return 'must be action-led form: "Verb-led action — target state" (capital start, em-dash U+2014 separator, no premature punctuation)';
	}
	const parts = value.split(/\s+—\s+/);
	const preWords = parts[0].trim().split(/\s+/).filter((w) => w.length > 0);
	if (preWords.length < 2) {
		return 'must have ≥ 2 words before the em-dash (verb + object/subject — old noun-state form rejected)';
	}
	const allWords = value.trim().split(/\s+/).filter((w) => w !== '—' && w.length > 0);
	if (allWords.length > 8) {
		return `must be ≤ 8 words (got ${allWords.length})`;
	}
	return null;
}

// True when a cached cookMode payload is stale relative to the current schema
// shape — i.e. needs a force-regen on next view. Returns FALSE for null
// (caller distinguishes empty vs stale: empty = first generation, stale = re-gen).
//
// Clauses, in evaluation order:
//   (a) cm == null → false  (let the caller treat "no cache" separately).
//   (b) cache version/language missing or old (pre-atomic-English contract).
//   (c) streams missing or empty (pre-DAG legacy shape).
//   (d) any step.goal fails the action-led check (pre-action-led legacy).
//   (e) any step has timer_seconds without timer_action (pre-timer-pill-label).
//
// Future schema bumps add a clause here — single place to update on the next rev.
export function isStaleCookMode(cm: Partial<CookModeRecipe> | null): boolean {
	if (cm == null) return false;
	if (cm.version !== 2 || cm.language !== 'en') return true;
	if (!Array.isArray(cm.streams) || cm.streams.length === 0) return true;
	if (!Array.isArray(cm.steps)) return true;
	for (const step of cm.steps) {
		if (typeof step.goal !== 'string' || violatesActionState(step.goal) != null) {
			return true;
		}
		if (
			step.timer_seconds != null &&
			(step.timer_action == null || step.timer_action === '')
		) {
			return true;
		}
	}
	return false;
}
