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
import { upsertRecipeAhPreference } from '$lib/server/domains/shopping/commands';
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
export const RecipeProductChoiceInputSchema = z
	.object({
		ingredient_id: z.string().trim().min(1),
		reason: z.string().trim().min(1).max(500),
		candidates: z
			.array(
				z
					.object({
						evidence_key: z.string().trim().min(1),
						form_label: z.string().trim().min(1).max(80),
						distinction: z.string().trim().min(1).max(240).optional()
					})
					.strict()
			)
			.min(3)
			.max(9)
	})
	.strict();
export type RecipeProductChoiceInput = z.infer<typeof RecipeProductChoiceInputSchema>;

export type RecipePatchEvidence = {
	key: string;
	source: 'ah';
	query: string;
	productId: string;
	productName: string;
	packageSize: string | null;
	price: number | null;
};
export type RecipePatchDisplayEvidence = Omit<RecipePatchEvidence, 'productId'>;

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
	evidence?: RecipePatchDisplayEvidence;
};

type StoredOperation = RecipePatchDisplayOperation & {
	input: RecipePatchOperationInput;
	evidenceInternal?: RecipePatchEvidence;
};

export type RecipeProductCandidateDisplay = {
	id: string;
	formLabel: string;
	distinction?: string;
	productName: string;
	packageSize: string | null;
	price: number | null;
};

export type RecipeProductChoiceDisplay = {
	id: string;
	ingredientId: string;
	label: string;
	reason: string;
	candidates: RecipeProductCandidateDisplay[];
};

type StoredProductCandidate = RecipeProductCandidateDisplay & {
	evidenceKey: string;
	productId: string;
};

type StoredProductChoice = Omit<RecipeProductChoiceDisplay, 'candidates'> & {
	candidates: StoredProductCandidate[];
};

export type RecipePatchProposal = {
	token: string;
	recipeSlug: string;
	recipeRevision: number;
	status: RecipePatchStatus;
	operations: RecipePatchDisplayOperation[];
	productChoices: RecipeProductChoiceDisplay[];
};

export type RecipePatchStatus = 'active' | 'applying' | 'superseded' | 'applied' | 'expired';

type StoredProposal = Omit<RecipePatchProposal, 'token' | 'operations' | 'productChoices'> & {
	userId: number;
	recipeId: number;
	expiresAt: number;
	operations: StoredOperation[];
	productChoices: StoredProductChoice[];
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
	key: string | undefined,
	evidence: (key: string) => RecipePatchEvidence | undefined
): RecipePatchEvidence | undefined {
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
	const verifiedEvidence = resolveEvidence(input.evidence?.evidence_key, evidence);
	const displayEvidence = verifiedEvidence
		? (({ productId: _productId, ...safe }) => safe)(verifiedEvidence)
		: undefined;
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
			evidence: displayEvidence,
			evidenceInternal: verifiedEvidence,
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
			evidence: displayEvidence,
			evidenceInternal: verifiedEvidence,
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
			evidence: displayEvidence,
			evidenceInternal: verifiedEvidence,
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
		evidence: displayEvidence,
		evidenceInternal: verifiedEvidence,
		input
	};
}

function normalizeFormLabel(label: string): string {
	return label.trim().toLocaleLowerCase('nl-NL').replace(/\s+/g, ' ');
}

function stageProductChoice(
	recipe: RecipeRecord,
	input: RecipeProductChoiceInput,
	evidence: (key: string) => RecipePatchEvidence | undefined
): StoredProductChoice {
	const ingredient = (recipe.ingredients as Ingredient[]).find(
		(candidate) => candidate.id === input.ingredient_id
	);
	if (!ingredient) {
		throw new RecipePatchContractError(
			'prohibited_target',
			`Ingredient ${input.ingredient_id} is not in this recipe`
		);
	}
	const evidenceKeys = new Set<string>();
	const productIds = new Set<string>();
	const formLabels = new Set<string>();
	const candidates = input.candidates.map((candidate) => {
		if (evidenceKeys.has(candidate.evidence_key)) {
			throw new RecipePatchContractError('prohibited_target', 'Product choices must use unique evidence');
		}
		const verified = resolveEvidence(candidate.evidence_key, evidence);
		if (!verified) {
			throw new RecipePatchContractError('missing_provenance', 'Retailer evidence is unavailable');
		}
		const formLabel = normalizeFormLabel(candidate.form_label);
		if (productIds.has(verified.productId) || formLabels.has(formLabel)) {
			throw new RecipePatchContractError(
				'prohibited_target',
				'Product choices must have unique products and form labels'
			);
		}
		evidenceKeys.add(candidate.evidence_key);
		productIds.add(verified.productId);
		formLabels.add(formLabel);
		return {
			id: randomUUID(),
			evidenceKey: candidate.evidence_key,
			productId: verified.productId,
			formLabel: candidate.form_label,
			...(candidate.distinction ? { distinction: candidate.distinction } : {}),
			productName: verified.productName,
			packageSize: verified.packageSize,
			price: verified.price
		};
	});
	return {
		id: randomUUID(),
		ingredientId: input.ingredient_id,
		label: ingredientLabel(ingredient),
		reason: input.reason,
		candidates
	};
}

