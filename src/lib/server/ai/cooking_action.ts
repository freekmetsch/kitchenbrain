import { randomUUID } from 'node:crypto';
import type { Recipe } from '$lib/server/domains/recipes';
import * as schema from '$lib/server/db/schema';
import {
	cookingRescue,
	type CookingRescueIssue
} from '$lib/components/cook-mode/cooking_rescue';

type InventoryItem = typeof schema.inventoryItems.$inferSelect;
type Confidence = 'high' | 'medium' | 'low';

type Recommendation = {
	whyNow: string;
	evidence: string[];
	confidence: Confidence;
	uncertainty: string | null;
	consequence: string;
	alternatives: string[];
};

type Localized<T> = { en: T; nl: T };

function recommendation(
	whyNow: string,
	evidence: string[],
	confidence: Confidence,
	uncertainty: string | null,
	consequence: string,
	alternatives: string[]
): Recommendation {
	return { whyNow, evidence, confidence, uncertainty, consequence, alternatives };
}

export function stageTimerCookingAction(
	input: {
		operation: 'start' | 'extend' | 'rename' | 'cancel';
		seconds?: number;
		label?: string;
		targetLabel?: string;
	},
	id: string = randomUUID()
) {
	const operation = input.operation;
	const label = input.label?.trim() || null;
	const targetLabel = input.targetLabel?.trim() || null;
	const seconds = input.seconds == null ? null : Math.round(input.seconds);
	const effectEn =
		operation === 'start'
			? `Start “${label}” for ${seconds} seconds.`
			: operation === 'extend'
				? `Extend the matching timer by ${seconds} seconds.`
				: operation === 'rename'
					? `Rename the matching timer to “${label}”.`
					: 'Cancel the matching timer.';
	const effectNl =
		operation === 'start'
			? `Start ‘${label}’ voor ${seconds} seconden.`
			: operation === 'extend'
				? `Verleng de passende timer met ${seconds} seconden.`
				: operation === 'rename'
					? `Hernoem de passende timer naar ‘${label}’.`
					: 'Annuleer de passende timer.';
	return {
		ok: true as const,
		kind: 'cooking_action' as const,
		id,
		actionKind: 'timer' as const,
		timer: { operation, seconds, label, targetLabel },
		localized: {
			en: {
				title: 'Review timer',
				recommendation: recommendation(
					'A timer action was requested in this conversation.',
					[targetLabel ? `Requested target: ${targetLabel}` : 'No existing timer target was named.'],
					targetLabel || operation === 'start' ? 'high' : 'medium',
					operation !== 'start' && !targetLabel ? 'Choose the intended running timer before applying.' : null,
					effectEn,
					['Adjust the timer details', 'Leave all timers unchanged']
				)
			},
			nl: {
				title: 'Timer controleren',
				recommendation: recommendation(
					'In dit gesprek is om een timeractie gevraagd.',
					[targetLabel ? `Gevraagd doel: ${targetLabel}` : 'Er is geen bestaande timer genoemd.'],
					targetLabel || operation === 'start' ? 'high' : 'medium',
					operation !== 'start' && !targetLabel ? 'Kies voor uitvoeren de bedoelde lopende timer.' : null,
					effectNl,
					['Pas de timerdetails aan', 'Laat alle timers ongewijzigd']
				)
			}
		} satisfies Localized<{ title: string; recommendation: Recommendation }>
	};
}

function localizedRecipe(recipe: Recipe, language: 'en' | 'nl') {
	const directions =
		language === 'en' && recipe.directionsEn?.length === recipe.directions.length
			? recipe.directionsEn
			: recipe.directions;
	const ingredients =
		language === 'en' && recipe.ingredientsEn?.length === recipe.ingredients.length
			? recipe.ingredientsEn.map((item) => item.name)
			: recipe.ingredients.map((item) => item.name);
	return {
		title: language === 'en' ? (recipe.titleEn ?? recipe.title) : recipe.title,
		directions,
		ingredients
	};
}

export function stageRescueCookingAction(
	recipe: Recipe,
	input: { issue: CookingRescueIssue; stepIndex?: number },
	id: string = randomUUID()
) {
	const stepIndex = input.stepIndex ?? 0;
	const localized = Object.fromEntries(
		(['en', 'nl'] as const).map((language) => {
			const view = localizedRecipe(recipe, language);
			const step = view.directions[stepIndex];
			if (!step) throw new Error('Recipe step not found');
			const rescue = cookingRescue({
				issue: input.issue,
				language,
				step,
				ingredients: view.ingredients
			});
			return [
				language,
				{
					title: language === 'nl' ? `Kookhulp voor ${view.title}` : `Cooking help for ${view.title}`,
					step,
					guidance: rescue.guidance,
					safetyCaution: rescue.safetyCaution,
					recommendation: recommendation(
						rescue.whyNow,
						language === 'nl'
							? [`Recept: ${view.title}`, `Actieve stap ${stepIndex + 1}: ${step}`]
							: [`Recipe: ${view.title}`, `Active step ${stepIndex + 1}: ${step}`],
						'high',
						language === 'nl'
							? 'De app kan de panwarmte, precieze textuur en verstreken tijd niet zien.'
							: 'Pan heat, exact texture, and elapsed time are not visible to the app.',
						rescue.consequence,
						rescue.alternatives
					)
				}
			];
		})
	) as Localized<{
		title: string;
		step: string;
		guidance: string[];
		safetyCaution: string | null;
		recommendation: Recommendation;
	}>;
	return {
		ok: true as const,
		kind: 'cooking_action' as const,
		id,
		actionKind: 'rescue' as const,
		rescue: {
			recipeSlug: recipe.slug,
			issue: input.issue,
			stepIndex
		},
		localized
	};
}

export function stageDefrostCookingAction(
	item: InventoryItem,
	input: { reminderSeconds?: number },
	id: string = randomUUID()
) {
	if (item.section !== 'freezer' || item.deletedAt) {
		throw new Error('Choose a current freezer item to defrost');
	}
	const reminderSeconds = input.reminderSeconds ?? 2 * 60 * 60;
	const quantity = [item.qtyNum ?? item.qtyText, item.unit].filter(Boolean).join(' ');
	return {
		ok: true as const,
		kind: 'cooking_action' as const,
		id,
		actionKind: 'defrost' as const,
		defrost: {
			itemId: item.id,
			itemName: item.name,
			expectedUpdatedAt: item.updatedAt.toISOString(),
			reminderSeconds
		},
		localized: {
			en: {
				title: `Defrost ${item.name}`,
				recommendation: recommendation(
					`${item.name} is currently recorded in the freezer.`,
					[quantity ? `${item.name}: ${quantity}` : item.name, 'Storage: freezer'],
					'high',
					'The app cannot verify that the food has physically moved until you confirm it.',
					'One tap starts the reviewed cue; completion moves the stock record to the fridge and remains undoable.',
					['Adjust the cue duration', 'Leave it in the freezer']
				)
			},
			nl: {
				title: `${item.name} ontdooien`,
				recommendation: recommendation(
					`${item.name} staat nu in de voorraad als diepvriesitem.`,
					[quantity ? `${item.name}: ${quantity}` : item.name, 'Bewaarplek: vriezer'],
					'high',
					'De app kan de fysieke verplaatsing pas controleren wanneer je die bevestigt.',
					'Eén tik start de gecontroleerde melding; na bevestiging verhuist de voorraadregistratie naar de koelkast en blijft Ongedaan maken beschikbaar.',
					['Pas de duur aan', 'Laat het in de vriezer']
				)
			}
		} satisfies Localized<{ title: string; recommendation: Recommendation }>
	};
}
