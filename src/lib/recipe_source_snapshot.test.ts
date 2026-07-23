import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
	captureRecipeSource,
	ensureDirectionIds,
	reconcileDirectionIds
} from './recipe_source_snapshot';

describe('recipe source identity', () => {
	it('captures a detached source snapshot', () => {
		const ingredients = [{ id: 'tomaat', name: 'tomaat', amount: '2' }];
		const snapshot = captureRecipeSource(
			{
				title: 'Soep',
				servings: 4,
				sourceUrl: 'https://example.test/soep',
				ingredients,
				directions: ['Snijd de tomaat.']
			},
			{ capturedAt: 10 }
		);
		ingredients[0].name = 'paprika';
		expect(snapshot).toMatchObject({
			version: 1,
			provenance: 'imported_source',
			capturedAt: 10,
			ingredients: [{ name: 'tomaat' }]
		});
	});

	it('keeps direction IDs through copy edits and reorders', () => {
		const current = ['Snijd de ui.', 'Bak de ui.'];
		const ids = ['dir-a', 'dir-b'];
		expect(reconcileDirectionIds(current, ids, ['Bak de ui.', 'Snijd de ui.'])).toEqual([
			'dir-b',
			'dir-a'
		]);
		expect(reconcileDirectionIds(current, ids, ['Snijd de rode ui.', 'Bak de ui.'])).toEqual([
			'dir-a',
			'dir-b'
		]);
		expect(new Set(ensureDirectionIds(['A', 'B'], ['same', 'same'])).size).toBe(2);
	});
});
describe('0021 recipe source migration', () => {
	it('backfills without changing canonical content and makes snapshots immutable', () => {
		const sqlite = new Database(':memory:');
		sqlite.exec(`
			CREATE TABLE recipes (
				id integer PRIMARY KEY,
				title text NOT NULL,
				servings integer,
				source_url text,
				ingredients text NOT NULL,
				directions text NOT NULL,
				updated_at integer NOT NULL
			);
		`);
		const ingredients = JSON.stringify([{ id: 'ui', name: 'ui', amount: '1' }]);
		const directions = JSON.stringify(['Snijd.', 'Bak.']);
		sqlite
			.prepare(
				'INSERT INTO recipes (id, title, servings, source_url, ingredients, directions, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
			)
			.run(7, 'Ui', 2, 'https://example.test/ui', ingredients, directions, 1234);

		const before = sqlite
			.prepare('SELECT title, servings, source_url, ingredients, directions, updated_at FROM recipes')
			.get();
		sqlite.exec(
			readFileSync(path.join(process.cwd(), 'drizzle', '0021_loud_hannibal_king.sql'), 'utf8')
		);
		const row = sqlite
			.prepare(
				'SELECT title, servings, source_url, ingredients, directions, updated_at, direction_ids_json, source_snapshot_json FROM recipes'
			)
			.get() as Record<string, unknown>;

		expect({
			title: row.title,
			servings: row.servings,
			source_url: row.source_url,
			ingredients: row.ingredients,
			directions: row.directions,
			updated_at: row.updated_at
		}).toEqual(before);
		expect(JSON.parse(String(row.direction_ids_json))).toEqual([
			'dir_migrated_7_0',
			'dir_migrated_7_1'
		]);
		expect(JSON.parse(String(row.source_snapshot_json))).toMatchObject({
			version: 1,
			provenance: 'legacy_baseline',
			capturedAt: 1234,
			title: 'Ui'
		});
		expect(() =>
			sqlite.prepare("UPDATE recipes SET source_snapshot_json = '{}' WHERE id = 7").run()
		).toThrow(/immutable/i);
	});
});
