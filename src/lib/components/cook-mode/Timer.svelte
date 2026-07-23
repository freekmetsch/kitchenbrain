<!--
	Floating cook-mode timer pill — one instance per active timer.

	Multi-pill stacking is handled by <TimerStack>, which renders one <Timer>
	per id in `timerEnds` and passes a stable `index` (FIFO oldest-at-bottom).
	The pill positions itself above the bottom navigation and any temporary
	bottom-bar clearance supplied by the cooking view.

	Lifecycle is owned by the parent (BenchSheet): the parent holds `timerEnds`,
	the worker-driven `now`, and the `firedFor` set, and is responsible for
	playing the alarm exactly once per timer instance. This component is now
	a pure pill — it derives `remaining` and `done` from props and surfaces a
	single `onDismiss` callback the user taps to remove the pill.

	Drag uses `@neodrag/svelte` v2 with the WHOLE pill as the drag surface —
	`cancel` scoping excludes only the two buttons (`.timer-no-drag`). The old
	handle-only grip failed in the kitchen: cooks grab the big clock text, not
	a 44 px grip column. Body bounds + `ignoreMultitouch` for iOS pinch-zoom
	hardening. Position is held in *local* `$state` (V9-V1 reference pattern);
	writing `position` from inside `onDrag` violates neodrag v2's
	controlled-position contract if it's a parent prop, so each pill keeps its
	drag position component-local.

	On release we snap horizontally to the nearer viewport edge with a smooth
	translate transition. Vertical position persists where the user dropped it.
-->
<script lang="ts">
	import { draggable, type DragEventData, type DragOptions } from '@neodrag/svelte';
	import { m } from '$lib/paraglide/messages';
	import { fmtClock } from './palette';

	type Props = {
		// Timer identity (the step's globalIdx). Used by the parent to key the
		// stack so each pill keeps its drag/minimize state across re-renders.
		id: number;
		// Stack position from the bottom: 0 = bottom-most (oldest, FIFO), 1 =
		// next up, 2 = top-of-stack visible cap.
		index: number;
		// Wall-clock fire time. Null while the each-block is keying us out.
		endsAt: number | null;
		// Worker-driven tick from the parent. Drives the per-frame remaining
		// derivation; advances ~every 250 ms while the worker has a subscriber.
		now: number;
		stepTitle: string | null;
		purpose: string;
		// Action-led label fields. When both are non-null, the pill renders
		// "{ACTION} · {location}" as the dominant glanceable text and demotes
		// `purpose` to a secondary line. Either being null falls back to the
		// previous layout (purpose dominant, stepTitle secondary).
		action?: string | null;
		location?: string | null;
		bottomClearanceRem?: number;
		onDismiss: () => void;
	};
	let {
		id,
		index,
		endsAt,
		now,
		stepTitle,
		purpose,
		action = null,
		location = null,
		bottomClearanceRem = 0,
		onDismiss
	}: Props = $props();

	let hasActionLabel = $derived(
		action != null && action !== '' && location != null && location !== ''
	);

	let minimized = $state(false);
	let dragging = $state(false);
	let pos = $state({ x: 0, y: 0 });

	let remaining = $derived(endsAt != null ? Math.max(0, Math.ceil((endsAt - now) / 1000)) : 0);
	let done = $derived(endsAt != null && remaining === 0);

	// Stack position: oldest at the bottom, newer pills float up. 4.25rem per
	// pill = 68 px @ 16 px base (44 px actions plus breathing room), with safe-area-inset on the bottom
	// pill only — upper pills inherit the cumulative offset.
	let bottomCss = $derived(
		index === 0
			? `calc(4.5rem + env(safe-area-inset-bottom) + ${bottomClearanceRem}rem)`
			: `calc(4.5rem + env(safe-area-inset-bottom) + ${bottomClearanceRem + index * 4.25}rem)`
	);

	function snapHorizontal(data: DragEventData) {
		const rect = data.rootNode.getBoundingClientRect();
		const vw = window.innerWidth;
		const margin = 12;
		const centerX = rect.left + rect.width / 2;
		const targetLeft = centerX < vw / 2 ? margin : vw - rect.width - margin;
		const dx = targetLeft - rect.left;
		pos = { x: data.offsetX + dx, y: data.offsetY };
	}

	let dragOpts = $derived<DragOptions>({
		cancel: '.timer-no-drag',
		bounds: 'body',
		ignoreMultitouch: true,
		position: pos,
		onDragStart: () => {
			dragging = true;
		},
		onDrag: (data) => {
			pos = { x: data.offsetX, y: data.offsetY };
		},
		onDragEnd: (data) => {
			dragging = false;
			snapHorizontal(data);
		}
	});
