<script lang="ts">
	import { page } from '$app/stores';
	import { base } from '$app/paths';
	import { onMount, tick } from 'svelte';
	import { draggable, type DragEventData, type DragOptions } from '@neodrag/svelte';
	import ChatView from '$lib/components/ChatView.svelte';
	import Icon from '$lib/components/ui/icons/Icon.svelte';
	import { m } from '$lib/paraglide/messages';
	import type { ChatAgentController } from '$lib/stores/chat-agent.svelte';

	let { controller }: { controller: ChatAgentController } = $props();
	let dialog = $state<HTMLDialogElement>();
	let bubble = $state<HTMLButtonElement>();
	let mobile = $state(false);
	let dragging = $state(false);
	let position = $state({ x: 0, y: 0 });
	let verticalPosition = 0.68;
	let edge: 'left' | 'right' = 'right';
	let returnFocusToBubble = false;
	const STORAGE_KEY = 'kitchenbrain-agent-position-v1';

	function persistPosition(rect: DOMRect) {
		const available = Math.max(1, window.innerHeight - rect.height);
		verticalPosition = Math.min(1, Math.max(0, rect.top / available));
		localStorage.setItem(STORAGE_KEY, JSON.stringify({ verticalPosition, edge }));
	}

	function placeAtSavedPosition() {
		if (!bubble) return;
		const rect = bubble.getBoundingClientRect();
		const margin = 12;
		const targetTop = Math.min(
			window.innerHeight - rect.height - margin,
			Math.max(margin, verticalPosition * (window.innerHeight - rect.height))
		);
		const targetLeft = edge === 'left' ? margin : window.innerWidth - rect.width - margin;
		position = {
			x: position.x + targetLeft - rect.left,
			y: position.y + targetTop - rect.top
		};
	}

	function snapToEdge(data: DragEventData) {
		const rect = data.rootNode.getBoundingClientRect();
		const margin = 12;
		edge = rect.left + rect.width / 2 < window.innerWidth / 2 ? 'left' : 'right';
		const targetLeft = edge === 'left' ? margin : window.innerWidth - rect.width - margin;
		position = { x: data.offsetX + targetLeft - rect.left, y: data.offsetY };
		void tick().then(() => bubble && persistPosition(bubble.getBoundingClientRect()));
	}

	let dragOptions = $derived<DragOptions>({
		bounds: 'body',
		ignoreMultitouch: true,
		position,
		onDragStart: () => (dragging = true),
		onDrag: (data) => (position = { x: data.offsetX, y: data.offsetY }),
		onDragEnd: (data) => {
			dragging = false;
			snapToEdge(data);
		}
	});

	function focusHomeChat() {
		controller.focusRequest += 1;
		void controller.ensureHydrated();
		document.getElementById('home-chat')?.scrollIntoView({ block: 'nearest' });
	}

	function openAgent() {
		if ($page.url.pathname === `${base}/`) focusHomeChat();
		else {
			returnFocusToBubble = true;
			controller.open();
		}
	}

	async function closeAgent() {
		const focusBubble = returnFocusToBubble;
		returnFocusToBubble = false;
		if (controller.opened) controller.close();
		if (focusBubble) {
			await tick();
			bubble?.focus();
		}
	}

	function repositionWithKeyboard(event: KeyboardEvent) {
		if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
		event.preventDefault();
		position = {
			...position,
			y: position.y + (event.key === 'ArrowUp' ? -48 : 48)
		};
		void tick().then(() => {
			if (!bubble) return;
			const rect = bubble.getBoundingClientRect();
			const clampedTop = Math.min(
				window.innerHeight - rect.height - 12,
				Math.max(12, rect.top)
			);
			position = { ...position, y: position.y + clampedTop - rect.top };
			void tick().then(() => bubble && persistPosition(bubble.getBoundingClientRect()));
		});
	}

	function syncDialog() {
		if (!dialog) return;
		if (controller.opened && !dialog.open) {
			if (mobile) dialog.showModal();
			else dialog.show();
		} else if (!controller.opened && dialog.open) dialog.close();
	}

	$effect(syncDialog);

	onMount(() => {
		const query = window.matchMedia('(max-width: 47.999rem)');
		const updateMode = () => {
			const changed = mobile !== query.matches;
			mobile = query.matches;
			if (changed && dialog?.open) {
				dialog.close();
				void tick().then(syncDialog);
			}
		};
		updateMode();
		query.addEventListener('change', updateMode);
		try {
			const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
			if (typeof stored?.verticalPosition === 'number') verticalPosition = stored.verticalPosition;
			if (stored?.edge === 'left' || stored?.edge === 'right') edge = stored.edge;
		} catch {
			// Ignore a malformed local-only preference.
		}
		void tick().then(placeAtSavedPosition);
		window.addEventListener('resize', placeAtSavedPosition);
		return () => {
			query.removeEventListener('change', updateMode);
			window.removeEventListener('resize', placeAtSavedPosition);
		};
	});
