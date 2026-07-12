// Shared client-side shapes for the shopping page components. Data types
// derive from the shopping route's server load (via the generated $types) so
// the components stay in lock-step with the actual shape — no hand-kept mirror.
import type { PageData } from '../../../routes/shopping/$types';

export type ShoppingListItem = PageData['items'][number];

/** Per-item push decision inside the AH preview sheet. */
export type Decision = { mode: 'product' | 'freetext' | 'exclude'; pick: number };

/** Outcome summary of one AH push, shown in the sheet's result view. */
export type AhPushOutcome = {
	pushed: number;
	accountName: string | null;
	destination: 'order' | 'list';
	failed: { term: string; kind: 'product' | 'freetext' }[];
	markedBought: number;
	reason?: string;
};