export function stageRecipePatch(
	recipe: RecipeRecord,
	input: {
		userId: number;
		operations?: unknown[];
		productChoices?: unknown[];
		evidence?: (key: string) => RecipePatchEvidence | undefined;
		replacement?: { token: string; groupId: string };
	},
	now = Date.now()
): RecipePatchProposal {
	for (const [token, proposal] of proposals) {
		if (proposal.expiresAt <= now && proposal.status === 'active') proposal.status = 'expired';
	}
	while (proposals.size >= MAX_PROPOSALS) proposals.delete(proposals.keys().next().value!);
	const evidence = input.evidence ?? (() => undefined);
	let operations = (input.operations ?? [])
		.map((operation) => RecipePatchOperationInputSchema.parse(operation))
		.map((operation) => stageOperation(recipe, operation, evidence))
		.filter((operation): operation is StoredOperation => operation !== null);
	let productChoices = (input.productChoices ?? [])
		.map((choice) => RecipeProductChoiceInputSchema.parse(choice))
		.map((choice) => stageProductChoice(recipe, choice, evidence));
	const choiceIngredientIds = productChoices.map((choice) => choice.ingredientId);
	if (new Set(choiceIngredientIds).size !== choiceIngredientIds.length) {
		throw new RecipePatchContractError(
			'prohibited_target',
			'A proposal can contain only one product-choice group per ingredient'
		);
	}
	if (operations.length === 0 && productChoices.length === 0) {
		throw new Error('The proposal contains no recipe changes or product choices');
	}
	let replacedProposal: StoredProposal | undefined;
	if (input.replacement) {
		replacedProposal = proposals.get(input.replacement.token);
		if (
			!replacedProposal ||
			replacedProposal.userId !== input.userId ||
			replacedProposal.recipeId !== recipe.id ||
			replacedProposal.status !== 'active' ||
			replacedProposal.expiresAt <= now
		) {
			throw new RecipePatchContractError(
				'missing_provenance',
				'The product-choice proposal is no longer active'
			);
		}
		if (replacedProposal.recipeRevision !== recipe.contentRevision) {
			throw new RecipePatchContractError(
				'prohibited_target',
				'The recipe changed; generate a new proposal'
			);
		}
		const oldGroup = replacedProposal.productChoices.find(
			(group) => group.id === input.replacement!.groupId
		);
		if (
			!oldGroup ||
			operations.length > 0 ||
			productChoices.length !== 1 ||
			productChoices[0].ingredientId !== oldGroup.ingredientId
		) {
			throw new RecipePatchContractError(
				'prohibited_target',
				'Find-different can replace only its bound ingredient group'
			);
		}
		const oldProductIds = new Set(oldGroup.candidates.map((candidate) => candidate.productId));
		if (
			productChoices[0].candidates.some((candidate) => oldProductIds.has(candidate.productId))
		) {
			throw new RecipePatchContractError(
				'prohibited_target',
				'Replacement product choices must be different from the previous options'
			);
		}
		const replacementGroup = { ...productChoices[0], id: oldGroup.id };
		operations = replacedProposal.operations;
		productChoices = replacedProposal.productChoices.map((group) =>
			group.id === oldGroup.id ? replacementGroup : group
		);
	}
	const token = randomBytes(24).toString('base64url');
	const proposal: StoredProposal = {
		userId: input.userId,
		recipeId: recipe.id,
		recipeSlug: recipe.slug,
		recipeRevision: recipe.contentRevision,
		status: 'active',
		operations,
		productChoices,
		expiresAt: now + TTL_MS
	};
	for (const existing of proposals.values()) {
		const shouldSupersede = replacedProposal
			? existing === replacedProposal
			: existing.userId === input.userId &&
				existing.recipeId === recipe.id &&
				existing.status === 'active';
		if (shouldSupersede) existing.status = 'superseded';
	}
	proposals.set(token, proposal);
	return {
		token,
		recipeSlug: proposal.recipeSlug,
		recipeRevision: proposal.recipeRevision,
		status: proposal.status,
		operations: operations.map(({ input: _input, evidenceInternal: _evidenceInternal, ...operation }) => operation),
		productChoices: productChoices.map((choice) => ({
			...choice,
			candidates: choice.candidates.map(
				({ evidenceKey: _evidenceKey, productId: _productId, ...candidate }) => candidate
			)
		}))
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
		productSelections?: Array<{ groupId: string; candidateId: string }>;
	}
) {
	const proposal = proposals.get(input.token);
	if (!proposal || proposal.userId !== input.userId) {
		throw new Error('Recipe proposal expired or belongs to another user');
	}
	if (proposal.expiresAt <= Date.now()) proposal.status = 'expired';
	if (proposal.status !== 'active') throw new Error(`Recipe proposal is ${proposal.status}`);
	const selected = new Set(input.operationIds);
	if (selected.size !== input.operationIds.length) throw new Error('Recipe operation IDs must be unique');
	if ([...selected].some((id) => !proposal.operations.some((operation) => operation.id === id))) {
		throw new Error('Unknown recipe operation');
	}
	const selectionInputs = input.productSelections ?? [];
	const selectedGroupIds = new Set(selectionInputs.map((selection) => selection.groupId));
	if (selectedGroupIds.size !== selectionInputs.length) {
		throw new Error('Product choice groups must be unique');
	}
	const productSelections = selectionInputs.map((selection) => {
		const group = proposal.productChoices.find((candidate) => candidate.id === selection.groupId);
		const candidate = group?.candidates.find((item) => item.id === selection.candidateId);
		if (!group || !candidate) throw new Error('Unknown recipe product choice');
		return { group, candidate };
	});

	proposal.status = 'applying';
	try {
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
			const updated = contentChanged
				? updateCanonicalRecipe(tx, {
						recipeId: recipe.id,
						expectedRevision: proposal.recipeRevision,
						changes: {
							...(ingredientChanged ? { ingredients } : {}),
							...(servings !== recipe.servings ? { servings } : {}),
							...(directionsChanged ? { directions } : {}),
							...(notes !== recipe.notes ? { notes } : {}),
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
					})
				: recipe;
			if (!updated) throw new Error('Recipe changed; generate a new proposal');
			for (const selection of productSelections) {
				if (!ingredients.some((ingredient) => ingredient.id === selection.group.ingredientId)) {
					throw new Error('Proposal ingredient no longer exists');
				}
				upsertRecipeAhPreference(tx, {
					recipeId: recipe.id,
					ingredientId: selection.group.ingredientId,
					productId: selection.candidate.productId,
					productName: selection.candidate.productName,
					variantLabel: selection.candidate.formLabel
				});
			}
			if (ingredientChanged || servings !== recipe.servings) reconcileShoppingAfterWrite(tx);
			return {
				appliedOperations: selected.size,
				appliedPreferences: productSelections.length,
				recipeRevision: updated.contentRevision
			};
		});
		proposal.status = 'applied';
		return result;
	} catch (error) {
		proposal.status =
			error instanceof Error &&
			(error.message.includes('changed') || error.message.includes('no longer exists'))
				? 'superseded'
				: 'active';
		throw error;
	}
}

