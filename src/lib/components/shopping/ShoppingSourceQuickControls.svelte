<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import type { ShoppingListSource } from './types';

	export type ShoppingNeed = 'required' | 'optional' | 'stocked';

	type Props = {
		source: ShoppingListSource;
		disabled?: boolean;
		pending?: boolean;
		needBlocked?: boolean;
		onNeed: (source: ShoppingListSource, need: ShoppingNeed) => Promise<boolean>;
		onTerm: (source: ShoppingListSource, term: string) => Promise<boolean>;
	};

	let {
		source,
		disabled = false,
		pending = false,
		needBlocked = false,
		onNeed,
		onTerm
	}: Props = $props();

	function need(): ShoppingNeed {
		if (source.staple) return 'stocked';
		if (source.optional) return 'optional';
		return 'required';
	}

	function nextNeed(current: ShoppingNeed): ShoppingNeed {
		if (current === 'required') return 'optional';
		if (current === 'optional') return 'stocked';
		return 'required';
	}

	function needLabel(value: ShoppingNeed): string {
		if (value === 'stocked') return m.shopping_need_usually_stocked();
		if (value === 'optional') return m.shopping_need_nice_to_have();
		return m.shopping_need_every_time();
	}

	function sourceContext(): string {
		return [
			[source.amount, source.unit].filter(Boolean).join(' '),
			source.recipeTitle,
			source.component
		]
			.filter(Boolean)
			.join(' · ');
	}

	function controlName(): string {
		return [source.name, source.recipeTitle].filter(Boolean).join(' · ');
	}

	async function chooseTerm(event: Event) {
		const select = event.currentTarget as HTMLSelectElement;
		const previous = source.term;
		const saved = await onTerm(source, select.value);
		if (!saved) select.value = previous;
	}
</script>

<div
	class="source-quick-row"
	data-source-line={source.sourceKey}
	class:busy={pending}
>
	<span class="source-name" title={source.name}>
		<strong>{source.name}</strong>
		{#if sourceContext()}<small>{sourceContext()}</small>{/if}
	</span>
	<button
		type="button"
		class="ui-action ui-action-secondary need-choice"
		data-source-key={source.sourceKey}
		disabled={disabled || pending || needBlocked}
		aria-busy={pending}
		aria-label={m.shopping_need_cycle_aria({
			name: controlName(),
			current: needLabel(need())
		})}
		onclick={() => onNeed(source, nextNeed(need()))}
	>
		{needLabel(need())}
	</button>
	{#if source.approvedTerms.length > 1}
		<label class="buy-field" aria-busy={pending}>
			<span class="sr-only">{m.shopping_buy_term_aria({ name: controlName() })}</span>
			<select
				class="ui-field"
				value={source.term}
				disabled={disabled || pending}
				aria-label={m.shopping_buy_term_aria({ name: controlName() })}
				onchange={(event) => void chooseTerm(event)}
			>
				{#each source.approvedTerms as term}
					<option value={term}>{term}</option>
				{/each}
			</select>
		</label>
	{/if}
</div>

<style>
	.source-quick-row {
		display: grid;
		grid-template-columns: minmax(3.75rem, 1fr) auto auto;
		align-items: center;
		gap: 0.25rem;
		min-width: 0;
		width: 100%;
	}

	.source-quick-row.busy {
		opacity: 0.72;
	}

	.source-name {
		display: block;
		min-width: 0;
	}

	.source-name strong,
	.source-name small {
		display: block;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.source-name strong {
		font-size: 0.72rem;
		line-height: 1.2;
	}

	.source-name small {
		margin-top: 0.08rem;
		color: color-mix(in oklab, var(--color-base-content) 62%, transparent);
		font-size: 0.56rem;
	}

	.need-choice {
		max-width: 7rem;
		min-width: 0;
		padding-inline: 0.55rem;
		overflow: hidden;
		font-size: 0.6rem;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.buy-field {
		position: relative;
		display: block;
		min-width: 0;
	}

	.buy-field :global(.ui-field) {
		width: min(6.5rem, 27vw);
		padding-inline: 0.55rem 1.15rem;
		overflow: hidden;
		font-size: 0.6rem;
		font-weight: 800;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.need-choice:disabled {
		cursor: wait;
		opacity: 0.58;
	}

	@media (min-width: 48rem) {
		.source-quick-row {
			grid-template-columns: minmax(8rem, 1fr) auto auto;
		}

		.buy-field :global(.ui-field) {
			width: min(9rem, 18vw);
		}
	}
</style>
