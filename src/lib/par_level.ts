import { normalizeUnit } from './food_class';
import type { InventorySection } from './inventory_section';

export type ParLevelInput = {
	section: InventorySection;
	qtyNum: number | null;
	unit: string | null;
	parTargetQty: number | null;
	parTargetUnit: string | null;
};

export type ParLevelValidation = { ok: true } | { ok: false; error: string };

export function validateParLevel(input: ParLevelInput): ParLevelValidation {
	const targetQtySet = input.parTargetQty !== null;
	const targetUnitSet = normalizeUnit(input.parTargetUnit) !== '';
	if (targetQtySet !== targetUnitSet) {
		return {
			ok: false,
			error: 'Par target quantity and unit must be set or cleared together.'
		};
	}
	if (!targetQtySet) return { ok: true };
	if (input.section !== 'pantry') {
		return { ok: false, error: 'Par targets are only available for pantry items.' };
	}
	if (!Number.isFinite(input.parTargetQty) || input.parTargetQty! <= 0) {
		return { ok: false, error: 'Par target quantity must be greater than zero.' };
	}
	if (
		input.qtyNum !== null &&
		normalizeUnit(input.unit) !== '' &&
		normalizeUnit(input.unit) !== normalizeUnit(input.parTargetUnit)
	) {
		return { ok: false, error: 'Current quantity and par target units must match.' };
	}
	return { ok: true };
}

export type InventoryParStatus =
	| { state: 'none' }
	| { state: 'below'; deficitQty: number; unit: string }
	| { state: 'at_or_above'; unit: string }
	| { state: 'unknown'; reason: 'quantity_unknown' | 'unit_mismatch'; unit: string };

export function inventoryParStatus(input: ParLevelInput): InventoryParStatus {
	const unit = normalizeUnit(input.parTargetUnit);
	if (input.parTargetQty === null || !unit || input.section !== 'pantry') return { state: 'none' };
	if (input.qtyNum === null) return { state: 'unknown', reason: 'quantity_unknown', unit };
	if (normalizeUnit(input.unit) !== unit) {
		return { state: 'unknown', reason: 'unit_mismatch', unit };
	}
	if (input.qtyNum < input.parTargetQty) {
		return {
			state: 'below',
			deficitQty: Math.round((input.parTargetQty - input.qtyNum + Number.EPSILON) * 100) / 100,
			unit
		};
	}
	return { state: 'at_or_above', unit };
}
