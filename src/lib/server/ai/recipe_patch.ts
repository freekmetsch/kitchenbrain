import { randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Db } from '$lib/server/db/types';
import * as schema from '$lib/server/db/schema';
import { getRecipeById } from '$lib/server/domains/recipes';
import { updateCanonicalRecipe } from '$lib/server/domains/recipes';
import {
	createIngredientId,
	StoredIngredientSchema,
	type Ingredient,
	type IngredientRole,
	type IngredientPurchaseForm,
	type IngredientScale
} from '$lib/recipe_ingredient';
import { reconcileShoppingAfterWrite } from '$lib/server/workflows/reconcile-shopping';

type RecipeRecord = typeof schema.recipes.$inferSelect;

const OptionalText = z.string().trim().max(256).nullable().optional();
const EvidenceRefSchema = z.object({ evidence_key: z.string().trim().min(1) }).strict();
const CommonFields = {
	reason: z.string().trim().min(1).max(500),
	evidence: EvidenceRefSchema.optional()
};

const AddIngredientSchema = z
	.object({
		kind: z.literal('add_ingredient'),
		after: z
			.object({
				name: z.string().trim().min(1).max(256),
				amount: z.string().trim().max(64),
				unit: OptionalText,
				preparation: OptionalText,
				role: z.enum(['cook_in', 'serve_fresh']).optional(),
				optional: z.boolean().optional(),
				component: OptionalText,
				purchaseForm: z.enum(['fresh', 'preserved', 'frozen', 'dried', 'any']).optional(),
				scale: z.enum(['linear', 'whole', 'fixed']).optional()
			})
			.strict(),
		...CommonFields
	})
	.strict();

const UpdateIngredientSchema = z
	.object({
		kind: z.literal('update_ingredient'),
		ingredient_id: z.string().trim().min(1),
		changes: z
			.object({
				amount: z.string().trim().max(64).optional(),
				unit: OptionalText,
				preparation: OptionalText,
				role: z.enum(['cook_in', 'serve_fresh']).nullable().optional(),
				optional: z.boolean().optional()
			})
			.strict()
			.refine((changes) => Object.keys(changes).length > 0, 'At least one ingredient field must change'),
		...CommonFields
	})
	.strict();

const AddSubstituteSchema = z
	.object({
		kind: z.literal('add_substitute'),
		ingredient_id: z.string().trim().min(1),
		after: z
			.object({
				name: z.string().trim().min(1).max(256),
				kind: z.enum(['protein', 'spice', 'vegetable', 'other']).optional(),
				note: z.string().trim().min(1).max(500).optional()
			})
			.strict(),
		...CommonFields
	})
	.strict();

const RecipeFieldSchema = z.discriminatedUnion('field', [
	z.object({
		kind: z.literal('recipe_field'),
		field: z.literal('servings'),
		after: z.number().int().positive().max(100).nullable(),
		...CommonFields
	}),
	z.object({
		kind: z.literal('recipe_field'),
		field: z.literal('directions'),
		after: z.array(z.string().trim().min(1).max(2000)).max(100),
		...CommonFields
	}),
	z.object({
		kind: z.literal('recipe_field'),
		field: z.literal('notes'),
		after: z.string().trim().max(10000).nullable(),
		...CommonFields
	})
]);

export const RecipePatchOperationInputSchema = z.discriminatedUnion('kind', [
	AddIngredientSchema,
	UpdateIngredientSchema,
	AddSubstituteSchema,
	RecipeFieldSchema
]);

export type RecipePatchOperationInput = z.infer<typeof RecipePatchOperationInputSchema>;

export type RecipePatchEvidence = {
	key: string;
	source: 'ah';
	query: string;
	productName: string;
	packageSize: string | null;
	price: number | null;
};

export class RecipePatchContractError extends Error {
	constructor(
		public readonly code: 'missing_provenance' | 'prohibited_target',
		message: string
	) {
		super(message);
		this.name = 'RecipePatchContractError';
	}
}

export type RecipePatchDisplayOperation = {
	id: string;
	kind: RecipePatchOperationInput['kind'];
	label: string;
	before: string | null;
	after: string;
	reason: string;
	evidence?: RecipePatchEvidence;
};

type StoredOperation = RecipePatchDisplayOperation & {
	input: RecipePatchOperationInput;
};

export type RecipePatchProposal = {
	token: string;
	recipeSlug: string;
	recipeRevision: number;
	operations: RecipePatchDisplayOperation[];
};

type StoredProposal = Omit<RecipePatchProposal, 'token' | 'operations'> & {
	userId: number;
	recipeId: number;
	expiresAt: number;
	operations: StoredOperation[];
};

const TTL_MS = 10 * 60 * 1000;
const MAX_PROPOSALS = 100;
const proposals = new Map<string, StoredProposal>();

function cleanOptional<T>(value: T | null | undefined): T | undefined {
	return value === null || value === undefined || value === '' ? undefined : value;
}

