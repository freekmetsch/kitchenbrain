import type { PageServerLoad } from './$types';
import { and, isNull, isNotNull, lte } from 'drizzle-orm';
import { db } from '$lib/server/db/index';
import { inventoryItems } from '$lib/server/db/schema';
import { checkDailyCap } from '$lib/server/ai/client';
import { recentChatMessages } from '$lib/server/ai/recent_chat';
import { isoDateInAppTimeZone } from '$lib/week';

function plusDaysIso(days: number): string {
	const d = new Date();
	d.setDate(d.getDate() + days);
	return isoDateInAppTimeZone(d);
}

export const load: PageServerLoad = async ({ locals }) => {
	const messages = recentChatMessages(db, locals.user!.id);

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

	const { exceeded: capExceeded } = checkDailyCap();

	return { messages, expiring, capExceeded };
};
