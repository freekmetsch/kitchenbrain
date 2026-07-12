/**
 * Inventory unit-in-name backfill (Phase 2 of v2-ux-overhaul).
 *
 * For every live inventory_items row whose `name` starts with a unit token while `unit` is NULL,
 * strip the token from `name` and write it to `unit`. Also normalises an approximate-qty pattern
 * ("~10") into a numeric qty_num. Always snapshots the affected rows to JSON first.
 *
 * Usage (from v2/):
 *   tsx scripts/backfill_inventory_units.ts                     # dry-run, prints plan
 *   tsx scripts/backfill_inventory_units.ts --db=/path/to/v2.db # dry-run on a specific DB
 *   tsx scripts/backfill_inventory_units.ts --apply             # snapshot, then write
 *   tsx scripts/backfill_inventory_units.ts --apply --db=...    # production run
 *
 * Snapshot location: ./data/backups/inventory_pre_backfill_<utc-iso>.json
 * Rollback: re-apply the snapshot's `original` rows with UPDATE statements (script logs the path).
 *
 * Idempotent: a clean row (no leading unit token, or unit already set) is skipped silently.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { detectDirty, UNIT_TOKENS } from './audit_inventory.js';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const dbArg = args.find((a) => a.startsWith('--db='))?.slice('--db='.length);

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(scriptDir, '..');
const DB_PATH = path.resolve(appDir, dbArg ?? './dev.db');
const BACKUP_DIR = path.resolve(appDir, 'data/backups');

type Row = {
	id: number;
	name: string;
	qty_text: string | null;
	qty_num: number | null;
	unit: string | null;
	section: string;
	category: string | null;
	expiry_date: string | null;
	tags: string | null;
	created_at: number;
	updated_at: number;
};

type Plan = {
	id: number;
	original: Row;
	updated: Pick<Row, 'name' | 'qty_text' | 'qty_num' | 'unit' | 'updated_at'>;
	notes: string[];
};

/**
 * Strip a leading "of " (case-insensitive) once. Cleans up "blocks of butter chicken" → "butter chicken".
 */
function stripLeadingOf(name: string): string {
	return name.replace(/^of\s+/i, '');
}

/**
 * Parse approximate qty like "~10", "~ 10", "~10 pieces" → 10.
 */
function parseApproxQty(qtyText: string | null): number | null {
	if (!qtyText) return null;
	const m = qtyText.trim().match(/^~\s*(\d+(?:\.\d+)?)/);
	return m ? parseFloat(m[1]) : null;
}

function buildQtyText(qtyNum: number | null, unit: string | null): string | null {
	if (qtyNum === null) return null;
	return unit ? `${qtyNum} ${unit}` : `${qtyNum}`;
}

function planRow(row: Row, nowEpoch: number): Plan | null {
	const dirty = detectDirty({
		id: row.id,
		name: row.name,
		qty_text: row.qty_text,
		qty_num: row.qty_num,
		unit: row.unit,
		section: row.section,
		category: row.category
	});
	const notes: string[] = [];
	let updatedName = row.name;
	let updatedUnit = row.unit;
	let updatedQtyNum = row.qty_num;

	if (dirty) {
		updatedName = stripLeadingOf(dirty.suggested_name).trim();
		updatedUnit = dirty.suggested_unit;
		notes.push(`leading token "${dirty.leading_token}" → unit`);
		if (updatedName !== dirty.suggested_name) notes.push('stripped leading "of "');
	}

	// Approximate qty fix: only when qty_num is missing and qty_text encodes an approximate value.
	if (row.qty_num === null) {
		const approx = parseApproxQty(row.qty_text);
		if (approx !== null) {
			updatedQtyNum = approx;
			notes.push(`parsed approximate qty "${row.qty_text}" → ${approx}`);
		}
	}

	const nameChanged = updatedName !== row.name;
	const unitChanged = updatedUnit !== row.unit;
	const qtyChanged = updatedQtyNum !== row.qty_num;
	if (!nameChanged && !unitChanged && !qtyChanged) return null;

	const updatedQtyText = buildQtyText(updatedQtyNum, updatedUnit);

	return {
		id: row.id,
		original: row,
		updated: {
			name: updatedName,
			qty_text: updatedQtyText,
			qty_num: updatedQtyNum,
			unit: updatedUnit,
			updated_at: nowEpoch
		},
		notes
	};
}

