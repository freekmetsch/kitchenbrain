import { describe, expect, it } from 'vitest';
import * as schema from '$lib/server/db/schema';
import { createTestDb } from '$lib/server/test_db';
import { buildHouseholdExport } from '$lib/server/settings/export';

describe('buildHouseholdExport', () => {
	it('never includes timer push endpoints or encryption keys', () => {
		const db = createTestDb();
		const now = new Date('2026-07-28T12:00:00.000Z');
		db.insert(schema.pushSubscriptions)
			.values({
				id: '0191a6c2-4a70-7c1e-8203-cf07f92ff70a',
				userId: 1,
				endpoint: 'https://fcm.googleapis.com/fcm/send/export-secret-endpoint',
				p256dh: 'export-secret-p256dh',
				auth: 'export-secret-auth',
				createdAt: now,
				updatedAt: now,
				lastUsedAt: now
			})
			.run();

		const serialized = JSON.stringify(buildHouseholdExport(db, now));

		expect(serialized).not.toContain('export-secret-endpoint');
		expect(serialized).not.toContain('export-secret-p256dh');
		expect(serialized).not.toContain('export-secret-auth');
		expect(Object.keys(buildHouseholdExport(db, now))).not.toContain('push_subscriptions');
	});
});
