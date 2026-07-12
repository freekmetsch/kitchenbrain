import { mkdirSync } from 'fs';

const ALLOWED_MIME: Record<string, string> = {
	'image/jpeg': 'jpg',
	'image/jpg': 'jpg',
	'image/png': 'png',
	'image/webp': 'webp',
	'image/heic': 'heic',
	'image/heif': 'heif'
};

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export function getRecipeImagesDir(): string {
	const dir = process.env.RECIPE_IMAGES_DIR ?? './data/recipe_images';
	mkdirSync(dir, { recursive: true });
	return dir;
}

export function extensionForMime(mime: string): string | null {
	return ALLOWED_MIME[mime.toLowerCase()] ?? null;
}

export function isAllowedExtension(ext: string): boolean {
	return Object.values(ALLOWED_MIME).includes(ext.toLowerCase());
}

export function contentTypeForExtension(ext: string): string {
	const map: Record<string, string> = {
		jpg: 'image/jpeg',
		png: 'image/png',
		webp: 'image/webp',
		heic: 'image/heic',
		heif: 'image/heif'
	};
	return map[ext.toLowerCase()] ?? 'application/octet-stream';
}