function fmtTs(d: Date): string {
	return d.toISOString().replace(/[:.]/g, '-');
}

function writeSnapshot(plans: Plan[]): string {
	if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
	const file = path.join(BACKUP_DIR, `inventory_pre_backfill_${fmtTs(new Date())}.json`);
	fs.writeFileSync(
		file,
		JSON.stringify(
			{
				db: DB_PATH,
				created_at: new Date().toISOString(),
				row_count: plans.length,
				known_unit_tokens: UNIT_TOKENS,
				rows: plans.map((p) => ({ id: p.id, original: p.original, planned: p.updated, notes: p.notes }))
			},
			null,
			2
		)
	);
	return file;
}

function main() {
	const db = new Database(DB_PATH, { readonly: !APPLY });
	if (APPLY) {
		db.pragma('journal_mode = WAL');
		db.pragma('foreign_keys = ON');
	}

	const rows = db
		.prepare(
			`SELECT id, name, qty_text, qty_num, unit, section, category, expiry_date,
			        tags, created_at, updated_at
			 FROM inventory_items WHERE deleted_at IS NULL ORDER BY id`
		)
		.all() as Row[];

	const nowEpoch = Math.floor(Date.now() / 1000);
	const plans = rows.map((r) => planRow(r, nowEpoch)).filter((p): p is Plan => p !== null);

	console.log(`DB: ${DB_PATH}`);
	console.log(`Mode: ${APPLY ? 'APPLY (writing)' : 'DRY-RUN (no writes)'}`);
	console.log(`Total live rows: ${rows.length}`);
	console.log(`Rows planned for change: ${plans.length}`);
	console.log('');

	if (plans.length === 0) {
		console.log('Nothing to backfill — DB is already clean.');
		db.close();
		return;
	}

	for (const p of plans) {
		const o = p.original;
		const u = p.updated;
		console.log(`id=${p.id}`);
		console.log(`  name:     "${o.name}"  →  "${u.name}"`);
		console.log(`  qty_text: ${JSON.stringify(o.qty_text)}  →  ${JSON.stringify(u.qty_text)}`);
		console.log(`  qty_num:  ${o.qty_num}  →  ${u.qty_num}`);
		console.log(`  unit:     ${JSON.stringify(o.unit)}  →  ${JSON.stringify(u.unit)}`);
		if (p.notes.length) console.log(`  notes:    ${p.notes.join('; ')}`);
	}
	console.log('');

	const snapshotFile = writeSnapshot(plans);
	console.log(`Snapshot: ${snapshotFile}`);

	if (!APPLY) {
		console.log('');
		console.log('Dry-run only — re-run with --apply to write changes.');
		db.close();
		return;
	}

	const update = db.prepare(
		`UPDATE inventory_items
		 SET name = @name, qty_text = @qty_text, qty_num = @qty_num,
		     unit = @unit, updated_at = @updated_at
		 WHERE id = @id`
	);
	const insertOp = db.prepare(
		`INSERT INTO inventory_ops_log (user_id, op_type, item_snapshot, created_at)
		 VALUES (@user_id, 'update', @item_snapshot, @created_at)`
	);

	const userRow = db.prepare(`SELECT id FROM users ORDER BY id LIMIT 1`).get() as
		| { id: number }
		| undefined;
	if (!userRow) {
		console.error('No user rows in DB — cannot write to inventory_ops_log. Aborting.');
		db.close();
		process.exit(1);
	}

	const tx = db.transaction((items: Plan[]) => {
		for (const p of items) {
			update.run({ id: p.id, ...p.updated });
			insertOp.run({
				user_id: userRow.id,
				item_snapshot: JSON.stringify({ before: p.original, after: p.updated, notes: p.notes }),
				created_at: nowEpoch
			});
		}
	});
	tx(plans);

	console.log(`Wrote ${plans.length} updates inside one transaction.`);
	console.log(`Rollback: replay snapshot at ${snapshotFile} (each row's "original" → UPDATE).`);
	db.close();
}

main();
