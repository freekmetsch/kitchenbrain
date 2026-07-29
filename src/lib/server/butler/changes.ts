import { and, desc, eq, gte, isNotNull, lte } from 'drizzle-orm';
import { displayName } from '$lib/actors';
import * as schema from '$lib/server/db/schema';
import type { Db } from '$lib/server/db/types';
import { listInventoryHistory } from '$lib/server/domains/inventory/history';

export type ButlerHouseholdChange = {
	id: string;
	domain: 'stock' | 'shopping';
	actor: string;
	summary: string;
	subject: string;
	happenedAt: Date;
};

export type ButlerChangeSummary = {
	since: Date | null;
	through: Date;
	events: ButlerHouseholdChange[];
	limitations: string[];
};

export function getProvableHouseholdChanges(
	db: Db,
	input: { since: Date | null; through?: Date }
): ButlerChangeSummary {
	const through = input.through ?? new Date();
	const limitations = [
		'Meal-plan and recipe edits are omitted until those writers carry actor provenance.'
	];
	if (!input.since) return { since: null, through, events: [], limitations };

	const history = listInventoryHistory(db, { limit: 200 });
	if (history.length === 200) {
		limitations.push('Only the 200 most recent Stock operations were checked.');
	}
	const events: ButlerHouseholdChange[] = history
		.filter(
			(event) =>
				event.createdAt > input.since!.getTime() && event.createdAt <= through.getTime()
		)
		.map((event) => ({
			id: `stock:${event.id}`,
			domain: 'stock',
			actor: event.actorLabel,
			summary: event.summary,
			subject: event.itemName,
			happenedAt: new Date(event.createdAt)
		}));

	const pushes = db
		.select({
			id: schema.shoppingPushHistory.id,
			destination: schema.shoppingPushHistory.destination,
			productsPushed: schema.shoppingPushHistory.productsPushed,
			freetextPushed: schema.shoppingPushHistory.freetextPushed,
			attemptStatus: schema.shoppingPushHistory.attemptStatus,
			completedAt: schema.shoppingPushHistory.completedAt,
			username: schema.users.username
		})
		.from(schema.shoppingPushHistory)
		.innerJoin(schema.users, eq(schema.shoppingPushHistory.userId, schema.users.id))
		.where(
			and(
				isNotNull(schema.shoppingPushHistory.completedAt),
				gte(schema.shoppingPushHistory.completedAt, input.since),
				lte(schema.shoppingPushHistory.completedAt, through)
			)
		)
		.orderBy(desc(schema.shoppingPushHistory.completedAt))
		.limit(50)
		.all();
	if (pushes.length === 50) {
		limitations.push('Only the 50 most recent attributed AH pushes were checked.');
	}
	for (const push of pushes) {
		if (!push.completedAt || !push.username) continue;
		const count = push.productsPushed + push.freetextPushed;
		events.push({
			id: `shopping-push:${push.id}`,
			domain: 'shopping',
			actor: displayName(push.username),
			summary:
				push.attemptStatus === 'succeeded'
					? `Sent ${count} item${count === 1 ? '' : 's'} to AH ${push.destination}`
					: `AH ${push.destination} attempt ended ${push.attemptStatus}`,
			subject: 'Shopping',
			happenedAt: push.completedAt
		});
	}

	return {
		since: input.since,
		through,
		events: events
			.sort((left, right) => right.happenedAt.getTime() - left.happenedAt.getTime())
			.slice(0, 8),
		limitations
	};
}
