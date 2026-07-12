/**
 * Inventory unit-in-name audit (Phase 2 of v2-ux-overhaul).
 *
 * The V1→V2 migration's `parseInventoryBullet` regex captured "8 blocks spicy beef curry" as
 * { qty_num: 8, unit: null, name: "blocks spicy beef curry" } — leaking the unit into the name.
 * This script flags rows that match that pattern so the backfill can correct them.
 *
 * Usage (from v2/):
 *   tsx scripts/audit_inventory.ts                  # default DB at ./dev.db
 *   tsx scripts/audit_inventory.ts --db=/path/to/v2.db
 *
 * Output: dirty count + table of {id, name, qty_text, leading_token, suggested_unit, suggested_name}.
 * Read-only — touches nothing.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const args = process.argv.slice(2);
const dbArg = args.find((a) => a.startsWith('--db='))?.slice('--db='.length);

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(scriptDir, '..');
const DB_PATH = path.resolve(appDir, dbArg ?? './dev.db');

// Tokens we treat as units when they appear as the first word of `name` and `unit IS NULL`.
// Keep narrow — only tokens that act as containers/quantifiers in this household's vocabulary.
export const UNIT_TOKENS = [
	// English
	'block', 'blocks',
	'container', 'containers',
	'jar', 'jars',
	'tub', 'tubs',
	'bag', 'bags',
	'packet', 'packets',
	'pack', 'packs',
	'piece', 'pieces',
	'bottle', 'bottles',
	'can', 'cans',
	'slice', 'slices',
	// Dutch (kept lowercase; legacy data may carry these)
	'blok', 'blokken',
	'stuk', 'stuks',
	'zakje', 'zakjes', 'zakken',
	'pot', 'potten',
	'fles', 'flessen'
] as const;

export type DirtyRow = {
	id: number;
	name: string;
	qty_text: string | null;
	qty_num: number | null;
	unit: string | null;
	section: string;
	category: string | null;
	leading_token: string;
	suggested_unit: string;
	suggested_name: string;
};

export function detectDirty(row: {
	id: number;
	name: string;
	qty_text: string | null;
	qty_num: number | null;
	unit: string | null;
	section: string;
	category: string | null;
}): DirtyRow | null {
	if (row.unit) return null;
	if (!row.name) return null;
	const trimmed = row.name.trim();
	const m = trimmed.match(/^(\S+)\s+(.+)$/);
	if (!m) return null;
	const first = m[1];
	const rest = m[2];
	if (!UNIT_TOKENS.includes(first.toLowerCase() as (typeof UNIT_TOKENS)[number])) return null;
	return {
		...row,
		leading_token: first,
		suggested_unit: first.toLowerCase(),
		suggested_name: rest
	};
}

function main() {
	const db = new Database(DB_PATH, { readonly: true });
	const rows = db
		.prepare(
			`SELECT id, name, qty_text, qty_num, unit, section, category
			 FROM inventory_items WHERE deleted_at IS NULL ORDER BY id`
		)
		.all() as Array<{
		id: number;
		name: string;
		qty_text: string | null;
		qty_num: number | null;
		unit: string | null;
		section: string;
		category: string | null;
	}>;

	const dirty = rows.map(detectDirty).filter((r): r is DirtyRow => r !== null);

	console.log(`DB: ${DB_PATH}`);
	console.log(`Total live rows: ${rows.length}`);
	console.log(`Dirty (leading unit token + unit IS NULL): ${dirty.length}`);
	console.log('');

	if (dirty.length === 0) {
		console.log('No dirty rows. Nothing to backfill.');
		return;
	}

	console.log('id\tqty\ttoken\t→ unit\t→ name');
	console.log('--\t---\t-----\t------\t------');
	for (const r of dirty) {
		const qty = r.qty_num ?? r.qty_text ?? '';
		console.log(`${r.id}\t${qty}\t${r.leading_token}\t${r.suggested_unit}\t${r.suggested_name}`);
	}

	// Spot common edge cases worth a manual look
	const edgeCases = rows.filter(
		(r) => r.unit === null && r.qty_num === null && r.qty_text && /^~/.test(r.qty_text.trim())
	);
	if (edgeCases.length) {
		console.log('');
		console.log(`Approximate-quantity rows (qty_text starts with "~"): ${edgeCases.length}`);
		for (const r of edgeCases) console.log(`  id=${r.id}  qty_text="${r.qty_text}"  name="${r.name}"`);
	}
}

// Skip auto-run when imported (the backfill script reuses detectDirty).
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1].endsWith('audit_inventory.ts')) {
	main();
}
