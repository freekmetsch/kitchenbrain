export type SubstituteDraft = {
	clientId: string;
	name: string;
	kind?: 'protein' | 'spice' | 'vegetable' | 'other';
	note?: string;
};

export type IngredientDraft = {
	clientId: string;
	name: string;
	amount: string;
	unit?: string;
	role?: 'cook_in' | 'serve_fresh';
	substitutes?: SubstituteDraft[];
};

export type DirectionDraft = { clientId: string; text: string };

type PersistedSubstitute = Omit<SubstituteDraft, 'clientId'> & { clientId?: string };
type PersistedIngredient = Omit<IngredientDraft, 'clientId' | 'substitutes'> & {
	clientId?: string;
	substitutes?: PersistedSubstitute[];
};

let nextClientId = 0;
export function createRecipeEditId(prefix: 'ingredient' | 'substitute' | 'direction'): string {
	nextClientId += 1;
	return `${prefix}-${nextClientId}`;
}

export function hydrateIngredients(items: PersistedIngredient[]): IngredientDraft[] {
	return items.map((ingredient) => ({
		...ingredient,
		clientId: ingredient.clientId || createRecipeEditId('ingredient'),
		unit: ingredient.unit ?? '',
		substitutes: (ingredient.substitutes ?? []).map((substitute) => ({
			...substitute,
			clientId: substitute.clientId || createRecipeEditId('substitute')
		}))
	}));
}

export function hydrateDirections(items: Array<string | DirectionDraft>): DirectionDraft[] {
	return items.map((direction) =>
		typeof direction === 'string'
			? { clientId: createRecipeEditId('direction'), text: direction }
			: { clientId: direction.clientId || createRecipeEditId('direction'), text: direction.text }
	);
}

export function serializeIngredients(items: IngredientDraft[]): string {
	return JSON.stringify(
		items
			.map((ingredient) => ({
				name: ingredient.name.trim(),
				amount: ingredient.amount.trim(),
				unit: ingredient.unit?.trim() || undefined,
				role: ingredient.role,
				substitutes: (ingredient.substitutes ?? [])
					.map((substitute) => ({
						name: substitute.name.trim(),
						kind: substitute.kind,
						note: substitute.note?.trim() || undefined
					}))
					.filter((substitute) => substitute.name.length > 0)
			}))
			.filter((ingredient) => ingredient.name.length > 0)
	);
}

export function serializeDirections(items: DirectionDraft[]): string {
	return JSON.stringify(items.map((direction) => direction.text.trim()).filter(Boolean));
}
