import { getContext, setContext } from 'svelte';
import type { CookTimerCoordinator } from './cook-timer-coordinator.svelte';

const COOK_TIMER_COORDINATOR_CONTEXT = Symbol('cook-timer-coordinator');

export type CookTimerCoordinatorContextValue = {
	readonly coordinator: CookTimerCoordinator | null;
};

export function provideCookTimerCoordinator(
	context: CookTimerCoordinatorContextValue
): void {
	setContext(COOK_TIMER_COORDINATOR_CONTEXT, context);
}

export function useCookTimerCoordinator(): CookTimerCoordinator {
	const coordinator = getContext<CookTimerCoordinatorContextValue | undefined>(
		COOK_TIMER_COORDINATOR_CONTEXT
	)?.coordinator;
	if (!coordinator) throw new Error('Cook timer coordinator is unavailable');
	return coordinator;
}
