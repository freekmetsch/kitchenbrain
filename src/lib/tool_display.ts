// Client-safe tool-display contract for the chat agent (P5.1).
// The server builds a ToolDisplay per executed tool call (see
// server/ai/tool_display.ts); ChatView renders it live (SSE) and from persisted
// history. Kept dependency-free so both sides can import it.

export type ToolDisplayDiff = { label: string; before: string | null; after: string | null };
export type ToolDisplayOp = { opId: number; undoable: boolean };

export type ToolDisplay = {
	kind: 'read' | 'write' | 'error' | 'confirm' | 'plan';
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
};

type Input = Record<string, unknown>;

function asInput(raw: unknown): Input {
	return raw && typeof raw === 'object' ? (raw as Input) : {};
}

function str(v: unknown): string | undefined {
	return typeof v === 'string' && v.trim() ? v : undefined;
}

/** Present-tense "doing" line shown the moment a tool starts, before its result. */
export function describeToolStart(name: string, rawInput: unknown): string {
	const input = asInput(rawInput);
	const section = str(input.section);
	const itemName = str(input.name);
	switch (name) {
		case 'get_inventory':
			return section ? `Checking the ${section}…` : 'Checking inventory…';
		case 'add_to_inventory':
			return itemName ? `Adding ${itemName}…` : 'Adding to inventory…';
		case 'remove_from_inventory':
			return itemName ? `Removing ${itemName}…` : 'Removing from inventory…';
		case 'update_inventory_item':
			return 'Updating the item…';
		case 'bulk_update_inventory': {
			const updates = input.updates;
			const n = Array.isArray(updates) ? updates.length : null;
			return n ? `Updating ${n} item${n === 1 ? '' : 's'}…` : 'Updating several items…';
		}
		case 'set_review_flag':
			return 'Updating review…';
		case 'undo_op':
			return 'Undoing…';
		case 'get_inventory_history':
			return 'Checking recent changes…';
		case 'present_plan':
			return 'Making a plan…';
		case 'link_leftover_recipe':
			return 'Linking the leftover…';
		case 'set_staple':
			return 'Updating staple…';
		case 'set_freezer_staple':
			return 'Updating freezer staple…';
		case 'get_freezer_staples':
			return 'Checking freezer staples…';
		case 'get_meal_plan':
			return 'Reading the meal plan…';
		case 'plan_meal':
			return str(input.dinner) ? `Planning ${str(input.dinner)}…` : 'Planning a meal…';
		case 'remove_meal':
			return 'Removing the meal…';
		case 'mark_meal_cooked':
			return 'Marking it cooked…';
		case 'suggest_meals':
			return 'Looking for meal ideas…';
		case 'get_recipe':
			return 'Looking up the recipe…';
		case 'search_recipes':
			return 'Searching recipes…';
		case 'generate_shopping_list':
			return 'Building the shopping list…';
		case 'add_recipe':
			return str(input.title) ? `Saving ${str(input.title)}…` : 'Saving the recipe…';
		case 'create_meal_recipe':
			return str(input.title) ? `Combining into ${str(input.title)}…` : 'Combining recipes…';
		case 'add_recipe_from_url':
			return 'Importing the recipe…';
		case 'edit_recipe':
			return 'Editing the recipe…';
		case 'log_meal':
			return 'Logging the meal…';
		default:
			return 'Working…';
	}
}
