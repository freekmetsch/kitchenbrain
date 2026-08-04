<script lang="ts" generics="T extends string | number">
	import { onMount, tick } from 'svelte';

	type Option = {
		value: T;
		label: string;
		badge?: string | number;
		disabled?: boolean;
	};

	let {
		options,
		value = $bindable(),
		onchange,
		cols,
		ariaLabel
	}: {
		options: Option[];
		value: T | null | undefined;
		onchange?: (value: T) => void;
		ariaLabel?: string;
		/** 2 or 3 uses an equal-width grid. The default is one content-sized row. */
		cols?: 2 | 3;
	} = $props();

	let track: HTMLDivElement;
	let optionElements = new Map<T, HTMLButtonElement>();
	let resizeObserver: ResizeObserver | null = null;
	let indicator = $state({ left: 0, width: 0, visible: false });

	function selectedIndex(): number {
		return options.findIndex((option) => option.value === value && !option.disabled);
	}

	function fallbackIndex(): number {
		const selected = selectedIndex();
		return selected >= 0 ? selected : options.findIndex((option) => !option.disabled);
	}

	async function measureIndicator() {
		await tick();
		const selected = value == null ? undefined : optionElements.get(value);
		if (!track || !selected) {
			indicator = { ...indicator, visible: false };
			return;
		}
		const trackRect = track.getBoundingClientRect();
		const optionRect = selected.getBoundingClientRect();
		if (trackRect.width === 0 || optionRect.width === 0) {
			indicator = { ...indicator, visible: false };
			return;
		}
		indicator = {
			left: optionRect.left - trackRect.left,
			width: optionRect.width,
			visible: true
		};
	}

	function registerOption(node: HTMLButtonElement, initialValue: T) {
		let registeredValue = initialValue;
		optionElements.set(registeredValue, node);
		resizeObserver?.observe(node);
		queueMicrotask(() => void measureIndicator());

		return {
			update(nextValue: T) {
				if (nextValue === registeredValue) return;
				if (optionElements.get(registeredValue) === node) {
					optionElements.delete(registeredValue);
				}
				registeredValue = nextValue;
				optionElements.set(registeredValue, node);
				queueMicrotask(() => void measureIndicator());
			},
			destroy() {
				resizeObserver?.unobserve(node);
				if (optionElements.get(registeredValue) === node) {
					optionElements.delete(registeredValue);
				}
				queueMicrotask(() => void measureIndicator());
			}
		};
	}

	function select(option: Option) {
		if (option.disabled) return;
		value = option.value;
		onchange?.(option.value);
	}

	function handleKeydown(event: KeyboardEvent, focusedIndex: number) {
		if (
			event.key !== 'ArrowLeft' &&
			event.key !== 'ArrowRight' &&
			event.key !== 'ArrowUp' &&
			event.key !== 'ArrowDown'
		) {
			return;
		}
		event.preventDefault();
		const enabledIndexes = options
			.map((option, index) => ({ option, index }))
			.filter(({ option }) => !option.disabled)
			.map(({ index }) => index);
		if (enabledIndexes.length === 0) return;
		const current = enabledIndexes.indexOf(focusedIndex);
		const forward = event.key === 'ArrowRight' || event.key === 'ArrowDown';
		const nextPosition =
			current < 0
				? 0
				: (current + (forward ? 1 : -1) + enabledIndexes.length) % enabledIndexes.length;
		const nextIndex = enabledIndexes[nextPosition];
		select(options[nextIndex]);
		const buttons = Array.from(
			track.querySelectorAll<HTMLButtonElement>(':scope > button[role="radio"]')
		);
		buttons[nextIndex]?.focus();
	}

	$effect(() => {
		value;
		options;
		queueMicrotask(() => void measureIndicator());
	});

	onMount(() => {
		resizeObserver = new ResizeObserver(() => void measureIndicator());
		const handleTrackKeydown = (event: KeyboardEvent) => {
			const buttons = Array.from(
				track.querySelectorAll<HTMLButtonElement>(':scope > button[role="radio"]')
			);
			const focusedIndex = buttons.indexOf(event.target as HTMLButtonElement);
			if (focusedIndex >= 0) handleKeydown(event, focusedIndex);
		};
		let mounted = true;
		queueMicrotask(() => {
			if (!mounted || !track) return;
			resizeObserver?.observe(track);
			for (const option of optionElements.values()) resizeObserver?.observe(option);
			track.addEventListener('keydown', handleTrackKeydown, true);
			void measureIndicator();
		});
		return () => {
			mounted = false;
			resizeObserver?.disconnect();
			resizeObserver = null;
			track?.removeEventListener('keydown', handleTrackKeydown, true);
		};
	});
</script>

<div
	bind:this={track}
	role="radiogroup"
	aria-label={ariaLabel}
	tabindex="-1"
	data-house-style="segmented-control"
	class="ui-segmented-control {cols ? `ui-segmented-control-grid ui-segmented-control-cols-${cols}` : ''}"
>
	<span
		aria-hidden="true"
		class:visible={indicator.visible}
		class="ui-segmented-indicator"
		style:left="{indicator.left}px"
		style:width="{indicator.width}px"
	></span>
	{#each options as option, index (option.value)}
		<button
			use:registerOption={option.value}
			type="button"
			role="radio"
			aria-checked={value === option.value}
			tabindex={index === fallbackIndex() ? 0 : -1}
			disabled={option.disabled}
			class:active={value === option.value}
			onclick={() => select(option)}
		>
			<span class="ui-segmented-label">{option.label}</span>
			{#if option.badge !== undefined}
				<span class="badge badge-sm">{option.badge}</span>
			{/if}
		</button>
	{/each}
</div>
