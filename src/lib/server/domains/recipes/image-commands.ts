import { eq } from 'drizzle-orm';
import * as schema from '$lib/server/db/schema';
import type { DbOrTx } from '$lib/server/db/types';

export type RecipeImageTarget = Pick<
	typeof schema.recipes.$inferSelect,
	'id' | 'slug' | 'imageUrl'
>;

export function getRecipeImageTarget(
	db: DbOrTx,
	slug: string
): RecipeImageTarget | undefined {
	return db
		.select({
			id: schema.recipes.id,
			slug: schema.recipes.slug,
			imageUrl: schema.recipes.imageUrl
		})
		.from(schema.recipes)
		.where(eq(schema.recipes.slug, slug))
		.get();
}

export function setRecipeImageUrl(
	db: DbOrTx,
	recipeId: number,
	imageUrl: string | null
): void {
	db.update(schema.recipes)
		.set({ imageUrl, updatedAt: new Date() })
		.where(eq(schema.recipes.id, recipeId))
		.run();
}
