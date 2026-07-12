// Pure helpers that render inventory_ops_log rows as human-readable history (P2.3).
// No DB / server imports so the history endpoint AND the client can both use them.
// Snapshots are the plain-JSON `before_snapshot` / `after_snapshot` blobs written
// by inventory_writes.ts (Date fields as epoch ms).
import { displayName, type MachineActor } from '$lib/actors';

export type OpType = 'add' | 'remove' | 'update';
// Machine actors are reserved; any other value is a username (see $lib/actors).
export type OpActor = MachineActor | (string & {}) | null;
export type OpSnapshot = Record<string, unknown> | null;

/** Actor → display label. Usernames render capitalized; pipeline (AH poller etc.) reads as "Auto". */
export function actorLabel(actor: OpActor): string {
	if (!actor) return 'System';
	if (actor === 'ai') return 'AI';
	if (actor === 'pipeline') return 'Auto';
	return displayName(actor);
}

const SECTION_LABEL: Record<string, string> = { freezer: 'Freezer', pantry: 'Pantry' };

function str(v: unknown): string | null {
	return typeof v === 'string' ? v : null;
}
function num(v: unknown): number | null {
	return typeof v === 'number' ? v : null;
}

/** Human, quantity-aware label from a snapshot ("3 stuks", "2 portions"). */
export function qtyLabel(snap: Record<string, unknown>): string | null {
	const q = num(snap.qtyNum);
	const unit = str(snap.unit);
	if (q === null) return str(snap.qtyText);
	if (unit === 'portion') return `${q} ${q === 1 ? 'portion' : 'portions'}`;
	return unit ? `${q} ${unit}` : `${q}`;
}

/** Best available item name across the two snapshots (after wins). */
export function snapshotName(before: OpSnapshot, after: OpSnapshot): string {
	return str(after?.name ?? null) ?? str(before?.name ?? null) ?? 'item';
}

/** One-line, name-less description of a single op for a timeline row. */
export function summarizeOp(
	opType: OpType,
	before: OpSnapshot,
	after: OpSnapshot,
	undoOf?: number | null
): string {
	if (undoOf) return 'Undid a change';
	if (opType === 'add') {
		const q = after ? qtyLabel(after) : null;
		return q ? `Added · ${q}` : 'Added';
	}
	if (opType === 'remove') return 'Removed';

	// update: diff before → after, most salient first.
	if (!before || !after) return 'Edited';
	const changes: string[] = [];

	const bq = num(before.qtyNum);
	const aq = num(after.qtyNum);
	if (bq !== aq && aq !== null) {
		const unit = str(after.unit) ?? str(before.unit);
		const unitTxt = unit === 'portion' ? (aq === 1 ? 'portion' : 'portions') : (unit ?? '');
		changes.push(`${bq ?? '—'} → ${aq}${unitTxt ? ' ' + unitTxt : ''}`);
	}
	if (str(before.section) !== str(after.section) && str(after.section)) {
		const s = str(after.section)!;
		changes.push(`Moved to ${SECTION_LABEL[s] ?? s}`);
	}
	if (str(before.name) !== str(after.name) && str(after.name)) {
		changes.push(`Renamed to ${str(after.name)}`);
	}
	const bRev = Boolean(before.needsReview);
	const aRev = Boolean(after.needsReview);
	if (!bRev && aRev) changes.push('Flagged for review');
	if (bRev && !aRev) changes.push('Review resolved');
	const bStaple = Boolean(before.isStaple);
	const aStaple = Boolean(after.isStaple);
	if (!bStaple && aStaple) changes.push('Marked staple');
	if (bStaple && !aStaple) changes.push('Unmarked staple');
	if (str(before.kind) !== str(after.kind) || str(before.foodClass) !== str(after.foodClass)) {
		changes.push('Reclassified');
	}
	if (num(before.madeFromRecipeId) !== num(after.madeFromRecipeId)) {
		changes.push(num(after.madeFromRecipeId) !== null ? 'Linked recipe' : 'Unlinked recipe');
	}
	if (!changes.length && str(before.expiryDate) !== str(after.expiryDate)) {
		changes.push('Best-before updated');
	}
	if (!changes.length) return 'Edited';
	return changes.slice(0, 2).join(' · ');
}

/** Whether the op carries the snapshots its inverse needs (mirrors undoOp eligibility). */
export function isUndoable(opType: OpType, before: OpSnapshot, after: OpSnapshot): boolean {
	if (opType === 'add') return !!after;
	if (opType === 'remove') return !!before;
	return !!before && !!after; // update
}

/** Compact relative time. `now` is passed in so the fn stays pure/testable. */
export function relativeTime(ms: number, now: number): string {
	const diff = Math.max(0, now - ms);
	const min = Math.floor(diff / 60000);
	if (min < 1) return 'just now';
	if (min < 60) return `${min}m ago`;
	const hr = Math.floor(min / 60);
	if (hr < 24) return `${hr}h ago`;
	const d = Math.floor(hr / 24);
	if (d < 31) return `${d}d ago`;
	const mo = Math.floor(d / 30);
	if (mo < 12) return `${mo}mo ago`;
	return `${Math.floor(d / 365)}y ago`;
}
