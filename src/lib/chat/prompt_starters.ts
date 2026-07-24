import type { ScreenContextV1 } from './screen_context';
import { m } from '$lib/paraglide/messages';

export type PromptStarterId =
	| 'generalCook'
	| 'generalPlan'
	| 'generalShop'
	| 'inventoryUseUp'
	| 'inventoryMeal'
	| 'inventoryRestock'
	| 'mealPlanOpenDays'
	| 'mealPlanUseStock'
	| 'mealPlanSwap'
	| 'shoppingNeed'
	| 'shoppingRegenerate'
	| 'shoppingCovered'
	| 'recipesFind'
	| 'recipesUseStock'
	| 'recipesFreezer'
	| 'recipeScale'
	| 'recipeAlternative'
	| 'recipeRole'
	| 'recipeEditCheck'
	| 'recipeEditStep'
	| 'recipeEditImprove'
	| 'recipeDirtyExplain'
	| 'recipeDirtyRole'
	| 'recipeDirtyStep'
	| 'settingsChange'
	| 'settingsConnect'
	| 'settingsExport'
	| 'accountPassword'
	| 'accountUsers'
	| 'accountSignOut'
	| 'advancedTemperature'
	| 'advancedBackgroundModel'
	| 'advancedVisionModel'
	| 'aiModels'
	| 'aiLimit'
	| 'aiRoute'
	| 'connectionsConnect'
	| 'connectionsReconnect'
	| 'connectionsExpiry'
	| 'dataExport'
	| 'dataImport'
	| 'dataReset'
	| 'displayLanguage'
	| 'displayTheme'
	| 'mealSettingsWeekStart'
	| 'mealSettingsCount'
	| 'mealSettingsDelivery'
	| 'recipeSettingsLanguage'
	| 'recipeSettingsTranslate'
	| 'recipeSettingsSort';

export const ALL_PROMPT_STARTER_IDS: readonly PromptStarterId[] = [
	'generalCook',
	'generalPlan',
	'generalShop',
	'inventoryUseUp',
	'inventoryMeal',
	'inventoryRestock',
	'mealPlanOpenDays',
	'mealPlanUseStock',
	'mealPlanSwap',
	'shoppingNeed',
	'shoppingRegenerate',
	'shoppingCovered',
	'recipesFind',
	'recipesUseStock',
	'recipesFreezer',
	'recipeScale',
	'recipeAlternative',
	'recipeRole',
	'recipeEditCheck',
	'recipeEditStep',
	'recipeEditImprove',
	'recipeDirtyExplain',
	'recipeDirtyRole',
	'recipeDirtyStep',
	'settingsChange',
	'settingsConnect',
	'settingsExport',
	'accountPassword',
	'accountUsers',
	'accountSignOut',
	'advancedTemperature',
	'advancedBackgroundModel',
	'advancedVisionModel',
	'aiModels',
	'aiLimit',
	'aiRoute',
	'connectionsConnect',
	'connectionsReconnect',
	'connectionsExpiry',
	'dataExport',
	'dataImport',
	'dataReset',
	'displayLanguage',
	'displayTheme',
	'mealSettingsWeekStart',
	'mealSettingsCount',
	'mealSettingsDelivery',
	'recipeSettingsLanguage',
	'recipeSettingsTranslate',
	'recipeSettingsSort'
];

const GENERAL: readonly PromptStarterId[] = ['generalCook', 'generalPlan', 'generalShop'];

