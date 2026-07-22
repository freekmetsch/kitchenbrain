import { z } from 'zod';

const IngredientSubstituteFields = {
	name: z.string().trim().min(1),
	kind: z.enum(['protein', 'spice', 'vegetable', 'other']).optional(),
	note: z.string().trim().min(1).max(500).optional()
};

export const StoredIngredientSubstituteSchema = z.object(IngredientSubstituteFields).passthrough();
export const LiveIngredientSubstituteSchema = z.object(IngredientSubstituteFields);
export const IngredientSubstituteSchema = StoredIngredientSubstituteSchema;

const IngredientFields = {
	id: z.string().trim().min(1).optional(),
	name: z.string().trim().min(1),
	amount: z.string().trim(),
	unit: z.string().trim().min(1).optional(),
	preparation: z.string().trim().min(1).optional(),
	role: z.enum(['cook_in', 'serve_fresh']).optional(),
	optional: z.boolean().optional(),
	component: z.string().trim().min(1).optional(),
	purchaseForm: z.enum(['fresh', 'preserved', 'frozen', 'dried', 'any']).optional(),
	scale: z.enum(['linear', 'whole', 'fixed']).optional(),
	origin: z.enum(['source', 'ai_suggested', 'ai_accepted']).optional(),
	substitutes: z.array(StoredIngredientSubstituteSchema).max(12).optional()
};

export function createIngredientId(): string {
	return `ing_${globalThis.crypto.randomUUID()}`;
}

function requireOptionalAiSuggestions(
	ingredient: { origin?: string; optional?: boolean },
	ctx: z.RefinementCtx
) {
	if (ingredient.origin === 'ai_suggested' && ingredient.optional !== true) {
		ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'AI-suggested ingredients must be optional' });
	}
}

/** Stored recipe data, including fields emitted by future releases. */
export const StoredIngredientSchema = z
	.object(IngredientFields)
	.passthrough()
	.superRefine(requireOptionalAiSuggestions);

/** Normal client/model writes cannot mint the trusted ai_accepted origin. */
export const LiveIngredientSchema = z
	.object({
		...IngredientFields,
		origin: z.enum(['source', 'ai_suggested']).optional(),
		substitutes: z.array(LiveIngredientSubstituteSchema).max(12).optional()
	})
	.superRefine(requireOptionalAiSuggestions);

const { id: _ingredientId, ...NewIngredientFields } = IngredientFields;

/** Creation and AI-enrichment paths cannot emit an ingredient ID in Release A. */
export const NewIngredientSchema = z
	.object({
		...NewIngredientFields,
		origin: z.enum(['source', 'ai_suggested']).optional(),
		substitutes: z.array(LiveIngredientSubstituteSchema).max(12).optional()
	})
	.strict()
	.superRefine(requireOptionalAiSuggestions)
	.transform((ingredient) => ({ ...ingredient, id: createIngredientId() }));

/** A validated full backup may restore trusted provenance and future fields. */
export const TrustedRestoreIngredientSchema = StoredIngredientSchema;

// General recipe reads use the future-shaped stored schema. Live mutation
// boundaries must opt into LiveIngredientSchema explicitly.
export const IngredientSchema = StoredIngredientSchema;

export const IngredientArraySchema = z.array(StoredIngredientSchema);
export const LiveIngredientArraySchema = z.array(LiveIngredientSchema);
export const NewIngredientArraySchema = z.array(NewIngredientSchema);

export type Ingredient = z.infer<typeof StoredIngredientSchema>;
export type IngredientSubstitute = z.infer<typeof IngredientSubstituteSchema>;
export type IngredientRole = 'cook_in' | 'serve_fresh';
export type MealSource = 'fresh' | 'freezer';
export type RecipeScalingMode = 'scalable' | 'fixed_batch';
export type IngredientPurchaseForm = 'fresh' | 'preserved' | 'frozen' | 'dried' | 'any';
export type IngredientScale = 'linear' | 'whole' | 'fixed';
export type IngredientOrigin = 'source' | 'ai_suggested' | 'ai_accepted';
export type TranslatedIngredient = {
	name: string;
	preparation?: string;
	component?: string;
	substitutes?: Array<{ name: string; note?: string }>;
};

export function parseIngredientsForWrite(raw: unknown) {
	return ensureIngredientIds(IngredientArraySchema.parse(raw));
}

/** Assign IDs only where a trusted legacy payload does not have one yet. */
export function ensureIngredientIds(
	ingredients: Ingredient[],
	createId: () => string = createIngredientId
): Ingredient[] {
	const seen = new Set<string>();
	return ingredients.map((ingredient) => {
		const id = ingredient.id ?? createId();
		if (seen.has(id)) throw new Error('Ingredient IDs must be unique within a recipe');
		seen.add(id);
		return ingredient.id ? ingredient : { ...ingredient, id };
	});
}

/**
 * Apply editable live fields while retaining stored IDs, trusted provenance,
 * and fields unknown to this release. Release A never creates an ingredient ID.
 */
export function mergeLiveIngredients(
	currentRaw: unknown,
	submittedRaw: unknown,
	sourceIndexes?: Array<number | null>
): Ingredient[] {
	const current = IngredientArraySchema.parse(currentRaw);
	const submitted = LiveIngredientArraySchema.parse(submittedRaw);
	const submittedIds = submitted.flatMap((ingredient) => (ingredient.id ? [ingredient.id] : []));
	if (new Set(submittedIds).size !== submittedIds.length) {
		throw new Error('Ingredient IDs must be unique within a recipe');
	}
	const currentById = new Map(
		current.filter((ingredient) => ingredient.id).map((ingredient) => [ingredient.id!, ingredient])
	);

	return submitted.map((ingredient, index) => {
		const namedMatches = current.filter(
			(candidate) => !candidate.id && candidate.name.toLowerCase() === ingredient.name.toLowerCase()
		);
		const sourceIndex = sourceIndexes?.[index];
		const existing = ingredient.id
			? currentById.get(ingredient.id)
			: sourceIndexes
				? sourceIndex == null
					? undefined
					: current[sourceIndex]
				: namedMatches.length === 1
					? namedMatches[0]
					: current.length === submitted.length && !current[index]?.id
						? current[index]
						: undefined;
		if (ingredient.id && !existing) {
			throw new Error('Ingredient ID does not belong to this recipe');
		}
		if (!existing) return StoredIngredientSchema.parse({ ...ingredient, id: createIngredientId() });

		const submittedSubstitutes = ingredient.substitutes;
		const storedSubstitutes = existing.substitutes ?? [];
		const mergedSubstitutes = submittedSubstitutes?.map((substitute, substituteIndex) => {
			const named = storedSubstitutes.filter(
				(candidate) => candidate.name.toLowerCase() === substitute.name.toLowerCase()
			);
			const stored = named.length === 1
				? named[0]
				: storedSubstitutes.length === submittedSubstitutes.length
					? storedSubstitutes[substituteIndex]
					: undefined;
			return StoredIngredientSubstituteSchema.parse({ ...stored, ...substitute });
		});

		return StoredIngredientSchema.parse({
			...existing,
			...ingredient,
			id: existing.id,
			origin: existing.origin === 'ai_accepted' ? 'ai_accepted' : ingredient.origin,
			...(submittedSubstitutes ? { substitutes: mergedSubstitutes } : {})
		});
	});
}
