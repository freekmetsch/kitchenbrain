export type CompletedAgentIteration =
	| { done: false; text: '' }
	| { done: true; text: string };

/**
 * Text produced before tool calls is working prose, not a user-facing answer.
 * Keep it private until an iteration finishes without tools.
 */
export class FinalIterationText {
	private current = '';

	append(delta: string): void {
		this.current += delta;
	}

	complete(toolCallCount: number): CompletedAgentIteration {
		const text = this.current;
		this.current = '';

		if (toolCallCount > 0) {
			return { done: false, text: '' };
		}

		return { done: true, text };
	}
}

const MAX_PROPOSAL_FINAL_CHARACTERS = 180;

/**
 * Proposal cards already carry the decision details. Keep a genuinely concise
 * final sentence, but replace model narration that would duplicate or bury the
 * card with the localized route-owned fallback.
 */
export function finalizeProposalText(text: string, fallback: string): string {
	const trimmed = text.trim();
	const lineCount = trimmed ? trimmed.split(/\r?\n/).length : 0;
	return trimmed.length > MAX_PROPOSAL_FINAL_CHARACTERS || lineCount > 1
		? fallback
		: trimmed;
}
