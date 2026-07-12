// Server-side builder for the chat agent's semantic tool events (P5.1).
// Turns a raw executor result into a ToolDisplay (human sentence + optional
// before/after diff + undoable inventory ops). Inventory writes are rendered
// from the committed inventory_ops_log row, reusing the pure history formatters
// so chat and the inventory history view speak the same language.
import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from '$lib/server/db/schema';
import {
	isUndoable,
	snapshotName,
	summarizeOp,
	type OpSnapshot,
	type OpType
} from '$lib/inventory_history';
import type { ToolDisplay, ToolDisplayDiff } from '$lib/tool_display';

type DB = BetterSQLite3Database<typeof schema>;
type Result = Record<string, unknown>;

function asObj(raw: unknown): Record<string, unknown> {
	return raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
}
function num(v: unknown): number | null {
	return typeof v === 'number' ? v : null;
}
function str(v: unknown): string | null {
	return typeof v === 'string' ? v : null;
}

const READ_TOOLS = new Set([
	'get_inventory',
	'get_meal_plan',
	'suggest_meals',
	'get_recipe',
	'search_recipes',
	'generate_shopping_list',
	'get_freezer_staples',
	'get_inventory_history'
]);

function readSummary(name: string, result: Result): string {
	const count = num(result.count);
	switch (name) {
		case 'get_inventory':
			return count === null ? 'Checked inventory' : `Found ${count} item${count === 1 ? '' : 's'}`;
		case 'search_recipes':
			return count === null ? 'Searched recipes' : `Found ${count} recipe${count === 1 ? '' : 's'}`;
		case 'get_recipe':
			return result.found === false ? 'No recipe found' : 'Loaded the recipe';
		case 'get_meal_plan':
			return 'Loaded the meal plan';
		case 'suggest_meals':
			return 'Gathered meal ideas';
		case 'generate_shopping_list': {
			const list = result.shopping_list;
			const n = Array.isArray(list) ? list.length : null;
			return n === null ? 'Built the shopping list' : `${n} item${n === 1 ? '' : 's'} to buy`;
		}
		case 'get_freezer_staples':
			return 'Checked freezer staples';
		case 'get_inventory_history': {
			const n = num(result.count);
			return n === null ? 'Checked recent changes' : `${n} recent change${n === 1 ? '' : 's'}`;
		}
		default:
			return 'Done';
	}
}

function nonInventoryWriteSummary(name: string, result: Result): string {
	switch (name) {
		case 'set_freezer_staple':
			return result.is_freezer_staple ? 'Set as freezer staple' : 'Cleared freezer staple';
		case 'plan_meal':
			return str(result.dinner) ? `Planned ${str(result.dinner)}` : 'Planned the meal';
		case 'remove_meal':
			return str(result.removed) ? `Removed ${str(result.removed)}` : 'Removed the meal';
		case 'mark_meal_cooked':
			return str(result.meal) ? `Marked ${str(result.meal)} cooked` : 'Marked cooked';
		case 'add_recipe':
			return str(result.title) ? `Saved ${str(result.title)}` : 'Saved the recipe';
		case 'create_meal_recipe': {
			if (result.created === false) return 'Could not combine the recipes';
			const title = str(result.title);
			return title ? `Created meal ${title}` : 'Created the meal recipe';
		}
		case 'add_recipe_from_url': {
			const title = str(result.title);
			const suffix = result.needs_review === true ? ' (needs review)' : '';
			return title ? `Imported ${title}${suffix}` : `Imported the recipe${suffix}`;
		}
		case 'edit_recipe':
			return result.needs_review === true ? 'Updated the recipe (needs review)' : 'Updated the recipe';
		case 'log_meal':
			return 'Logged the meal';
		default:
			return 'Done';
	}
}

