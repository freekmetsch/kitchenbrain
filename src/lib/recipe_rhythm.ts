import {
	normalizeRotationSettings,
	type RotationPolicy,
	type RotationSeason
} from '$lib/meal_rotation';
import { freezerTargetPayload } from '$lib/freezer_target';

export type RecipeRhythmState = {
	rotationPolicy: RotationPolicy | null;
	rotationSeasons: RotationSeason[];
	isFreezerStaple: boolean;
	targetPortions: number | null;
};

export function recipeRhythmPayload(
	policy: RotationPolicy | null,
	seasons: RotationSeason[],
	keepStocked: boolean,
	targetPortions: number
) {
	const rotation = normalizeRotationSettings(policy, seasons);
	return {
		rotation_policy: rotation.policy,
		rotation_seasons: rotation.seasons,
		...freezerTargetPayload(keepStocked, targetPortions)
	};
}

export function parseRecipeRhythmResponse(value: unknown): RecipeRhythmState | null {
	if (!value || typeof value !== 'object') return null;
	const candidate = value as Record<string, unknown>;
	if (typeof candidate.isFreezerStaple !== 'boolean') return null;
	if (candidate.targetPortions !== null && typeof candidate.targetPortions !== 'number') return null;
	try {
		const rotation = normalizeRotationSettings(
			candidate.rotationPolicy,
			candidate.rotationSeasons
		);
		return {
			rotationPolicy: rotation.policy,
			rotationSeasons: rotation.seasons,
			isFreezerStaple: candidate.isFreezerStaple,
			targetPortions: candidate.targetPortions as number | null
		};
	} catch {
		return null;
	}
}
