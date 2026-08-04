import { describe, expect, it, vi } from 'vitest';
import { PlannedServingsRegistry, type PlannedServingMeal } from './planned_servings_registry';

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((resolvePromise, rejectPromise) => {
		resolve = resolvePromise;
		reject = rejectPromise;
	});
	return { promise, resolve, reject };
}

describe('PlannedServingsRegistry', () => {
	it('coalesces rapid changes and converges on the last absolute target', async () => {
		const firstWrite = deferred<PlannedServingMeal>();
		const secondWrite = deferred<PlannedServingMeal>();
		const write = vi
			.fn<(mealId: number, servings: number) => Promise<PlannedServingMeal>>()
			.mockImplementationOnce(() => firstWrite.promise)
			.mockImplementationOnce(() => secondWrite.promise);
		const registry = new PlannedServingsRegistry({ write });
		registry.sync({ id: 7, servings: 4 });

		const first = registry.change(7, 1);
		const second = registry.change(7, 1);

		expect(registry.snapshot(7)).toMatchObject({ desired: 6, confirmed: 4, pending: true });
		expect(write).toHaveBeenCalledTimes(1);
		expect(write).toHaveBeenNthCalledWith(1, 7, 5);

		firstWrite.resolve({ id: 7, servings: 5 });
		await vi.waitFor(() => expect(write).toHaveBeenCalledTimes(2));
		expect(write).toHaveBeenNthCalledWith(2, 7, 6);
		secondWrite.resolve({ id: 7, servings: 6 });

		await expect(first).resolves.toBe(true);
		await expect(second).resolves.toBe(true);
		expect(registry.snapshot(7)).toMatchObject({
			desired: 6,
			confirmed: 6,
			pending: false,
			lastWriteSucceeded: true
		});
	});

	it('can unsubscribe, resync, and write in the opposite direction after navigation', async () => {
		const write = vi
			.fn<(mealId: number, servings: number) => Promise<PlannedServingMeal>>()
			.mockResolvedValueOnce({ id: 7, servings: 5 })
			.mockResolvedValueOnce({ id: 7, servings: 4 });
		const registry = new PlannedServingsRegistry({ write });
		const stopFirst = registry.subscribe({ id: 7, servings: 4 }, () => {});

		await expect(registry.change(7, 1)).resolves.toBe(true);
		stopFirst();
		const stopSecond = registry.subscribe({ id: 7, servings: 5 }, () => {});
		await expect(registry.change(7, -1)).resolves.toBe(true);
		stopSecond();

		expect(write).toHaveBeenNthCalledWith(1, 7, 5);
		expect(write).toHaveBeenNthCalledWith(2, 7, 4);
		expect(registry.snapshot(7)).toMatchObject({ desired: 4, confirmed: 4, pending: false });
	});

	it('discards an in-flight response without resurrecting a deleted meal', async () => {
		const pendingWrite = deferred<PlannedServingMeal>();
		const registry = new PlannedServingsRegistry({ write: () => pendingWrite.promise });
		registry.sync({ id: 7, servings: 4 });
		const changed = registry.change(7, 1);

		registry.discard(7);
		pendingWrite.resolve({ id: 7, servings: 5 });

		await expect(changed).resolves.toBe(false);
		expect(registry.snapshot(7)).toBeNull();
	});

	it('exposes a failed settlement after reverting to the confirmed value', async () => {
		const onError = vi.fn();
		const registry = new PlannedServingsRegistry({
			write: () => Promise.reject(new Error('save failed')),
			onError
		});
		registry.sync({ id: 7, servings: 4 });

		await expect(registry.change(7, 1)).resolves.toBe(false);

		expect(onError).toHaveBeenCalledOnce();
		expect(registry.snapshot(7)).toMatchObject({
			desired: 4,
			confirmed: 4,
			pending: false,
			lastWriteSucceeded: false
		});
	});

	it('does not settle a write started by a listener with the previous result', async () => {
		const firstWrite = deferred<PlannedServingMeal>();
		const secondWrite = deferred<PlannedServingMeal>();
		const write = vi
			.fn<(mealId: number, servings: number) => Promise<PlannedServingMeal>>()
			.mockImplementationOnce(() => firstWrite.promise)
			.mockImplementationOnce(() => secondWrite.promise);
		const registry = new PlannedServingsRegistry({ write });
		let listenerWrite: Promise<boolean> | null = null;
		registry.subscribe({ id: 7, servings: 4 }, (snapshot) => {
			if (!snapshot.pending && snapshot.lastWriteSucceeded === true && !listenerWrite) {
				listenerWrite = registry.change(7, 1);
			}
		});

		const initialWrite = registry.change(7, 1);
		firstWrite.resolve({ id: 7, servings: 5 });

		await expect(initialWrite).resolves.toBe(true);
		await vi.waitFor(() => expect(write).toHaveBeenCalledTimes(2));
		expect(listenerWrite).not.toBeNull();
		secondWrite.reject(new Error('later save failed'));
		await expect(listenerWrite).resolves.toBe(false);
	});
});
