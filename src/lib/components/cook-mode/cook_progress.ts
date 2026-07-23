export type CookProgressState = {
	currentKey: string | null;
};

export function cookStepKey(index: number, streamId: string): string {
	return `${index}:${streamId}`;
}

export function normalizeCookProgress(
	keys: string[],
	restoredKey: string | null | undefined
): CookProgressState {
	if (!keys.length) return { currentKey: null };
	if (restoredKey && keys.includes(restoredKey)) return { currentKey: restoredKey };
	return { currentKey: keys[0] };
}

export function selectCookStep(
	keys: string[],
	state: CookProgressState,
	key: string
): CookProgressState {
	if (!keys.includes(key)) return state;
	return { currentKey: key };
}