</script>

{#if !controller.opened}
	<button
		bind:this={bubble}
		use:draggable={dragOptions}
		type="button"
		class="ui-z-agent fixed right-3 flex h-14 w-14 touch-none select-none items-center justify-center rounded-full bg-primary text-primary-content shadow-xl transition-[translate,box-shadow] hover:shadow-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary {dragging ? 'ring-4 ring-primary/25' : ''}"
		style="bottom: var(--ui-overlay-bottom)"
		aria-label={m.agent_open_aria()}
		aria-keyshortcuts="ArrowUp ArrowDown"
		onkeydown={repositionWithKeyboard}
		onclick={openAgent}
	>
		<Icon name="pot" class="h-7 w-7" />
		{#if controller.unread > 0}
			<span class="absolute -right-0.5 -top-0.5 grid min-h-5 min-w-5 place-items-center rounded-full bg-error px-1 text-[10px] font-bold text-error-content"
				>{controller.unread}</span
			>
		{/if}
	</button>
{/if}

<dialog
	bind:this={dialog}
	class="agent-dialog ui-z-agent fixed m-0 max-h-none max-w-none overflow-hidden border border-base-300 bg-base-100 p-0 shadow-2xl"
	aria-labelledby="agent-title"
	oncancel={(event) => {
		event.preventDefault();
		void closeAgent();
	}}
	onclose={() => {
		// A programmatic close queues this event. If the panel was reopened before
		// that queued event arrives, `dialog.open` is true again and the stale
		// event must not close the new session.
		if (controller.opened && !dialog?.open) void closeAgent();
	}}
>
	<div class="flex h-full min-w-0 flex-col">
		<header class="flex min-h-14 items-center gap-2 border-b border-base-300 px-3">
			<Icon name="pot" class="h-5 w-5 text-primary" />
			<h2 id="agent-title" class="min-w-0 flex-1 truncate text-sm font-semibold">{m.agent_title()}</h2>
			<button
				type="button"
				class="btn btn-ghost btn-sm h-10 min-h-10 w-10 p-0"
				aria-label={m.agent_close_aria()}
				onclick={() => void closeAgent()}><Icon name="x" class="h-4 w-4" /></button
			>
		</header>

		{#if controller.screenContext && controller.contextEnabled}
			<div class="flex items-center gap-2 border-b border-base-200 bg-base-200/50 px-3 py-2 text-xs">
				<span class="min-w-0 flex-1 truncate"
					>{m.agent_using_context({ label: controller.screenContext.label })}</span
				>
				<button
					type="button"
					class="btn btn-ghost btn-xs min-h-8"
					onclick={() => controller.removeContext()}>{m.agent_remove_context()}</button
				>
			</div>
		{/if}

		<div class="min-h-0 min-w-0 flex-1">
			{#if controller.hydrating}
				<div class="grid h-full place-items-center text-sm text-base-content/60">{m.agent_loading()}</div>
			{:else if controller.hydrationError && controller.messages.length === 0}
				<div class="grid h-full place-items-center px-6 text-center text-sm text-warning">
					<div>
						<p>{m.agent_history_error()}</p>
						<button class="btn btn-sm btn-outline mt-3" onclick={() => controller.ensureHydrated()}
							>{m.mealplan_retry_button()}</button
						>
					</div>
				</div>
			{:else}
				<ChatView {controller} />
			{/if}
		</div>
	</div>
</dialog>

<style>
	.agent-dialog {
		inset-block: var(--ui-safe-top) var(--ui-nav-offset);
		inset-inline: auto 0;
		width: min(34rem, calc(100vw - 5rem));
		height: auto;
	}
	@media (max-width: 47.999rem) {
		.agent-dialog {
			inset: 0;
			width: 100vw;
			height: 100dvh;
			border: 0;
			padding-top: var(--ui-safe-top);
			padding-bottom: var(--ui-safe-bottom);
		}
	}
	.agent-dialog::backdrop {
		background: rgb(0 0 0 / 0.35);
	}
</style>
