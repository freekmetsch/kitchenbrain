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
import type { InventorySection } from '$lib/inventory_section';
import { inventoryParStatus } from '$lib/par_level';

export type Item = PageData['items'][number];
export type RecipeLink = PageData['recipeLinks'][number];
export type RecipeMatch = PageData['recipeMatches'][number][number];
export type RecipeOption = PageData['recipeOptions'][number];
export type StapleGhost = PageData['stapleGhosts'][number];

export type Kind = 'ingredient' | 'leftover' | 'processed';
export type Section = InventorySection;
export type InventoryScope = 'meals' | 'ingredients' | 'all';
export type InventoryQuickView = 'ready' | 'below_target';

export type StockRadarItem = {
	name: string;
	qtyNum: number | null;
	kind: Item['kind'];
	expiryDate: string | null;
	createdAt: string | Date;
	section?: InventorySection;
	unit?: string | null;
	parTargetQty?: number | null;
	parTargetUnit?: string | null;
};

export type StockRadarLink = {
	isFreezerStaple: boolean;
	targetPortions: number | null;
};

export type StockAttention =
	| { kind: 'expiry'; daysUntil: number }
	| { kind: 'below_target'; portionsBelow: number }
	| { kind: 'low_stock'; portions: number }
	| { kind: 'aging'; daysOld: number };

export type MealStockGroups<T> = {
	useNext: Array<{ item: T; attention: StockAttention }>;
	stillPlenty: T[];
	cookAgain: T[];
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
	expiry: string;
	staple: boolean;
	parTargetQty: number | null;
	parTargetUnit: string;
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

function daysUntil(expiryDate: string | null, todayIso: string): number | null {
	if (!expiryDate) return null;
	return Math.ceil((isoDayNumber(expiryDate) - isoDayNumber(todayIso)) / 86_400_000);
}

export function stockAttention(
	item: StockRadarItem,
	link: StockRadarLink | null,
	todayIso: string
): StockAttention | null {
	const portions = item.qtyNum ?? 0;
	if (item.kind !== 'leftover' || portions <= 0) return null;

	const expiryDays = daysUntil(item.expiryDate, todayIso);
	if (expiryDays !== null && expiryDays <= 7) {
		return { kind: 'expiry', daysUntil: expiryDays };
	}

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
	item: Pick<
		StockRadarItem,
		'kind' | 'qtyNum' | 'section' | 'unit' | 'parTargetQty' | 'parTargetUnit'
	>,
	link: StockRadarLink | null,
	quickView: InventoryQuickView | null
): boolean {
	if (quickView === null) return true;
	if (quickView === 'ready') return item.kind === 'leftover' && (item.qtyNum ?? 0) > 0;
	if (
		item.section &&
		inventoryParStatus({
			section: item.section,
			qtyNum: item.qtyNum,
			unit: item.unit ?? null,
			parTargetQty: item.parTargetQty ?? null,
			parTargetUnit: item.parTargetUnit ?? null
		}).state === 'below'
	) {
		return true;
	}
	return (
		item.kind === 'leftover' &&
		link?.isFreezerStaple === true &&
		link.targetPortions !== null &&
		(item.qtyNum ?? 0) < link.targetPortions
	);
}

export function groupMealStock<T extends StockRadarItem>(
	items: T[],
	linkFor: (item: T) => StockRadarLink | null,
	todayIso: string
): MealStockGroups<T> {
	const useNext: MealStockGroups<T>['useNext'] = [];
	const stillPlenty: T[] = [];
	const cookAgain: T[] = [];

	for (const item of items) {
		if (item.kind !== 'leftover') continue;
		const portions = item.qtyNum ?? 0;
		const link = linkFor(item);
		if (portions <= 0) {
			if (link?.isFreezerStaple) cookAgain.push(item);
			continue;
		}
		const attention = stockAttention(item, link, todayIso);
		if (attention) useNext.push({ item, attention });
		else stillPlenty.push(item);
	}

	const expirySortValue = (item: T) => daysUntil(item.expiryDate, todayIso) ?? Number.POSITIVE_INFINITY;
	useNext.sort(
		(a, b) =>
			(a.item.qtyNum ?? 0) - (b.item.qtyNum ?? 0) ||
			expirySortValue(a.item) - expirySortValue(b.item) ||
			daysOldOn(b.item, todayIso) - daysOldOn(a.item, todayIso) ||
			a.item.name.localeCompare(b.item.name)
	);
	stillPlenty.sort(
		(a, b) => (a.qtyNum ?? 0) - (b.qtyNum ?? 0) || a.name.localeCompare(b.name)
	);
	cookAgain.sort((a, b) => a.name.localeCompare(b.name));

	return { useNext, stillPlenty, cookAgain };
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
