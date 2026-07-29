// Server-side builder for the chat agent's semantic tool events (P5.1).
// Turns a raw executor result into a ToolDisplay (human sentence + optional
// before/after diff + undoable inventory ops). Inventory writes are rendered
// from the committed inventory_ops_log row, reusing the pure history formatters
// so chat and the inventory history view speak the same language.
import { eq } from 'drizzle-orm';
import * as schema from '$lib/server/db/schema';
import type { Db as DB } from '$lib/server/db/types';
import {
	isUndoable,
	snapshotName,
	type OpSnapshot,
	type OpType
} from '$lib/inventory_history';
import type {
	ToolDisplay,
	ToolDisplayDiff,
	ToolDisplayEntityAction
} from '$lib/tool_display';
import {
	inventoryChangeSummary,
	readToolSummary,
	safeToolErrorSummary,
	writeToolSummary,
	type ChatLocale
} from '$lib/chat/tool_copy';

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
	'search_ah_products',
	'generate_shopping_list',
	'get_freezer_staples',
	'get_inventory_history'
]);

const RECIPE_ENTITY_TOOLS = new Set([
	'get_recipe',
	'add_recipe',
	'add_recipe_from_url',
	'edit_recipe',
	'create_meal_recipe',
	'set_freezer_staple'
]);

function recipeEntityAction(
	name: string,
	result: Result
): ToolDisplayEntityAction | undefined {
	if (!RECIPE_ENTITY_TOOLS.has(name)) return undefined;
	const recipe = asObj(result.recipe);
	const id = str(result.slug) ?? str(recipe.slug);
	if (!id?.trim()) return undefined;
	return {
		kind: 'recipe',
		id,
		intent: result.needs_review === true ? 'review' : 'view'
	};
}

