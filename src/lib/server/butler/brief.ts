export type ButlerConfidence = 'high' | 'medium' | 'low';
export type ButlerCandidateKind =
	| 'pending_review'
	| 'expiring_stock'
	| 'shopping_conflict'
	| 'plan_gap'
	| 'shopping_open'
	| 'freezer_shortfall';

export type ButlerSnapshot = {
	today: string;
	expiring: Array<{
		id: number;
		name: string;
		expiryDate: string;
		section: string;
	}>;
	plannedMeals: number;
	shopping: {
		toBuy: number;
		conflicts: number;
		sourcesNeedingReview: number;
	};
	freezerTargets: Array<{
		recipeSlug: string;
		title: string;
		currentPortions: number;
		targetPortions: number;
	}>;
	pendingReviews: number;
};

export type ButlerCandidate = {
	id: string;
	kind: ButlerCandidateKind;
	priority: number;
	title: string;
	summary: string;
	whyNow: string;
	evidence: string[];
	confidence: ButlerConfidence;
	uncertainty: string | null;
	consequence: string;
	alternatives: string[];
	href: string;
	actionLabel: string;
};

type Locale = 'en' | 'nl';

function daysBetween(from: string, to: string): number {
	return Math.round(
		(Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000
	);
}

function itemNames(items: ButlerSnapshot['expiring']): string {
	return items.map((item) => item.name).join(', ');
}

function copy(locale: Locale) {
	return locale === 'nl'
		? {
				pending: {
					title: 'Beoordeling wacht op je',
					summary: (count: number) => `${count} voorbereid voorstel${count === 1 ? '' : 'len'} staat klaar.`,
					why: 'Er is eerder werk voorbereid maar nog niet goedgekeurd of afgewezen.',
					evidence: (count: number) => `${count} open beoordeling${count === 1 ? '' : 'en'}`,
					consequence: 'Er verandert niets totdat je een voorstel controleert en toepast.',
					alternatives: ['Later terugkomen', 'Het voorstel afwijzen'],
					action: 'Verder beoordelen'
				},
				expiring: {
					title: 'Gebruik dit eerst',
					summary: (names: string) => `${names} ${names.includes(',') ? 'vragen' : 'vraagt'} binnenkort aandacht.`,
					why: 'Bekende houdbaarheidsdatums vallen binnen de komende zeven dagen.',
					evidence: (name: string, days: number) =>
						days < 0
							? `${name} is ${Math.abs(days)} dag${Math.abs(days) === 1 ? '' : 'en'} over datum`
							: days === 0
								? `${name} verloopt vandaag`
								: `${name} verloopt over ${days} dag${days === 1 ? '' : 'en'}`,
					consequence: 'De voorraad blijft ongewijzigd; je opent alleen de relevante voorraad.',
					alternatives: ['Een andere maaltijd kiezen', 'De datum eerst controleren'],
					action: 'Voorraad bekijken'
				},
				shoppingConflict: {
					title: 'Boodschappen heeft keuzes nodig',
					summary: (count: number) => `${count} bron- of hoeveelheidsconflict${count === 1 ? '' : 'en'} blokkeren een betrouwbare lijst.`,
					why: 'De huidige week bevat bronnen die niet veilig automatisch samengevoegd kunnen worden.',
					evidence: (conflicts: number, review: number) =>
						`${conflicts} hoeveelheidsconflict${conflicts === 1 ? '' : 'en'}, ${review} bron${review === 1 ? '' : 'nen'} te controleren`,
					consequence: 'Je opent Boodschappen om de exacte bronnen te kiezen; er wordt niets naar AH gestuurd.',
					alternatives: ['Bronnen apart houden', 'De week later controleren'],
					action: 'Conflicten bekijken'
				},
				planGap: {
					title: 'Deze week heeft nog geen maaltijden',
					summary: 'Er is nog geen dinerplan om Boodschappen op te baseren.',
					why: 'De huidige planweek bevat nul geplande maaltijden.',
					evidence: '0 geplande maaltijden',
					consequence: 'Je opent Maaltijdplanning; er wordt niet automatisch gepland.',
					alternatives: ['Alleen vanavond kiezen', 'Deze week bewust leeg laten'],
					action: 'Week plannen'
				},
				shoppingOpen: {
					title: 'Boodschappen staat nog open',
					summary: (count: number) => `${count} product${count === 1 ? '' : 'en'} moet${count === 1 ? '' : 'en'} nog gekocht worden.`,
					why: 'De huidige weeklijst heeft onvoltooide, conflict-vrije regels.',
					evidence: (count: number) => `${count} nog te kopen`,
					consequence: 'Je opent de bestaande lijst; er wordt niets gekocht of naar AH gestuurd.',
					alternatives: ['Later boodschappen doen', 'Eerst het maaltijdplan aanpassen'],
					action: 'Lijst openen'
				},
				freezer: {
					title: 'Vriezerdoel loopt achter',
					summary: (title: string, deficit: number) => `${title} mist ${deficit} doelportie${deficit === 1 ? '' : 's'}.`,
					why: 'Een expliciet ingesteld vriezerdoel ligt boven de huidige gekoppelde porties.',
					evidence: (current: number, target: number) => `${current} van ${target} doelporties aanwezig`,
					consequence: 'Je opent de vriezervoorraad; er wordt niets ingepland of gekookt.',
					alternatives: ['Het doel aanpassen', 'Een ander recept aanvullen'],
					action: 'Vriezer bekijken'
				}
			}
		: {
				pending: {
					title: 'A review is waiting',
					summary: (count: number) => `${count} prepared proposal${count === 1 ? '' : 's'} ${count === 1 ? 'is' : 'are'} ready.`,
					why: 'Earlier work was prepared but has not been approved or rejected.',
					evidence: (count: number) => `${count} open review${count === 1 ? '' : 's'}`,
					consequence: 'Nothing changes until you inspect and apply a proposal.',
					alternatives: ['Come back later', 'Reject the proposal'],
					action: 'Continue review'
				},
				expiring: {
					title: 'Use these first',
					summary: (names: string) => `${names} ${names.includes(',') ? 'need' : 'needs'} attention soon.`,
					why: 'Known expiry dates fall within the next seven days.',
					evidence: (name: string, days: number) =>
						days < 0
							? `${name} expired ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago`
							: days === 0
								? `${name} expires today`
								: `${name} expires in ${days} day${days === 1 ? '' : 's'}`,
					consequence: 'Stock stays unchanged; this only opens the relevant inventory.',
					alternatives: ['Choose another meal', 'Check the date first'],
					action: 'View stock'
				},
				shoppingConflict: {
					title: 'Shopping needs decisions',
					summary: (count: number) => `${count} source or quantity conflict${count === 1 ? '' : 's'} block a reliable list.`,
					why: 'The current week contains sources that cannot be merged safely.',
					evidence: (conflicts: number, review: number) =>
						`${conflicts} quantity conflict${conflicts === 1 ? '' : 's'}, ${review} source${review === 1 ? '' : 's'} needing review`,
					consequence: 'This opens Shopping to choose exact sources; nothing is sent to AH.',
					alternatives: ['Keep the sources separate', 'Review the week later'],
					action: 'Review conflicts'
				},
				planGap: {
					title: 'This week has no meals yet',
					summary: 'There is no dinner plan for Shopping to work from.',
					why: 'The current planning week contains zero planned meals.',
					evidence: '0 planned meals',
					consequence: 'This opens Meal Plan; nothing is planned automatically.',
					alternatives: ['Choose tonight only', 'Intentionally leave the week empty'],
					action: 'Plan the week'
				},
				shoppingOpen: {
					title: 'Shopping is still open',
					summary: (count: number) => `${count} item${count === 1 ? '' : 's'} still ${count === 1 ? 'needs' : 'need'} buying.`,
					why: 'The current week has unfinished, conflict-free Shopping rows.',
					evidence: (count: number) => `${count} still to buy`,
					consequence: 'This opens the existing list; nothing is bought or sent to AH.',
					alternatives: ['Shop later', 'Adjust the meal plan first'],
					action: 'Open list'
				},
				freezer: {
					title: 'A freezer target is behind',
					summary: (title: string, deficit: number) => `${title} is ${deficit} target portion${deficit === 1 ? '' : 's'} short.`,
					why: 'An explicitly configured freezer target is above the currently linked portions.',
					evidence: (current: number, target: number) => `${current} of ${target} target portions on hand`,
					consequence: 'This opens freezer stock; nothing is planned or cooked.',
					alternatives: ['Change the target', 'Refill a different recipe'],
					action: 'View freezer'
				}
			};
}

export function deriveButlerBrief(
	snapshot: ButlerSnapshot,
	options: { locale?: Locale; limit?: number } = {}
): ButlerCandidate[] {
	const locale = options.locale ?? 'en';
	const labels = copy(locale);
	const candidates: ButlerCandidate[] = [];

	if (snapshot.pendingReviews > 0) {
		candidates.push({
			id: `brief:pending:${snapshot.pendingReviews}`,
			kind: 'pending_review',
			priority: 110,
			title: labels.pending.title,
			summary: labels.pending.summary(snapshot.pendingReviews),
			whyNow: labels.pending.why,
			evidence: [labels.pending.evidence(snapshot.pendingReviews)],
			confidence: 'high',
			uncertainty: null,
			consequence: labels.pending.consequence,
			alternatives: labels.pending.alternatives,
			href: '/#home-chat',
			actionLabel: labels.pending.action
		});
	}

	if (snapshot.expiring.length > 0) {
		const ordered = [...snapshot.expiring].sort(
			(left, right) => left.expiryDate.localeCompare(right.expiryDate) || left.id - right.id
		);
		candidates.push({
			id: `brief:expiring:${ordered.map((item) => item.id).join('-')}`,
			kind: 'expiring_stock',
			priority: 100 - Math.max(0, daysBetween(snapshot.today, ordered[0].expiryDate)),
			title: labels.expiring.title,
			summary: labels.expiring.summary(itemNames(ordered)),
			whyNow: labels.expiring.why,
			evidence: ordered.map((item) =>
				labels.expiring.evidence(item.name, daysBetween(snapshot.today, item.expiryDate))
			),
			confidence: 'high',
			uncertainty: null,
			consequence: labels.expiring.consequence,
			alternatives: labels.expiring.alternatives,
			href: `/inventory?item=${ordered[0].id}`,
			actionLabel: labels.expiring.action
		});
	}

	const unresolved = snapshot.shopping.conflicts + snapshot.shopping.sourcesNeedingReview;
	if (unresolved > 0) {
		candidates.push({
			id: `brief:shopping-conflict:${snapshot.today}`,
			kind: 'shopping_conflict',
			priority: 90,
			title: labels.shoppingConflict.title,
			summary: labels.shoppingConflict.summary(unresolved),
			whyNow: labels.shoppingConflict.why,
			evidence: [
				labels.shoppingConflict.evidence(
					snapshot.shopping.conflicts,
					snapshot.shopping.sourcesNeedingReview
				)
			],
			confidence: 'high',
			uncertainty: null,
			consequence: labels.shoppingConflict.consequence,
			alternatives: labels.shoppingConflict.alternatives,
			href: '/shopping',
			actionLabel: labels.shoppingConflict.action
		});
	}

	if (snapshot.plannedMeals === 0) {
		candidates.push({
			id: `brief:plan-gap:${snapshot.today}`,
			kind: 'plan_gap',
			priority: 80,
			title: labels.planGap.title,
			summary: labels.planGap.summary,
			whyNow: labels.planGap.why,
			evidence: [labels.planGap.evidence],
			confidence: 'high',
			uncertainty: null,
			consequence: labels.planGap.consequence,
			alternatives: labels.planGap.alternatives,
			href: '/meal-plan',
			actionLabel: labels.planGap.action
		});
	}

	if (snapshot.shopping.toBuy > 0 && unresolved === 0) {
		candidates.push({
			id: `brief:shopping-open:${snapshot.today}`,
			kind: 'shopping_open',
			priority: 70,
			title: labels.shoppingOpen.title,
			summary: labels.shoppingOpen.summary(snapshot.shopping.toBuy),
			whyNow: labels.shoppingOpen.why,
			evidence: [labels.shoppingOpen.evidence(snapshot.shopping.toBuy)],
			confidence: 'high',
			uncertainty: null,
			consequence: labels.shoppingOpen.consequence,
			alternatives: labels.shoppingOpen.alternatives,
			href: '/shopping',
			actionLabel: labels.shoppingOpen.action
		});
	}

	const freezer = [...snapshot.freezerTargets]
		.filter((target) => target.currentPortions < target.targetPortions)
		.sort(
			(left, right) =>
				right.targetPortions -
					right.currentPortions -
					(left.targetPortions - left.currentPortions) ||
				left.title.localeCompare(right.title)
		)[0];
	if (freezer) {
		const deficit = freezer.targetPortions - freezer.currentPortions;
		candidates.push({
			id: `brief:freezer:${freezer.recipeSlug}`,
			kind: 'freezer_shortfall',
			priority: 60 + Math.min(deficit, 9),
			title: labels.freezer.title,
			summary: labels.freezer.summary(freezer.title, deficit),
			whyNow: labels.freezer.why,
			evidence: [labels.freezer.evidence(freezer.currentPortions, freezer.targetPortions)],
			confidence: 'high',
			uncertainty: null,
			consequence: labels.freezer.consequence,
			alternatives: labels.freezer.alternatives,
			href: '/inventory?section=freezer',
			actionLabel: labels.freezer.action
		});
	}

	return candidates
		.sort((left, right) => right.priority - left.priority || left.id.localeCompare(right.id))
		.slice(0, Math.max(0, options.limit ?? 3));
}
