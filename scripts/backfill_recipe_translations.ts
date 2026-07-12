/**
 * Backfill recipe translations.
 *
 * Usage (run from v2/ directory):
 *   npm run recipes:backfill:dry       # prints pending count + estimated cost
 *   npm run recipes:backfill           # snapshots DB, then translates pending rows
 *
 * Options:
 *   --apply          Write translations. Without this flag the script is dry-run only.
 *   --db=PATH        SQLite file path (default: $DATABASE_URL or ./dev.db)
 *   --limit=N        Translate at most N pending recipes in this run.
 *   --retry-errors   Include rows currently marked translation_status='error'.
 *
 * The script is idempotent: by default it only targets rows with translation_status='pending'.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { eq, inArray } from 'drizzle-orm';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const RETRY_ERRORS = args.includes('--retry-errors');
const limitArg = args.find((arg) => arg.startsWith('--limit='))?.slice('--limit='.length);
const LIMIT = limitArg ? Number.parseInt(limitArg, 10) : null;

if (LIMIT !== null && (!Number.isFinite(LIMIT) || LIMIT < 1)) {
	console.error('--limit must be a positive integer');
	process.exit(1);
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(scriptDir, '..');
process.chdir(appDir);

const dbArg = args.find((arg) => arg.startsWith('--db='))?.slice('--db='.length);
if (dbArg) {
	process.env.DATABASE_URL = dbArg;
}

const DB_PATH = path.resolve(process.env.DATABASE_URL ?? './dev.db');
const AVG_INPUT_TOKENS = 500;
const AVG_OUTPUT_TOKENS = 500;
const INPUT_PRICE_PER_M = Number.parseFloat(process.env.SONNET_INPUT_PRICE_PER_M ?? '3.00');
const OUTPUT_PRICE_PER_M = Number.parseFloat(process.env.SONNET_OUTPUT_PRICE_PER_M ?? '15.00');
const USD_TO_EUR = Number.parseFloat(process.env.USD_TO_EUR ?? '0.92');

function estimateCostEur(recipeCount: number): number {
	const usdPerRecipe =
		(AVG_INPUT_TOKENS / 1_000_000) * INPUT_PRICE_PER_M +
		(AVG_OUTPUT_TOKENS / 1_000_000) * OUTPUT_PRICE_PER_M;
	return usdPerRecipe * USD_TO_EUR * recipeCount;
}

function timestamp(): string {
	return new Date().toISOString().replace(/[:.]/g, '-');
}

function snapshotDb(): string | null {
	if (!fs.existsSync(DB_PATH)) {
		console.warn(`[backfill] DB snapshot skipped; file does not exist: ${DB_PATH}`);
		return null;
	}

	const backupsDir = path.join(path.dirname(DB_PATH), 'backups');
	fs.mkdirSync(backupsDir, { recursive: true });

	const target = path.join(backupsDir, `recipes_pre_bilingual_${timestamp()}.db`);
	fs.copyFileSync(DB_PATH, target);
	return target;
}

const [{ db }, schema, { translateRecipe }, { checkDailyCap, DailyCapExceeded }] = await Promise.all([
	import('../src/lib/server/db/index'),
	import('../src/lib/server/db/schema'),
	import('../src/lib/server/ai/translate_recipe'),
	import('../src/lib/server/ai/client')
]);

const targetStatuses = RETRY_ERRORS ? ['pending', 'error'] : ['pending'];
const pending = db
	.select({
		slug: schema.recipes.slug,
		title: schema.recipes.title
	})
	.from(schema.recipes)
	.where(inArray(schema.recipes.translationStatus, targetStatuses))
	.all();

const selected = LIMIT ? pending.slice(0, LIMIT) : pending;
const cap = checkDailyCap();
const estimatedCost = estimateCostEur(selected.length);

console.log(`[backfill] DB: ${DB_PATH}`);
console.log(
	`[backfill] Target statuses: ${targetStatuses.join(', ')}; target recipes: ${pending.length}; selected: ${selected.length}; estimated cost: EUR ${estimatedCost.toFixed(
		4
	)} (${AVG_INPUT_TOKENS} input + ${AVG_OUTPUT_TOKENS} output tokens avg/recipe)`
);
console.log(`[backfill] Daily spend: EUR ${cap.totalEur.toFixed(4)}`);

if (!APPLY) {
	console.log('[backfill] Dry run only. Re-run with --apply to write translations.');
	process.exit(0);
}

if (selected.length === 0) {
	console.log('[backfill] No pending recipes selected; nothing to apply.');
	process.exit(0);
}

if (!process.env.ANTHROPIC_API_KEY) {
	console.error('[backfill] ANTHROPIC_API_KEY is required for --apply.');
	process.exit(1);
}

if (cap.exceeded) {
	console.error('[backfill] Daily cap already exceeded; aborting. Re-run tomorrow.');
	process.exit(1);
}

const snapshot = snapshotDb();
if (snapshot) {
	console.log(`[backfill] Snapshot created: ${snapshot}`);
}

let ready = 0;
let errors = 0;

for (const [index, recipe] of selected.entries()) {
	const label = `${index + 1}/${selected.length} ${recipe.slug}`;
	try {
		console.log(`[backfill] Translating ${label}`);
		await translateRecipe(recipe.slug);

		const updated = db
			.select({ status: schema.recipes.translationStatus })
			.from(schema.recipes)
			.where(eq(schema.recipes.slug, recipe.slug))
			.get();

		if (updated?.status === 'ready') {
			ready += 1;
			console.log(`[backfill] Ready ${label}`);
		} else {
			errors += 1;
			console.error(`[backfill] Error ${label}; status=${updated?.status ?? 'missing'}`);
		}
	} catch (err) {
		if (err instanceof DailyCapExceeded) {
			console.error('[backfill] Daily cap reached; aborting. Re-run tomorrow.');
			break;
		}

		errors += 1;
		console.error(`[backfill] Error ${label}`, err);
	}
}

const remaining = db
	.select({ slug: schema.recipes.slug })
	.from(schema.recipes)
	.where(inArray(schema.recipes.translationStatus, targetStatuses))
	.all().length;

console.log(`[backfill] Complete. ready=${ready}; errors=${errors}; target_remaining=${remaining}`);
if (errors > 0 || remaining > 0) {
	process.exitCode = 1;
}
