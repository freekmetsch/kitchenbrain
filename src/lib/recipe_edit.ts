export type SubstituteDraft = {
	clientId: string;
	name: string;
	kind?: 'protein' | 'spice' | 'vegetable' | 'other';
	note?: string;
};

export type IngredientDraft = {
	clientId: string;
	id?: string;
	name: string;
	amount: string;
	unit?: string;
	preparation?: string;
	role?: 'cook_in' | 'serve_fresh';
	optional?: boolean;
	component?: string;
	purchaseForm?: 'fresh' | 'preserved' | 'frozen' | 'dried' | 'any';
	scale?: 'linear' | 'whole' | 'fixed';
	origin?: 'source' | 'ai_suggested' | 'ai_accepted';
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
		preparation: ingredient.preparation ?? '',
		component: ingredient.component ?? '',
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
			.map((ingredient) => {
				const { clientId: _clientId, substitutes, ...stored } = ingredient;
				return {
				...stored,
				name: ingredient.name.trim(),
				amount: ingredient.amount.trim(),
				unit: ingredient.unit?.trim() || undefined,
				preparation: ingredient.preparation?.trim() || undefined,
				role: ingredient.role,
				optional: ingredient.optional || undefined,
				component: ingredient.component?.trim() || undefined,
				purchaseForm: ingredient.purchaseForm,
				scale: ingredient.scale,
				// ai_accepted is server-owned. Omitting it lets the live boundary
				// retain an existing trusted value without accepting a forged one.
				origin: ingredient.origin === 'ai_accepted' ? undefined : ingredient.origin,
				substitutes: (substitutes ?? [])
					.map((substitute) => {
						const { clientId: _substituteClientId, ...storedSubstitute } = substitute;
						return {
						...storedSubstitute,
						name: substitute.name.trim(),
						kind: substitute.kind,
						note: substitute.note?.trim() || undefined
						};
					})
					.filter((substitute) => substitute.name.length > 0)
				};
			})
			.filter((ingredient) => ingredient.name.length > 0)
	);
}

export function serializeDirections(items: DirectionDraft[]): string {
	return JSON.stringify(items.map((direction) => direction.text.trim()).filter(Boolean));
}

export function serializeDirectionIds(items: DirectionDraft[]): string {
	return JSON.stringify(
		items.filter((direction) => direction.text.trim().length > 0).map((direction) => direction.clientId)
	);
}

export function recipeIngredientsEqual(
	left: PersistedIngredient[],
	right: PersistedIngredient[]
): boolean {
	return (
		serializeIngredients(hydrateIngredients(left)) ===
		serializeIngredients(hydrateIngredients(right))
	);
}
