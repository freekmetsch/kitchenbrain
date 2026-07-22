import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { rename, unlink } from 'fs/promises';
import { basename, join } from 'path';
import { randomUUID } from 'node:crypto';
import { db } from '$lib/server/db/index';
import { recipes } from '$lib/server/db/schema';
import {
	MAX_IMAGE_BYTES,
	getRecipeImagesDir,
	normalizeRecipeImage
} from '$lib/server/recipe_images';

// Defense in depth (F19): the slug becomes a filename component below, so
// reject anything path-like — mirrors the hardened read path in
// src/routes/recipe-images/[file]/+server.ts.
function assertSafeSlug(slug: string): void {
	const safe = basename(slug);
	if (safe !== slug || safe.startsWith('.') || safe.includes('\\')) {
		throw error(400, 'Invalid slug');
	}
}

export const POST: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	assertSafeSlug(params.slug);

	const recipe = db.select().from(recipes).where(eq(recipes.slug, params.slug)).get();
	if (!recipe) throw error(404, 'Recipe not found');

	let form: FormData;
	try {
		form = await request.formData();
	} catch {
		throw error(400, 'Invalid form data');
	}
	const file = form.get('image');
	if (!(file instanceof File)) throw error(400, 'No image uploaded');
	if (file.size === 0) throw error(400, 'Empty file');
	if (file.size > MAX_IMAGE_BYTES) throw error(413, 'Image larger than 5MB');

	const dir = getRecipeImagesDir();
	const version = Date.now();
	const filename = `${params.slug}-${version}.webp`;
	const target = join(dir, filename);
	const temporary = join(dir, `.${params.slug}-${randomUUID()}.tmp`);

	const buf = Buffer.from(await file.arrayBuffer());
	try {
		await normalizeRecipeImage(buf, temporary);
	} catch {
		await unlink(temporary).catch(() => undefined);
		throw error(415, 'The uploaded file is not a valid supported image');
	}
	try {
		await rename(temporary, target);
	} catch {
		await unlink(temporary).catch(() => undefined);
		throw error(500, 'Could not store the image');
	}

	const imageUrl = `/recipe-images/${filename}`;
	try {
		db.update(recipes)
			.set({ imageUrl, updatedAt: new Date() })
			.where(eq(recipes.slug, params.slug))
			.run();
	} catch (cause) {
		await unlink(target).catch(() => undefined);
		throw cause;
	}

	if (recipe.imageUrl?.startsWith('/recipe-images/')) {
		const oldFilename = basename(recipe.imageUrl.split('?')[0]);
		if (oldFilename !== filename) await unlink(join(dir, oldFilename)).catch(() => undefined);
	}
	for (const legacyExt of ['jpg', 'png', 'webp', 'heic', 'heif']) {
		await unlink(join(dir, `${params.slug}.${legacyExt}`)).catch(() => undefined);
	}

	return json({ imageUrl });
};

export const DELETE: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	assertSafeSlug(params.slug);

	const recipe = db.select().from(recipes).where(eq(recipes.slug, params.slug)).get();
	if (!recipe) throw error(404, 'Recipe not found');

	const dir = getRecipeImagesDir();
	db.update(recipes)
		.set({ imageUrl: null, updatedAt: new Date() })
		.where(eq(recipes.slug, params.slug))
		.run();

	if (recipe.imageUrl?.startsWith('/recipe-images/')) {
		await unlink(join(dir, basename(recipe.imageUrl.split('?')[0]))).catch(() => undefined);
	}
	for (const ext of ['jpg', 'png', 'webp', 'heic', 'heif']) {
		await unlink(join(dir, `${params.slug}.${ext}`)).catch(() => undefined);
	}

	return json({ ok: true });
};

