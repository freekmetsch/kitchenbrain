<script lang="ts">
	import { page } from '$app/stores';
	import { base } from '$app/paths';
	import { onMount, tick } from 'svelte';
	import { draggable, type DragEventData, type DragOptions } from '@neodrag/svelte';
	import ChatView from '$lib/components/ChatView.svelte';
	import Icon from '$lib/components/ui/icons/Icon.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import { m } from '$lib/paraglide/messages';
	import type { ChatAgentController } from '$lib/stores/chat-agent.svelte';
	import { COOK_TIMER_LAYOUT_EVENT } from '$lib/timer/layout';
	import { MOTION_MICRO_MS } from '$lib/motion';

	let { controller }: { controller: ChatAgentController } = $props();
	let dialog = $state<HTMLDialogElement>();
	let bubble = $state<HTMLButtonElement>();
	let mobile = $state(false);
	let dragging = $state(false);
	let position = $state({ x: 0, y: 0 });
	let verticalPosition = 0.68;
	let edge: 'left' | 'right' = 'right';
	let returnFocusToBubble = false;
	let settlingBubble = false;
	let settleAgain = false;
	let bubbleReady = $state(false);
	let positionPreferenceLoaded = false;
	let bubbleInitId = 0;
	let dialogClosing = $state(false);
	let dialogClosePromise: Promise<void> | null = null;
	const STORAGE_KEY = 'kitchenbrain-agent-position-v1';

	function persistPosition(rect: DOMRect) {
		const available = Math.max(1, window.innerHeight - rect.height);
		verticalPosition = Math.min(1, Math.max(0, rect.top / available));
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify({ verticalPosition, edge }));
		} catch {
			// Position memory is optional; layout settling must keep working if
			// storage is unavailable or full.
		}
	}

	function maxBubbleTop(height: number): number {
		const fixedBarHeight =
			Number.parseFloat(
				getComputedStyle(document.documentElement).getPropertyValue('--ui-fixed-bar-height')
			) || 0;
		const obstructionTop =
			document.querySelector<HTMLElement>('nav[aria-label]')?.getBoundingClientRect().top ??
			window.innerHeight - fixedBarHeight;
		return Math.max(12, obstructionTop - height - 12);
	}

	async function placeAtSavedPosition() {
		if (!bubble) return;
		const rect = bubble.getBoundingClientRect();
		const margin = 12;
		const targetTop = Math.min(
			maxBubbleTop(rect.height),
			Math.max(margin, verticalPosition * (window.innerHeight - rect.height))
		);
		const targetLeft = edge === 'left' ? margin : window.innerWidth - rect.width - margin;
		position = {
			x: position.x + targetLeft - rect.left,
			y: position.y + targetTop - rect.top
		};
		await settleBubble();
	}

	async function initializeBubble(node: HTMLButtonElement) {
		const initId = ++bubbleInitId;
		bubbleReady = false;
		await tick();
		if (bubble !== node || initId !== bubbleInitId) return;
		await placeAtSavedPosition();
		if (bubble === node && initId === bubbleInitId) bubbleReady = true;
	}

	function prepareBubble(node: HTMLButtonElement) {
		bubble = node;
		if (positionPreferenceLoaded) void initializeBubble(node);
		return {
			destroy() {
				if (bubble === node) bubble = undefined;
				bubbleReady = false;
				bubbleInitId += 1;
			}
		};
	}

	function resolveTimerCollision() {
		if (!bubble || controller.opened) return;
		const bubbleRect = bubble.getBoundingClientRect();
		const timerRects = [...document.querySelectorAll<HTMLElement>('[data-timer-id]')]
			.map((node) => node.getBoundingClientRect())
			.filter(
				(rect) =>
					rect.right + 12 > bubbleRect.left &&
					rect.left - 12 < bubbleRect.right
			);
		if (timerRects.length === 0) return;
		const stackTop = Math.min(...timerRects.map((rect) => rect.top));
		const stackBottom = Math.max(...timerRects.map((rect) => rect.bottom));
		if (bubbleRect.bottom + 12 <= stackTop || bubbleRect.top - 12 >= stackBottom) return;

		const margin = 12;
		const above = stackTop - bubbleRect.height - margin;
		const below = stackBottom + margin;
		if (above >= margin) {
			position = { ...position, y: position.y + above - bubbleRect.top };
			return;
		}
		if (below + bubbleRect.height <= window.innerHeight - margin) {
			position = { ...position, y: position.y + below - bubbleRect.top };
			return;
		}

		// A tall timer stack can consume the whole edge. Move the assistant to
		// the other edge rather than forcing either control off-screen.
		edge = edge === 'left' ? 'right' : 'left';
		const targetLeft = edge === 'left' ? margin : window.innerWidth - bubbleRect.width - margin;
		position = { ...position, x: position.x + targetLeft - bubbleRect.left };
	}

	async function settleBubble() {
		if (settlingBubble) {
			settleAgain = true;
			return;
		}
		settlingBubble = true;
		try {
			do {
				settleAgain = false;
				await tick();
				if (!bubble) break;
				const rect = bubble.getBoundingClientRect();
				const clampedTop = Math.min(maxBubbleTop(rect.height), Math.max(12, rect.top));
				if (clampedTop !== rect.top) {
					position = { ...position, y: position.y + clampedTop - rect.top };
					await tick();
				}
				resolveTimerCollision();
				await tick();
				if (bubble) persistPosition(bubble.getBoundingClientRect());
			} while (settleAgain);
		} finally {
			settlingBubble = false;
		}
	}

	function snapToEdge(data: DragEventData) {
		const rect = data.rootNode.getBoundingClientRect();
		const margin = 12;
		edge = rect.left + rect.width / 2 < window.innerWidth / 2 ? 'left' : 'right';
		const targetLeft = edge === 'left' ? margin : window.innerWidth - rect.width - margin;
		position = { x: data.offsetX + targetLeft - rect.left, y: data.offsetY };
		void settleBubble();
	}

	let dragOptions = $derived<DragOptions>({
		bounds: 'body',
		ignoreMultitouch: true,
		// Neodrag's default 3 px threshold turns most thumb taps into drags on
		// mobile (a tap wobbles more than 3 px), which swallowed the click that
		// opens the agent. 12 px keeps taps as taps; a deliberate drag clears it.
		threshold: { distance: 12 },
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

	function closeDialogAfterMotion(): Promise<void> {
		if (!dialog?.open) return Promise.resolve();
		if (dialogClosePromise) return dialogClosePromise;
		dialogClosing = true;
		dialogClosePromise = (async () => {
			await tick();
			const reducedMotion =
				window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
			if (!reducedMotion) {
				await new Promise((resolve) => setTimeout(resolve, MOTION_MICRO_MS));
			}
			if (!controller.opened && dialog?.open) dialog.close();
			dialogClosing = false;
			dialogClosePromise = null;
		})();
		return dialogClosePromise;
	}

	async function closeAgent() {
		const focusBubble = returnFocusToBubble;
		returnFocusToBubble = false;
		if (controller.opened) controller.close({ restoreFocus: false });
		await closeDialogAfterMotion();
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
				maxBubbleTop(rect.height),
				Math.max(12, rect.top)
			);
			position = { ...position, y: position.y + clampedTop - rect.top };
			void settleBubble();
		});
	}

	function syncDialog() {
		if (!dialog) return;
		if (controller.opened) {
			dialogClosing = false;
			if (!dialog.open) {
				if (mobile) dialog.showModal();
				else dialog.show();
			}
		} else if (dialog.open) void closeDialogAfterMotion();
	}

	$effect(syncDialog);
	$effect(() => {
		if (!controller.opened) return;
		document.documentElement.dataset.chatAgentOpen = 'true';
		return () => {
			delete document.documentElement.dataset.chatAgentOpen;
		};
	});

	onMount(() => {
		const query = window.matchMedia('(max-width: 51.999rem)');
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
		positionPreferenceLoaded = true;
		if (bubble) void initializeBubble(bubble);
		const handleResize = () => void placeAtSavedPosition();
		window.addEventListener('resize', handleResize);
		window.addEventListener(COOK_TIMER_LAYOUT_EVENT, settleBubble);
		return () => {
			query.removeEventListener('change', updateMode);
			window.removeEventListener('resize', handleResize);
			window.removeEventListener(COOK_TIMER_LAYOUT_EVENT, settleBubble);
		};
	});
