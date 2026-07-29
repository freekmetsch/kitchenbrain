<script lang="ts">
	import { base } from '$app/paths';
	import Icon from '$lib/components/ui/icons/Icon.svelte';
	import { m } from '$lib/paraglide/messages';
	import {
		mealChoiceHref,
		type MealChoiceOptionDisplay,
		type MealChoicesDisplay
	} from '$lib/tool_display';

	let { choices }: { choices: MealChoicesDisplay } = $props();

	function confidenceLabel(level: MealChoicesDisplay['confidence']) {
		if (level === 'high') return m.chat_meal_plan_confidence_high();
		if (level === 'medium') return m.chat_meal_plan_confidence_medium();
		return m.chat_meal_plan_confidence_low();
	}

	function optionReason(option: MealChoiceOptionDisplay): string {
		if (option.source === 'freezer' && option.frozenPortionsOnHand > 0) {
			return m.chat_meal_choices_reason_freezer({ count: option.frozenPortionsOnHand });
		}
		if (option.staleOnHand.length > 0) {
			return m.chat_meal_choices_reason_stale({ items: option.staleOnHand.join(', ') });
		}
		if (option.onHand.length > 0) {
			return m.chat_meal_choices_reason_on_hand({ count: option.onHand.length });
		}
		return m.chat_meal_choices_reason_catalog();
	}

	function freezerEffect(option: MealChoiceOptionDisplay): string {
		if (option.source === 'freezer') {
			return m.chat_meal_choices_freezer_use({
				count: Math.min(option.servings, option.frozenPortionsOnHand)
			});
		}
		if (option.frozenPortionsOnHand > 0) {
			return m.chat_meal_choices_freezer_keep({ count: option.frozenPortionsOnHand });
		}
		return m.chat_meal_choices_freezer_none();
	}
</script>

<section
	class="min-w-0 rounded-xl border border-base-300/70 bg-base-100/45 p-3"
	aria-label={m.chat_meal_choices_title()}
	data-testid="meal-choice-cards"
>
	<header class="flex min-w-0 flex-wrap items-start justify-between gap-2">
		<h3 class="min-w-0 break-words text-sm font-semibold">{m.chat_meal_choices_title()}</h3>
		<span class="badge badge-outline badge-sm shrink-0">
			{m.chat_meal_plan_confidence({ level: confidenceLabel(choices.confidence) })}
		</span>
	</header>

	<div class="mt-3 grid min-w-0 gap-2 text-xs md:grid-cols-2">
		<section class="min-w-0 rounded-lg bg-base-200/55 p-2.5">
			<h4 class="font-semibold">{m.chat_meal_plan_why_now()}</h4>
			<p class="mt-1 break-words leading-relaxed">{choices.whyNow}</p>
		</section>
		<section class="min-w-0 rounded-lg bg-base-200/55 p-2.5">
			<h4 class="font-semibold">{m.chat_meal_plan_consequence()}</h4>
			<p class="mt-1 break-words leading-relaxed">{choices.consequence}</p>
		</section>
	</div>

	<details class="mt-2 min-w-0 rounded-lg border border-base-300/60 px-2.5 py-2 text-xs">
		<summary class="min-h-6 cursor-pointer font-semibold">{m.chat_meal_plan_evidence()}</summary>
		<ul class="mt-1 list-disc space-y-1 pl-4">
			{#each choices.evidence as fact}
				<li class="break-words">{fact}</li>
			{/each}
		</ul>
		{#if choices.uncertainty}
			<h4 class="mt-2 font-semibold">{m.chat_meal_plan_uncertainty()}</h4>
			<p class="mt-1 break-words text-base-content/65">{choices.uncertainty}</p>
		{/if}
	</details>

	<div class="mt-3 grid min-w-0 gap-2 lg:grid-cols-3">
		{#each choices.options as option, index (option.slug + option.source)}
			{@const href = mealChoiceHref(option, base)}
			<article
				class="flex min-w-0 flex-col rounded-xl border p-3 {index === 0
					? 'border-primary/35 bg-primary/5'
					: 'border-base-300/70 bg-base-100/45'}"
			>
				<div class="flex min-w-0 flex-wrap items-start justify-between gap-1.5">
					<h4 class="min-w-0 flex-1 break-words font-semibold leading-snug">{option.title}</h4>
					{#if index === 0}
						<span class="badge badge-primary badge-sm shrink-0">
							{m.chat_meal_choices_default()}
						</span>
					{/if}
				</div>
				<p class="mt-1.5 break-words text-xs leading-relaxed text-base-content/70">
					{optionReason(option)}
				</p>
				<div class="mt-2 flex flex-wrap gap-1">
					<span class="badge badge-ghost badge-sm">
						{option.source === 'freezer'
							? m.chat_meal_choices_source_freezer()
							: m.chat_meal_choices_source_fresh()}
					</span>
					<span class="badge badge-ghost badge-sm">
						{option.totalTimeMin === null
							? m.chat_meal_choices_effort_unknown()
							: m.chat_meal_choices_effort({ minutes: option.totalTimeMin })}
					</span>
					<span class="badge badge-ghost badge-sm">
						{option.daysSinceCooked === null
							? m.chat_meal_choices_never_cooked()
							: m.chat_meal_choices_repeat({ days: option.daysSinceCooked })}
					</span>
				</div>
				<dl class="mt-2 min-w-0 space-y-1.5 text-xs">
					<div class="min-w-0">
						<dt class="font-medium">{m.chat_meal_choices_on_hand()}</dt>
						<dd class="break-words text-base-content/65">
							{option.onHand.length > 0 ? option.onHand.join(', ') : m.chat_meal_choices_none()}
						</dd>
					</div>
					<div class="min-w-0">
						<dt class="font-medium">{m.chat_meal_choices_missing()}</dt>
						<dd class="break-words text-base-content/65">
							{option.missingItems.length > 0
								? option.missingItems.join(', ')
								: m.chat_meal_choices_none()}
						</dd>
					</div>
					{#if option.staleOnHand.length > 0}
						<div class="min-w-0">
							<dt class="font-medium">{m.chat_meal_choices_use_soon()}</dt>
							<dd class="break-words text-base-content/65">{option.staleOnHand.join(', ')}</dd>
						</div>
					{/if}
					<div class="min-w-0">
						<dt class="font-medium">{m.chat_meal_choices_freezer_effect()}</dt>
						<dd class="break-words text-base-content/65">{freezerEffect(option)}</dd>
					</div>
				</dl>
				{#if href}
					<a
						href={href}
						class="btn btn-primary btn-sm ui-chat-action mt-3 min-h-11 w-full"
						data-testid={`cook-meal-choice-${index}`}
					>
						{m.chat_meal_choices_cook()}
						<Icon name="chevronRight" class="h-3.5 w-3.5" />
					</a>
				{/if}
			</article>
		{/each}
	</div>
</section>
