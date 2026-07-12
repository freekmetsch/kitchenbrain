import type { Action } from 'svelte/action';

interface SwipeOptions {
	onSwipeLeft?: () => void;
	threshold?: number;
}

export const swipe: Action<HTMLElement, SwipeOptions> = (node, initialOptions) => {
	let options = initialOptions;
	let startX = 0;
	let startY = 0;
	let tracking = false;
	let dx = 0;

	function onTouchStart(e: TouchEvent) {
		startX = e.touches[0].clientX;
		startY = e.touches[0].clientY;
		tracking = true;
		dx = 0;
		node.style.transition = 'none';
	}

	function onTouchMove(e: TouchEvent) {
		if (!tracking) return;
		const moveX = e.touches[0].clientX - startX;
		const moveY = e.touches[0].clientY - startY;
		if (Math.abs(moveY) > Math.abs(moveX)) {
			tracking = false;
			node.style.transform = '';
			return;
		}
		if (moveX < 0) {
			dx = Math.max(moveX, -120);
			node.style.transform = `translateX(${dx}px)`;
		}
	}

	function onTouchEnd() {
		if (!tracking) return;
		tracking = false;
		const threshold = options?.threshold ?? 80;
		node.style.transition = 'transform 0.2s ease';
		if (Math.abs(dx) >= threshold) {
			node.style.transform = 'translateX(-100%)';
			setTimeout(() => options?.onSwipeLeft?.(), 200);
		} else {
			dx = 0;
			node.style.transform = '';
		}
	}

	node.addEventListener('touchstart', onTouchStart, { passive: true });
	node.addEventListener('touchmove', onTouchMove, { passive: true });
	node.addEventListener('touchend', onTouchEnd);

	return {
		update(newOptions: SwipeOptions) {
			options = newOptions;
		},
		destroy() {
			node.removeEventListener('touchstart', onTouchStart);
			node.removeEventListener('touchmove', onTouchMove);
			node.removeEventListener('touchend', onTouchEnd);
		}
	};
};
