// Architectural guard (P1.5): inventory_writes.ts is the ONLY module allowed
// to mutate inventory_items for domain writes (inventory_merge.ts is its
// internal engine) — taxonomy rules, ops-log, and freezer-staple side effects
// all live behind that boundary. This test fails when a new direct
// insert/update/delete sneaks in elsewhere, so the boundary holds without
// relying on review discipline.
//
// settings/reset.ts and settings/import.ts are a deliberate, reviewed
// exception (FEATURE_LIST_SETTINGS_MENU.md Phase 3): a full-table wipe and an
// id-preserving bootstrap restore are administrative bulk operations, not
// domain merges — neither taxonomy inference nor a per-row ops-log entry
// makes sense for either, and inventory_writes.ts's per-item API has no
// signature that could express "insert this exact historical row verbatim."
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';

const ALLOWED_FILES = new Set([
	path.join('lib', 'server', 'inventory_writes.ts'),
	path.join('lib', 'server', 'inventory_merge.ts'),
	path.join('lib', 'server', 'settings', 'reset.ts'),
	path.join('lib', 'server', 'settings', 'import.ts')
]);

const WRITE_PATTERN = /\.(insert|update|delete)\(\s*(schema\.)?inventoryItems\b/;

function walk(dir: string): string[] {
	return readdirSync(dir).flatMap((entry) => {
		const full = path.join(dir, entry);
		if (statSync(full).isDirectory()) return walk(full);
		return full.endsWith('.ts') || full.endsWith('.svelte') ? [full] : [];
	});
}

describe('inventory mutation boundary', () => {
	it('only inventory_writes.ts and inventory_merge.ts mutate inventory_items', () => {
		const srcRoot = path.join(process.cwd(), 'src');
		const offenders = walk(srcRoot).filter((file) => {
			const relative = path.relative(srcRoot, file);
			if (relative.endsWith('.test.ts')) return false;
			if (ALLOWED_FILES.has(relative)) return false;
			return WRITE_PATTERN.test(readFileSync(file, 'utf-8'));
		});
		expect(offenders).toEqual([]);
	});
});
