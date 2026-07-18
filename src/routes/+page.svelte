<script lang="ts">
	import ChatView from '$lib/components/ChatView.svelte';
	import { useChatAgent } from '$lib/chat/agent_context';
	import Icon from '$lib/components/ui/icons/Icon.svelte';
	import { base } from '$app/paths';
	import { m } from '$lib/paraglide/messages';
	import { untrack } from 'svelte';

	type ExpiringItem = { id: number; name: string; expiryDate: string | null; section: string };

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
			}[];
			expiring: ExpiringItem[];
			capExceeded: boolean;
		};
	} = $props();

	let showExpiring = $state(true);
	const chatAgent = useChatAgent();
	untrack(() =>
		chatAgent.hydrateOnce(data.messages, {
			capExceeded: data.capExceeded
		})
	);

	function expiryChipClass(expiryDate: string): string {
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const diff = Math.ceil((new Date(expiryDate).getTime() - today.getTime()) / 86400000);
		if (diff < 3) return 'border-error/30 bg-error/10 text-error';
		if (diff < 7) return 'border-warning/40 bg-warning/10 text-warning';
		return 'border-base-300/70 bg-base-200/60 text-base-content/50';
	}

	function formatExpiry(expiryDate: string): string {
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const diff = Math.ceil((new Date(expiryDate).getTime() - today.getTime()) / 86400000);
		if (diff < 0) return m.home_expiry_days_expired({ days: Math.abs(diff) });
		if (diff === 0) return m.home_expiry_today();
		if (diff === 1) return m.home_expiry_tomorrow();
		return m.home_expiry_days_left({ days: diff });
	}
</script>

<svelte:head><title>{m.nav_home()}</title></svelte:head>

<div class="flex flex-col h-full">
	{#if showExpiring && data.expiring && data.expiring.length > 0}
	<div class="px-3 pt-3 shrink-0">
		<div class="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
			<Icon name="warn" class="h-4 w-4 shrink-0 mt-0.5" />
			<div class="flex-1 min-w-0 flex flex-wrap items-center gap-x-2 gap-y-1">
				<span class="font-medium">{m.home_expiring_soon_label()}</span>
				{#each data.expiring as item}
				<a href="{base}/inventory?item={item.id}" class="inline-flex items-center gap-1 hover:underline">
					<span>{item.name}</span>
					{#if item.expiryDate}
					<span class="rounded-full border px-1.5 text-[11px] font-medium {expiryChipClass(item.expiryDate)}">{formatExpiry(item.expiryDate)}</span>
					{/if}
				</a>
				{/each}
			</div>
			<button class="btn btn-xs btn-ghost h-9 min-h-9 w-9 shrink-0 p-0 -mr-1" aria-label={m.home_dismiss_aria()} onclick={() => (showExpiring = false)}><Icon name="x" class="h-3.5 w-3.5" /></button>
		</div>
	</div>
	{/if}
	<div id="home-chat" class="flex-1 min-h-0">
		<ChatView controller={chatAgent} />
	</div>
</div>
