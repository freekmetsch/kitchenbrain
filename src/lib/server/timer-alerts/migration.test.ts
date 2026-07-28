import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';

function runMigration(sqlite: Database.Database, filename: string): void {
	const sql = fs.readFileSync(path.join(process.cwd(), 'drizzle', filename), 'utf8');
	for (const statement of sql.split('--> statement-breakpoint')) {
		if (statement.trim()) sqlite.exec(statement);
	}
}

describe('timer alert delivery receipt migration', () => {
	it('upgrades an existing timer job without losing rollback-readable fields', () => {
		const sqlite = new Database(':memory:');
		sqlite.pragma('foreign_keys = ON');
		sqlite.exec(`
			CREATE TABLE users (
				id integer PRIMARY KEY NOT NULL
			);
			INSERT INTO users (id) VALUES (1);
		`);
		runMigration(sqlite, '0023_cloudy_vampiro.sql');
		sqlite.exec(`
			INSERT INTO push_subscriptions (
				id, user_id, endpoint, p256dh, auth, created_at, updated_at, last_used_at
			) VALUES (
				'subscription-id', 1, 'https://push.example/subscription', 'p256dh', 'auth',
				1000, 1000, 1000
			);
			INSERT INTO timer_alert_jobs (
				id, user_id, subscription_id, deadline, title, body, navigate, state,
				attempt_count, next_attempt_at, sent_at, created_at, updated_at
			) VALUES (
				'job-id', 1, 'subscription-id', 2000, 'Timer', 'Done', '/', 'sent',
				1, 2000, 2100, 1000, 2100
			);
		`);

		runMigration(sqlite, '0024_sparkling_spirit.sql');

		const job = sqlite
			.prepare(
				`SELECT id, kind, sent_at, worker_received_at, notification_shown_at
				 FROM timer_alert_jobs WHERE id = ?`
			)
			.get('job-id');
		expect(job).toEqual({
			id: 'job-id',
			kind: 'timer',
			sent_at: 2100,
			worker_received_at: null,
			notification_shown_at: null
		});
		expect(sqlite.pragma('foreign_key_check')).toEqual([]);
		expect(sqlite.pragma('integrity_check', { simple: true })).toBe('ok');
	});
});
