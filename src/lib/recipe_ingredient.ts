import { z } from 'zod';

export const IngredientSubstituteSchema = z.object({
	name: z.string().trim().min(1),
	kind: z.enum(['protein', 'spice', 'vegetable', 'other']).optional(),
	note: z.string().trim().min(1).max(500).optional()
});

export const IngredientSchema = z.object({
	name: z.string().trim().min(1),
	amount: z.string().trim(),
	unit: z.string().trim().min(1).optional(),
	preparation: z.string().trim().min(1).optional(),
	role: z.enum(['cook_in', 'serve_fresh']).optional(),
	optional: z.boolean().optional(),
	component: z.string().trim().min(1).optional(),
	purchaseForm: z.enum(['fresh', 'preserved', 'frozen', 'dried', 'any']).optional(),
	scale: z.enum(['linear', 'whole', 'fixed']).optional(),
	origin: z.enum(['source', 'ai_suggested']).optional(),
	substitutes: z.array(IngredientSubstituteSchema).max(12).optional()
}).superRefine((ingredient, ctx) => {
	if (ingredient.origin === 'ai_suggested' && ingredient.optional !== true) {
		ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'AI-suggested ingredients must be optional' });
	}
});

export const IngredientArraySchema = z.array(IngredientSchema);

export type Ingredient = z.infer<typeof IngredientSchema>;
export type IngredientSubstitute = z.infer<typeof IngredientSubstituteSchema>;
export type IngredientRole = 'cook_in' | 'serve_fresh';
export type MealSource = 'fresh' | 'freezer';
export type RecipeScalingMode = 'scalable' | 'fixed_batch';
export type IngredientPurchaseForm = 'fresh' | 'preserved' | 'frozen' | 'dried' | 'any';
export type IngredientScale = 'linear' | 'whole' | 'fixed';
export type IngredientOrigin = 'source' | 'ai_suggested';
export type TranslatedIngredient = {
	name: string;
	preparation?: string;
	component?: string;
	substitutes?: Array<{ name: string; note?: string }>;
};

export function parseIngredientsForWrite(raw: unknown) {
	return IngredientArraySchema.parse(raw);
}
