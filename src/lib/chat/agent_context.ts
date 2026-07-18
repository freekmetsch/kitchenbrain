import { getContext, setContext } from 'svelte';
import type { ChatAgentController } from '$lib/stores/chat-agent.svelte';

const CHAT_AGENT_CONTEXT = Symbol('chat-agent-controller');

export function provideChatAgent(controller: ChatAgentController): void {
	setContext(CHAT_AGENT_CONTEXT, controller);
}

export function useChatAgent(): ChatAgentController {
	const controller = getContext<ChatAgentController | undefined>(CHAT_AGENT_CONTEXT);
	if (!controller) throw new Error('Chat agent controller is unavailable');
	return controller;
}
