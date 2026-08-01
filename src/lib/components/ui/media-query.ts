import { onMount } from 'svelte';

export function onMediaQuery(
	queryText: string | (() => string),
	onChange: (matches: boolean) => void
): void {
	onMount(() => {
		const query = window.matchMedia(typeof queryText === 'function' ? queryText() : queryText);
		const sync = () => onChange(query.matches);
		sync();
		query.addEventListener('change', sync);
		return () => query.removeEventListener('change', sync);
	});
}
