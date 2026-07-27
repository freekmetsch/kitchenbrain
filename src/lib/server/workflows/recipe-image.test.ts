import { afterEach, describe, expect, it } from 'vitest';
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	rmSync,
	writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq, sql } from 'drizzle-orm';
import sharp from 'sharp';
import * as schema from '$lib/server/db/schema';
import { createTestDb } from '$lib/server/test_db';
import {
	deleteRecipeImage,
	getRecipeImageTarget,
	InvalidRecipeImageFilenameError,
	InvalidRecipeImageError,
	readRecipeImage,
	RecipeImageNotFoundError,
	RecipeImageStoreError,
	storeRecipeImage
} from './recipe-image';

const directories: string[] = [];

function imageDirectory() {
	const directory = mkdtempSync(join(tmpdir(), 'recipe-images-'));
	directories.push(directory);
	return directory;
}

function seedRecipe(db: ReturnType<typeof createTestDb>, imageUrl: string | null = null) {
	return db
		.insert(schema.recipes)
		.values({
			slug: 'tomatensoep',
			title: 'Tomatensoep',
			servings: 4,
			imageUrl,
			ingredients: [],
			directions: [],
			createdAt: new Date('2026-01-01T00:00:00Z'),
			updatedAt: new Date('2026-01-01T00:00:00Z')
		})
		.returning()
		.get();
}

