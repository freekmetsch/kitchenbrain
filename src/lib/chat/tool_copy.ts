import type { OpSnapshot, OpType } from '$lib/inventory_history';

export type ChatLocale = 'en' | 'nl';
type Data = Record<string, unknown>;

function object(raw: unknown): Data {
	return raw && typeof raw === 'object' ? (raw as Data) : {};
}

function text(value: unknown): string | null {
	return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function number(value: unknown): number | null {
	return typeof value === 'number' ? value : null;
}

function sectionLabel(value: unknown, locale: ChatLocale): string {
	if (value === 'freezer') return locale === 'nl' ? 'vriezer' : 'freezer';
	if (value === 'fridge') return locale === 'nl' ? 'koelkast' : 'fridge';
	if (value === 'pantry') return locale === 'nl' ? 'voorraadkast' : 'pantry';
	return text(value) ?? (locale === 'nl' ? 'voorraad' : 'inventory');
}

export function chatQuantityLabel(snapshot: Data, locale: ChatLocale): string | null {
	const quantity = number(snapshot.qtyNum);
	const unit = text(snapshot.unit);
	if (quantity === null) return text(snapshot.qtyText);
	if (unit === 'portion') {
		if (locale === 'nl') return `${quantity} ${quantity === 1 ? 'portie' : 'porties'}`;
		return `${quantity} ${quantity === 1 ? 'portion' : 'portions'}`;
	}
	return unit ? `${quantity} ${unit}` : `${quantity}`;
}

export function toolStartSummary(
	name: string,
	rawInput: unknown,
	locale: ChatLocale
): string {
	const input = object(rawInput);
	const section = text(input.section);
	const item = text(input.name);
	const title = text(input.title);
	const meal = text(input.dinner);
	const updates = Array.isArray(input.updates) ? input.updates.length : null;

	if (locale === 'nl') {
		switch (name) {
			case 'get_inventory':
				return section
					? `Voorraad in de ${sectionLabel(section, locale)} bekijken…`
					: 'Voorraad bekijken…';
			case 'add_to_inventory':
				return item ? `${item} toevoegen…` : 'Aan voorraad toevoegen…';
			case 'remove_from_inventory':
				return item ? `${item} verwijderen…` : 'Uit voorraad verwijderen…';
			case 'update_inventory_item':
				return 'Item bijwerken…';
			case 'bulk_update_inventory':
				return updates
					? `${updates} ${updates === 1 ? 'item' : 'items'} bijwerken…`
					: 'Meerdere items bijwerken…';
			case 'set_review_flag':
				return 'Controle bijwerken…';
			case 'undo_op':
				return 'Ongedaan maken…';
			case 'get_inventory_history':
				return 'Recente wijzigingen bekijken…';
			case 'link_leftover_recipe':
				return 'Restje koppelen…';
			case 'set_staple':
				return 'Basisvoorraad bijwerken…';
			case 'set_freezer_staple':
				return 'Vriezerbasis bijwerken…';
			case 'get_freezer_staples':
				return 'Vriezerbasis bekijken…';
			case 'get_meal_plan':
				return 'Maaltijdplan lezen…';
			case 'plan_meal':
				return meal ? `${meal} inplannen…` : 'Maaltijd inplannen…';
			case 'propose_meal_plan':
				return 'Maaltijdplan voorbereiden…';
			case 'remove_meal':
				return 'Maaltijd verwijderen…';
			case 'mark_meal_cooked':
				return 'Als gekookt markeren…';
			case 'suggest_meals':
				return 'Maaltijdideeën zoeken…';
			case 'get_recipe':
				return 'Recept opzoeken…';
			case 'search_recipes':
				return 'Recepten zoeken…';
			case 'search_ah_products':
				return 'Producten bij AH zoeken…';
			case 'generate_shopping_list':
				return 'Boodschappenlijst maken…';
			case 'prepare_stock_action':
				return 'Voorraad en boodschappen voorbereiden…';
			case 'add_recipe':
				return title ? `${title} opslaan…` : 'Recept opslaan…';
			case 'create_meal_recipe':
				return title ? `${title} samenstellen…` : 'Recepten combineren…';
			case 'add_recipe_from_url':
				return 'Recept importeren…';
			case 'edit_recipe':
				return 'Recept bewerken…';
			case 'propose_recipe_patch':
				return 'Receptwijzigingen voorbereiden…';
			case 'log_meal':
				return 'Maaltijd vastleggen…';
			default:
				return 'Bezig…';
		}
	}

	switch (name) {
		case 'get_inventory':
			return section ? `Checking the ${sectionLabel(section, locale)}…` : 'Checking inventory…';
		case 'add_to_inventory':
			return item ? `Adding ${item}…` : 'Adding to inventory…';
		case 'remove_from_inventory':
			return item ? `Removing ${item}…` : 'Removing from inventory…';
		case 'update_inventory_item':
			return 'Updating the item…';
		case 'bulk_update_inventory':
			return updates
				? `Updating ${updates} item${updates === 1 ? '' : 's'}…`
				: 'Updating several items…';
		case 'set_review_flag':
			return 'Updating review…';
		case 'undo_op':
			return 'Undoing…';
		case 'get_inventory_history':
			return 'Checking recent changes…';
		case 'link_leftover_recipe':
			return 'Linking the leftover…';
		case 'set_staple':
			return 'Updating staple…';
		case 'set_freezer_staple':
			return 'Updating freezer staple…';
		case 'get_freezer_staples':
			return 'Checking freezer staples…';
		case 'get_meal_plan':
			return 'Reading the meal plan…';
		case 'plan_meal':
			return meal ? `Planning ${meal}…` : 'Planning a meal…';
		case 'propose_meal_plan':
			return 'Preparing the meal plan…';
		case 'remove_meal':
			return 'Removing the meal…';
		case 'mark_meal_cooked':
			return 'Marking it cooked…';
		case 'suggest_meals':
			return 'Looking for meal ideas…';
		case 'get_recipe':
			return 'Looking up the recipe…';
		case 'search_recipes':
			return 'Searching recipes…';
		case 'search_ah_products':
			return 'Searching AH products…';
		case 'generate_shopping_list':
			return 'Building the shopping list…';
		case 'prepare_stock_action':
			return 'Preparing Stock and Shopping…';
		case 'add_recipe':
			return title ? `Saving ${title}…` : 'Saving the recipe…';
		case 'create_meal_recipe':
			return title ? `Combining into ${title}…` : 'Combining recipes…';
		case 'add_recipe_from_url':
			return 'Importing the recipe…';
		case 'edit_recipe':
			return 'Editing the recipe…';
		case 'propose_recipe_patch':
			return 'Preparing recipe changes…';
		case 'log_meal':
			return 'Logging the meal…';
		default:
			return 'Working…';
	}
}

export function readToolSummary(name: string, rawResult: unknown, locale: ChatLocale): string {
	const result = object(rawResult);
	const count = number(result.count);
	const plural = (singular: string, multiple: string) => (count === 1 ? singular : multiple);

	if (locale === 'nl') {
		switch (name) {
			case 'get_inventory':
				return count === null ? 'Voorraad bekeken' : `${count} ${plural('item', 'items')} gevonden`;
			case 'search_recipes':
				return count === null
					? 'Recepten doorzocht'
					: `${count} ${plural('recept', 'recepten')} gevonden`;
			case 'search_ah_products':
				return count === null
					? 'AH-producten doorzocht'
					: `${count} AH-${plural('product', 'producten')} gevonden`;
			case 'get_recipe':
				return result.found === false ? 'Geen recept gevonden' : 'Recept geladen';
			case 'get_meal_plan':
				return 'Maaltijdplan geladen';
			case 'suggest_meals':
				return 'Maaltijdideeën verzameld';
			case 'generate_shopping_list': {
				const listCount = Array.isArray(result.shopping_list) ? result.shopping_list.length : null;
				return listCount === null
					? 'Boodschappenlijst gemaakt'
					: `${listCount} ${listCount === 1 ? 'item' : 'items'} te kopen`;
			}
			case 'get_freezer_staples':
				return 'Vriezerbasis bekeken';
			case 'get_inventory_history':
				return count === null
					? 'Recente wijzigingen bekeken'
					: `${count} recente ${plural('wijziging', 'wijzigingen')}`;
			default:
				return 'Klaar';
		}
	}

	switch (name) {
		case 'get_inventory':
			return count === null ? 'Checked inventory' : `Found ${count} item${count === 1 ? '' : 's'}`;
		case 'search_recipes':
			return count === null ? 'Searched recipes' : `Found ${count} recipe${count === 1 ? '' : 's'}`;
		case 'search_ah_products':
			return count === null
				? 'Searched AH products'
				: `Found ${count} AH product${count === 1 ? '' : 's'}`;
		case 'get_recipe':
			return result.found === false ? 'No recipe found' : 'Loaded the recipe';
		case 'get_meal_plan':
			return 'Loaded the meal plan';
		case 'suggest_meals':
			return 'Gathered meal ideas';
		case 'generate_shopping_list': {
			const listCount = Array.isArray(result.shopping_list) ? result.shopping_list.length : null;
			return listCount === null
				? 'Built the shopping list'
				: `${listCount} item${listCount === 1 ? '' : 's'} to buy`;
		}
		case 'get_freezer_staples':
			return 'Checked freezer staples';
		case 'get_inventory_history':
			return count === null
				? 'Checked recent changes'
				: `${count} recent change${count === 1 ? '' : 's'}`;
		default:
			return 'Done';
	}
}

export function writeToolSummary(name: string, rawResult: unknown, locale: ChatLocale): string {
	const result = object(rawResult);
	const title = text(result.title);
	const dinner = text(result.dinner);
	const removed = text(result.removed);
	const meal = text(result.meal);

	if (locale === 'nl') {
		switch (name) {
			case 'set_freezer_staple':
				return result.is_freezer_staple ? 'Als vriezerbasis ingesteld' : 'Vriezerbasis verwijderd';
			case 'plan_meal':
				return dinner ? `${dinner} ingepland` : 'Maaltijd ingepland';
			case 'remove_meal':
				return removed ? `${removed} verwijderd` : 'Maaltijd verwijderd';
			case 'mark_meal_cooked':
				return meal ? `${meal} als gekookt gemarkeerd` : 'Als gekookt gemarkeerd';
			case 'add_recipe':
				return title ? `${title} opgeslagen` : 'Recept opgeslagen';
			case 'create_meal_recipe':
				if (result.created === false) return 'Kon de recepten niet combineren';
				return title ? `Maaltijd ${title} gemaakt` : 'Maaltijdrecept gemaakt';
			case 'add_recipe_from_url': {
				const suffix = result.needs_review === true ? ' (controle nodig)' : '';
				return title ? `${title} geïmporteerd${suffix}` : `Recept geïmporteerd${suffix}`;
			}
			case 'edit_recipe':
				return result.needs_review === true
					? 'Recept bijgewerkt (controle nodig)'
					: 'Recept bijgewerkt';
			case 'log_meal':
				return 'Maaltijd vastgelegd';
			default:
				return 'Klaar';
		}
	}

	switch (name) {
		case 'set_freezer_staple':
			return result.is_freezer_staple ? 'Set as freezer staple' : 'Cleared freezer staple';
		case 'plan_meal':
			return dinner ? `Planned ${dinner}` : 'Planned the meal';
		case 'remove_meal':
			return removed ? `Removed ${removed}` : 'Removed the meal';
		case 'mark_meal_cooked':
			return meal ? `Marked ${meal} cooked` : 'Marked cooked';
		case 'add_recipe':
			return title ? `Saved ${title}` : 'Saved the recipe';
		case 'create_meal_recipe':
			if (result.created === false) return 'Could not combine the recipes';
			return title ? `Created meal ${title}` : 'Created the meal recipe';
		case 'add_recipe_from_url': {
			const suffix = result.needs_review === true ? ' (needs review)' : '';
			return title ? `Imported ${title}${suffix}` : `Imported the recipe${suffix}`;
		}
		case 'edit_recipe':
			return result.needs_review === true
				? 'Updated the recipe (needs review)'
				: 'Updated the recipe';
		case 'log_meal':
			return 'Logged the meal';
		default:
			return 'Done';
	}
}

export function inventoryChangeSummary(
	opType: OpType,
	before: OpSnapshot,
	after: OpSnapshot,
	undoOf: number | null | undefined,
	locale: ChatLocale
): string {
	if (undoOf) return locale === 'nl' ? 'Wijziging ongedaan gemaakt' : 'Undid a change';
	if (opType === 'add') {
		const quantity = after ? chatQuantityLabel(after, locale) : null;
		if (locale === 'nl') return quantity ? `Toegevoegd · ${quantity}` : 'Toegevoegd';
		return quantity ? `Added · ${quantity}` : 'Added';
	}
	if (opType === 'remove') return locale === 'nl' ? 'Verwijderd' : 'Removed';
	if (!before || !after) return locale === 'nl' ? 'Bewerkt' : 'Edited';

	const changes: string[] = [];
	const beforeQuantity = number(before.qtyNum);
	const afterQuantity = number(after.qtyNum);
	if (beforeQuantity !== afterQuantity && afterQuantity !== null) {
		const unit = text(after.unit) ?? text(before.unit);
		const unitText =
			unit === 'portion'
				? locale === 'nl'
					? afterQuantity === 1
						? 'portie'
						: 'porties'
					: afterQuantity === 1
						? 'portion'
						: 'portions'
				: (unit ?? '');
		changes.push(`${beforeQuantity ?? '—'} → ${afterQuantity}${unitText ? ` ${unitText}` : ''}`);
	}
	if (text(before.section) !== text(after.section) && text(after.section)) {
		changes.push(
			locale === 'nl'
				? `Verplaatst naar ${sectionLabel(after.section, locale)}`
				: `Moved to ${sectionLabel(after.section, locale)}`
		);
	}
	if (text(before.name) !== text(after.name) && text(after.name)) {
		changes.push(
			locale === 'nl' ? `Hernoemd naar ${text(after.name)}` : `Renamed to ${text(after.name)}`
		);
	}
	const beforeReview = Boolean(before.needsReview);
	const afterReview = Boolean(after.needsReview);
	if (!beforeReview && afterReview)
		changes.push(locale === 'nl' ? 'Gemarkeerd voor controle' : 'Flagged for review');
	if (beforeReview && !afterReview)
		changes.push(locale === 'nl' ? 'Controle afgerond' : 'Review resolved');
	const beforeStaple = Boolean(before.isStaple);
	const afterStaple = Boolean(after.isStaple);
	if (!beforeStaple && afterStaple)
		changes.push(locale === 'nl' ? 'Als basisvoorraad gemarkeerd' : 'Marked staple');
	if (beforeStaple && !afterStaple)
		changes.push(locale === 'nl' ? 'Niet langer basisvoorraad' : 'Unmarked staple');
	if (text(before.kind) !== text(after.kind) || text(before.foodClass) !== text(after.foodClass)) {
		changes.push(locale === 'nl' ? 'Opnieuw ingedeeld' : 'Reclassified');
	}
	if (number(before.madeFromRecipeId) !== number(after.madeFromRecipeId)) {
		changes.push(
			number(after.madeFromRecipeId) !== null
				? locale === 'nl'
					? 'Recept gekoppeld'
					: 'Linked recipe'
				: locale === 'nl'
					? 'Recept ontkoppeld'
					: 'Unlinked recipe'
		);
	}
	if (!changes.length && text(before.expiryDate) !== text(after.expiryDate)) {
		changes.push(locale === 'nl' ? 'THT bijgewerkt' : 'Best-before updated');
	}
	return changes.length ? changes.slice(0, 2).join(' · ') : locale === 'nl' ? 'Bewerkt' : 'Edited';
}

export function safeToolErrorSummary(error: string, locale: ChatLocale): string {
	if (locale === 'nl') {
		if (/^AI service error/.test(error)) return 'De AI-service haperde bij deze stap — probeer opnieuw.';
		if (/changed|stale|expired|verlopen|gewijzigd/i.test(error)) {
			return 'De gegevens zijn gewijzigd — controleer ze opnieuw.';
		}
		if (/not found|unavailable|niet gevonden|niet beschikbaar/i.test(error)) {
			return 'Deze informatie kon niet worden gecontroleerd.';
		}
		return 'Deze stap is mislukt — probeer opnieuw.';
	}
	if (/^AI service error/.test(error)) return 'The AI service hiccuped on this step — try again.';
	if (/changed|stale|expired/i.test(error)) return 'The data changed — review it again.';
	if (/not found|unavailable/i.test(error)) return 'This information could not be verified.';
	return 'This step failed — try again.';
}

export function commitRiskDeleteSummary(
	item: string,
	quantity: string | null,
	section: string,
	bulk: boolean,
	locale: ChatLocale
): string {
	const label = `${item}${quantity ? ` (${quantity})` : ''}`;
	if (locale === 'nl') {
		return bulk
			? `${label} verwijderen? Dit zijn meerdere verwijderingen achter elkaar.`
			: `${label} uit de ${sectionLabel(section, locale)} verwijderen?`;
	}
	return bulk
		? `Delete ${label}? That's several deletions in one go.`
		: `Delete ${label} from the ${sectionLabel(section, locale)}?`;
}

export function commitRiskMergeSummary(
	item: string,
	quantity: string | null,
	locale: ChatLocale
): string {
	if (locale === 'nl') {
		return `Toevoegen aan bestaande ${item}${quantity ? ` (nu ${quantity})` : ''} en samenvoegen tot één item?`;
	}
	return `Add to your existing ${item}${quantity ? ` (currently ${quantity})` : ''} — combine into one entry?`;
}
