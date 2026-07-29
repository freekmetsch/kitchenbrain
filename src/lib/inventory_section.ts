export const INVENTORY_SECTIONS = ['freezer', 'fridge', 'pantry'] as const;

export type InventorySection = (typeof INVENTORY_SECTIONS)[number];

export function isInventorySection(value: unknown): value is InventorySection {
	return typeof value === 'string' && INVENTORY_SECTIONS.includes(value as InventorySection);
}
