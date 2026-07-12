// Global toast store — single active toast (matches the /inventory specimen model).
// Behavior extracted from inventory/+page.svelte:1104-1114. Rendered by
// $lib/components/ui/Toast.svelte, mounted once in the root layout by the first
// consumer (Phase 2). Frozen recipe: docs/v2-ui-primitives.md.

export type ToastVariant = 'success' | 'error' | 'undo';

export interface ToastAction {
	label: string;
	run: () => void;
}

export interface ToastState {
	msg: string;
	variant: ToastVariant;
	action?: ToastAction;
}

let current = $state<ToastState | null>(null);
let timer: ReturnType<typeof setTimeout> | null = null;

// 6s when there's an action to read + tap; 3.5s for a plain confirmation.
const DURATION_WITH_ACTION = 6000;
const DURATION_PLAIN = 3500;

function show(
	msg: string,
	opts: { variant?: ToastVariant; action?: ToastAction; duration?: number } = {}
): void {
	if (timer) clearTimeout(timer);
	current = { msg, variant: opts.variant ?? 'success', action: opts.action };
	const duration = opts.duration ?? (opts.action ? DURATION_WITH_ACTION : DURATION_PLAIN);
	timer = setTimeout(() => {
		current = null;
		timer = null;
	}, duration);
}

function dismiss(): void {
	if (timer) {
		clearTimeout(timer);
		timer = null;
	}
	current = null;
}

export const toast = {
	/** Reactive current toast (getter preserves cross-module reactivity). */
	get current() {
		return current;
	},
	show,
	dismiss,
	success: (msg: string, action?: ToastAction) => show(msg, { variant: 'success', action }),
	error: (msg: string, action?: ToastAction) => show(msg, { variant: 'error', action }),
	/** Convenience for the delete-with-undo idiom. */
	undo: (msg: string, run: () => void) =>
		show(msg, { variant: 'undo', action: { label: 'Undo', run } })
};
