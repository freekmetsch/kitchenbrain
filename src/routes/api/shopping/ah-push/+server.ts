import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { eq, inArray, sql } from 'drizzle-orm';
import { db } from '$lib/server/db/index';
import * as schema from '$lib/server/db/schema';
import { addProductItems, addFreetextItems, getActiveOrder, addProductsToOrder, getAHStatus, AHNotConnectedError, AH_NOT_CONNECTED } from '$lib/server/ah/client';
import { readJsonBody } from '$lib/server/api_body';
import { AhPushBodySchema, bindAhPushDecisions, claimAhPreviewToken, isAhEligibleShoppingRow, type AhPreviewBinding, type AhPushDecision } from '$lib/server/ah/preview_tokens';
import { getShoppingWeekView } from '$lib/server/shopping_view';

function freetextDescription(item: AhPreviewBinding): string {
	return [item.term, item.amount, item.unit].filter((value) => value && value.trim()).join(' ');
}

class AhWriteUncertainError extends Error {}

function assertCurrentPreview(weekStart: string, bindings: AhPreviewBinding[]): void {
	const currentRows = new Map(getShoppingWeekView(db, weekStart).toBuy.filter(isAhEligibleShoppingRow).map((row) => [`entries:${[...row.entryIds].sort((a, b) => a - b).join(',')}`, row]));
	for (const binding of bindings) {
		const row = currentRows.get(binding.ref);
		if (!row || row.name !== binding.term || row.amount !== binding.amount || row.unit !== binding.unit) error(409, 'The shopping list changed; review it again');
		const ids = [...row.entryIds].sort((a, b) => a - b);
		const expectedIds = [...binding.entryIds].sort((a, b) => a - b);
		if (JSON.stringify(ids) !== JSON.stringify(expectedIds)) error(409, 'The shopping sources changed; review them again');
		const revisions = new Map(row.sources.map((source) => [source.id, source.revision]));
		if (binding.entryIds.some((id, index) => revisions.get(id) !== binding.entryRevisions[index])) error(409, 'A shopping choice changed; review it again');
	}
}

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) error(401, 'Unauthorized');
	const body = await readJsonBody(request, AhPushBodySchema);
	const preview = claimAhPreviewToken(body.previewToken, locals.user.id);
	if (!preview) error(409, 'This AH review expired or was already used');
	let decisions: Map<string, AhPushDecision>;
	try {
		decisions = bindAhPushDecisions(preview.items, body.decisions);
	} catch (cause) {
		error(400, cause instanceof Error ? cause.message : 'Invalid AH push decisions');
	}
	assertCurrentPreview(preview.weekStart, preview.items);
	if (![...decisions.values()].some((decision) => decision.mode !== 'exclude')) error(400, 'Choose at least one item to send');
	if (!getAHStatus().connected) return json({ ok: false, reason: AH_NOT_CONNECTED });

	let destination: 'order' | 'list' = 'list';
	let historyId: number | null = null;
	let productsPushed = 0;
	let freetextPushed = 0;
	let reason: string | undefined;
	const failed: Array<{ term: string; kind: 'product' | 'freetext' }> = [];
	const successfulRefs = new Set<string>();
	const uncertainRefs = new Set<string>();
	try {
		const order = await getActiveOrder();
		if (order) destination = 'order';
		const now = new Date();
		historyId = db.insert(schema.shoppingPushHistory).values({
			weekStartDate: preview.weekStart, userId: locals.user.id, destination,
			accountName: getAHStatus().memberName, attemptStatus: 'pending', createdAt: now
		}).returning({ id: schema.shoppingPushHistory.id }).get().id;

		const productChoices = preview.items.flatMap((item) => {
			const decision = decisions.get(item.ref)!;
			return decision.mode === 'product' ? [{ item, decision }] : [];
		});
		if (productChoices.length) {
			const requestItems = productChoices.map(({ decision }) => ({ id: decision.productId, qty: decision.qty }));
			const result = order ? await addProductsToOrder(order.id, requestItems) : await addProductItems(requestItems);
			if (result.ok) {
				productsPushed = productChoices.length;
				productChoices.forEach(({ item }) => successfulRefs.add(item.ref));
			} else if (result.uncertain) {
				productChoices.forEach(({ item }) => uncertainRefs.add(item.ref));
				throw new AhWriteUncertainError('AH returned an ambiguous product-write response');
			} else {
				productChoices.forEach(({ item }) => failed.push({ term: item.term, kind: 'product' }));
				reason = `Albert Heijn rejected the product push (HTTP ${result.status}).`;
			}
		}

		const textChoices = preview.items.filter((item) => decisions.get(item.ref)?.mode === 'freetext');
		if (textChoices.length) {
			if (order) {
				textChoices.forEach((item) => failed.push({ term: freetextDescription(item), kind: 'freetext' }));
				reason ??= 'There is an open AH order, so free-text items were not sent.';
			} else {
				const descriptions = textChoices.map(freetextDescription);
				const result = await addFreetextItems(descriptions);
				freetextPushed = result.pushed.length;
				if (result.uncertain.length) {
					const uncertainDescriptions = new Set(result.uncertain);
					textChoices
						.filter((item) => uncertainDescriptions.has(freetextDescription(item)))
						.forEach((item) => uncertainRefs.add(item.ref));
					throw new AhWriteUncertainError('AH returned an ambiguous free-text write response');
				}
				const failedCounts = new Map<string, number>();
				result.failed.forEach((term) => failedCounts.set(term, (failedCounts.get(term) ?? 0) + 1));
				textChoices.forEach((item, index) => {
					const description = descriptions[index];
					const count = failedCounts.get(description) ?? 0;
					if (count) {
						failedCounts.set(description, count - 1);
						failed.push({ term: description, kind: 'freetext' });
					} else successfulRefs.add(item.ref);
				});
				if (result.failed.length) reason ??= 'Some free-text items could not be sent.';
			}
		}

		const markedBoughtRefs = db.transaction((tx) => {
			const completedAt = new Date();
			const rows: (typeof schema.shoppingPushItems.$inferInsert)[] = preview.items.map((item) => {
				const decision = decisions.get(item.ref)!;
				const product = decision.mode === 'product' ? item.offeredProducts.find((candidate) => candidate.id === decision.productId) : undefined;
				const status = decision.mode === 'exclude' ? 'skipped' : successfulRefs.has(item.ref) ? 'success' : 'failed';
				return {
					pushId: historyId!, sourceRef: item.entryIds.join(','), sourceName: item.term,
					amount: item.amount, unit: item.unit, mode: decision.mode === 'exclude' ? 'skip' : decision.mode,
					ahProductId: product?.id ?? null, ahProductName: product?.name ?? null,
					quantity: decision.mode === 'product' ? decision.qty : decision.mode === 'freetext' ? 1 : null,
					destination, status, failureReason: status === 'failed' ? reason ?? 'AH rejected this item' : null, createdAt: completedAt
				};
			});
			tx.insert(schema.shoppingPushItems).values(rows).run();
			const successful = preview.items.filter((item) => successfulRefs.has(item.ref));
			const entryIds = successful.flatMap((item) => item.entryIds);
			if (entryIds.length) tx.update(schema.shoppingWeekEntries).set({ bought: true, revision: sql`${schema.shoppingWeekEntries.revision} + 1`, updatedAt: completedAt }).where(inArray(schema.shoppingWeekEntries.id, entryIds)).run();
			tx.update(schema.shoppingPushHistory).set({
				productsPushed, freetextPushed, failedCount: failed.length,
				skippedCount: preview.items.length - successful.length - failed.length,
				attemptStatus: failed.length ? 'failed' : 'succeeded', attemptError: reason ?? null, completedAt
			}).where(eq(schema.shoppingPushHistory.id, historyId!)).run();
			return successful.map((item) => item.ref);
		});
		return json({ ok: failed.length === 0, uncertain: false, reason, productsPushed, freetextPushed, failed, destination, markedBoughtRefs, accountName: getAHStatus().memberName });
	} catch (cause) {
		const definite = cause instanceof AHNotConnectedError;
		reason = definite ? AH_NOT_CONNECTED : 'AH may have received part of this push. Review the basket before trying again.';
		if (historyId != null) {
			db.transaction((tx) => {
				const completedAt = new Date();
				const rows: (typeof schema.shoppingPushItems.$inferInsert)[] = preview.items.map((item) => {
					const decision = decisions.get(item.ref)!;
					const product = decision.mode === 'product' ? item.offeredProducts.find((candidate) => candidate.id === decision.productId) : undefined;
					const status = decision.mode === 'exclude'
						? 'skipped'
						: successfulRefs.has(item.ref)
							? 'success'
							: uncertainRefs.has(item.ref) || !definite
								? 'uncertain'
								: 'failed';
					return {
						pushId: historyId!, sourceRef: item.entryIds.join(','), sourceName: item.term,
						amount: item.amount, unit: item.unit, mode: decision.mode === 'exclude' ? 'skip' : decision.mode,
						ahProductId: product?.id ?? null, ahProductName: product?.name ?? null,
						quantity: decision.mode === 'product' ? decision.qty : decision.mode === 'freetext' ? 1 : null,
						destination, status, failureReason: status === 'success' || status === 'skipped' ? null : reason,
						createdAt: completedAt
					};
				});
				tx.insert(schema.shoppingPushItems).values(rows).run();
				const knownSuccessfulIds = preview.items.filter((item) => successfulRefs.has(item.ref)).flatMap((item) => item.entryIds);
				if (knownSuccessfulIds.length) tx.update(schema.shoppingWeekEntries).set({ bought: true, revision: sql`${schema.shoppingWeekEntries.revision} + 1`, updatedAt: completedAt }).where(inArray(schema.shoppingWeekEntries.id, knownSuccessfulIds)).run();
				tx.update(schema.shoppingPushHistory).set({
					productsPushed, freetextPushed, failedCount: failed.length,
					skippedCount: preview.items.filter((item) => decisions.get(item.ref)?.mode === 'exclude').length,
					attemptStatus: definite ? 'failed' : 'uncertain', attemptError: reason, completedAt
				}).where(eq(schema.shoppingPushHistory.id, historyId!)).run();
			});
		}
		return json({
			ok: false,
			uncertain: !definite,
			reason,
			productsPushed,
			freetextPushed,
			failed,
			destination,
			markedBoughtRefs: [...successfulRefs],
			accountName: getAHStatus().memberName
		});
	}
};
