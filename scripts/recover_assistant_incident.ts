import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '$lib/server/db/schema';
import {
	applyAssistantIncidentRecovery,
	inspectAssistantIncidentRecovery
} from '$lib/server/recovery/assistant_incident';

function arg(name: string): string | undefined {
	return process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
}

const databasePath = path.resolve(arg('db') ?? process.env.DATABASE_URL ?? './dev.db');
const operationIds = (arg('ops') ?? '269,270,271,272,273,274')
	.split(',')
	.map((value) => Number(value.trim()));
const inventoryMessageId = Number(arg('inventory-message') ?? '92');
const recipeMessageId = Number(arg('recipe-message') ?? arg('message') ?? '94');
const apply = process.argv.includes('--apply');
const outputPath = arg('output') ? path.resolve(arg('output')!) : undefined;

if (!fs.existsSync(databasePath)) throw new Error(`Database not found: ${databasePath}`);
if (apply && process.env.ASSISTANT_INCIDENT_RECOVERY !== 'APPLY') {
	throw new Error('Set ASSISTANT_INCIDENT_RECOVERY=APPLY as a second apply guard.');
}

const sqlite = new Database(databasePath);
sqlite.pragma('foreign_keys = ON');
sqlite.pragma('busy_timeout = 5000');
const db = drizzle(sqlite, { schema });
const input = { operationIds, inventoryMessageId, recipeMessageId };

try {
	const result = apply
		? applyAssistantIncidentRecovery(db, input)
		: inspectAssistantIncidentRecovery(db, input);
	const evidence = {
		mode: apply ? 'apply' : 'dry-run',
		databasePath: path.basename(databasePath),
		createdAt: new Date().toISOString(),
		...result
	};
	const rendered = `${JSON.stringify(evidence, null, 2)}\n`;
	if (outputPath) {
		fs.mkdirSync(path.dirname(outputPath), { recursive: true });
		fs.writeFileSync(outputPath, rendered, { flag: 'wx' });
	}
	process.stdout.write(rendered);
	if (!result.ready) process.exitCode = 2;
} finally {
	sqlite.close();
}