export function promptStarterIds(
	context: ScreenContextV1 | undefined,
	contextEnabled: boolean
): readonly PromptStarterId[] {
	if (!contextEnabled || !context) return GENERAL;

	switch (context.routeId) {
		case '/inventory':
			return ['inventoryUseUp', 'inventoryMeal', 'inventoryRestock'];
		case '/meal-plan':
			return ['mealPlanOpenDays', 'mealPlanUseStock', 'mealPlanSwap'];
		case '/shopping':
			return ['shoppingNeed', 'shoppingRegenerate', 'shoppingCovered'];
		case '/recipes':
			return ['recipesFind', 'recipesUseStock', 'recipesFreezer'];
		case '/recipes/[slug]':
			return ['recipeScale', 'recipeAlternative', 'recipeRole'];
		case '/recipes/[slug]/edit':
			return context.interaction?.dirty
				? ['recipeDirtyExplain', 'recipeDirtyRole', 'recipeDirtyStep']
				: ['recipeEditCheck', 'recipeEditStep', 'recipeEditImprove'];
		case '/settings':
			return ['settingsChange', 'settingsConnect', 'settingsExport'];
		case '/settings/account':
			return ['accountPassword', 'accountUsers', 'accountSignOut'];
		case '/settings/advanced':
			return ['advancedTemperature', 'advancedBackgroundModel', 'advancedVisionModel'];
		case '/settings/ai':
			return ['aiModels', 'aiLimit', 'aiRoute'];
		case '/settings/connections':
			return ['connectionsConnect', 'connectionsReconnect', 'connectionsExpiry'];
		case '/settings/data':
			return ['dataExport', 'dataImport', 'dataReset'];
		case '/settings/display':
			return ['displayLanguage', 'displayTheme'];
		case '/settings/meal-plan':
			return ['mealSettingsWeekStart', 'mealSettingsCount', 'mealSettingsDelivery'];
		case '/settings/recipes':
			return ['recipeSettingsLanguage', 'recipeSettingsTranslate', 'recipeSettingsSort'];
		default:
			return GENERAL;
	}
}

const starterCopy: Record<PromptStarterId, () => string> = {
	generalCook: m.chat_starter_general_cook,
	generalPlan: m.chat_starter_general_plan,
	generalShop: m.chat_starter_general_shop,
	inventoryUseUp: m.chat_starter_inventory_use_up,
	inventoryMeal: m.chat_starter_inventory_meal,
	inventoryRestock: m.chat_starter_inventory_restock,
	mealPlanOpenDays: m.chat_starter_meal_plan_open_days,
	mealPlanUseStock: m.chat_starter_meal_plan_use_stock,
	mealPlanSwap: m.chat_starter_meal_plan_swap,
	shoppingNeed: m.chat_starter_shopping_need,
	shoppingRegenerate: m.chat_starter_shopping_regenerate,
	shoppingCovered: m.chat_starter_shopping_covered,
	recipesFind: m.chat_starter_recipes_find,
	recipesUseStock: m.chat_starter_recipes_use_stock,
	recipesFreezer: m.chat_starter_recipes_freezer,
	recipeScale: m.chat_starter_recipe_scale,
	recipeAlternative: m.chat_starter_recipe_alternative,
	recipeRole: m.chat_starter_recipe_role,
	recipeEditCheck: m.chat_starter_recipe_edit_check,
	recipeEditStep: m.chat_starter_recipe_edit_step,
	recipeEditImprove: m.chat_starter_recipe_edit_improve,
	recipeDirtyExplain: m.chat_starter_recipe_dirty_explain,
	recipeDirtyRole: m.chat_starter_recipe_dirty_role,
	recipeDirtyStep: m.chat_starter_recipe_dirty_step,
	settingsChange: m.chat_starter_settings_change,
	settingsConnect: m.chat_starter_settings_connect,
	settingsExport: m.chat_starter_settings_export,
	accountPassword: m.chat_starter_account_password,
	accountUsers: m.chat_starter_account_users,
	accountSignOut: m.chat_starter_account_sign_out,
	advancedTemperature: m.chat_starter_advanced_temperature,
	advancedBackgroundModel: m.chat_starter_advanced_background_model,
	advancedVisionModel: m.chat_starter_advanced_vision_model,
	aiModels: m.chat_starter_ai_models,
	aiLimit: m.chat_starter_ai_limit,
	aiRoute: m.chat_starter_ai_route,
	connectionsConnect: m.chat_starter_connections_connect,
	connectionsReconnect: m.chat_starter_connections_reconnect,
	connectionsExpiry: m.chat_starter_connections_expiry,
	dataExport: m.chat_starter_data_export,
	dataImport: m.chat_starter_data_import,
	dataReset: m.chat_starter_data_reset,
	displayLanguage: m.chat_starter_display_language,
	displayTheme: m.chat_starter_display_theme,
	mealSettingsWeekStart: m.chat_starter_meal_settings_week_start,
	mealSettingsCount: m.chat_starter_meal_settings_count,
	mealSettingsDelivery: m.chat_starter_meal_settings_delivery,
	recipeSettingsLanguage: m.chat_starter_recipe_settings_language,
	recipeSettingsTranslate: m.chat_starter_recipe_settings_translate,
	recipeSettingsSort: m.chat_starter_recipe_settings_sort
};

export function promptStarterText(id: PromptStarterId): string {
	return starterCopy[id]();
}

export function promptStarterDraft(text: string): string {
	return `${text.trimEnd()} `;
}
