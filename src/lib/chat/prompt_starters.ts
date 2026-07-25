import { m } from '$lib/paraglide/messages';

export type PromptStarterId = 'generalCook' | 'generalPlan' | 'generalShop';

export const ALL_PROMPT_STARTER_IDS: readonly PromptStarterId[] = [
	'generalCook',
	'generalPlan',
	'generalShop'
];

export function promptStarterIds(): readonly PromptStarterId[] {
	return ALL_PROMPT_STARTER_IDS;
}

const starterCopy: Record<PromptStarterId, () => string> = {
	generalCook: m.chat_starter_general_cook,
	generalPlan: m.chat_starter_general_plan,
	generalShop: m.chat_starter_general_shop
};

export function promptStarterText(id: PromptStarterId): string {
	return starterCopy[id]();
}

export function promptStarterDraft(text: string): string {
	return `${text.trimEnd()} `;
}
