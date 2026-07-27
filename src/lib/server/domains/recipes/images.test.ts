import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { MAX_IMAGE_DIMENSION, normalizeRecipeImage } from './images';

const directories: string[] = [];

function outputPath() {
	const directory = mkdtempSync(join(tmpdir(), 'recipe-image-'));
	directories.push(directory);
	return join(directory, 'normalized.webp');
}

afterEach(() => {
	for (const directory of directories.splice(0)) {
		rmSync(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
	}
});

describe('recipe image normalization', () => {
	it('converts a large JPEG to a bounded WebP', async () => {
		const source = await sharp({
			create: {
				width: 2400,
				height: 1200,
				channels: 4,
				background: { r: 20, g: 80, b: 140, alpha: 0.5 }
			}
		})
			.jpeg()
			.toBuffer();
		const output = outputPath();

		await normalizeRecipeImage(source, output);

		const metadata = await sharp(readFileSync(output)).metadata();
		expect(metadata).toMatchObject({
			format: 'webp',
			width: MAX_IMAGE_DIMENSION,
			height: 800
		});
	});

	it.each(['png', 'webp'] as const)('also accepts %s input', async (format) => {
		const source = await sharp({
			create: {
				width: 40,
				height: 30,
				channels: 3,
				background: { r: 20, g: 80, b: 140 }
			}
		})
			[format]()
			.toBuffer();
		const output = outputPath();

		await normalizeRecipeImage(source, output);

		expect(await sharp(readFileSync(output)).metadata()).toMatchObject({
			format: 'webp',
			width: 40,
			height: 30
		});
	});

	it('does not enlarge small images and preserves transparency', async () => {
		const source = await sharp({
			create: {
				width: 80,
				height: 60,
				channels: 4,
				background: { r: 0, g: 0, b: 0, alpha: 0 }
			}
		})
			.png()
			.toBuffer();
		const output = outputPath();

		await normalizeRecipeImage(source, output);

		expect(await sharp(readFileSync(output)).metadata()).toMatchObject({
			width: 80,
			height: 60,
			hasAlpha: true
		});
	});

	it('applies EXIF orientation before writing', async () => {
		const source = await sharp({
			create: {
				width: 40,
				height: 80,
				channels: 3,
				background: { r: 10, g: 20, b: 30 }
			}
		})
			.jpeg()
			.withMetadata({ orientation: 6 })
			.toBuffer();
		const output = outputPath();

		await normalizeRecipeImage(source, output);

		const metadata = await sharp(readFileSync(output)).metadata();
		expect(metadata).toMatchObject({ width: 80, height: 40 });
		expect(metadata.orientation).toBeUndefined();
	});

	it('rejects malformed image bytes', async () => {
		await expect(
			normalizeRecipeImage(Buffer.from('not an image'), outputPath())
		).rejects.toThrow();
	});
});
