import type { Action } from 'svelte/action';

const FOCUSABLE = 'button:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])';

/**
 * Makes a horizontal chip rail keyboard-navigable and keeps the focused chip
 * inside the visible portion of the scroller.
 */
export const scrollRail: Action<HTMLElement> = (node) => {
	function keepVisible(target: Element) {
		if (!(target instanceof HTMLElement) || !target.matches(FOCUSABLE)) return;
		target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
	}

	function onFocusIn(event: FocusEvent) {
		if (event.target instanceof Element) keepVisible(event.target);
	}

	function onKeyDown(event: KeyboardEvent) {
		if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
		const controls = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE));
		const index = controls.indexOf(document.activeElement as HTMLElement);
		if (index < 0) return;
		const direction = event.key === 'ArrowRight' ? 1 : -1;
		const next = controls[index + direction];
		if (!next) return;
		event.preventDefault();
		next.focus();
	}

	node.addEventListener('focusin', onFocusIn);
	node.addEventListener('keydown', onKeyDown);

	return {
		destroy() {
			node.removeEventListener('focusin', onFocusIn);
			node.removeEventListener('keydown', onKeyDown);
		}
	};
};
