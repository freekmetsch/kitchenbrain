import { base } from '$app/paths';

// Client half of the keep-stocked seam (server half: $lib/server/freezer_staple).
// One PATCH shape for every surface that toggles the flag; turning it off omits
// the target — the server drops it and records the opt-out.
export async function patchKeepStocked(
	slug: string,
	on: boolean,
	target?: number | null
): Promise<boolean> {
	try {
		const res = await fetch(`${base}/api/recipes/${slug}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				is_freezer_staple: on,
				...(on && target != null ? { target_portions: target } : {})
			})
		});
		return res.ok;
	} catch {
		return false;
	}
}