/** Render a committed inventory op (add/update/remove) as a display with inline undo. */
function inventoryOpDisplay(db: DB, opId: number, fallbackName: string | null): ToolDisplay {
	const op = db
		.select()
		.from(schema.inventoryOpsLog)
		.where(eq(schema.inventoryOpsLog.id, opId))
		.get();
	if (!op) {
		return {
			kind: 'write',
			summary: fallbackName ? `Updated ${fallbackName}` : 'Updated inventory'
		};
	}

	const before = op.beforeSnapshot as OpSnapshot;
	const after = op.afterSnapshot as OpSnapshot;
	const opType = op.opType as OpType;
	const name = snapshotName(before, after);
	const change = summarizeOp(opType, before, after, op.undoOf);
	// undoable is best-effort at build time; the undo endpoint is authoritative
	// and returns 409 if the item has since drifted from this op's after-state.
	const undoable = isUndoable(opType, before, after) && !op.undoOf;

	const diff: ToolDisplayDiff[] = [];
	const bq = num(before?.qtyNum ?? null);
	const aq = num(after?.qtyNum ?? null);
	if (opType === 'update' && bq !== aq && (bq !== null || aq !== null)) {
		const unit = str(after?.unit ?? null) ?? str(before?.unit ?? null);
		const suffix = unit ? ` ${unit}` : '';
		diff.push({
			label: 'Qty',
			before: bq === null ? null : `${bq}${suffix}`,
			after: aq === null ? null : `${aq}${suffix}`
		});
	}

	return {
		kind: 'write',
		summary: `${name} — ${change}`,
		itemName: name,
		section: str(after?.section ?? before?.section ?? null) ?? undefined,
		ops: [{ opId, undoable }],
		...(diff.length ? { diff } : {})
	};
}

// Last line of defense for the "summary is a sentence, never JSON" contract:
// executor error strings normally read fine (fixed at their sources), but any
// path that still carries a payload or a wall of text gets flattened here.
function humanizeToolError(err: string): string {
	if (/^AI service error/.test(err)) return "The AI service hiccuped on this step — try again.";
	if (/[{}[\]]/.test(err) || /\n/.test(err)) return "This step failed — try again.";
	if (err.length > 160) return `${err.slice(0, 157)}…`;
	return err;
}

export function buildToolDisplay(
	db: DB,
	name: string,
	_rawInput: unknown,
	rawResult: unknown
): ToolDisplay {
	const result = asObj(rawResult) as Result;

	// Plan-first (P5.2): render an ordered checklist the UI checks off best-effort
	// as the subsequent write-displays in this turn complete. No inventory op.
	// Guard on a real steps array so a rejected present_plan (zod threw → { error })
	// falls through to the error path instead of rendering a blank plan card.
	if (name === 'present_plan' && Array.isArray(result.steps)) {
		const steps = result.steps.filter((s): s is string => typeof s === 'string');
		return { kind: 'plan', summary: str(result.title) ?? 'Plan', steps };
	}

	// Deferred for approval (P5.3): render an Approve/Cancel card. The client
	// posts confirmationId to /api/chat/confirm; nothing executed yet.
	if (result.needs_confirmation === true) {
		return {
			kind: 'confirm',
			summary: str(result.action_summary) ?? 'Confirm this action?',
			confirmationId: str(result.confirmation_id) ?? undefined
		};
	}

	// executeToolCall wraps thrown errors as { error }; executors report soft
	// failures as { ok: false, error }.
	const err = str(result.error);
	if (err && (result.ok === false || result.ok === undefined)) {
		return { kind: 'error', summary: humanizeToolError(err) };
	}

	// Bulk inventory update: many committed ops, each undoable. Render one write
	// line with the per-item undo chips (the undo endpoint stays authoritative).
	if (name === 'bulk_update_inventory') {
		const okCount = num(result.updated_count) ?? 0;
		const failed = num(result.failed_count) ?? 0;
		const opIds = Array.isArray(result.op_ids)
			? result.op_ids.filter((x): x is number => typeof x === 'number')
			: [];
		const summary =
			`Updated ${okCount} item${okCount === 1 ? '' : 's'}` +
			(failed > 0 ? ` (${failed} failed)` : '');
		return {
			kind: failed > 0 && okCount === 0 ? 'error' : 'write',
			summary,
			...(opIds.length ? { ops: opIds.map((id) => ({ opId: id, undoable: true })) } : {})
		};
	}

	// Inventory writes surface an opId → render the committed op with undo.
	const opId = num(result.opId);
	if (opId !== null) {
		const item = asObj(result.item);
		const fallbackName = str(item.name) ?? str(result.name) ?? str(result.removed);
		return inventoryOpDisplay(db, opId, fallbackName);
	}

	if (READ_TOOLS.has(name)) {
		return { kind: 'read', summary: readSummary(name, result) };
	}

	// Non-inventory writes (recipes, meal plan) — sentence, no inventory undo.
	return { kind: 'write', summary: nonInventoryWriteSummary(name, result) };
}
