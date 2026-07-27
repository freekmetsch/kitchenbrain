import { mkdirSync } from 'node:fs';
import { basename } from 'node:path';
import sharp from 'sharp';

const CONTENT_TYPES: Record<string, string> = {
	jpg: 'image/jpeg',
	png: 'image/png',
	webp: 'image/webp',
	heic: 'image/heic',
	heif: 'image/heif'
};

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 40_000_000;
export const MAX_IMAGE_DIMENSION = 1600;

export function getRecipeImagesDir(override?: string): string {
	const directory = override ?? process.env.RECIPE_IMAGES_DIR ?? './data/recipe_images';
	mkdirSync(directory, { recursive: true });
	return directory;
}

export function isSafeImagePathSegment(value: string): boolean {
	return (
		value.length > 0 &&
		basename(value) === value &&
		!value.startsWith('.') &&
		!value.includes('\\')
	);
}

export function isAllowedImageExtension(extension: string): boolean {
	return extension.toLowerCase() in CONTENT_TYPES;
}

export function contentTypeForImageExtension(extension: string): string {
	return CONTENT_TYPES[extension.toLowerCase()] ?? 'application/octet-stream';
}

export async function normalizeRecipeImage(input: Buffer, outputPath: string) {
	return sharp(input, { failOn: 'error', limitInputPixels: MAX_IMAGE_PIXELS })
		.autoOrient()
		.resize({
			width: MAX_IMAGE_DIMENSION,
			height: MAX_IMAGE_DIMENSION,
			fit: 'inside',
			withoutEnlargement: true
		})
		.webp({ quality: 82, effort: 4 })
		.toFile(outputPath);
}
