export type PlannedServingMeal = {
	id: number;
	servings: number | null;
};

export type PlannedServingsSnapshot = {
	mealId: number;
	confirmed: number;
	desired: number;
	pending: boolean;
	lastWriteSucceeded: boolean | null;
};

type RegistryDependencies = {
	write: (mealId: number, servings: number) => Promise<PlannedServingMeal>;
	onError?: (error: unknown) => void;
};

type Entry = PlannedServingsSnapshot & {
	generation: number;
	running: Promise<boolean> | null;
	listeners: Set<(snapshot: PlannedServingsSnapshot) => void>;
	waiters: Array<(ok: boolean) => void>;
};

function boundedServings(value: number): number | null {
	return Number.isInteger(value) && value >= 1 && value <= 99 ? value : null;
}

export class PlannedServingsRegistry {
	readonly #dependencies: RegistryDependencies;
	readonly #entries = new Map<number, Entry>();

	constructor(dependencies: RegistryDependencies) {
		this.#dependencies = dependencies;
	}

	sync(meal: PlannedServingMeal): void {
		const servings = meal.servings == null ? null : boundedServings(meal.servings);
		if (servings == null) return;
		const current = this.#entries.get(meal.id);
		if (current?.pending) return;
		if (current) {
			current.confirmed = servings;
			current.desired = servings;
			current.lastWriteSucceeded = null;
			current.generation += 1;
			this.#notify(current);
			return;
		}
		this.#entries.set(meal.id, {
			mealId: meal.id,
			confirmed: servings,
			desired: servings,
			pending: false,
			lastWriteSucceeded: null,
			generation: 0,
			running: null,
			listeners: new Set(),
			waiters: []
		});
	}

	snapshot(mealId: number): PlannedServingsSnapshot | null {
		const entry = this.#entries.get(mealId);
		return entry ? this.#snapshot(entry) : null;
	}

	subscribe(
		meal: PlannedServingMeal,
		listener: (snapshot: PlannedServingsSnapshot) => void
	): () => void {
		this.sync(meal);
		const entry = this.#entries.get(meal.id);
		if (!entry) return () => {};
		entry.listeners.add(listener);
		listener(this.#snapshot(entry));
		return () => entry.listeners.delete(listener);
	}

	set(mealId: number, value: number): Promise<boolean> {
		const target = boundedServings(value);
		const entry = this.#entries.get(mealId);
		if (target == null || !entry || target === entry.desired) return Promise.resolve(false);
		entry.desired = target;
		entry.pending = true;
		entry.lastWriteSucceeded = null;
		this.#notify(entry);
		const settled = new Promise<boolean>((resolve) => entry.waiters.push(resolve));
		if (mealId >= 0) this.#start(entry);
		return settled;
	}

	change(mealId: number, delta: number): Promise<boolean> {
		const entry = this.#entries.get(mealId);
		if (!entry || !Number.isInteger(delta) || delta === 0) return Promise.resolve(false);
		return this.set(mealId, Math.max(1, Math.min(99, entry.desired + delta)));
	}

	async flush(mealId?: number): Promise<boolean> {
		const entries = mealId == null
			? [...this.#entries.values()]
			: [this.#entries.get(mealId)].filter((entry): entry is Entry => entry != null);
		const results = await Promise.all(entries.map((entry) => entry.running ?? true));
		return results.every(Boolean) && entries.every((entry) => !entry.pending);
	}

	discard(mealId: number): void {
		const entry = this.#entries.get(mealId);
		if (!entry) return;
		entry.generation += 1;
		this.#entries.delete(mealId);
		for (const resolve of entry.waiters.splice(0)) resolve(false);
	}

	transfer(fromMealId: number, meal: PlannedServingMeal): void {
		const from = this.#entries.get(fromMealId);
		const desired = from?.desired;
		if (from) this.discard(fromMealId);
		this.sync(meal);
		if (desired != null && desired !== meal.servings) void this.set(meal.id, desired);
	}

	#start(entry: Entry): void {
		if (entry.running) return;
		const generation = entry.generation;
		entry.running = this.#drain(entry, generation);
	}

	async #drain(entry: Entry, generation: number): Promise<boolean> {
		let ok = true;
		try {
			while (entry.desired !== entry.confirmed) {
				const target = entry.desired;
				const saved = await this.#dependencies.write(entry.mealId, target);
				if (this.#entries.get(entry.mealId) !== entry || entry.generation !== generation) {
					return false;
				}
				entry.confirmed = boundedServings(saved.servings ?? target) ?? target;
				this.#notify(entry);
			}
		} catch (error) {
			ok = false;
			entry.desired = entry.confirmed;
			this.#dependencies.onError?.(error);
		} finally {
			if (this.#entries.get(entry.mealId) === entry && entry.generation === generation) {
				entry.pending = false;
				entry.lastWriteSucceeded = ok;
				entry.running = null;
				this.#notify(entry);
				for (const resolve of entry.waiters.splice(0)) resolve(ok);
			}
		}
		return ok;
	}

	#snapshot(entry: Entry): PlannedServingsSnapshot {
		return {
			mealId: entry.mealId,
			confirmed: entry.confirmed,
			desired: entry.desired,
			pending: entry.pending,
			lastWriteSucceeded: entry.lastWriteSucceeded
		};
	}

	#notify(entry: Entry): void {
		const snapshot = this.#snapshot(entry);
		for (const listener of entry.listeners) listener(snapshot);
	}
}
