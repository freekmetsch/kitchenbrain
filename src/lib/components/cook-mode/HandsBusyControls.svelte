<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { m } from '$lib/paraglide/messages';
	import { parseHandsBusyCommand, type HandsBusyCommand } from './hands_busy_voice';

	type Step = {
		body?: string | null;
		goal?: string | null;
		title?: string | null;
		timer_seconds?: number | null;
	};

	let {
		steps,
		currentIndex,
		language,
		onSelect,
		onStartTimer
	}: {
		steps: Step[];
		currentIndex: number;
		language: 'en' | 'nl';
		onSelect: (index: number) => void;
		onStartTimer: (index: number) => void;
	} = $props();

	let listening = $state(false);
	let ready = $state(false);
	let feedback = $state('');
	let lastSpoken = $state('');
	let recognition: { start: () => void; stop: () => void } | null = null;
	let recognitionTimeout: ReturnType<typeof setTimeout> | null = null;

	onMount(() => {
		ready = true;
	});

	onDestroy(() => {
		if (recognitionTimeout) clearTimeout(recognitionTimeout);
		recognitionTimeout = null;
		recognition?.stop();
		recognition = null;
	});

	function stepText(index: number) {
		const step = steps[Math.max(0, Math.min(steps.length - 1, index))];
		return (step?.body || step?.goal || step?.title || '').trim();
	}

	function speak(text: string) {
		if (!text) return;
		lastSpoken = text;
		feedback = text;
		if (!('speechSynthesis' in globalThis)) return;
		globalThis.speechSynthesis.cancel();
		const utterance = new SpeechSynthesisUtterance(text);
		utterance.lang = language === 'nl' ? 'nl-NL' : 'en-GB';
		globalThis.speechSynthesis.speak(utterance);
	}

	function readNext() {
		const next = Math.min(steps.length - 1, currentIndex + 1);
		onSelect(next);
		speak(stepText(next));
	}

	function readCurrent() {
		speak(stepText(currentIndex));
	}

	function repeat() {
		speak(lastSpoken || stepText(currentIndex));
	}

	function startCurrentTimer() {
		if (!steps[currentIndex]?.timer_seconds) {
			feedback = m.cook_hands_busy_no_timer();
			return;
		}
		onStartTimer(currentIndex);
	}

	function execute(command: HandsBusyCommand) {
		if (command === 'next') readNext();
		else if (command === 'repeat') repeat();
		else if (command === 'current') readCurrent();
		else if (command === 'timer') startCurrentTimer();
		else feedback = m.cook_hands_busy_voice_unknown();
	}

	function listenOnce() {
		if (listening) return;
		type RecognitionEvent = Event & {
			results?: { 0?: { 0?: { transcript?: string } } };
		};
		type Recognition = {
			continuous: boolean;
			interimResults: boolean;
			lang: string;
			onresult: ((event: RecognitionEvent) => void) | null;
			onerror: (() => void) | null;
			onend: (() => void) | null;
			start: () => void;
			stop: () => void;
		};
		type RecognitionConstructor = new () => Recognition;
		const browser = globalThis as typeof globalThis & {
			SpeechRecognition?: RecognitionConstructor;
			webkitSpeechRecognition?: RecognitionConstructor;
		};
		const Constructor = browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
		if (!Constructor) {
			feedback = m.cook_hands_busy_voice_unavailable();
			return;
		}
		const instance = new Constructor();
		instance.continuous = false;
		instance.interimResults = false;
		instance.lang = language === 'nl' ? 'nl-NL' : 'en-GB';
		instance.onresult = (event) => {
			if (recognitionTimeout) clearTimeout(recognitionTimeout);
			recognitionTimeout = null;
			const transcript = event.results?.[0]?.[0]?.transcript ?? '';
			execute(parseHandsBusyCommand(transcript));
			instance.stop();
		};
		instance.onerror = () => {
			if (recognitionTimeout) clearTimeout(recognitionTimeout);
			recognitionTimeout = null;
			feedback = m.cook_hands_busy_voice_unknown();
		};
		instance.onend = () => {
			if (recognitionTimeout) clearTimeout(recognitionTimeout);
			recognitionTimeout = null;
			listening = false;
			recognition = null;
		};
		recognition = instance;
		listening = true;
		feedback = m.cook_hands_busy_listening();
		instance.start();
		recognitionTimeout = setTimeout(() => {
			instance.stop();
			listening = false;
			recognition = null;
			feedback = m.cook_hands_busy_voice_unknown();
			recognitionTimeout = null;
		}, 8_000);
	}
</script>

<details class="mx-auto mt-2 max-w-5xl rounded-2xl border border-primary/25 bg-primary/5">
	<summary class="min-h-12 cursor-pointer px-4 py-3 font-semibold">
		{m.cook_hands_busy_title()}
	</summary>
	<div class="border-t border-primary/15 p-3">
		<p class="text-xs text-base-content/65">{m.cook_hands_busy_hint()}</p>
		<div class="mt-3 grid grid-cols-2 gap-2 md:grid-cols-5">
			<button class="btn btn-primary min-h-14" type="button" disabled={!ready} onclick={readNext}>
				{m.cook_hands_busy_next()}
			</button>
			<button class="btn btn-outline min-h-14" type="button" disabled={!ready} onclick={repeat}>
				{m.cook_hands_busy_repeat()}
			</button>
			<button class="btn btn-outline min-h-14" type="button" disabled={!ready} onclick={readCurrent}>
				{m.cook_hands_busy_now()}
			</button>
			<button class="btn btn-outline min-h-14" type="button" disabled={!ready} onclick={startCurrentTimer}>
				{m.cook_hands_busy_timer()}
			</button>
			<button
				class="btn btn-outline col-span-2 min-h-14 md:col-span-1"
				type="button"
				disabled={!ready || listening}
				onclick={listenOnce}
			>
				{listening ? m.cook_hands_busy_listening() : m.cook_hands_busy_listen()}
			</button>
		</div>
		{#if feedback}
			<p class="mt-3 rounded-xl bg-base-100/70 p-3 text-sm" aria-live="polite">{feedback}</p>
		{/if}
	</div>
</details>
