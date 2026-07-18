const fixedSurfaceHeights = new Map<symbol, number>();

function publishFixedSurfaceHeight(): void {
	const height = Math.max(0, ...fixedSurfaceHeights.values());
	document.documentElement.style.setProperty('--ui-fixed-bar-height', `${height}px`);
}

/** Registers a fixed action bar so page padding and transient overlays clear it. */
export function registerFixedSurface(node: HTMLElement): () => void {
	const id = Symbol('fixed-surface');
	const update = () => {
		fixedSurfaceHeights.set(id, node.getBoundingClientRect().height);
		publishFixedSurfaceHeight();
	};
	const observer = new ResizeObserver(update);
	observer.observe(node);
	update();

	return () => {
		observer.disconnect();
		fixedSurfaceHeights.delete(id);
		publishFixedSurfaceHeight();
	};
}
