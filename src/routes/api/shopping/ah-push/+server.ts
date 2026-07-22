import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db/index';
import * as schema from '$lib/server/db/schema';
import {
	addProductItems,
	addFreetextItems,
	getActiveOrder,
	addProductsToOrder,
	getAHStatus,
	AHNotConnectedError,
	AH_NOT_CONNECTED
} from '$lib/server/ah/client';
import type { PushProduct, PushFreetext, PushSkipped } from '$lib/shopping_ah';
import { packQuantitySchema } from '$lib/shopping_ah';
import { z } from 'zod';
import { readJsonBody } from '$lib/server/api_body';
import { isoDateSchema } from '$lib/date_schema';
import { findShoppingOverride } from '$lib/server/shopping_overrides';

type Failed = { term: string; kind: 'product' | 'freetext' };
type PushedChoice = PushProduct | PushFreetext;

const ChoiceBase = z.object({
	ref: z.string().min(1).max(256),
	sourceName: z.string().min(1).max(256),
	term: z.string().min(1).max(256),
	amount: z.string().max(64).nullable(),
	unit: z.string().max(64).nullable()
});
const BodySchema = z.object({
	weekStart: isoDateSchema.optional(),
	products: z.array(ChoiceBase.extend({
		id: z.string().min(1).max(256),
		name: z.string().min(1).max(512),
		qty: packQuantitySchema
	})).default([]),
	freetext: z.array(ChoiceBase).default([]),
	skipped: z.array(ChoiceBase).default([])
});

/**
 * AH-INVARIANT: free-text descriptions must stay Dutch. The term is the Dutch
 * shopping-list name; amount/unit originate from the same Dutch recipe/manual
 * data and are appended verbatim so the AH line reads "snoeptomaatjes 250 g"
 * instead of a bare name (F13).
 */
