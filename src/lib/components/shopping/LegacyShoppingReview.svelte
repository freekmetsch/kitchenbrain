<script lang="ts">
	import Icon from '$lib/components/ui/icons/Icon.svelte';
	import KitchenNotice from '$lib/components/ui/KitchenNotice.svelte';
	import { m } from '$lib/paraglide/messages';
	type Legacy = { id: number; revision: number; name: string; term: string; amount: string | null; unit: string | null; candidates: Array<{ id: number; revision: number; label: string }> };
	type Props = { items: Legacy[]; onResolve: (item: Legacy, resolution: 'attach' | 'manual' | 'dismiss', targetEntryId?: number) => void };
	let { items, onResolve }: Props = $props();
	let selections = $state<Record<number, number | undefined>>({});
</script>

{#if items.length}
	<KitchenNotice tone="warning" class="mb-4">
		<div class="flex items-center gap-2">
			<Icon name="warn" class="h-4 w-4 shrink-0 text-warning" />
			<h2 class="ui-section-title">{m.shopping_legacy_heading()}</h2>
		</div>
		<p class="mt-1 text-xs text-base-content/65">{m.shopping_legacy_help()}</p>
		<ul class="mt-3 space-y-3">
			{#each items as item (item.id)}
				<li class="rounded-xl bg-base-100 p-3">
					<p class="text-sm font-semibold">{item.name}</p>
					{#if item.amount || item.unit}<p class="text-xs text-base-content/60">{[item.amount, item.unit].filter(Boolean).join(' ')}</p>{/if}
					{#if item.candidates.length}
						<select class="ui-field mt-2 w-full" value={selections[item.id]} onchange={(event) => (selections[item.id] = Number(event.currentTarget.value))}>
							<option value="">—</option>
							{#each item.candidates as candidate}<option value={candidate.id}>{candidate.label}</option>{/each}
						</select>
					{/if}
					<div class="mt-2 flex flex-wrap gap-2">
						{#if item.candidates.length}<button type="button" class="ui-action ui-action-primary" disabled={!selections[item.id]} onclick={() => onResolve(item, 'attach', selections[item.id])}>{m.shopping_legacy_attach()}</button>{/if}
						<button type="button" class="ui-action ui-action-secondary" onclick={() => onResolve(item, 'manual')}>{m.shopping_legacy_manual()}</button>
						<button type="button" class="ui-action ui-action-tertiary" onclick={() => onResolve(item, 'dismiss')}>{m.shopping_legacy_dismiss()}</button>
					</div>
				</li>
			{/each}
		</ul>
	</KitchenNotice>
{/if}
