import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';

function withoutId(value: Record<string, unknown>) {
	const { id: _id, ...rest } = value;
	return rest;
}

describe('0020 shopping source migration', () => {
	it('adds stable IDs without changing old ingredient fields or order', () => {
		const sqlite = new Database(':memory:');
		sqlite.exec(`
			CREATE TABLE recipes (
				id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
				ingredients text DEFAULT '[]' NOT NULL,
				structure_draft text
			);
			CREATE TABLE shopping_push_history (id integer PRIMARY KEY AUTOINCREMENT NOT NULL);
		`);
		const ingredients = [
			{ name: 'ui', amount: '1', future: { keep: true } },
			{ id: 'existing', name: 'tomaat', amount: '4', substitutes: [{ name: 'paprika', future: 7 }] }
		];
		const draft = [{ name: 'knoflook', amount: '2', optional: true }];
		sqlite
			.prepare('INSERT INTO recipes (ingredients, structure_draft) VALUES (?, ?)')
			.run(JSON.stringify(ingredients), JSON.stringify(draft));

		const migration = fs.readFileSync(path.join(process.cwd(), 'drizzle', '0020_shopping_source_entries.sql'), 'utf8');
		for (const statement of migration.split('--> statement-breakpoint')) {
			if (statement.trim()) sqlite.exec(statement);
		}

		const row = sqlite.prepare('SELECT ingredients, structure_draft FROM recipes').get() as {
			ingredients: string;
			structure_draft: string;
		};
		const migrated = JSON.parse(row.ingredients) as Array<Record<string, unknown>>;
		const migratedDraft = JSON.parse(row.structure_draft) as Array<Record<string, unknown>>;
		expect(migrated.map(withoutId)).toEqual(ingredients.map(withoutId));
		expect(migrated.map((ingredient) => ingredient.id)).toEqual(['ing_migrated_1_0', 'existing']);
		expect(migratedDraft.map(withoutId)).toEqual(draft);
		expect(migratedDraft[0].id).toBe('ing_draft_1_0');

		const beforeSecondRun = row.ingredients;
		for (const statement of migration.split('--> statement-breakpoint')) {
			if (statement.trimStart().startsWith('UPDATE `recipes`')) sqlite.exec(statement);
		}
		expect((sqlite.prepare('SELECT ingredients FROM recipes').get() as { ingredients: string }).ingredients).toBe(
			beforeSecondRun
		);
	});

	it.each([
		['empty', [{ id: '', name: 'ui', amount: '1' }]],
		['null', [{ id: null, name: 'ui', amount: '1' }]],
		['object', [{ id: { forged: true }, name: 'ui', amount: '1' }]],
		['array', [{ id: ['forged'], name: 'ui', amount: '1' }]],
		['duplicate', [{ id: 'same', name: 'ui', amount: '1' }, { id: 'same', name: 'prei', amount: '1' }]]
	])('aborts when an existing recipe has %s ingredient IDs', (_label, ingredients) => {
		const sqlite = new Database(':memory:');
		sqlite.exec(`
			CREATE TABLE recipes (
				id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
				ingredients text DEFAULT '[]' NOT NULL,
				structure_draft text
			);
			CREATE TABLE shopping_push_history (id integer PRIMARY KEY AUTOINCREMENT NOT NULL);
		`);
		sqlite.prepare('INSERT INTO recipes (ingredients) VALUES (?)').run(JSON.stringify(ingredients));
		const migration = fs.readFileSync(path.join(process.cwd(), 'drizzle', '0020_shopping_source_entries.sql'), 'utf8');
		expect(() => {
			for (const statement of migration.split('--> statement-breakpoint')) {
				if (statement.trim()) sqlite.exec(statement);
			}
		}).toThrow();
	});
});
