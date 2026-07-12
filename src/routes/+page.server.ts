import type { PageServerLoad } from './$types';
import { eq, desc, and, isNull, isNotNull, lte } from 'drizzle-orm';
import { db } from '$lib/server/db/index';
import { chatMessages, inventoryItems } from '$lib/server/db/schema';
import { checkDailyCap } from '$lib/server/ai/client';
import { isoDateInAppTimeZone } from '$lib/week';

function plusDaysIso(days: number): string {
	const d = new Date();
	d.setDate(d.getDate() + days);
	return isoDateInAppTimeZone(d);
}

export const load: PageServerLoad = async ({ locals, url }) => {
	const messages = db
		.select({
			id: chatMessages.id,
			role: chatMessages.role,
			content: chatMessages.content,
			toolCalls: chatMessages.toolCalls,
			createdAt: chatMessages.createdAt
		})
		.from(chatMessages)
		.where(eq(chatMessages.userId, locals.user!.id))
		.orderBy(desc(chatMessages.createdAt))
		.limit(20)
		.all()
		.reverse();

	const expiring = db
		.select({
			id: inventoryItems.id,
			name: inventoryItems.name,
			expiryDate: inventoryItems.expiryDate,
			section: inventoryItems.section
		})
		.from(inventoryItems)
		.where(
			and(
				isNull(inventoryItems.deletedAt),
				isNotNull(inventoryItems.expiryDate),
				lte(inventoryItems.expiryDate, plusDaysIso(7))
			)
		)
		.orderBy(inventoryItems.expiryDate)
		.limit(5)
		.all();

	const prefillMessage = url.searchParams.get('msg');
	const { exceeded: capExceeded } = checkDailyCap();

	return { messages, expiring, prefillMessage, capExceeded };
};