export function getRecipePatchStatus(input: {
	token: string;
	userId: number;
	recipeSlug: string;
}): RecipePatchStatus {
	const proposal = proposals.get(input.token);
	if (
		!proposal ||
		proposal.userId !== input.userId ||
		proposal.recipeSlug !== input.recipeSlug
	) {
		return 'expired';
	}
	if (proposal.expiresAt <= Date.now() && proposal.status === 'active') {
		proposal.status = 'expired';
	}
	return proposal.status;
}

export function getRecipePatchReplacementContext(input: {
	token: string;
	groupId: string;
	userId: number;
}): {
	token: string;
	groupId: string;
	recipeSlug: string;
	ingredientId: string;
	ingredientLabel: string;
} | null {
	const proposal = proposals.get(input.token);
	if (
		!proposal ||
		proposal.userId !== input.userId ||
		proposal.status !== 'active' ||
		proposal.expiresAt <= Date.now()
	) {
		return null;
	}
	const group = proposal.productChoices.find((candidate) => candidate.id === input.groupId);
	if (!group) return null;
	return {
		token: input.token,
		groupId: group.id,
		recipeSlug: proposal.recipeSlug,
		ingredientId: group.ingredientId,
		ingredientLabel: group.label
	};
}

export function clearRecipePatchesForTest(): void {
	proposals.clear();
}
