<script lang="ts">
	import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
	import Icon from '$lib/components/ui/icons/Icon.svelte';
	import { m } from '$lib/paraglide/messages';
	import ShoppingRuleEditor from './ShoppingRuleEditor.svelte';
	import type { ShoppingListSource } from './types';

	type Need = 'required' | 'optional' | 'stocked';
	type Props = {
		open: boolean;
		sources: ShoppingListSource[];
		onSave: (
			source: ShoppingListSource,
			input: { need: Need; term: string; useInRecipe: boolean }
		) => Promise<boolean>;
	};

	let { open = $bindable(), sources, onSave }: Props = $props();
	let selectedSourceId = $state<number | null>(null);
	let sourceSetKey = $state('');

	$effect(() => {
		const nextKey = sources.map((source) => `${source.id}:${source.revision}`).join(',');
		if (sourceSetKey === nextKey) return;
		sourceSetKey = nextKey;
		selectedSourceId = sources.length === 1 ? (sources[0]?.id ?? null) : null;
	});

	function needLabel(source: ShoppingListSource): string {
		if (source.staple) return m.shopping_need_usually_stocked();
		if (source.optional) return m.shopping_need_nice_to_have();
		return m.shopping_need_every_time();
	}

	function closeEditor() {
		if (sources.length === 1) open = false;
		else selectedSourceId = null;
	}
</script>

<BottomSheet
	bind:open
	title={sources.length > 1 ? m.shopping_choose_rule() : m.shopping_edit_rule()}
	desktopSide
	onclose={() => {
		if (!open) selectedSourceId = sources.length === 1 ? (sources[0]?.id ?? null) : null;
	}}
>
	<div class="source-editors">
		{#each sources as source (source.id)}
			<section class:expanded={selectedSourceId === source.id}>
				<button
					type="button"
					class="source-editor-heading"
					aria-expanded={selectedSourceId === source.id}
					onclick={() => (selectedSourceId = selectedSourceId === source.id && sources.length > 1 ? null : source.id)}
				>
					<span>
						<strong>{source.name}</strong>
						<small>{[source.recipeTitle, source.component].filter(Boolean).join(' · ')}</small>
						<small>{needLabel(source)} · {source.term}</small>
					</span>
					<Icon name="chevronRight" />
				</button>
				{#if selectedSourceId === source.id}
					<div class="source-editor-body">
						<ShoppingRuleEditor
							{source}
							{onSave}
							onCancel={closeEditor}
							onSaved={closeEditor}
						/>
					</div>
				{/if}
			</section>
		{/each}
	</div>
</BottomSheet>

<style>
	.source-editors {
		display: grid;
		gap: 0.5rem;
	}

	.source-editors section {
		overflow: hidden;
		border: 1px solid var(--color-base-300);
		border-radius: 0.8rem;
		background: var(--color-base-100);
	}

	.source-editors section.expanded {
		border-color: color-mix(in oklab, var(--market-olive, #304b3a) 45%, var(--color-base-300));
	}

	.source-editor-heading {
		display: flex;
		width: 100%;
		min-height: 3.4rem;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.55rem 0.65rem 0.55rem 0.75rem;
		text-align: left;
	}

	.source-editor-heading span {
		min-width: 0;
	}

	.source-editor-heading strong,
	.source-editor-heading small {
		display: block;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.source-editor-heading strong {
		font-size: 0.76rem;
	}

	.source-editor-heading small {
		margin-top: 0.08rem;
		color: color-mix(in oklab, var(--color-base-content) 62%, transparent);
		font-size: 0.62rem;
	}

	.source-editor-heading :global(svg) {
		width: 1rem;
		height: 1rem;
		flex: 0 0 auto;
		transition: transform var(--motion-micro) var(--ease-standard);
	}

	.source-editors section.expanded .source-editor-heading :global(svg) {
		transform: rotate(90deg);
	}

	.source-editor-body {
		padding: 0 0.75rem 0.75rem;
	}
</style>