function freetextDescription({ term, amount, unit }: PushFreetext): string {
	const qty = (amount ?? '').trim();
	const u = (unit ?? '').trim();
	if (qty && u) return `${term} ${qty} ${u}`;
	if (qty) return `${term} ${qty}`;
	return term;
}

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) error(401, 'Unauthorized');

	const body = await readJsonBody(request, BodySchema);
	const weekStart = body.weekStart;
	const products = body.products as PushProduct[];
	const freetext = body.freetext as PushFreetext[];
	const skipped = body.skipped as PushSkipped[];

	let productsPushed = 0;
	let freetextPushed = 0;
	const failed: Failed[] = [];
	const successfulChoices: PushedChoice[] = [];
	const failedRefs = new Set<string>();
	const markedBoughtRefs: string[] = [];
	let reason: string | undefined;
	let destination: 'order' | 'list' = 'list';

	// One exit shape for every path — ok is true only when nothing failed.
	const respond = () =>
		json({
			ok: !reason && failed.length === 0,
			reason,
			productsPushed,
			freetextPushed,
			failed,
			destination,
			markedBoughtRefs,
			accountName: getAHStatus().memberName
		});

	if (!getAHStatus().connected) {
		reason = AH_NOT_CONNECTED;
		return respond();
	}

	try {
		// An open order (unplaced basket) is the household's normal state, and it
		// locks the shopping-list write path ("Server in order mode", 412 —
		// verified live 2026-07-08). Products then go into the order instead.
		const order = await getActiveOrder();
		if (order) destination = 'order';

		if (products.length) {
			const items = products.map((p) => ({ id: p.id, qty: p.qty }));
			const res = order ? await addProductsToOrder(order.id, items) : await addProductItems(items);
			if (res.ok) {
				productsPushed = products.length;
				successfulChoices.push(...products);
			} else {
				failed.push(...products.map((p) => ({ term: p.term, kind: 'product' as const })));
				products.forEach((p) => failedRefs.add(p.ref));
				reason = `Albert Heijn rejected the product push (HTTP ${res.status}).`;
			}
		}

		if (freetext.length) {
			const descriptions = freetext.map((item) => ({ item, description: freetextDescription(item) }));
			if (order) {
				// An order holds real products only — free text has nowhere to go
				// until these items are matched to products.
				failed.push(...descriptions.map(({ description }) => ({ term: description, kind: 'freetext' as const })));
				freetext.forEach((item) => failedRefs.add(item.ref));
				reason ??= 'There is an open AH order, and free-text items cannot be added to an order — only matched products were sent.';
			} else {
				// AH-INVARIANT: free-text terms must remain Dutch for the AH shopping list.
				const res = await addFreetextItems(descriptions.map(({ description }) => description));
				freetextPushed = res.pushed.length;
				if (res.failed.length) {
					failed.push(...res.failed.map((term) => ({ term, kind: 'freetext' as const })));
					const failedDescriptions = new Map<string, number>();
					for (const description of res.failed) failedDescriptions.set(description, (failedDescriptions.get(description) ?? 0) + 1);
					for (const { item, description } of descriptions) {
						const count = failedDescriptions.get(description) ?? 0;
						if (count > 0) {
							failedDescriptions.set(description, count - 1);
							failedRefs.add(item.ref);
						} else successfulChoices.push(item);
					}
					reason ??= 'Some items could not be added as free text.';
				} else {
					successfulChoices.push(...freetext);
				}
			}
		}

		if (weekStart && (successfulChoices.length || failedRefs.size || skipped.length)) {
			try {
				const recordedBoughtRefs = db.transaction((tx) => {
					const now = new Date();
					const history = tx
						.insert(schema.shoppingPushHistory)
						.values({
							weekStartDate: weekStart,
							userId: locals.user!.id,
							destination,
							accountName: getAHStatus().memberName,
							productsPushed,
							freetextPushed,
							failedCount: failedRefs.size,
							skippedCount: skipped.length,
							createdAt: now
						})
						.returning({ id: schema.shoppingPushHistory.id })
						.get();
					if (!history) throw new Error('shopping push history insert returned no id');

					const successRefs = new Set(successfulChoices.map((choice) => choice.ref));
					const rows: (typeof schema.shoppingPushItems.$inferInsert)[] = [
						...products.map((item) => ({
							pushId: history.id,
							sourceRef: item.sourceName,
							sourceName: item.sourceName,
							amount: item.amount,
							unit: item.unit,
							mode: 'product' as const,
							ahProductId: item.id,
							ahProductName: item.name,
							quantity: item.qty,
							destination,
							status: successRefs.has(item.ref) ? ('success' as const) : ('failed' as const),
							failureReason: successRefs.has(item.ref) ? null : (reason ?? null),
							createdAt: now
						})),
						...freetext.map((item) => ({
							pushId: history.id,
							sourceRef: item.sourceName,
							sourceName: item.sourceName,
							amount: item.amount,
							unit: item.unit,
							mode: 'freetext' as const,
							ahProductId: null,
							ahProductName: null,
							quantity: 1,
							destination,
							status: successRefs.has(item.ref) ? ('success' as const) : ('failed' as const),
							failureReason: successRefs.has(item.ref) ? null : (reason ?? null),
							createdAt: now
						})),
						...skipped.map((item) => ({
							pushId: history.id,
							sourceRef: item.sourceName,
							sourceName: item.sourceName,
							amount: item.amount,
							unit: item.unit,
							mode: 'skip' as const,
							ahProductId: null,
							ahProductName: null,
							quantity: null,
							destination,
							status: 'skipped' as const,
							failureReason: null,
							createdAt: now
						}))
					];

					if (rows.length) tx.insert(schema.shoppingPushItems).values(rows).run();

					const refs: string[] = [];
					for (const choice of successfulChoices) {
						const existing = findShoppingOverride(tx, weekStart, choice.sourceName);

						if (existing) {
							tx.update(schema.shoppingListOverrides)
								.set({ bought: true })
								.where(eq(schema.shoppingListOverrides.id, existing.id))
								.run();
						} else {
							tx.insert(schema.shoppingListOverrides)
								.values({
									weekStartDate: weekStart,
									name: choice.sourceName,
									bought: true,
									manual: false,
									selectedName: choice.term === choice.sourceName ? null : choice.term,
									amount: choice.amount,
									unit: choice.unit,
									createdAt: now
								})
								.run();
						}
						refs.push(choice.ref);
					}
					return refs;
				});
				markedBoughtRefs.push(...recordedBoughtRefs);
			} catch (e) {
				console.error(`[ah] pushed items but failed to record shopping history: ${e instanceof Error ? e.message : e}`);
				reason ??= 'Items were sent to AH, but Household Brain could not record the local history.';
			}
		}
	} catch (e) {
		if (e instanceof AHNotConnectedError) reason = AH_NOT_CONNECTED;
		else {
			console.error(`[ah] push failed unexpectedly: ${e instanceof Error ? e.message : e}`);
			reason = 'Albert Heijn is unreachable right now — nothing (more) was added.';
		}
	}

	return respond();
};
