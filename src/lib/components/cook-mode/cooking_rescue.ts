export type CookingRescueIssue = 'too_salty' | 'too_thin' | 'not_browning';

export type CookingRescue = {
	whyNow: string;
	guidance: string[];
	safetyCaution: string | null;
	consequence: string;
	alternatives: string[];
};

type CookingRescueInput = {
	issue: CookingRescueIssue;
	language: 'en' | 'nl';
	step: string;
	ingredients: string[];
};

function ingredient(
	ingredients: string[],
	pattern: RegExp
): string | null {
	return ingredients.find((candidate) => pattern.test(candidate.toLocaleLowerCase('nl-NL'))) ?? null;
}

function animalProtein(ingredients: string[]): boolean {
	return ingredients.some((candidate) =>
		/\b(raw|rauw|chicken|kip|beef|rund|pork|varken|lamb|lam|fish|vis|meat|vlees)\b/iu.test(
			candidate
		)
	);
}

export function cookingRescue(input: CookingRescueInput): CookingRescue {
	const step = input.step.trim();
	const proteinCaution = animalProtein(input.ingredients)
		? input.language === 'nl'
			? 'Proef rauw vlees of rauwe vis niet. Gaar het tot een veilige kerntemperatuur.'
			: 'Do not taste raw meat or fish. Keep cooking it to a safe internal temperature.'
		: null;

	if (input.issue === 'too_salty') {
		const unsalted = ingredient(
			input.ingredients,
			/\b(unsalted|ongezouten|water|cream|room|milk|melk|tomato|tomaat|yog|stock zonder zout)\b/iu
		);
		return input.language === 'nl'
			? {
					whyNow: `De smaak moet nu worden bijgestuurd tijdens: ${step}`,
					guidance: [
						'Stop met zout en zoute smaakmakers.',
						unsalted
							? `Roer eerst een kleine hoeveelheid ${unsalted} erdoor en proef opnieuw.`
							: 'Verdun alleen met een ongezouten vloeistof die al in het recept staat.',
						'Werk in kleine stappen; te veel verdunnen is moeilijk terug te draaien.'
					],
					safetyCaution: proteinCaution,
					consequence: 'Een kleine verdunning verlaagt de zoutconcentratie zonder de hele pan te veranderen.',
					alternatives: ['Serveer met een ongezouten onderdeel', 'Maak een extra ongezouten deel']
				}
			: {
					whyNow: `The seasoning needs correction during the active step: ${step}`,
					guidance: [
						'Stop adding salt and salty seasonings.',
						unsalted
							? `Stir in a small amount of ${unsalted}, then taste again.`
							: 'Dilute only with an unsalted liquid already present in the recipe.',
						'Work in small additions; over-diluting is difficult to reverse.'
					],
					safetyCaution: proteinCaution,
					consequence: 'A small dilution lowers the salt concentration without changing the whole pan at once.',
					alternatives: ['Serve with an unsalted component', 'Make an extra unsalted portion']
				};
	}

	if (input.issue === 'too_thin') {
		const thickener = ingredient(
			input.ingredients,
			/\b(cornstarch|maizena|flour|bloem|cream|room|potato|aardappel|rice|rijst)\b/iu
		);
		return input.language === 'nl'
			? {
					whyNow: `De dikte wijkt af tijdens: ${step}`,
					guidance: [
						'Laat de saus eerst onbedekt zacht inkoken en roer regelmatig.',
						thickener
							? `Gebruik daarna zo nodig een kleine hoeveelheid ${thickener}, omdat dit al in het recept staat.`
							: 'Voeg niet zomaar een nieuw bindmiddel toe; controleer eerst de bestaande receptingrediënten.',
						'Wacht na elke aanpassing even: de saus dikt vaak verder in.'
					],
					safetyCaution: proteinCaution,
					consequence: 'Rustig inkoken concentreert ook zout en kruiden, dus proef opnieuw voordat je verder gaat.',
					alternatives: ['Langer onbedekt inkoken', 'Een bestaand bindend ingrediënt gebruiken']
				}
			: {
					whyNow: `The texture is off during the active step: ${step}`,
					guidance: [
						'Simmer uncovered first and stir regularly.',
						thickener
							? `If needed, add a small amount of ${thickener}, which is already in the recipe.`
							: 'Do not invent a thickener; check the existing recipe ingredients first.',
						'Pause after each adjustment because the sauce may continue to thicken.'
					],
					safetyCaution: proteinCaution,
					consequence: 'Reducing also concentrates salt and seasoning, so taste again before continuing.',
					alternatives: ['Reduce uncovered for longer', 'Use an existing thickening ingredient']
				};
	}

	return input.language === 'nl'
		? {
				whyNow: `Het eten kleurt niet zoals verwacht tijdens: ${step}`,
				guidance: [
					'Dep het oppervlak droog als dat veilig kan.',
					'Laat ruimte tussen de stukken en bak zo nodig in porties.',
					'Verhoog de hitte één stap en controleer vaak; laat olie niet roken.'
				],
				safetyCaution: proteinCaution,
				consequence: 'Minder vocht en meer pancontact helpen bruinen, maar verhogen ook het risico op aanbranden.',
				alternatives: ['In kleinere porties bakken', 'Meer tijd geven op dezelfde hitte']
			}
		: {
				whyNow: `The food is not coloring as expected during the active step: ${step}`,
				guidance: [
					'Pat the surface dry when it is safe to do so.',
					'Leave space between pieces and cook in batches if needed.',
					'Raise the heat one step and check often; do not let the oil smoke.'
				],
				safetyCaution: proteinCaution,
				consequence: 'Less surface moisture and more pan contact improve browning but also increase burn risk.',
				alternatives: ['Cook in smaller batches', 'Allow more time at the same heat']
			};
}
