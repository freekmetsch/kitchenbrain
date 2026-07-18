import { desc, eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from '$lib/server/db/schema';

type DB = BetterSQLite3Database<typeof schema>;

export function recentChatMessages(db: DB, userId: number, limit = 20) {
	return db
		.select({
			id: schema.chatMessages.id,
			role: schema.chatMessages.role,
			content: schema.chatMessages.content,
			toolCalls: schema.chatMessages.toolCalls,
			createdAt: schema.chatMessages.createdAt
		})
		.from(schema.chatMessages)
		.where(eq(schema.chatMessages.userId, userId))
		.orderBy(desc(schema.chatMessages.createdAt), desc(schema.chatMessages.id))
		.limit(limit)
		.all()
		.reverse();
}
