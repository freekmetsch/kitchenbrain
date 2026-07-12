import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { writeFile, unlink } from 'fs/promises';
import { basename, join } from 'path';
import { db } from '$lib/server/db/index';
import { recipes } from '$lib/server/db/schema';
import {
	MAX_IMAGE_BYTES,
	extensionForMime,
	getRecipeImagesDir
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

	const ext = extensionForMime(file.type);
	if (!ext) throw error(415, `Unsupported image type: ${file.type || 'unknown'}`);

	const dir = getRecipeImagesDir();
	const filename = `${params.slug}.${ext}`;
	const target = join(dir, filename);

	const buf = Buffer.from(await file.arrayBuffer());
	await writeFile(target, buf);

	// Remove stale files with a different extension for the same slug.
	for (const otherExt of ['jpg', 'png', 'webp', 'heic', 'heif']) {
		if (otherExt === ext) continue;
		const stale = join(dir, `${params.slug}.${otherExt}`);
		await unlink(stale).catch(() => undefined);
	}

	const ts = Date.now();
	const imageUrl = `/recipe-images/${filename}?v=${ts}`;
	db.update(recipes)
		.set({ imageUrl, updatedAt: new Date() })
		.where(eq(recipes.slug, params.slug))
		.run();

	return json({ imageUrl });
};

export const DELETE: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	assertSafeSlug(params.slug);

	const recipe = db.select().from(recipes).where(eq(recipes.slug, params.slug)).get();
	if (!recipe) throw error(404, 'Recipe not found');

	const dir = getRecipeImagesDir();
	for (const ext of ['jpg', 'png', 'webp', 'heic', 'heif']) {
		await unlink(join(dir, `${params.slug}.${ext}`)).catch(() => undefined);
	}

	db.update(recipes)
		.set({ imageUrl: null, updatedAt: new Date() })
		.where(eq(recipes.slug, params.slug))
		.run();

	return json({ ok: true });
};

