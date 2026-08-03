// Shared types + display helpers for the stock page components. Data types
// derive from the inventory route's server load (via the generated $types) so
// the components stay in lock-step with the actual shape — no hand-kept mirror.
import type { PageData } from '../../../routes/inventory/$types';
import { foodCategoryLabel } from '$lib/food_categories';
import { dateInputValue, daysSinceDate, parseDateOnly } from '$lib/inventory_dates';
import { normalizeUnit } from '$lib/food_class';
import { formatNumber, type AppLocale } from '$lib/i18n';
import { getLocale } from '$lib/paraglide/runtime';
import { m } from '$lib/paraglide/messages';

export type Item = PageData['items'][number];
export type RecipeLink = PageData['recipeLinks'][number];
export type RecipeMatch = PageData['recipeMatches'][number][number];
export type RecipeOption = PageData['recipeOptions'][number];
export type StapleGhost = PageData['stapleGhosts'][number];

export type Kind = 'ingredient' | 'leftover' | 'processed';
export type Section = 'freezer' | 'pantry';
export type InventoryScope = 'meals' | 'ingredients' | 'all';
export type InventoryQuickView = 'ready' | 'below_target';

export type StockRadarItem = {
	name: string;
	qtyNum: number | null;
	kind: Item['kind'];
	createdAt: string | Date;
};

export type StockRadarLink = {
	isFreezerStaple: boolean;
	targetPortions: number | null;
	slug?: string;
};

export type StockAttention =
	| { kind: 'below_target'; portionsBelow: number }
	| { kind: 'low_stock'; portions: number }
	| { kind: 'aging'; daysOld: number }
	| { kind: 'cook_again' };

export type MealLedgerEntry<TItem, TGhost> =
	| {
			kind: 'item';
			key: `item-${number}`;
			name: string;
			item: TItem;
			attention: StockAttention | null;
	  }
	| {
			kind: 'ghost';
			key: `ghost-${string}`;
			name: string;
			ghost: TGhost;
			attention: { kind: 'cook_again' };
	  };

export type HistoryEvent = {
	id: number;
	opType: 'add' | 'remove' | 'update';
	actorLabel: string;
	itemId: number | null;
	itemName: string;
	summary: string;
	createdAt: number;
	isUndo: boolean;
	undoable: boolean;
};

// Edit draft for the in-place row editor. The keep-stocked fields patch the
// linked RECIPE, not the item (UX-STOCK-14).
export type EditDraft = {
	name: string;
	qty: number | null;
	unit: string;
	kind: Kind | '';
	section: Section;
	foodClass: string;
	staple: boolean;
	keepStocked: boolean;
	target: number | null;
};

// ── display helpers ──────────────────────────────────────────────────────────
export function daysOld(item: Item): number {
	return daysSinceDate(item.createdAt) ?? 0;
}

function isoDayNumber(value: string): number {
	return parseDateOnly(value)!.getTime();
}

export function daysOldOn(
	item: Pick<StockRadarItem, 'createdAt'>,
	todayIso: string
): number {
	const createdIso = dateInputValue(item.createdAt);
	if (!createdIso) return 0;
	return Math.max(0, Math.floor((isoDayNumber(todayIso) - isoDayNumber(createdIso)) / 86_400_000));
}

export function stockAttention(
	item: StockRadarItem,
	link: StockRadarLink | null,
	todayIso: string
): StockAttention | null {
	const portions = item.qtyNum ?? 0;
	if (item.kind !== 'leftover' || portions <= 0) return null;

	if (
		link?.isFreezerStaple &&
		link.targetPortions !== null &&
		portions < link.targetPortions
	) {
		return {
			kind: 'below_target',
			portionsBelow: Math.max(0, link.targetPortions - portions)
		};
	}

	if (portions <= 2) return { kind: 'low_stock', portions };

	const age = daysOldOn(item, todayIso);
	if (age >= 21) return { kind: 'aging', daysOld: age };

	return null;
}

export function matchesInventoryScope(
	item: Pick<StockRadarItem, 'kind'>,
	scope: InventoryScope
): boolean {
	if (scope === 'meals') return item.kind === 'leftover';
	if (scope === 'ingredients') return item.kind === 'ingredient';
	return true;
}

export function matchesInventoryQuickView(
	item: Pick<StockRadarItem, 'kind' | 'qtyNum'>,
	link: StockRadarLink | null,
	quickView: InventoryQuickView | null
): boolean {
	if (quickView === null) return true;
	if (quickView === 'ready') return item.kind === 'leftover' && (item.qtyNum ?? 0) > 0;
	return (
		item.kind === 'leftover' &&
		link?.isFreezerStaple === true &&
		link.targetPortions !== null &&
		(item.qtyNum ?? 0) < link.targetPortions
	);
}