function displayValue(value: unknown): string {
	if (Array.isArray(value)) return value.join('\n');
	if (value === null || value === undefined || value === '') return '—';
	if (typeof value === 'boolean') return value ? 'yes' : 'no';
	return String(value);
}

function ingredientLabel(ingredient: Ingredient): string {
	return ingredient.name;
}

function resolveEvidence(
	input: RecipePatchOperationInput,
	evidence: (key: string) => RecipePatchEvidence | undefined
): RecipePatchEvidence | undefined {
	const key = input.evidence?.evidence_key;
	if (!key) return undefined;
	const resolved = evidence(key);
	if (!resolved) {
		throw new RecipePatchContractError(
			'missing_provenance',
			'Retailer evidence is unavailable or not from this turn'
		);
	}
	return resolved;
}

function stageOperation(
	recipe: RecipeRecord,
	input: RecipePatchOperationInput,
	evidence: (key: string) => RecipePatchEvidence | undefined
): StoredOperation | null {
	const ingredients = recipe.ingredients as Ingredient[];
	const verifiedEvidence = resolveEvidence(input, evidence);
	if (input.kind === 'add_ingredient') {
		if (ingredients.some((ingredient) => ingredient.name.toLowerCase() === input.after.name.toLowerCase())) {
			return null;
		}
		return {
			id: randomUUID(),
			kind: input.kind,
			label: input.after.name,
			before: null,
			after: [input.after.amount, input.after.unit, input.after.name].filter(Boolean).join(' '),
			reason: input.reason,
			evidence: verifiedEvidence,
			input
		};
	}

	const ingredient = ingredients.find(
		(candidate) =>
			candidate.id ===
			(input.kind === 'recipe_field' ? undefined : input.ingredient_id)
	);
	if (input.kind !== 'recipe_field' && !ingredient) {
		throw new RecipePatchContractError(
			'prohibited_target',
			`Ingredient ${input.ingredient_id} is not in this recipe`
		);
	}
	if (input.kind === 'update_ingredient') {
		const changed = Object.entries(input.changes).filter(
			([field, value]) => displayValue(ingredient![field as keyof Ingredient]) !== displayValue(value)
		);
		if (changed.length === 0) return null;
		return {
			id: randomUUID(),
			kind: input.kind,
			label: ingredientLabel(ingredient!),
			before: changed
				.map(([field]) => `${field}: ${displayValue(ingredient![field as keyof Ingredient])}`)
				.join(', '),
			after: changed.map(([field, value]) => `${field}: ${displayValue(value)}`).join(', '),
			reason: input.reason,
			evidence: verifiedEvidence,
			input
		};
	}
	if (input.kind === 'add_substitute') {
		if (
			ingredient!.name.toLowerCase() === input.after.name.toLowerCase() ||
			(ingredient!.substitutes ?? []).some(
				(substitute) => substitute.name.toLowerCase() === input.after.name.toLowerCase()
			)
		) {
			return null;
		}
		return {
			id: randomUUID(),
			kind: input.kind,
			label: `${input.after.name} for ${ingredient!.name}`,
			before: null,
			after: input.after.name,
			reason: input.reason,
			evidence: verifiedEvidence,
			input
		};
	}

	const before = recipe[input.field];
	if (JSON.stringify(before) === JSON.stringify(input.after)) return null;
	return {
		id: randomUUID(),
		kind: input.kind,
		label: input.field,
		before: displayValue(before),
		after: displayValue(input.after),
		reason: input.reason,
		evidence: verifiedEvidence,
		input
	};
}

export function stageRecipePatch(
	recipe: RecipeRecord,
	input: {
		userId: number;
		operations: unknown[];
		evidence?: (key: string) => RecipePatchEvidence | undefined;
	},
	now = Date.now()
): RecipePatchProposal {
	for (const [token, proposal] of proposals) {
		if (proposal.expiresAt <= now) proposals.delete(token);
	}
	while (proposals.size >= MAX_PROPOSALS) proposals.delete(proposals.keys().next().value!);
	const evidence = input.evidence ?? (() => undefined);
	const operations = input.operations
		.map((operation) => RecipePatchOperationInputSchema.parse(operation))
		.map((operation) => stageOperation(recipe, operation, evidence))
		.filter((operation): operation is StoredOperation => operation !== null);
	if (operations.length === 0) throw new Error('The proposal contains no recipe changes');
	const token = randomBytes(24).toString('base64url');
	const proposal: StoredProposal = {
		userId: input.userId,
		recipeId: recipe.id,
		recipeSlug: recipe.slug,
		recipeRevision: recipe.contentRevision,
		operations,
		expiresAt: now + TTL_MS
	};
	proposals.set(token, proposal);
	return {
		token,
		recipeSlug: proposal.recipeSlug,
		recipeRevision: proposal.recipeRevision,
		operations: operations.map(({ input: _input, ...operation }) => operation)
	};
}

