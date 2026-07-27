import { count, desc, eq } from 'drizzle-orm';
import * as schema from '$lib/server/db/schema';
import type { Db as DB } from '$lib/server/db/types';
import { isChatTurnActive } from '$lib/server/ai/chat_activity';

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

export function recentChatPage(db: DB, userId: number, limit = 20) {
	const messages = recentChatMessages(db, userId, limit);
	const total =
		db
			.select({ value: count() })
			.from(schema.chatMessages)
			.where(eq(schema.chatMessages.userId, userId))
			.get()?.value ?? 0;
	const newest = messages.at(-1);

	return {
		messages:
			newest?.role === 'user' && !isChatTurnActive(userId)
				? [
						...messages,
						{
							role: 'assistant' as const,
							content: '',
							toolCalls: null,
							createdAt: newest.createdAt,
							errorCode: 'interrupted_turn' as const
						}
					]
				: messages,
		hasOlder: total > messages.length,
		visibleLimit: limit
	};
}
