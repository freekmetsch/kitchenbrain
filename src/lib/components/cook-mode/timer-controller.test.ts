import { describe, expect, it } from 'vitest';
import { CookTimerController } from './timer-controller.svelte';

describe('CookTimerController', () => {
	it('keeps timer state isolated per cooking surface', () => {
		const first = new CookTimerController(1_000);
		const second = new CookTimerController(1_000);

		expect(first.start(0, 10, 1_000)).toBe(11_000);

		expect(first.order).toEqual([0]);
		expect(first.ends).toEqual({ 0: 11_000 });
		expect(second.order).toEqual([]);
		expect(second.ends).toEqual({});
	});

	it('fires once at the wall-clock deadline and supports cancellation', () => {
		const timers = new CookTimerController(1_000);
		timers.start(0, 10, 1_000);
		timers.start(1, 20, 1_000);

		expect(timers.tick(10_999)).toEqual([]);
		expect(timers.tick(11_000)).toEqual([0]);
		expect(timers.tick(12_000)).toEqual([]);

		timers.cancel(1);
		expect(timers.order).toEqual([0]);
		expect(timers.ends).toEqual({ 0: 11_000 });
	});

	it('restores expired timers as already fired and resets atomically', () => {
		const timers = new CookTimerController(20_000);

		timers.restore({ 0: 10_000, 1: 30_000 }, [0, 1], 20_000);
		expect(timers.tick(20_000)).toEqual([]);
		expect(timers.snapshot.doneIdxs).toEqual(new Set([0]));
		expect(timers.snapshot.runningIdxs).toEqual(new Set([1]));

		timers.reset(25_000);
		expect(timers.order).toEqual([]);
		expect(timers.ends).toEqual({});
		expect(timers.now).toBe(25_000);
	});
});
