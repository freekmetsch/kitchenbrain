<script lang="ts">
	import ChatView from '$lib/components/ChatView.svelte';
	import { useChatAgent } from '$lib/chat/agent_context';
	import { m } from '$lib/paraglide/messages';
	import { untrack } from 'svelte';

	let {
		data
	}: {
		data: {
			user: { id: number; username: string };
			messages: {
				role: 'user' | 'assistant';
				content: string;
				toolCalls: unknown;
				createdAt: Date;
				errorCode?: 'interrupted_turn';
			}[];
			assistantDraft: string;
			capExceeded: boolean;
			capEur: number;
			hasOlder: boolean;
			visibleLimit: number;
		};
	} = $props();

	const chatAgent = useChatAgent();
	untrack(() =>
		chatAgent.hydrateOnce(data.messages, {
			input: data.assistantDraft,
			capExceeded: data.capExceeded,
			capEur: data.capEur,
			hasOlder: data.hasOlder,
			visibleLimit: data.visibleLimit
		})
	);

</script>

<svelte:head><title>{m.nav_home()}</title></svelte:head>

<div class="mx-auto flex h-full w-full max-w-5xl flex-col">
	<div id="home-chat" class="flex-1 min-h-0">
		<ChatView controller={chatAgent} />
	</div>
</div>