function applyIngredientChanges(ingredient: Ingredient, changes: z.infer<typeof UpdateIngredientSchema>['changes']): Ingredient {
	const next = { ...ingredient };
	for (const [field, value] of Object.entries(changes)) {
		if ((field === 'unit' || field === 'preparation' || field === 'role') && cleanOptional(value) === undefined) {
			delete next[field as 'unit' | 'preparation' | 'role'];
		} else {
			(next as Record<string, unknown>)[field] = value;
		}
	}
	return StoredIngredientSchema.parse(next);
}

export function applyRecipePatch(
	db: Db,
	input: {
		token: string;
		userId: number;
		operationIds: string[];
	}
) {
	const proposal = proposals.get(input.token);
	if (!proposal || proposal.expiresAt <= Date.now() || proposal.userId !== input.userId) {
		throw new Error('Recipe proposal expired or belongs to another user');
	}
	const selected = new Set(input.operationIds);
	if (selected.size !== input.operationIds.length) throw new Error('Recipe operation IDs must be unique');
	if ([...selected].some((id) => !proposal.operations.some((operation) => operation.id === id))) {
		throw new Error('Unknown recipe operation');
	}
	if (selected.size === 0) {
		return { appliedOperations: 0, recipeRevision: proposal.recipeRevision };
	}

	const result = db.transaction((tx) => {
		const recipe = getRecipeById(tx, proposal.recipeId);
		if (!recipe || recipe.contentRevision !== proposal.recipeRevision) {
			throw new Error('Recipe changed; generate a new proposal');
		}
		let ingredients = (recipe.ingredients as Ingredient[]).map((ingredient) => ({
			...ingredient,
			...(ingredient.substitutes ? { substitutes: [...ingredient.substitutes] } : {})
		}));
		let servings = recipe.servings;
		let directions = [...recipe.directions];
		let notes = recipe.notes;
		let ingredientChanged = false;
		let directionsChanged = false;
		let recipeFieldChanged = false;

		for (const operation of proposal.operations) {
			if (!selected.has(operation.id)) continue;
			const patch = operation.input;
			if (patch.kind === 'add_ingredient') {
				ingredients.push(
					StoredIngredientSchema.parse({
						id: createIngredientId(),
						name: patch.after.name,
						amount: patch.after.amount,
						unit: cleanOptional(patch.after.unit),
						preparation: cleanOptional(patch.after.preparation),
						role: patch.after.role as IngredientRole | undefined,
						optional: patch.after.optional,
						component: cleanOptional(patch.after.component),
						purchaseForm: patch.after.purchaseForm as IngredientPurchaseForm | undefined,
						scale: patch.after.scale as IngredientScale | undefined,
						origin: 'ai_accepted'
					})
				);
				ingredientChanged = true;
			} else if (patch.kind === 'update_ingredient') {
				const index = ingredients.findIndex((ingredient) => ingredient.id === patch.ingredient_id);
				if (index < 0) throw new Error('Proposal ingredient no longer exists');
				ingredients[index] = applyIngredientChanges(ingredients[index], patch.changes);
				ingredientChanged = true;
			} else if (patch.kind === 'add_substitute') {
				const index = ingredients.findIndex((ingredient) => ingredient.id === patch.ingredient_id);
				if (index < 0) throw new Error('Proposal ingredient no longer exists');
				ingredients[index] = {
					...ingredients[index],
					substitutes: [...(ingredients[index].substitutes ?? []), patch.after]
				};
				ingredientChanged = true;
			} else if (patch.field === 'servings') {
				servings = patch.after;
				recipeFieldChanged = true;
			} else if (patch.field === 'directions') {
				directions = patch.after;
				directionsChanged = true;
			} else {
				notes = patch.after;
				recipeFieldChanged = true;
			}
		}

		const contentChanged = ingredientChanged || directionsChanged || recipeFieldChanged;
		const updated = updateCanonicalRecipe(tx, {
			recipeId: recipe.id,
			expectedRevision: proposal.recipeRevision,
			changes: {
				...(ingredientChanged ? { ingredients } : {}),
				...(servings !== recipe.servings ? { servings } : {}),
				...(directionsChanged ? { directions } : {}),
				...(notes !== recipe.notes ? { notes } : {}),
				...(contentChanged
					? {
							titleEn: null,
							categoryEn: null,
							cuisineEn: null,
							notesEn: null,
							ingredientsEn: null,
							directionsEn: null,
							translationStatus: recipe.language === 'en' ? ('ready' as const) : ('pending' as const),
							translatedAt: null,
							cookModeJson: null,
							cookModeGeneratedAt: null
						}
					: {})
			}
		});
		if (!updated) throw new Error('Recipe changed; generate a new proposal');
		if (ingredientChanged || servings !== recipe.servings) reconcileShoppingAfterWrite(tx);
		return {
			appliedOperations: selected.size,
			recipeRevision: updated.contentRevision
		};
	});
	proposals.delete(input.token);
	return result;
}

export function clearRecipePatchesForTest(): void {
	proposals.clear();
}
