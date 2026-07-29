<script lang="ts">
	import ChatView from '$lib/components/ChatView.svelte';
	import ButlerBrief from '$lib/components/butler/ButlerBrief.svelte';
	import { useChatAgent } from '$lib/chat/agent_context';
	import type { ButlerCandidate } from '$lib/server/butler/brief';
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
			brief: ButlerCandidate[];
			capExceeded: boolean;
			capEur: number;
			hasOlder: boolean;
			visibleLimit: number;
		};
	} = $props();

	const chatAgent = useChatAgent();
	untrack(() =>
		chatAgent.hydrateOnce(data.messages, {
			capExceeded: data.capExceeded,
			capEur: data.capEur,
			hasOlder: data.hasOlder,
			visibleLimit: data.visibleLimit
		})
	);

</script>

<svelte:head><title>{m.nav_home()}</title></svelte:head>

<div class="mx-auto flex h-full w-full max-w-5xl flex-col">
	<ButlerBrief candidates={data.brief} />
	<div id="home-chat" class="flex-1 min-h-0">
		<ChatView controller={chatAgent} />
	</div>
</div>
