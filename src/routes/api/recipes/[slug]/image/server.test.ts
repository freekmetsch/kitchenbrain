import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import * as schema from '$lib/server/db/schema';
import { createTestDb, type TestDb } from '$lib/server/test_db';

const mocked = vi.hoisted(() => ({ db: undefined as TestDb | undefined }));
vi.mock('$lib/server/db/index', () => ({
	get db() {
		return mocked.db;
	}
}));

import { DELETE, POST } from './+server';

const directories: string[] = [];
const originalDirectory = process.env.RECIPE_IMAGES_DIR;

function imageDirectory() {
	const directory = mkdtempSync(join(tmpdir(), 'recipe-image-api-'));
	directories.push(directory);
	process.env.RECIPE_IMAGES_DIR = directory;
	return directory;
}

function seedRecipe(db: TestDb, imageUrl: string | null = null) {
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

function uploadRequest(file: File): Request {
	const form = new FormData();
	form.set('image', file);
	return new Request('http://localhost/api/recipes/tomatensoep/image', {
		method: 'POST',
		body: form
	});
}

function postEvent(request: Request, slug = 'tomatensoep') {
	return {
		locals: { user: { id: 1, username: 'testuser' } },
		params: { slug },
		request
	} as Parameters<typeof POST>[0];
}

function deleteEvent(slug = 'tomatensoep') {
	return {
		locals: { user: { id: 1, username: 'testuser' } },
		params: { slug }
	} as Parameters<typeof DELETE>[0];
}

beforeEach(() => {
	mocked.db = createTestDb();
});

afterEach(() => {
	vi.restoreAllMocks();
	if (originalDirectory === undefined) delete process.env.RECIPE_IMAGES_DIR;
	else process.env.RECIPE_IMAGES_DIR = originalDirectory;
	for (const directory of directories.splice(0)) {
		rmSync(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
	}
});

describe('/api/recipes/[slug]/image', () => {
	it('stores a normalized upload and returns its public URL', async () => {
		const directory = imageDirectory();
		const recipe = seedRecipe(mocked.db!);
		const bytes = await sharp({
			create: {
				width: 24,
				height: 16,
				channels: 3,
				background: { r: 200, g: 30, b: 20 }
			}
		})
			.png()
			.toBuffer();
		vi.spyOn(Date, 'now').mockReturnValue(123);

		const response = await POST(
			postEvent(uploadRequest(new File([bytes], 'recipe.png', { type: 'image/png' })))
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			imageUrl: '/recipe-images/tomatensoep-123.webp'
		});
		expect(readdirSync(directory)).toEqual(['tomatensoep-123.webp']);
		expect(
			mocked.db!
				.select()
				.from(schema.recipes)
				.where(eq(schema.recipes.id, recipe.id))
				.get()
		).toMatchObject({ imageUrl: '/recipe-images/tomatensoep-123.webp' });
	});

	it('clears the recipe before removing its local image', async () => {
		const directory = imageDirectory();
		const imagePath = join(directory, 'tomatensoep-123.webp');
		await sharp({
			create: {
				width: 8,
				height: 8,
				channels: 3,
				background: { r: 200, g: 30, b: 20 }
			}
		})
			.webp()
			.toFile(imagePath);
		const recipe = seedRecipe(
			mocked.db!,
			'/recipe-images/tomatensoep-123.webp'
		);

		const response = await DELETE(deleteEvent());

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ ok: true });
		expect(existsSync(imagePath)).toBe(false);
		expect(
			mocked.db!
				.select()
				.from(schema.recipes)
				.where(eq(schema.recipes.id, recipe.id))
				.get()
		).toMatchObject({ imageUrl: null });
	});
});