afterEach(() => {
	for (const directory of directories.splice(0)) {
		rmSync(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
	}
});

describe('recipe image workflow', () => {
	it('normalizes an upload, updates the recipe, and removes superseded local files', async () => {
		const db = createTestDb();
		const directory = imageDirectory();
		const recipe = seedRecipe(
			db,
			'/recipe-images/tomatensoep-previous.webp?cache=old'
		);
		writeFileSync(join(directory, 'tomatensoep-previous.webp'), 'old');
		writeFileSync(join(directory, 'tomatensoep.jpg'), 'legacy');
		const input = await sharp({
			create: {
				width: 24,
				height: 16,
				channels: 3,
				background: { r: 200, g: 30, b: 20 }
			}
		})
			.png()
			.toBuffer();

		const target = getRecipeImageTarget(db, 'tomatensoep');
		expect(target).toMatchObject({ id: recipe.id, slug: 'tomatensoep' });

		const imageUrl = await storeRecipeImage(db, target!, input, {
			directory,
			version: 123,
			temporaryId: 'upload'
		});

		expect(imageUrl).toBe('/recipe-images/tomatensoep-123.webp');
		expect(
			db.select().from(schema.recipes).where(eq(schema.recipes.id, recipe.id)).get()
		).toMatchObject({ imageUrl });
		expect(await sharp(readFileSync(join(directory, 'tomatensoep-123.webp'))).metadata()).toMatchObject({
			format: 'webp',
			width: 24,
			height: 16
		});
		expect(existsSync(join(directory, 'tomatensoep-previous.webp'))).toBe(false);
		expect(existsSync(join(directory, 'tomatensoep.jpg'))).toBe(false);
	});

	it('rejects invalid bytes without leaving a temporary file or changing the recipe', async () => {
		const db = createTestDb();
		const directory = imageDirectory();
		const recipe = seedRecipe(db);
		const target = getRecipeImageTarget(db, recipe.slug)!;

		await expect(
			storeRecipeImage(db, target, Buffer.from('not an image'), {
				directory,
				version: 123,
				temporaryId: 'upload'
			})
		).rejects.toBeInstanceOf(InvalidRecipeImageError);

		expect(readdirSync(directory)).toEqual([]);
		expect(
			db.select().from(schema.recipes).where(eq(schema.recipes.id, recipe.id)).get()
		).toMatchObject({ imageUrl: null });
	});

	it('cleans up the temporary file when the final rename fails', async () => {
		const db = createTestDb();
		const directory = imageDirectory();
		const recipe = seedRecipe(db);
		const target = getRecipeImageTarget(db, recipe.slug)!;
		const blockedTarget = join(directory, 'tomatensoep-123.webp');
		mkdirSync(blockedTarget);
		const input = await sharp({
			create: {
				width: 12,
				height: 8,
				channels: 3,
				background: { r: 200, g: 30, b: 20 }
			}
		})
			.png()
			.toBuffer();

		await expect(
			storeRecipeImage(db, target, input, {
				directory,
				version: 123,
				temporaryId: 'upload'
			})
		).rejects.toBeInstanceOf(RecipeImageStoreError);

		expect(readdirSync(directory)).toEqual(['tomatensoep-123.webp']);
		expect(
			db.select().from(schema.recipes).where(eq(schema.recipes.id, recipe.id)).get()
		).toMatchObject({ imageUrl: null });
	});

	it('compensates the stored file when the database update fails', async () => {
		const db = createTestDb();
		const directory = imageDirectory();
		const recipe = seedRecipe(db);
		const target = getRecipeImageTarget(db, recipe.slug)!;
		const input = await sharp({
			create: {
				width: 12,
				height: 8,
				channels: 3,
				background: { r: 200, g: 30, b: 20 }
			}
		})
			.png()
			.toBuffer();
		db.run(sql`DROP TABLE recipes`);

		await expect(
			storeRecipeImage(db, target, input, {
				directory,
				version: 123,
				temporaryId: 'upload'
			})
		).rejects.toThrow();

		expect(readdirSync(directory)).toEqual([]);
	});

	it('clears the database before removing the current and legacy files', async () => {
		const db = createTestDb();
		const directory = imageDirectory();
		const recipe = seedRecipe(
			db,
			'/recipe-images/tomatensoep-current.webp?cache=current'
		);
		writeFileSync(join(directory, 'tomatensoep-current.webp'), 'current');
		writeFileSync(join(directory, 'tomatensoep.png'), 'legacy');
		const target = getRecipeImageTarget(db, recipe.slug)!;

		await deleteRecipeImage(db, target, { directory });

		expect(
			db.select().from(schema.recipes).where(eq(schema.recipes.id, recipe.id)).get()
		).toMatchObject({ imageUrl: null });
		expect(readdirSync(directory)).toEqual([]);
	});

	it('keeps the file when clearing the database fails', async () => {
		const db = createTestDb();
		const directory = imageDirectory();
		const recipe = seedRecipe(db, '/recipe-images/tomatensoep-current.webp');
		const storedPath = join(directory, 'tomatensoep-current.webp');
		writeFileSync(storedPath, 'current');
		const target = getRecipeImageTarget(db, recipe.slug)!;
		db.run(sql`DROP TABLE recipes`);

		await expect(deleteRecipeImage(db, target, { directory })).rejects.toThrow();

		expect(existsSync(storedPath)).toBe(true);
	});

	it('reads an allowed image with immutable cache metadata and exact length', async () => {
		const directory = imageDirectory();
		const bytes = Buffer.from('webp bytes');
		writeFileSync(join(directory, 'tomatensoep-123.webp'), bytes);

		const image = await readRecipeImage('tomatensoep-123.webp', { directory });

		expect(image).toEqual({
			data: new Uint8Array(bytes),
			contentType: 'image/webp',
			contentLength: bytes.byteLength,
			cacheControl: 'public, max-age=31536000, immutable'
		});
	});

	it.each(['../secret.webp', '.secret.webp', '..\\secret.webp'])(
		'rejects unsafe image filename %s',
		async (filename) => {
			await expect(
				readRecipeImage(filename, { directory: imageDirectory() })
			).rejects.toBeInstanceOf(InvalidRecipeImageFilenameError);
		}
	);

	it('returns not-found behavior for unsupported, missing, and non-file targets', async () => {
		const directory = imageDirectory();
		mkdirSync(join(directory, 'directory.webp'));

		await expect(
			readRecipeImage('recipe.svg', { directory })
		).rejects.toBeInstanceOf(RecipeImageNotFoundError);
		await expect(
			readRecipeImage('missing.webp', { directory })
		).rejects.toBeInstanceOf(RecipeImageNotFoundError);
		await expect(
			readRecipeImage('directory.webp', { directory })
		).rejects.toBeInstanceOf(RecipeImageNotFoundError);
	});
});
