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
