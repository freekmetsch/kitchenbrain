import type { NavigationType } from '@sveltejs/kit';

/**
 * Tracks scroll positions for the app's custom main scroller. The browser only
 * restores the window scroller, so client-side history needs its own index.
 */
export class MainScrollRestoration {
	private entryIndex = 0;
	private readonly positions = new Map<number, number>();

	capture(scrollTop: number): void {
		this.positions.set(this.entryIndex, Math.max(0, scrollTop));
	}

	destination(type: NavigationType, delta?: number): number | null {
		if (type === 'enter' || type === 'leave') return null;

		if (type === 'popstate') {
			this.entryIndex += delta ?? 0;
			return this.positions.get(this.entryIndex) ?? 0;
		}

		// A new forward navigation replaces any history entries that were ahead
		// after a Back action. Its new page always starts at the top.
		for (const index of this.positions.keys()) {
			if (index > this.entryIndex) this.positions.delete(index);
		}
		this.entryIndex += 1;
		this.positions.set(this.entryIndex, 0);
		return 0;
	}
}