/** Render a committed inventory op (add/update/remove) as a display with inline undo. */
function inventoryOpDisplay(
	db: DB,
	opId: number,
	fallbackName: string | null,
	locale: ChatLocale
): ToolDisplay {
	const op = db
		.select()
		.from(schema.inventoryOpsLog)
		.where(eq(schema.inventoryOpsLog.id, opId))
		.get();
	if (!op) {
		return {
			kind: 'write',
			summary: fallbackName
				? locale === 'nl'
					? `${fallbackName} bijgewerkt`
					: `Updated ${fallbackName}`
				: locale === 'nl'
					? 'Voorraad bijgewerkt'
					: 'Updated inventory'
		};
	}

	const before = op.beforeSnapshot as OpSnapshot;
	const after = op.afterSnapshot as OpSnapshot;
	const opType = op.opType as OpType;
	const name = snapshotName(before, after);
	const change = inventoryChangeSummary(opType, before, after, op.undoOf, locale);
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
			label: locale === 'nl' ? 'Aantal' : 'Qty',
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
export function buildToolDisplay(
	db: DB,
	name: string,
	_rawInput: unknown,
	rawResult: unknown,
	locale: ChatLocale = 'en'
): ToolDisplay {
	const result = asObj(rawResult) as Result;
	if (
		name === 'prepare_stock_action' &&
		result.kind === 'stock_action_proposal' &&
		typeof result.token === 'string' &&
		typeof result.title === 'string' &&
		typeof result.weekStartDate === 'string' &&
		Array.isArray(result.operations) &&
		result.recommendation &&
		typeof result.recommendation === 'object' &&
		result.atomicity &&
		typeof result.atomicity === 'object'
	) {
		return {
			kind: 'proposal',
			summary: locale === 'nl' ? 'Voorraad en boodschappen controleren' : 'Review Stock and Shopping',
			stockActionProposal: {
				token: result.token,
				status:
					result.status === 'active' ||
					result.status === 'applying' ||
					result.status === 'applied' ||
					result.status === 'undone' ||
					result.status === 'rejected' ||
					result.status === 'superseded' ||
					result.status === 'expired'
						? result.status
						: 'active',
				title: result.title,
				weekStartDate: result.weekStartDate,
				atomicity: result.atomicity as NonNullable<
					ToolDisplay['stockActionProposal']
				>['atomicity'],
				recommendation: result.recommendation as NonNullable<
					ToolDisplay['stockActionProposal']
				>['recommendation'],
				operations: result.operations as NonNullable<
					ToolDisplay['stockActionProposal']
				>['operations']
			}
		};
	}
	if (
		name === 'propose_meal_plan' &&
		result.kind === 'meal_plan_proposal' &&
		typeof result.token === 'string' &&
		typeof result.title === 'string' &&
		typeof result.weekStartDate === 'string' &&
		Array.isArray(result.operations) &&
		result.recommendation &&
		typeof result.recommendation === 'object' &&
		result.atomicity &&
		typeof result.atomicity === 'object'
	) {
		return {
			kind: 'proposal',
			summary: locale === 'nl' ? 'Maaltijdplan controleren' : 'Review meal plan',
			mealPlanProposal: {
				token: result.token,
				status:
					result.status === 'active' ||
					result.status === 'applying' ||
					result.status === 'applied' ||
					result.status === 'undone' ||
					result.status === 'rejected' ||
					result.status === 'superseded' ||
					result.status === 'expired'
						? result.status
						: 'active',
				title: result.title,
				weekStartDate: result.weekStartDate,
				atomicity: result.atomicity as NonNullable<
					ToolDisplay['mealPlanProposal']
				>['atomicity'],
				recommendation: result.recommendation as NonNullable<
					ToolDisplay['mealPlanProposal']
				>['recommendation'],
				operations: result.operations as NonNullable<
					ToolDisplay['mealPlanProposal']
				>['operations']
			}
		};
	}
	if (
		name === 'propose_recipe_patch' &&
		result.kind === 'recipe_patch' &&
		typeof result.token === 'string' &&
		typeof result.recipeSlug === 'string' &&
		Array.isArray(result.operations)
	) {
		return {
			kind: 'proposal',
			summary: locale === 'nl' ? 'Receptwijzigingen controleren' : 'Review recipe changes',
			recipePatch: {
				token: result.token,
				recipeSlug: result.recipeSlug,
				recipeRevision:
					typeof result.recipeRevision === 'number' ? result.recipeRevision : 0,
				status:
					result.status === 'active' ||
					result.status === 'applying' ||
					result.status === 'superseded' ||
					result.status === 'applied' ||
					result.status === 'expired'
						? result.status
						: 'active',
				operations: result.operations as NonNullable<ToolDisplay['recipePatch']>['operations'],
				productChoices: Array.isArray(result.productChoices)
					? (result.productChoices as NonNullable<ToolDisplay['recipePatch']>['productChoices'])
					: []
			}
		};
	}

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
		const diff = Array.isArray(result.action_diff)
			? result.action_diff.filter(
					(row): row is ToolDisplayDiff =>
						Boolean(
							row &&
								typeof row === 'object' &&
								typeof (row as ToolDisplayDiff).label === 'string'
						)
				)
			: undefined;
		return {
			kind: 'confirm',
			summary:
				str(result.action_summary) ??
				(locale === 'nl' ? 'Deze actie goedkeuren?' : 'Confirm this action?'),
			confirmationId: str(result.confirmation_id) ?? undefined,
			...(diff?.length ? { diff } : {})
		};
	}

	// executeToolCall wraps thrown errors as { error }; executors report soft
	// failures as { ok: false, error }.
	const err = str(result.error);
	if (err && (result.ok === false || result.ok === undefined)) {
		return { kind: 'error', summary: safeToolErrorSummary(err, locale) };
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
			(locale === 'nl'
				? `${okCount} ${okCount === 1 ? 'item' : 'items'} bijgewerkt`
				: `Updated ${okCount} item${okCount === 1 ? '' : 's'}`) +
			(failed > 0
				? locale === 'nl'
					? ` (${failed} mislukt)`
					: ` (${failed} failed)`
				: '');
		return {
			kind: failed > 0 && okCount === 0 ? 'error' : 'write',
			summary,
			...(opIds.length
				? {
						ops: opIds.map((id) => ({ opId: id, undoable: true })),
						undoAllOpIds: opIds
					}
				: {})
		};
	}

	// Inventory writes surface an opId → render the committed op with undo.
	const opId = num(result.opId);
	if (opId !== null) {
		const item = asObj(result.item);
		const fallbackName = str(item.name) ?? str(result.name) ?? str(result.removed);
		return inventoryOpDisplay(db, opId, fallbackName, locale);
	}

	if (READ_TOOLS.has(name)) {
		const entityAction = recipeEntityAction(name, result);
		return {
			kind: 'read',
			summary: readToolSummary(name, result, locale),
			...(entityAction ? { entityAction } : {})
		};
	}

	// Non-inventory writes (recipes, meal plan) — sentence, no inventory undo.
	const entityAction = recipeEntityAction(name, result);
	return {
		kind: 'write',
		summary: writeToolSummary(name, result, locale),
		...(entityAction ? { entityAction } : {})
	};
}
