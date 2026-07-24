// Client-safe tool-display contract for the chat agent (P5.1).
// The server builds a ToolDisplay per executed tool call (see
// server/ai/tool_display.ts); ChatView renders it live (SSE) and from persisted
// history. Kept dependency-free so both sides can import it.
import {
	toolStartSummary,
	type ChatLocale
} from '$lib/chat/tool_copy';

export type ToolDisplayDiff = { label: string; before: string | null; after: string | null };
export type ToolDisplayOp = { opId: number; undoable: boolean };
export type ToolDisplayEntityAction = {
	kind: 'recipe';
	id: string;
	intent: 'view' | 'review';
};
export type RecipeEnhancementDisplay = {
	token: string;
	recipeSlug: string;
	additions: Array<{ id: string; name: string; amount: string; unit?: string; reason: string }>;
	substitutes: Array<{ id: string; ingredientId: string; ingredientName: string; name: string; note?: string; reason: string }>;
};

export type ToolDisplay = {
	kind: 'read' | 'write' | 'error' | 'confirm' | 'plan' | 'proposal';
	/** One human-readable sentence — never JSON. */
	summary: string;
	/** Optional structured before/after chips (e.g. a qty change). */
	diff?: ToolDisplayDiff[];
	/** Inventory ops this call produced, for inline undo. Endpoint stays authoritative. */
	ops?: ToolDisplayOp[];
	itemName?: string;
	section?: string;
	/** For kind:'confirm' — the single-use token the Approve card posts back (P5.3). */
	confirmationId?: string;
	/** For kind:'plan' — the ordered step labels; the UI checks them off best-effort
	 *  as subsequent write-displays in the same turn complete (P5.2). */
	steps?: string[];
	recipeEnhancement?: RecipeEnhancementDisplay;
	/** A validated entity reference. The client derives the app-local route. */
	entityAction?: ToolDisplayEntityAction;
};

export function toolEntityHref(
	action: ToolDisplayEntityAction | undefined,
	basePath: string
): string | null {
	if (!action || action.kind !== 'recipe' || !action.id.trim()) return null;
	return `${basePath}/recipes/${encodeURIComponent(action.id)}`;
}

/** Present-tense "doing" line shown the moment a tool starts, before its result. */
export function describeToolStart(
	name: string,
	rawInput: unknown,
	locale: ChatLocale = 'en'
): string {
	return toolStartSummary(name, rawInput, locale);
}
