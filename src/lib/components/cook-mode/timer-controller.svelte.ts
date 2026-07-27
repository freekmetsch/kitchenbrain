export type CookTimerSnapshot = {
	runningIdxs: Set<number>;
	doneIdxs: Set<number>;
};

export class CookTimerController {
	ends = $state<Record<number, number>>({});
	order = $state<number[]>([]);
	now = $state(0);

	readonly nowSec = $derived(Math.floor(this.now / 1000));
	readonly snapshot = $derived.by<CookTimerSnapshot>(() => {
		const runningIdxs = new Set<number>();
		const doneIdxs = new Set<number>();
		for (const [key, deadline] of Object.entries(this.ends)) {
			const index = Number(key);
			if (deadline > this.now) runningIdxs.add(index);
			else doneIdxs.add(index);
		}
		return { runningIdxs, doneIdxs };
	});
	readonly anyRunning = $derived(this.snapshot.runningIdxs.size > 0);

	#fired = new Set<number>();

	constructor(initialNow = Date.now()) {
		this.now = initialNow;
	}

	start(index: number, seconds: number, now = Date.now()): number {
		const deadline = now + seconds * 1000;
		this.now = now;
		this.ends[index] = deadline;
		if (!this.order.includes(index)) this.order = [...this.order, index];
		this.#fired.delete(index);
		return deadline;
	}

	cancel(index: number): void {
		delete this.ends[index];
		this.order = this.order.filter((candidate) => candidate !== index);
		this.#fired.delete(index);
	}

	tick(now: number): number[] {
		this.now = now;
		const fired: number[] = [];
		for (const [key, deadline] of Object.entries(this.ends)) {
			const index = Number(key);
			if (deadline <= now && !this.#fired.has(index)) {
				this.#fired.add(index);
				fired.push(index);
			}
		}
		return fired;
	}

	restore(ends: Record<number, number>, order: number[], now = Date.now()): void {
		this.ends = { ...ends };
		this.order = order.filter((index) => this.ends[index] != null);
		this.now = now;
		this.#fired.clear();
		for (const [key, deadline] of Object.entries(this.ends)) {
			if (deadline <= now) this.#fired.add(Number(key));
		}
	}

	reset(now = Date.now()): void {
		this.ends = {};
		this.order = [];
		this.now = now;
		this.#fired.clear();
	}
}
