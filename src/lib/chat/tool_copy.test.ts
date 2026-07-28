import { describe, expect, it } from 'vitest';
import {
	commitRiskDeleteSummary,
	commitRiskMergeSummary,
	inventoryChangeSummary,
	readToolSummary,
	safeToolErrorSummary,
	toolStartSummary,
	writeToolSummary
} from './tool_copy';

describe('chat tool copy', () => {
	it('renders Dutch start, read, and write summaries from one locale seam', () => {
		expect(toolStartSummary('get_inventory', { section: 'freezer' }, 'nl')).toBe(
			'Voorraad in de vriezer bekijken…'
		);
		expect(readToolSummary('search_recipes', { count: 2 }, 'nl')).toBe('2 recepten gevonden');
		expect(writeToolSummary('add_recipe', { title: 'Soep' }, 'nl')).toBe('Soep opgeslagen');
	});

	it('localizes inventory changes and confirmation questions', () => {
		expect(
			inventoryChangeSummary(
				'update',
				{ qtyNum: 1, unit: 'portion' },
				{ qtyNum: 2, unit: 'portion' },
				null,
				'nl'
			)
		).toBe('1 → 2 porties');
		expect(commitRiskDeleteSummary('Soep', '2 porties', 'freezer', false, 'nl')).toBe(
			'Soep (2 porties) uit de vriezer verwijderen?'
		);
		expect(commitRiskMergeSummary('Soep', '2 porties', 'nl')).toContain('samenvoegen');
	});

	it('never leaks a raw English tool error into Dutch chat', () => {
		expect(safeToolErrorSummary('Inventory item was already removed', 'nl')).toBe(
			'Deze stap is mislukt — probeer opnieuw.'
		);
	});

	it('maps readable English errors without exposing executor text', () => {
		expect(safeToolErrorSummary('Inventory item was already removed', 'en')).toBe(
			'This step failed — try again.'
		);
		expect(safeToolErrorSummary('Recipe proposal expired', 'en')).toBe(
			'The data changed — review it again.'
		);
	});
});
