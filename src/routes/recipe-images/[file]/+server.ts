import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { readFile, stat } from 'fs/promises';
import { join, extname, basename } from 'path';
import { contentTypeForExtension, getRecipeImagesDir, isAllowedExtension } from '$lib/server/recipe_images';

export const GET: RequestHandler = async ({ params }) => {
	const safe = basename(params.file);
	if (safe !== params.file || safe.startsWith('.')) throw error(400, 'Invalid filename');

	const ext = extname(safe).slice(1).toLowerCase();
	if (!isAllowedExtension(ext)) throw error(404, 'Not found');

	const path = join(getRecipeImagesDir(), safe);
	let info;
	try {
		info = await stat(path);
	} catch {
		throw error(404, 'Not found');
	}
	if (!info.isFile()) throw error(404, 'Not found');

	const data = await readFile(path);
	return new Response(new Uint8Array(data), {
		headers: {
			'Content-Type': contentTypeForExtension(ext),
			'Content-Length': info.size.toString(),
			'Cache-Control': 'public, max-age=31536000, immutable'
		}
	});
};
