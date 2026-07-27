import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GET } from './+server';

const directories: string[] = [];
const originalDirectory = process.env.RECIPE_IMAGES_DIR;

function imageDirectory() {
	const directory = mkdtempSync(join(tmpdir(), 'recipe-image-route-'));
	directories.push(directory);
	process.env.RECIPE_IMAGES_DIR = directory;
	return directory;
}

afterEach(() => {
	if (originalDirectory === undefined) delete process.env.RECIPE_IMAGES_DIR;
	else process.env.RECIPE_IMAGES_DIR = originalDirectory;
	for (const directory of directories.splice(0)) {
		rmSync(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
	}
});

describe('GET /recipe-images/[file]', () => {
	it('serves an image with its exact cache and content headers', async () => {
		const directory = imageDirectory();
		const bytes = Buffer.from('image bytes');
		writeFileSync(join(directory, 'soep-123.webp'), bytes);

		const response = await GET({
			params: { file: 'soep-123.webp' }
		} as Parameters<typeof GET>[0]);

		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toBe('image/webp');
		expect(response.headers.get('content-length')).toBe(String(bytes.byteLength));
		expect(response.headers.get('cache-control')).toBe(
			'public, max-age=31536000, immutable'
		);
		expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
	});

	it.each(['../secret.webp', '.secret.webp', '..\\secret.webp'])(
		'rejects unsafe filename %s with 400',
		async (file) => {
			imageDirectory();

			await expect(
				GET({ params: { file } } as Parameters<typeof GET>[0])
			).rejects.toMatchObject({
				status: 400,
				body: { message: 'Invalid filename' }
			});
		}
	);

	it('maps unsupported and missing files to 404', async () => {
		imageDirectory();

		await expect(
			GET({ params: { file: 'soep.svg' } } as Parameters<typeof GET>[0])
		).rejects.toMatchObject({
			status: 404,
			body: { message: 'Not found' }
		});
		await expect(
			GET({ params: { file: 'missing.webp' } } as Parameters<typeof GET>[0])
		).rejects.toMatchObject({
			status: 404,
			body: { message: 'Not found' }
		});
	});
});
