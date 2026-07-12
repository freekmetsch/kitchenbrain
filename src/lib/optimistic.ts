import { toast } from '$lib/stores/toast.svelte';

/**
 * Optimistic-mutation helper. Apply the UI change synchronously at the call site
 * *before* calling this, then pass the server commit as `fn`. On failure the
 * `rollback` reverts the optimistic change and an error toast explains why.
 *
 *   items[i].bought = next;                       // optimistic apply
 *   await optimistic(
 *     () => fetch('/api/...', { method: 'PATCH', ... }),
 *     () => { items[i].bought = !next; },         // rollback
 *     'Could not update — check your connection.' // fail message
 *   );
 *
 * A returned `Response` is treated as failure when `!res.ok`, so a plain fetch
 * call needs no extra `.ok` check. Returns true on success, false on failure.
 */
export async function optimistic(
	fn: () => Promise<Response | unknown>,
	rollback: () => void,
	failMsg: string
): Promise<boolean> {
	try {
		const res = await fn();
		if (res instanceof Response && !res.ok) throw new Error(`HTTP ${res.status}`);
		return true;
	} catch {
		rollback();
		toast.error(failMsg);
		return false;
	}
}
