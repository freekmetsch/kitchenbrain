export type ScreenContextEntityKind =
	| 'recipe'
	| 'inventory'
	| 'meal-plan'
	| 'shopping'
	| 'settings'
	| 'other';

export type ScreenContextV1 = {
	v: 1;
	routeId: string;
	label: string;
	entity?: {
		kind: ScreenContextEntityKind;
		id?: string;
		label?: string;
	};
	facts?: Array<{ key: string; value: string | number | boolean }>;
	interaction?: { mode: 'view' | 'edit'; dirty: boolean };
};
