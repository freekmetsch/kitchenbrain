import { z } from 'zod';
import { StoredIngredientSchema, type Ingredient } from '$lib/recipe_ingredient';

export const RecipeSourceSnapshotSchema = z.object({
	version: z.literal(1),
	provenance: z.enum(['imported_source', 'legacy_baseline']),
	capturedAt: z.number().int().nonnegative(),
	title: z.string(),
	servings: z.number().int().positive().nullable(),
	sourceUrl: z.string().nullable(),
	ingredients: z.array(StoredIngredientSchema),
	directions: z.array(z.string())
});

export type RecipeSourceSnapshot = z.infer<typeof RecipeSourceSnapshotSchema>;

type SnapshotInput = {
	title: string;
	servings: number | null;
	sourceUrl: string | null;
	ingredients: Ingredient[];
	directions: string[];
};

export function captureRecipeSource(
	input: SnapshotInput,
	options: { provenance?: RecipeSourceSnapshot['provenance']; capturedAt?: number } = {}
): RecipeSourceSnapshot {
	return {
		version: 1,
		provenance: options.provenance ?? 'imported_source',
		capturedAt: options.capturedAt ?? Date.now(),
		title: input.title,
		servings: input.servings,
		sourceUrl: input.sourceUrl,
		ingredients: structuredClone(input.ingredients),
		directions: [...input.directions]
	};
}

let directionSequence = 0;

export function createDirectionId(): string {
	directionSequence += 1;
	const random = globalThis.crypto?.randomUUID?.();
	return random ? `dir_${random}` : `dir_${Date.now().toString(36)}_${directionSequence.toString(36)}`;
}

export function ensureDirectionIds(directions: string[], ids?: string[] | null): string[] {
	const seen = new Set<string>();
	return directions.map((_, index) => {
		const candidate = ids?.[index]?.trim();
		if (candidate && !seen.has(candidate)) {
			seen.add(candidate);
			return candidate;
		}
		let next = createDirectionId();
		while (seen.has(next)) next = createDirectionId();
		seen.add(next);
		return next;
	});
}

/**
 * Keep exact-text IDs across reorders, then retain same-position IDs for copy
 * edits. New and duplicate directions receive fresh IDs.
 */
export function reconcileDirectionIds(
	currentDirections: string[],
	currentIds: string[] | null | undefined,
	nextDirections: string[]
): string[] {
	const safeCurrentIds = ensureDirectionIds(currentDirections, currentIds);
	const unused = new Set(safeCurrentIds);
	const byText = new Map<string, string[]>();
	currentDirections.forEach((direction, index) => {
		const ids = byText.get(direction) ?? [];
		ids.push(safeCurrentIds[index]);
		byText.set(direction, ids);
	});

	const next = nextDirections.map((direction) => {
		const exact = byText.get(direction)?.find((id) => unused.has(id));
		if (!exact) return null;
		unused.delete(exact);
		return exact;
	});

	for (let index = 0; index < next.length; index += 1) {
		if (next[index]) continue;
		const samePosition = safeCurrentIds[index];
		if (samePosition && unused.has(samePosition)) {
			next[index] = samePosition;
			unused.delete(samePosition);
		} else {
			next[index] = createDirectionId();
		}
	}
	return next as string[];
}