export function buildMealLedger<
	TItem extends StockRadarItem & { id: number },
	TGhost extends { slug: string; title: string }
>(
	items: TItem[],
	ghosts: TGhost[],
	linkFor: (item: TItem) => StockRadarLink | null,
	todayIso: string,
	includeEmptyMeals = false
): Array<MealLedgerEntry<TItem, TGhost>> {
	const entries: Array<MealLedgerEntry<TItem, TGhost>> = [];
	const itemIds = new Set<number>();
	const liveRecipeSlugs = new Set<string>();

	for (const item of items) {
		if (item.kind !== 'leftover' || itemIds.has(item.id)) continue;
		const link = linkFor(item);
		if ((item.qtyNum ?? 0) <= 0 && !link?.isFreezerStaple && !includeEmptyMeals) continue;
		itemIds.add(item.id);
		if (link?.slug) liveRecipeSlugs.add(link.slug);
		entries.push({
			kind: 'item',
			key: `item-${item.id}`,
			name: item.name,
			item,
			attention:
				(item.qtyNum ?? 0) <= 0 && link?.isFreezerStaple
					? { kind: 'cook_again' }
					: stockAttention(item, link, todayIso)
		});
	}

	const ghostSlugs = new Set<string>();
	for (const ghost of ghosts) {
		if (ghostSlugs.has(ghost.slug) || liveRecipeSlugs.has(ghost.slug)) continue;
		ghostSlugs.add(ghost.slug);
		entries.push({
			kind: 'ghost',
			key: `ghost-${ghost.slug}`,
			name: ghost.title,
			ghost,
			attention: { kind: 'cook_again' }
		});
	}

	return entries.sort((a, b) => a.name.localeCompare(b.name) || a.key.localeCompare(b.key));
}

export function aging(item: Item): 'fresh' | 'soon' | 'old' {
	const [soon, old] = item.kind === 'leftover' ? [21, 35] : [90, 180];
	const d = daysOld(item);
	if (d >= old) return 'old';
	if (d >= soon) return 'soon';
	return 'fresh';
}
export function agingBar(item: Item): string {
	const a = aging(item);
	return a === 'old' ? 'bg-error' : a === 'soon' ? 'bg-warning' : 'bg-base-content/15';
}
export function foodClassText(slug: string | null): string {
	return foodCategoryLabel(slug) ?? m.food_category_unclassified();
}
export function composeQty(n: number, unit: string | null): string {
	return `${n}${unit ? ' ' + unit : ''}`;
}

export type RecipeRelationshipKind = 'linked' | 'planned' | 'not_needed' | 'unresolved';

export function recipeRelationshipKind(
	item: { recipeStatus: Item['recipeStatus'] },
	link: { slug: string } | null
): RecipeRelationshipKind {
	if (link) return 'linked';
	if (item.recipeStatus === 'plan_to_add') return 'planned';
	if (item.recipeStatus === 'no_recipe') return 'not_needed';
	return 'unresolved';
}

export type RecipeCoverage = Record<RecipeRelationshipKind, number>;

export function recipeCoverage(
	items: Array<{
		kind: Item['kind'];
		madeFromRecipeId: Item['madeFromRecipeId'];
		recipeStatus: Item['recipeStatus'];
	}>
): RecipeCoverage {
	const coverage: RecipeCoverage = {
		linked: 0,
		planned: 0,
		not_needed: 0,
		unresolved: 0
	};
	for (const item of items) {
		if (item.kind !== 'leftover') continue;
		if (item.madeFromRecipeId !== null) coverage.linked++;
		else if (item.recipeStatus === 'plan_to_add') coverage.planned++;
		else if (item.recipeStatus === 'no_recipe') coverage.not_needed++;
		else coverage.unresolved++;
	}
	return coverage;
}

function normalizeSearchValue(value: string): string {
	return value
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.toLocaleLowerCase()
		.trim();
}

export function matchesInventoryQuery(
	query: string,
	values: Array<string | null | undefined>
): boolean {
	const terms = normalizeSearchValue(query).split(/\s+/).filter(Boolean);
	if (terms.length === 0) return true;
	const haystack = normalizeSearchValue(values.filter(Boolean).join(' '));
	return terms.every((term) => haystack.includes(term));
}

export function displayQuantity(
	n: number,
	unit: string | null,
	locale: AppLocale = getLocale()
): string {
	const count = formatNumber(n, locale);
	const normalizedUnit = unit ? normalizeUnit(unit) : '';
	if (normalizedUnit === 'portion') {
		return n === 1
			? m.inventory_quantity_portion_one({ count }, { locale })
			: m.inventory_quantity_portion_many({ count }, { locale });
	}
	if (!unit || normalizedUnit === 'stuk') return count;
	return `${count} ${unit}`;
}

export function autofocus(node: HTMLInputElement) {
	node.focus();
	node.select();
}
