export type TimerReceiptEvent =
	| 'worker-received'
	| 'notification-shown'
	| 'display-failed'
	| 'clicked';

export type TimerReceipt = {
	id: string;
	event: TimerReceiptEvent;
	occurredAt: number;
	errorCategory?: 'permission' | 'show-notification' | 'unknown';
};

export type StoredTimerReceipt = TimerReceipt & {
	key: string;
};

type TimerReceiptOutboxAdapters = {
	send(receipt: TimerReceipt): Promise<boolean>;
	list(): Promise<StoredTimerReceipt[]>;
	put(receipt: StoredTimerReceipt): Promise<void>;
	remove(key: string): Promise<void>;
	now(): number;
};

const MAX_RECEIPTS = 100;
const MAX_AGE_MS = 10 * 60_000;

export class TimerReceiptOutbox {
	readonly #adapters: TimerReceiptOutboxAdapters;

	constructor(adapters: TimerReceiptOutboxAdapters) {
		this.#adapters = adapters;
	}

	async record(receipt: TimerReceipt): Promise<void> {
		try {
			if (await this.#adapters.send(receipt)) return;
		} catch {
			// A later worker/page wake retries the bounded local receipt.
		}
		if (receipt.occurredAt < this.#adapters.now() - MAX_AGE_MS) return;
		await this.#adapters.put({
			...receipt,
			key: `${receipt.id}:${receipt.event}`
		});
		await this.#trim();
	}

	async flush(): Promise<void> {
		const now = this.#adapters.now();
		const receipts = (await this.#adapters.list()).sort(
			(left, right) => left.occurredAt - right.occurredAt
		);
		for (const receipt of receipts) {
			if (receipt.occurredAt < now - MAX_AGE_MS) {
				await this.#adapters.remove(receipt.key);
				continue;
			}
			try {
				if (await this.#adapters.send(receipt)) {
					await this.#adapters.remove(receipt.key);
				}
			} catch {
				// Keep the receipt for the next bounded retry.
			}
		}
	}

	async #trim(): Promise<void> {
		const receipts = (await this.#adapters.list()).sort(
			(left, right) => right.occurredAt - left.occurredAt
		);
		await Promise.all(
			receipts.slice(MAX_RECEIPTS).map((receipt) => this.#adapters.remove(receipt.key))
		);
	}
}

export function createIndexedDbTimerReceiptAdapters(
	send: TimerReceiptOutboxAdapters['send']
): TimerReceiptOutboxAdapters {
	let connection: Promise<IDBDatabase> | null = null;
	const database = () =>
		(connection ??= new Promise<IDBDatabase>((resolve, reject) => {
			const request = indexedDB.open('keukenbrein-timer-receipts', 1);
			request.onupgradeneeded = () => {
				if (!request.result.objectStoreNames.contains('receipts')) {
					request.result.createObjectStore('receipts', { keyPath: 'key' });
				}
			};
			request.onblocked = () => {
				connection = null;
				reject(new Error('Timer receipt database upgrade blocked'));
			};
			request.onsuccess = () => {
				const db = request.result;
				db.onclose = () => {
					connection = null;
				};
				db.onversionchange = () => {
					db.close();
					connection = null;
				};
				resolve(db);
			};
			request.onerror = () => {
				connection = null;
				reject(request.error);
			};
		}));
	const transaction = async <T>(
		mode: IDBTransactionMode,
		run: (store: IDBObjectStore) => IDBRequest<T>
	): Promise<T> => {
		const db = await database();
		return new Promise<T>((resolve, reject) => {
			const tx = db.transaction('receipts', mode);
			let result: T;
			let request: IDBRequest<T>;
			try {
				request = run(tx.objectStore('receipts'));
			} catch (cause) {
				reject(cause);
				return;
			}
			request.onsuccess = () => {
				result = request.result;
			};
			request.onerror = () => reject(request.error);
			tx.oncomplete = () => resolve(result);
			tx.onerror = () => reject(tx.error ?? request.error);
			tx.onabort = () => reject(tx.error ?? new Error('Timer receipt transaction aborted'));
		});
	};
	return {
		send,
		list: () => transaction('readonly', (store) => store.getAll()),
		put: async (receipt) => {
			await transaction('readwrite', (store) => store.put(receipt));
		},
		remove: async (key) => {
			await transaction('readwrite', (store) => store.delete(key));
		},
		now: () => Date.now()
	};
}