</script>

{#if endsAt != null}
	<!--
		style: directives only — never a dynamic `style` attribute on this node.
		neodrag positions the pill by writing the element's inline `translate`
		property imperatively; re-rendering a style attribute replaces the whole
		inline style and wipes that translate, snapping the pill back to its
		anchor the moment `dragging` flips. The transition likewise targets
		`translate` — that's the property neodrag moves, not `transform`.
	-->
	<div
		use:draggable={dragOpts}
		data-timer-id={id}
		class="fixed z-[75] flex items-stretch rounded-2xl bg-amber-500 text-white shadow-2xl select-none touch-none {dragging
			? 'ring-4 ring-white/40'
			: ''} {done ? 'animate-pulse ring-4 ring-white/60' : ''}"
		style:bottom={bottomCss}
		style:right="0.75rem"
		style:transition={dragging ? 'none' : 'translate var(--motion-content) var(--ease-emphasized)'}
	>
		<!-- Grip glyph — visual draggability affordance only; the whole pill drags. -->
		<span
			class="flex items-center justify-center opacity-60 cursor-grab active:cursor-grabbing"
			style="min-width: 22px;"
			aria-hidden="true"
		>
			<span class="flex flex-col gap-0.5">
				<span class="block w-3 h-0.5 bg-white rounded-full"></span>
				<span class="block w-3 h-0.5 bg-white rounded-full"></span>
				<span class="block w-3 h-0.5 bg-white rounded-full"></span>
			</span>
		</span>

		<span class="text-2xl font-bold font-mono tabular-nums py-2 self-center cursor-grab active:cursor-grabbing">
			{done ? m.cookmode_timer_done_label() : fmtClock(remaining)}
		</span>

		{#if !minimized}
			<div class="flex flex-col py-2 px-3 max-w-[8.5rem] self-center leading-tight">
				{#if hasActionLabel}
					<span class="text-[14px] font-semibold uppercase tracking-wide truncate"
						>{action} · {location}</span
					>
					{#if purpose}
						<span class="text-[10px] opacity-80 truncate">{purpose}</span>
					{/if}
				{:else}
					{#if purpose}
						<span class="text-[11px] font-semibold truncate">{purpose}</span>
					{/if}
					{#if stepTitle}
						<span class="text-[10px] opacity-80 truncate">{stepTitle}</span>
					{/if}
				{/if}
			</div>
		{/if}

		<!-- Horizontal 44 px buttons keep the actions kitchen-friendly.
		     A vertical pair would make pills overlap in the
		     stack). `.timer-no-drag` excludes them from the drag surface. -->
		<div class="flex items-center gap-1 pr-2 py-2">
			<button
				type="button"
				class="timer-no-drag h-11 w-11 rounded-full bg-white/15 text-white text-sm hover:bg-white/25 active:scale-95"
				onclick={() => (minimized = !minimized)}
				aria-label={minimized ? m.cookmode_timer_expand_aria() : m.cookmode_timer_minimize_aria()}
			>
				{minimized ? '▣' : '–'}
			</button>
			<button
				type="button"
				class="timer-no-drag h-11 w-11 rounded-full bg-white/15 text-white text-sm hover:bg-white/25 active:scale-95"
				onclick={onDismiss}
				aria-label={done ? m.cookmode_dismiss_timer_aria() : m.cookmode_cancel_timer_aria()}
			>
				✕
			</button>
		</div>
	</div>
{/if}