</script>

<!-- Home already has the full composer. A second floating trigger covered its
     Send button on phones and offered no additional action there. -->
{#if !controller.opened && $page.url.pathname !== `${base}/`}
	<button
		use:prepareBubble
		use:draggable={dragOptions}
		type="button"
		class="ui-z-agent fixed right-3 flex h-12 w-12 touch-none select-none items-center justify-center rounded-full bg-primary/95 text-primary-content shadow-lg transition-[box-shadow,opacity] duration-[var(--motion-micro)] hover:bg-primary hover:shadow-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary {bubbleReady ? 'opacity-100' : 'pointer-events-none opacity-0'} {dragging ? 'ring-4 ring-primary/25' : ''}"
		style="bottom: var(--ui-overlay-bottom)"
		aria-label={m.agent_open_aria()}
		title={m.agent_title()}
		aria-keyshortcuts="ArrowUp ArrowDown"
		onkeydown={repositionWithKeyboard}
		onclick={openAgent}
	>
		<Icon name="pot" class="h-6 w-6" />
		{#if controller.unread > 0}
			<span class="absolute -right-0.5 -top-0.5 grid min-h-5 min-w-5 place-items-center rounded-full bg-error px-1 text-[10px] font-bold text-error-content"
				>{controller.unread}</span
			>
		{/if}
	</button>
{/if}

<dialog
	bind:this={dialog}
	class="agent-dialog ui-z-agent fixed m-0 max-h-none max-w-none overflow-hidden border border-base-300 bg-base-100 p-0 shadow-2xl {dialogClosing ? 'is-closing' : ''}"
	aria-labelledby="agent-title"
	oncancel={(event) => {
		event.preventDefault();
		void closeAgent();
	}}
	onkeydown={(event) => {
		if (event.key !== 'Escape') return;
		event.preventDefault();
		event.stopPropagation();
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
				class="btn btn-ghost btn-sm h-11 min-h-0 w-11 p-0"
				aria-label={m.agent_close_aria()}
				onclick={() => void closeAgent()}><Icon name="x" class="h-4 w-4" /></button
			>
		</header>

		{#if controller.screenContext}
			<div class="flex items-center gap-2 border-b border-base-200 bg-base-200/50 px-3 py-2 text-xs {controller.contextEnabled ? '' : 'text-base-content/60'}">
				<span class="min-w-0 flex-1 truncate"
					>{controller.contextEnabled
						? m.agent_using_context({ label: controller.screenContext.label })
						: m.agent_context_disabled({ label: controller.screenContext.label })}</span
				>
				<button
					type="button"
					class="btn btn-ghost btn-xs h-11 min-h-0"
					aria-pressed={controller.contextEnabled}
					onclick={() => controller.setContextEnabled(!controller.contextEnabled)}
					>{controller.contextEnabled
						? m.agent_disable_context()
						: m.agent_enable_context()}</button
				>
			</div>
		{/if}

		<div class="min-h-0 min-w-0 flex-1">
			{#if controller.hydrating}
				<div
					class="grid h-full place-items-center text-sm text-base-content/60"
					role="status"
					aria-live="polite"
					aria-atomic="true"
				>
					<span class="inline-flex items-center gap-2"><Spinner size="xs" />{m.agent_loading()}</span>
				</div>
			{:else if controller.hydrationError && controller.messages.length === 0}
				<div
					class="grid h-full place-items-center px-6 text-center text-sm text-warning"
					role="alert"
					aria-atomic="true"
				>
					<div>
						<p>{m.agent_history_error()}</p>
						<button class="btn btn-sm btn-outline mt-3 h-11 min-h-0" onclick={() => controller.ensureHydrated()}
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
		inset-block: auto var(--ui-overlay-bottom);
		inset-inline: auto 1rem;
		width: min(30rem, calc(100vw - 2rem));
		height: min(42rem, 72dvh);
		max-height: calc(100dvh - var(--ui-overlay-bottom) - var(--ui-safe-top) - 1rem);
		border-radius: var(--radius-box);
		transform-origin: bottom right;
	}
	.agent-dialog[open]:not(.is-closing) {
		animation: agent-dialog-enter var(--motion-content) var(--ease-emphasized);
	}
	.agent-dialog.is-closing {
		pointer-events: none;
		animation: agent-dialog-exit var(--motion-micro) var(--ease-standard) forwards;
	}
	@keyframes agent-dialog-enter {
		from {
			opacity: 0;
			transform: translateY(0.5rem) scale(0.985);
		}
		to {
			opacity: 1;
			transform: translateY(0) scale(1);
		}
	}
	@keyframes agent-dialog-exit {
		from {
			opacity: 1;
			transform: translateY(0) scale(1);
		}
		to {
			opacity: 0;
			transform: translateY(0.35rem) scale(0.99);
		}
	}
	@media (max-width: 51.999rem) {
		.agent-dialog {
			inset: 0;
			width: 100vw;
			height: 100dvh;
			max-height: none;
			border: 0;
			border-radius: 0;
			padding-top: var(--ui-safe-top);
			padding-bottom: var(--ui-safe-bottom);
		}
	}
	.agent-dialog::backdrop {
		background: rgb(0 0 0 / 0.35);
	}
</style>
