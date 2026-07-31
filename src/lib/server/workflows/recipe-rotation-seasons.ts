import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { db as appDb } from '$lib/server/db/index';
import * as schema from '$lib/server/db/schema';
import type { Db } from '$lib/server/db/types';
import {
	checkDailyCap,
	createMessage,
	loadPrompt,
	logSpend,
	parseModelJson
} from '$lib/server/ai/client';
import { getBackgroundModel } from '$lib/server/ai/config';
import { normalizeRotationSettings, type RotationSeason } from '$lib/meal_rotation';

const SeasonSchema = z.enum(['spring', 'summer', 'autumn', 'winter']);
const ModelOutputSchema = z
	.object({
		proposals: z
			.array(
				z
					.object({
						recipe_id: z.number().int().positive(),
						seasons: z.array(SeasonSchema).min(1).max(4),
						reason: z.string().trim().min(1).max(240)
					})
					.strict()
			)
			.max(40)
	})
	.strict();

export type RotationSeasonProposal = {
	recipeId: number;
	title: string;
	seasons: RotationSeason[];
	reason: string;
	expectedUpdatedAt: number;
};

type ProposalSource = {
	id: number;
	title: string;
	category: string | null;
	cuisine: string | null;
};

type GenerateProposals = (recipes: ProposalSource[]) => Promise<unknown>;

export function parseRotationSeasonModelOutput(
	value: unknown,
	allowedIds: ReadonlySet<number>
): Array<{ recipeId: number; seasons: RotationSeason[]; reason: string }> {
	const parsed = ModelOutputSchema.parse(value);
	const seen = new Set<number>();
	return parsed.proposals.map((proposal) => {
		if (!allowedIds.has(proposal.recipe_id)) {
			throw new Error(`Unknown recipe id ${proposal.recipe_id}`);
		}
		if (seen.has(proposal.recipe_id)) {
			throw new Error(`Duplicate recipe id ${proposal.recipe_id}`);
		}
		seen.add(proposal.recipe_id);
		return {
			recipeId: proposal.recipe_id,
			seasons: normalizeRotationSettings(null, proposal.seasons).seasons,
			reason: proposal.reason
		};
	});
}

async function generateWithBackgroundModel(recipes: ProposalSource[]): Promise<unknown> {
	if (checkDailyCap('background').exceeded) throw new Error('Daily background AI cap reached');
	const model = getBackgroundModel().value;
	const result = await createMessage({
		model,
		system: loadPrompt('recipe_rotation_seasons'),
		messages: [{ role: 'user', content: JSON.stringify({ recipes }) }],
		maxTokens: 2_500
	});
	logSpend(result.model, result.usage, result.costUsd);
	return parseModelJson(result.text);
}

export class RotationSeasonConflict extends Error {
	constructor() {
		super('Recipe rotation changed while this review was open');
	}
}

export type RotationSeasonUndo = {
	recipeId: number;
	previousSeasons: RotationSeason[];
	appliedSeasons: RotationSeason[];
	appliedUpdatedAt: number;
};

function timestampPrecisionNow(): Date {
	return new Date(Math.floor(Date.now() / 1_000) * 1_000);
}

export function createRecipeRotationSeasonService(
	db: Db,
	generate: GenerateProposals = generateWithBackgroundModel
) {
	return {
		async propose(): Promise<RotationSeasonProposal[]> {
			const recipes = db
				.select({
					id: schema.recipes.id,
					title: schema.recipes.title,
					category: schema.recipes.category,
					cuisine: schema.recipes.cuisine,
					updatedAt: schema.recipes.updatedAt
				})
				.from(schema.recipes)
				.where(isNull(schema.recipes.rotationPolicy))
				.orderBy(asc(schema.recipes.title))
				.limit(40)
				.all();
			if (recipes.length === 0) return [];
			const raw = await generate(
				recipes.map(({ updatedAt: _updatedAt, ...recipe }) => recipe)
			);
			const parsed = parseRotationSeasonModelOutput(raw, new Set(recipes.map((recipe) => recipe.id)));
			const byId = new Map(recipes.map((recipe) => [recipe.id, recipe]));
			return parsed.map((proposal) => {
				const recipe = byId.get(proposal.recipeId)!;
				return {
					...proposal,
					title: recipe.title,
					expectedUpdatedAt: recipe.updatedAt.getTime()
				};
			});
		},

		apply(
			items: Array<{ recipeId: number; seasons: RotationSeason[]; expectedUpdatedAt: number }>
		): { applied: number; undo: RotationSeasonUndo[] } {
			if (items.length === 0 || items.length > 40 || new Set(items.map((item) => item.recipeId)).size !== items.length) {
				throw new Error('Invalid reviewed season batch');
			}
			return db.transaction((tx) => {
				const rows = tx
					.select()
					.from(schema.recipes)
					.where(inArray(schema.recipes.id, items.map((item) => item.recipeId)))
					.all();
				const byId = new Map(rows.map((row) => [row.id, row]));
				for (const item of items) {
					const row = byId.get(item.recipeId);
					if (!row || row.rotationPolicy !== null || row.updatedAt.getTime() !== item.expectedUpdatedAt) {
						throw new RotationSeasonConflict();
					}
					normalizeRotationSettings(null, item.seasons);
				}
				const now = timestampPrecisionNow();
				const undo: RotationSeasonUndo[] = [];
				for (const item of items) {
					const row = byId.get(item.recipeId)!;
					const seasons = normalizeRotationSettings(null, item.seasons).seasons;
					tx.update(schema.recipes)
						.set({ rotationSeasonsJson: seasons, updatedAt: now })
						.where(and(eq(schema.recipes.id, item.recipeId), isNull(schema.recipes.rotationPolicy)))
						.run();
					undo.push({
						recipeId: item.recipeId,
						previousSeasons: row.rotationSeasonsJson,
						appliedSeasons: seasons,
						appliedUpdatedAt: now.getTime()
					});
				}
				return { applied: items.length, undo };
			});
		},

		undo(items: RotationSeasonUndo[]): { undone: number } {
			if (
				items.length === 0 ||
				items.length > 40 ||
				new Set(items.map((item) => item.recipeId)).size !== items.length
			) {
				throw new Error('Invalid season undo batch');
			}
			return db.transaction((tx) => {
				const rows = tx
					.select()
					.from(schema.recipes)
					.where(inArray(schema.recipes.id, items.map((item) => item.recipeId)))
					.all();
				const byId = new Map(rows.map((row) => [row.id, row]));
				for (const item of items) {
					const row = byId.get(item.recipeId);
					if (
						!row ||
						row.updatedAt.getTime() !== item.appliedUpdatedAt ||
						JSON.stringify(row.rotationSeasonsJson) !== JSON.stringify(item.appliedSeasons)
					) {
						throw new RotationSeasonConflict();
					}
				}
				const now = timestampPrecisionNow();
				for (const item of items) {
					tx.update(schema.recipes)
						.set({ rotationSeasonsJson: item.previousSeasons, updatedAt: now })
						.where(eq(schema.recipes.id, item.recipeId))
						.run();
				}
				return { undone: items.length };
			});
		}
	};
}

export const recipeRotationSeasonService = createRecipeRotationSeasonService(appDb);

let proposalFlight: Promise<RotationSeasonProposal[]> | null = null;

export function proposeRecipeRotationSeasons(): Promise<RotationSeasonProposal[]> {
	proposalFlight ??= recipeRotationSeasonService.propose().finally(() => {
		proposalFlight = null;
	});
	return proposalFlight;
}
