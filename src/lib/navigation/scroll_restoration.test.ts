import { describe, expect, it } from 'vitest';
import { MainScrollRestoration } from './scroll_restoration';

describe('MainScrollRestoration', () => {
	it('starts new forward navigations at the top', () => {
		const restoration = new MainScrollRestoration();
		restoration.capture(240);

		expect(restoration.destination('link')).toBe(0);
	});

	it('restores each history entry on back and forward navigation', () => {
		const restoration = new MainScrollRestoration();
		restoration.capture(120);
		restoration.destination('link');
		restoration.capture(480);
		restoration.destination('link');
		restoration.capture(60);

		expect(restoration.destination('popstate', -1)).toBe(480);
		expect(restoration.destination('popstate', -1)).toBe(120);
		expect(restoration.destination('popstate', 2)).toBe(60);
	});

	it('drops abandoned forward positions after navigating from history', () => {
		const restoration = new MainScrollRestoration();
		restoration.capture(10);
		restoration.destination('link');
		restoration.capture(20);
		restoration.destination('link');
		restoration.capture(30);

		restoration.destination('popstate', -1);
		expect(restoration.destination('goto')).toBe(0);
		restoration.capture(99);
		expect(restoration.destination('popstate', -1)).toBe(20);
		expect(restoration.destination('popstate', 1)).toBe(99);
	});

	it('does not move the scroller during initial hydration or unload', () => {
		const restoration = new MainScrollRestoration();

		expect(restoration.destination('enter')).toBeNull();
		expect(restoration.destination('leave')).toBeNull();
	});
});
