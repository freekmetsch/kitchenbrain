import { randomUUID } from 'node:crypto';
import { readFile, rename, stat, unlink } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import type { DbOrTx } from '$lib/server/db/types';
import { db as appDb } from '$lib/server/db/index';
import {
	getRecipeImageTarget,
	setRecipeImageUrl,
	type RecipeImageTarget
} from '$lib/server/domains/recipes/image-commands';
import {
	contentTypeForImageExtension,
	getRecipeImagesDir,
	isAllowedImageExtension,
	isSafeImagePathSegment,
	normalizeRecipeImage
} from '$lib/server/domains/recipes/images';

const LEGACY_EXTENSIONS = ['jpg', 'png', 'webp', 'heic', 'heif'] as const;

export { getRecipeImageTarget };

export function getRecipeImageTargetForApp(slug: string) {
	return getRecipeImageTarget(appDb, slug);
}

export class InvalidRecipeImageError extends Error {
	constructor() {
		super('The uploaded file is not a valid supported image');
		this.name = 'InvalidRecipeImageError';
	}
}

export class RecipeImageStoreError extends Error {
	constructor() {
		super('Could not store the image');
		this.name = 'RecipeImageStoreError';
	}
}

export class InvalidRecipeImageFilenameError extends Error {
	constructor() {
		super('Invalid filename');
		this.name = 'InvalidRecipeImageFilenameError';
	}
}

export class RecipeImageNotFoundError extends Error {
	constructor() {
		super('Not found');
		this.name = 'RecipeImageNotFoundError';
	}
}

type StoreRecipeImageOptions = {
	directory?: string;
	version?: number;
	temporaryId?: string;
};

export async function storeRecipeImage(
	db: DbOrTx,
	recipe: RecipeImageTarget,
	input: Buffer,
	options: StoreRecipeImageOptions = {}
): Promise<string> {
	const directory = getRecipeImagesDir(options.directory);
	const version = options.version ?? Date.now();
	const filename = `${recipe.slug}-${version}.webp`;
	const target = join(directory, filename);
	const temporary = join(
		directory,
		`.${recipe.slug}-${options.temporaryId ?? randomUUID()}.tmp`
	);

	try {
		await normalizeRecipeImage(input, temporary);
	} catch {
		await unlink(temporary).catch(() => undefined);
		throw new InvalidRecipeImageError();
	}

	try {
		await rename(temporary, target);
	} catch {
		await unlink(temporary).catch(() => undefined);
		throw new RecipeImageStoreError();
	}

	const imageUrl = `/recipe-images/${filename}`;
	try {
		setRecipeImageUrl(db, recipe.id, imageUrl);
	} catch (cause) {
		await unlink(target).catch(() => undefined);
		throw cause;
	}

	if (recipe.imageUrl?.startsWith('/recipe-images/')) {
		const oldFilename = basename(recipe.imageUrl.split('?')[0]);
		if (oldFilename !== filename) {
			await unlink(join(directory, oldFilename)).catch(() => undefined);
		}
	}
	for (const extension of LEGACY_EXTENSIONS) {
		await unlink(join(directory, `${recipe.slug}.${extension}`)).catch(() => undefined);
	}

	return imageUrl;
}

export function storeRecipeImageForApp(recipe: RecipeImageTarget, input: Buffer) {
	return storeRecipeImage(appDb, recipe, input);
}

type DeleteRecipeImageOptions = {
	directory?: string;
};

export async function deleteRecipeImage(
	db: DbOrTx,
	recipe: RecipeImageTarget,
	options: DeleteRecipeImageOptions = {}
): Promise<void> {
	const directory = getRecipeImagesDir(options.directory);
	setRecipeImageUrl(db, recipe.id, null);

	if (recipe.imageUrl?.startsWith('/recipe-images/')) {
		await unlink(join(directory, basename(recipe.imageUrl.split('?')[0]))).catch(
			() => undefined
		);
	}
	for (const extension of LEGACY_EXTENSIONS) {
		await unlink(join(directory, `${recipe.slug}.${extension}`)).catch(() => undefined);
	}
}

export function deleteRecipeImageForApp(recipe: RecipeImageTarget) {
	return deleteRecipeImage(appDb, recipe);
}

type ReadRecipeImageOptions = {
	directory?: string;
};

export type ReadRecipeImageResult = {
	data: Uint8Array;
	contentType: string;
	contentLength: number;
	cacheControl: 'public, max-age=31536000, immutable';
};

export async function readRecipeImage(
	filename: string,
	options: ReadRecipeImageOptions = {}
): Promise<ReadRecipeImageResult> {
	if (!isSafeImagePathSegment(filename)) {
		throw new InvalidRecipeImageFilenameError();
	}

	const extension = extname(filename).slice(1).toLowerCase();
	if (!isAllowedImageExtension(extension)) {
		throw new RecipeImageNotFoundError();
	}

	const path = join(getRecipeImagesDir(options.directory), filename);
	let info;
	try {
		info = await stat(path);
	} catch {
		throw new RecipeImageNotFoundError();
	}
	if (!info.isFile()) {
		throw new RecipeImageNotFoundError();
	}

	const data = await readFile(path);
	return {
		data: new Uint8Array(data),
		contentType: contentTypeForImageExtension(extension),
		contentLength: info.size,
		cacheControl: 'public, max-age=31536000, immutable'
	};
}
