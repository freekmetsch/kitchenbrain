<script lang="ts">
	import ChatView from '$lib/components/ChatView.svelte';
	import Icon from '$lib/components/ui/icons/Icon.svelte';
	import { base } from '$app/paths';
	import type { ToolDisplay } from '$lib/tool_display';
	import { m } from '$lib/paraglide/messages';

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
			prefillMessage: string | null;
			capExceeded: boolean;
		};
	} = $props();

	let showExpiring = $state(true);

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

<div class="flex flex-col h-full">
	{#if showExpiring && data.expiring && data.expiring.length > 0}
	<div class="px-3 pt-3 shrink-0">
		<div class="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
			<Icon name="warn" class="h-4 w-4 shrink-0 mt-0.5" />
			<div class="flex-1 min-w-0 flex flex-wrap items-center gap-x-2 gap-y-1">
				<span class="font-medium">{m.home_expiring_soon_label()}</span>
				{#each data.expiring as item}
				<a href="{base}/inventory" class="inline-flex items-center gap-1 hover:underline">
					<span>{item.name}</span>
					{#if item.expiryDate}
					<span class="rounded-full border px-1.5 text-[11px] font-medium {expiryChipClass(item.expiryDate)}">{formatExpiry(item.expiryDate)}</span>
					{/if}
				</a>
				{/each}
			</div>
			<button class="btn btn-xs btn-ghost shrink-0 -mr-1" aria-label={m.home_dismiss_aria()} onclick={() => (showExpiring = false)}><Icon name="x" class="h-3.5 w-3.5" /></button>
		</div>
	</div>
	{/if}
	<div class="flex-1 min-h-0">
		<ChatView username={data.user.username} initialCapExceeded={data.capExceeded} initialInput={data.prefillMessage ?? ''} initialMessages={data.messages.map((m) => ({
			role: m.role,
			content: m.content,
			at: m.createdAt,
			toolCalls: m.toolCalls as { id?: string; name: string; input: unknown; result: unknown; display?: ToolDisplay | null }[] | null
		}))} />
	</div>
</div>
