/**
 * Cook log backfill (Phase 4 of v2-ux-overhaul).
 *
 * For every meal_plan_meals row with status='cooked' and a recipe_slug, ensure a
 * cook_log row exists (source='backfill', cooked_at = cooked_date) and that the
 * matching recipes row has up-to-date last_cooked_at + cooked_count.
 *
 * Usage (from v2/):
 *   tsx scripts/backfill_cook_log.ts                       # dry-run, prints plan
 *   tsx scripts/backfill_cook_log.ts --apply               # write
 *   tsx scripts/backfill_cook_log.ts --apply --db=/path    # specific DB
 *
 * Idempotent: existing cook_log rows for a meal_plan_meal_id are not duplicated.
 * Stats are recomputed from cook_log so re-running is safe.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const dbArg = args.find((a) => a.startsWith('--db='))?.slice('--db='.length);

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(scriptDir, '..');
const DB_PATH = path.resolve(appDir, dbArg ?? './dev.db');

type CookedMeal = {
	id: number;
	recipe_slug: string | null;
	cooked_date: string | null;
	dinner: string;
};

function main() {
	console.log(`[backfill] DB: ${DB_PATH}`);
	console.log(`[backfill] Mode: ${APPLY ? 'APPLY' : 'dry-run'}`);

	const db = new Database(DB_PATH);
	db.pragma('foreign_keys = ON');

	const meals = db
		.prepare(
			`SELECT id, recipe_slug, cooked_date, dinner
			 FROM meal_plan_meals
			 WHERE status = 'cooked'
			   AND recipe_slug IS NOT NULL
			   AND cooked_date IS NOT NULL`
		)
		.all() as CookedMeal[];

	console.log(`[backfill] Found ${meals.length} cooked meals with recipe_slug.`);

	const alreadyLogged = db
		.prepare(`SELECT meal_plan_meal_id FROM cook_log WHERE meal_plan_meal_id IS NOT NULL`)
		.all() as { meal_plan_meal_id: number }[];
	const loggedSet = new Set(alreadyLogged.map((r) => r.meal_plan_meal_id));

	const todo = meals.filter((m) => !loggedSet.has(m.id));
	console.log(`[backfill] ${todo.length} meals need a cook_log row (${meals.length - todo.length} already logged).`);

	if (!APPLY) {
		for (const m of todo.slice(0, 20)) {
			console.log(`  - meal #${m.id} "${m.dinner}" slug=${m.recipe_slug} cooked_date=${m.cooked_date}`);
		}
		if (todo.length > 20) console.log(`  … ${todo.length - 20} more`);
		console.log('[backfill] Dry-run complete. Re-run with --apply to write.');
		return;
	}

	const insertCookLog = db.prepare(
		`INSERT INTO cook_log (recipe_id, recipe_slug, cooked_at, cooked_date, source, meal_plan_meal_id, created_at)
		 VALUES (
		   (SELECT id FROM recipes WHERE slug = ?),
		   ?,
		   ?,
		   ?,
		   'backfill',
		   ?,
		   ?
		 )`
	);

	const tx = db.transaction((rows: CookedMeal[]) => {
		for (const m of rows) {
			const cookedAtMs = new Date(`${m.cooked_date}T12:00:00.000Z`).getTime();
			insertCookLog.run(
				m.recipe_slug,
				m.recipe_slug,
				cookedAtMs,
				m.cooked_date,
				m.id,
				Date.now()
			);
		}
	});
	tx(todo);

	const recompute = db.prepare(
		`UPDATE recipes
		 SET last_cooked_at = (
		   SELECT MAX(cooked_at) FROM cook_log WHERE cook_log.recipe_id = recipes.id
		 ),
		 cooked_count = (
		   SELECT COUNT(*) FROM cook_log WHERE cook_log.recipe_id = recipes.id
		 ),
		 updated_at = ?`
	);
	recompute.run(Date.now());

	const updated = db
		.prepare(`SELECT COUNT(*) as n FROM recipes WHERE cooked_count > 0`)
		.get() as { n: number };

	console.log(`[backfill] Inserted ${todo.length} cook_log rows.`);
	console.log(`[backfill] ${updated.n} recipes now have cooked_count > 0.`);
}

main();
