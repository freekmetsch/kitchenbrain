export type CookProgressState = {
	currentKey: string | null;
	completed: Set<string>;
};

export type CookProgressEvent =
	| { type: 'select'; key: string }
	| { type: 'toggle'; key: string };

export function cookStepKey(index: number, streamId: string): string {
	return `${index}:${streamId}`;
}

function nextIncomplete(keys: string[], completed: Set<string>, afterKey: string): string | null {
	const start = Math.max(0, keys.indexOf(afterKey));
	for (let offset = 1; offset <= keys.length; offset += 1) {
		const candidate = keys[(start + offset) % keys.length];
		if (!completed.has(candidate)) return candidate;
	}
	return null;
}

export function normalizeCookProgress(
	keys: string[],
	completed: Set<string>,
	restoredKey: string | null | undefined
): CookProgressState {
	if (!keys.length) return { currentKey: null, completed };
	if (restoredKey && keys.includes(restoredKey) && !completed.has(restoredKey)) {
		return { currentKey: restoredKey, completed };
	}
	if (restoredKey && keys.includes(restoredKey)) {
		return { currentKey: nextIncomplete(keys, completed, restoredKey) ?? keys.at(-1)!, completed };
	}
	return { currentKey: keys.find((key) => !completed.has(key)) ?? keys.at(-1)!, completed };
}

export function reduceCookProgress(
	keys: string[],
	state: CookProgressState,
	event: CookProgressEvent
): CookProgressState {
	if (!keys.includes(event.key)) return state;
	if (event.type === 'select') return { ...state, currentKey: event.key };

	const completed = new Set(state.completed);
	if (completed.has(event.key)) {
		completed.delete(event.key);
		return { currentKey: event.key, completed };
	}
	completed.add(event.key);
	if (state.currentKey !== event.key) return { currentKey: state.currentKey, completed };
	return { currentKey: nextIncomplete(keys, completed, event.key) ?? event.key, completed };
}
