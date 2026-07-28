import { readCookSession, type CookSessionReadResult, type CookSessionV4 } from './cook_session';

export type CookSessionStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export class CookSessionStorageController {
	readonly key: string;
	#storage: CookSessionStorage | null;

	constructor(key: string, storage?: CookSessionStorage | null) {
		this.key = key;
		this.#storage =
			storage === undefined
				? typeof localStorage === 'undefined'
					? null
					: localStorage
				: storage;
	}

	read(): CookSessionReadResult {
		try {
			const raw = this.#storage?.getItem(this.key) ?? null;
			const result = readCookSession(raw ? JSON.parse(raw) : null);
			if (result.state === 'discard') this.clear();
			return result;
		} catch {
			this.clear();
			return { state: 'discard' };
		}
	}

	save(session: CookSessionV4 | unknown): void {
		try {
			this.#storage?.setItem(this.key, JSON.stringify(session));
		} catch {
			// Quota and private-mode failures keep the current in-memory session usable.
		}
	}

	clear(): void {
		try {
			this.#storage?.removeItem(this.key);
		} catch {
			// Storage is an optional persistence layer.
		}
	}
}
