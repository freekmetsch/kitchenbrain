/**
 * Taxonomy migration audit (Phase 1 of inventory-intelligence, P1.6).
 *
 * Reports the state a DB copy is in before/after the 0006+0007 migrations:
 *   - legacy `category` value distribution
 *   - kind / food_class distribution and null counts (= Phase 3 review workload)
 *   - ops-log attribution + undoable vs display-only split
 *
 * Usage (from v2/):
 *   npx tsx scripts/audit_taxonomy.ts                  # default DB at ./dev.db
 *   npx tsx scripts/audit_taxonomy.ts --db=/path/to/v2-copy.db
 *
 * Read-only — touches nothing. Run against the Railway DB copy before and
 * after `drizzle-kit migrate` during the beta stage-gate drill.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const args = process.argv.slice(2);
const dbArg = args.find((a) => a.startsWith('--db='))?.slice('--db='.length);

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(scriptDir, '..');
const DB_PATH = path.resolve(appDir, dbArg ?? './dev.db');

const db = new Database(DB_PATH, { readonly: true, fileMustExist: true });

function hasColumn(table: string, column: string): boolean {
	const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
	return cols.some((c) => c.name === column);
}

function distribution(sql: string): Record<string, number> {
	const rows = db.prepare(sql).all() as { key: string | null; n: number }[];
	return Object.fromEntries(rows.map((r) => [r.key ?? '(null)', r.n]));
}

console.log(`Taxonomy audit — ${DB_PATH}\n`);

const itemCount = (db.prepare('SELECT COUNT(*) AS n FROM inventory_items WHERE deleted_at IS NULL').get() as { n: number }).n;
console.log(`Active inventory items: ${itemCount}`);

console.log('\nLegacy category distribution (active items):');
console.table(
	distribution(
		"SELECT category AS key, COUNT(*) AS n FROM inventory_items WHERE deleted_at IS NULL GROUP BY category ORDER BY n DESC"
	)
);

if (hasColumn('inventory_items', 'kind')) {
	console.log('Kind distribution (active items):');
	console.table(
		distribution(
			'SELECT kind AS key, COUNT(*) AS n FROM inventory_items WHERE deleted_at IS NULL GROUP BY kind ORDER BY n DESC'
		)
	);

	console.log('Food class distribution (active items):');
	console.table(
		distribution(
			'SELECT food_class AS key, COUNT(*) AS n FROM inventory_items WHERE deleted_at IS NULL GROUP BY food_class ORDER BY n DESC'
		)
	);

	const nulls = db
		.prepare(
			'SELECT COUNT(*) AS n FROM inventory_items WHERE deleted_at IS NULL AND (kind IS NULL OR (kind != ? AND food_class IS NULL))'
		)
		.get('processed') as { n: number };
	console.log(`Unclassified rows (Phase 3 AI-pass workload): ${nulls.n}`);

	const flagged = db
		.prepare('SELECT COUNT(*) AS n FROM inventory_items WHERE deleted_at IS NULL AND needs_review = 1')
		.get() as { n: number };
	console.log(`Needs Review flags: ${flagged.n}`);
} else {
	console.log('Facet columns not present yet (pre-migration state).');
}

const opsCount = (db.prepare('SELECT COUNT(*) AS n FROM inventory_ops_log').get() as { n: number }).n;
console.log(`\nOps-log rows: ${opsCount}`);

if (hasColumn('inventory_ops_log', 'actor')) {
	console.log('Actor distribution:');
	console.table(distribution('SELECT actor AS key, COUNT(*) AS n FROM inventory_ops_log GROUP BY actor'));

	const undoable = db
		.prepare(
			`SELECT COUNT(*) AS n FROM inventory_ops_log
			 WHERE item_id IS NOT NULL AND (
			   (op_type = 'add' AND after_snapshot IS NOT NULL) OR
			   (op_type = 'update' AND before_snapshot IS NOT NULL AND after_snapshot IS NOT NULL) OR
			   (op_type = 'remove' AND before_snapshot IS NOT NULL)
			 )`
		)
		.get() as { n: number };
	console.log(`Undoable ops: ${undoable.n} / ${opsCount} (rest is display-only legacy history)`);
} else {
	console.log('History columns not present yet (pre-migration state).');
}
