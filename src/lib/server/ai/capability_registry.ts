export type CapabilityDomain =
	| 'inventory'
	| 'planning'
	| 'recipes'
	| 'shopping'
	| 'ah'
	| 'trust';

export type AssistantCapability = {
	exposed?: false;
	domain: CapabilityDomain;
	access: 'read' | 'write' | 'proposal';
	currentRead: 'none' | 'target' | 'conditional';
	confirmation: 'none' | 'risk-based' | 'always-review' | 'external-final';
	undo: 'none' | 'inventory-op' | 'atomic-batch' | 'compensating';
	externalEffect: 'none' | 'ah-read' | 'ah-basket';
	display: 'read' | 'write' | 'confirm' | 'proposal' | 'plan';
};

function capability(contract: AssistantCapability): AssistantCapability {
	return Object.freeze(contract);
}

/**
 * Consequence contract for every model-visible Assistant capability.
 *
 * This is the single source of truth for persistence classification. Target-specific
 * provenance and confirmation logic still live at their enforcement seams.
 */
export const ASSISTANT_CAPABILITIES = Object.freeze({
	get_inventory: capability({
		domain: 'inventory',
		access: 'read',
		currentRead: 'none',
		confirmation: 'none',
		undo: 'none',
		externalEffect: 'none',
		display: 'read'
	}),
	add_to_inventory: capability({
		domain: 'inventory',
		access: 'write',
		currentRead: 'conditional',
		confirmation: 'risk-based',
		undo: 'inventory-op',
		externalEffect: 'none',
		display: 'write'
	}),
	remove_from_inventory: capability({
		domain: 'inventory',
		access: 'write',
		currentRead: 'target',
		confirmation: 'risk-based',
		undo: 'inventory-op',
		externalEffect: 'none',
		display: 'confirm'
	}),
	update_inventory_item: capability({
		domain: 'inventory',
		access: 'write',
		currentRead: 'target',
		confirmation: 'none',
		undo: 'inventory-op',
		externalEffect: 'none',
		display: 'write'
	}),
	bulk_update_inventory: capability({
		domain: 'inventory',
		access: 'write',
		currentRead: 'target',
		confirmation: 'always-review',
		undo: 'atomic-batch',
		externalEffect: 'none',
		display: 'confirm'
	}),
	get_meal_plan: capability({
		domain: 'planning',
		access: 'read',
		currentRead: 'none',
		confirmation: 'none',
		undo: 'none',
		externalEffect: 'none',
		display: 'read'
	}),
	plan_meal: capability({
		exposed: false,
		domain: 'planning',
		access: 'write',
		currentRead: 'conditional',
		confirmation: 'none',
		undo: 'none',
		externalEffect: 'none',
		display: 'write'
	}),
	remove_meal: capability({
		exposed: false,
		domain: 'planning',
		access: 'write',
		currentRead: 'target',
		confirmation: 'none',
		undo: 'none',
		externalEffect: 'none',
		display: 'write'
	}),
	mark_meal_cooked: capability({
		domain: 'planning',
		access: 'write',
		currentRead: 'target',
		confirmation: 'none',
		undo: 'none',
		externalEffect: 'none',
		display: 'write'
	}),
	suggest_meals: capability({
		domain: 'planning',
		access: 'read',
		currentRead: 'none',
		confirmation: 'none',
		undo: 'none',
		externalEffect: 'none',
		display: 'read'
	}),
	propose_meal_plan: capability({
		domain: 'planning',
		access: 'proposal',
		currentRead: 'target',
		confirmation: 'always-review',
		undo: 'atomic-batch',
		externalEffect: 'none',
		display: 'proposal'
	}),
	get_recipe: capability({
		domain: 'recipes',
		access: 'read',
		currentRead: 'none',
		confirmation: 'none',
		undo: 'none',
		externalEffect: 'none',
		display: 'read'
	}),
	search_recipes: capability({
		domain: 'recipes',
		access: 'read',
		currentRead: 'none',
		confirmation: 'none',
		undo: 'none',
		externalEffect: 'none',
		display: 'read'
	}),
	search_ah_products: capability({
		domain: 'ah',
		access: 'read',
		currentRead: 'none',
		confirmation: 'none',
		undo: 'none',
		externalEffect: 'ah-read',
		display: 'read'
	}),
	create_meal_recipe: capability({
		domain: 'recipes',
		access: 'write',
		currentRead: 'target',
		confirmation: 'none',
		undo: 'none',
		externalEffect: 'none',
		display: 'write'
	}),
	generate_shopping_list: capability({
		domain: 'shopping',
		access: 'write',
		currentRead: 'none',
		confirmation: 'none',
		undo: 'none',
		externalEffect: 'none',
		display: 'write'
	}),
	add_recipe: capability({
		domain: 'recipes',
		access: 'write',
		currentRead: 'none',
		confirmation: 'risk-based',
		undo: 'none',
		externalEffect: 'none',
		display: 'write'
	}),
	propose_recipe_patch: capability({
		domain: 'recipes',
		access: 'proposal',
		currentRead: 'target',
		confirmation: 'always-review',
		undo: 'none',
		externalEffect: 'none',
		display: 'proposal'
	}),
	edit_recipe: capability({
		domain: 'recipes',
		access: 'write',
		currentRead: 'target',
		confirmation: 'none',
		undo: 'none',
		externalEffect: 'none',
		display: 'write'
	}),
	add_recipe_from_url: capability({
		domain: 'recipes',
		access: 'write',
		currentRead: 'none',
		confirmation: 'none',
		undo: 'none',
		externalEffect: 'none',
		display: 'write'
	}),
	log_meal: capability({
		domain: 'planning',
		access: 'write',
		currentRead: 'conditional',
		confirmation: 'none',
		undo: 'none',
		externalEffect: 'none',
		display: 'write'
	}),
	link_leftover_recipe: capability({
		domain: 'inventory',
		access: 'write',
		currentRead: 'target',
		confirmation: 'none',
		undo: 'inventory-op',
		externalEffect: 'none',
		display: 'write'
	}),
	set_staple: capability({
		domain: 'inventory',
		access: 'write',
		currentRead: 'target',
		confirmation: 'none',
		undo: 'inventory-op',
		externalEffect: 'none',
		display: 'write'
	}),
	set_freezer_staple: capability({
		domain: 'inventory',
		access: 'write',
		currentRead: 'target',
		confirmation: 'none',
		undo: 'none',
		externalEffect: 'none',
		display: 'write'
	}),
	get_freezer_staples: capability({
		domain: 'inventory',
		access: 'read',
		currentRead: 'none',
		confirmation: 'none',
		undo: 'none',
		externalEffect: 'none',
		display: 'read'
	}),
	set_review_flag: capability({
		domain: 'inventory',
		access: 'write',
		currentRead: 'target',
		confirmation: 'none',
		undo: 'inventory-op',
		externalEffect: 'none',
		display: 'write'
	}),
	get_inventory_history: capability({
		domain: 'inventory',
		access: 'read',
		currentRead: 'none',
		confirmation: 'none',
		undo: 'none',
		externalEffect: 'none',
		display: 'read'
	}),
	undo_op: capability({
		domain: 'inventory',
		access: 'write',
		currentRead: 'conditional',
		confirmation: 'none',
		undo: 'inventory-op',
		externalEffect: 'none',
		display: 'write'
	}),
	present_plan: capability({
		domain: 'trust',
		access: 'proposal',
		currentRead: 'none',
		confirmation: 'none',
		undo: 'none',
		externalEffect: 'none',
		display: 'plan'
	})
} satisfies Record<string, AssistantCapability>);

export type AssistantCapabilityName = keyof typeof ASSISTANT_CAPABILITIES;

export function isPersistentCapability(name: string): boolean {
	return (
		name in ASSISTANT_CAPABILITIES &&
		ASSISTANT_CAPABILITIES[name as AssistantCapabilityName].access === 'write'
	);
}

export function assertCapabilityRegistryComplete(toolNames: readonly string[]): void {
	const exposed = new Set(toolNames);
	const registered = new Set(
		Object.entries(ASSISTANT_CAPABILITIES)
			.filter(([, capability]) => capability.exposed !== false)
			.map(([name]) => name)
	);
	const missing = [...exposed].filter((name) => !registered.has(name));
	const orphaned = [...registered].filter((name) => !exposed.has(name));
	if (missing.length > 0 || orphaned.length > 0 || exposed.size !== toolNames.length) {
		throw new Error(
			`Assistant capability registry mismatch: missing=[${missing.join(', ')}], orphaned=[${orphaned.join(', ')}]`
		);
	}
}
