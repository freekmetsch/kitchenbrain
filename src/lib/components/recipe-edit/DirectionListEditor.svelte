<script lang="ts">
	import { tick } from 'svelte';
	import Icon from '$lib/components/ui/icons/Icon.svelte';
	import { m } from '$lib/paraglide/messages';
	import { createRecipeEditId, type DirectionDraft } from '$lib/recipe_edit';

	let { directions = $bindable<DirectionDraft[]>() }: { directions: DirectionDraft[] } = $props();
	let addButton: HTMLButtonElement | null = $state(null);

	async function focusSelector(selector: string) {
		await tick();
		const control = document.querySelector<HTMLElement>(selector);
		control?.scrollIntoView({ block: 'center' });
		control?.focus();
	}

	function addDirection() {
		const clientId = createRecipeEditId('direction');
		directions = [...directions, { clientId, text: '' }];
		void focusSelector(`[data-direction-id="${clientId}"] textarea`);
	}

	function removeDirection(index: number) {
		const focusId = directions[index + 1]?.clientId ?? directions[index - 1]?.clientId;
		directions = directions.filter((_, itemIndex) => itemIndex !== index);
		if (focusId) void focusSelector(`[data-direction-id="${focusId}"] textarea`);
		else void tick().then(() => addButton?.focus());
	}

	function moveDirection(index: number, delta: number) {
		const targetIndex = index + delta;
		if (targetIndex < 0 || targetIndex >= directions.length) return;
		const clientId = directions[index].clientId;
		const next = [...directions];
		[next[index], next[targetIndex]] = [next[targetIndex], next[index]];
		directions = next;
		void focusSelector(`[data-direction-id="${clientId}"] [data-move-direction="${delta}"]`);
	}
</script>

<section class="ui-form-card" aria-labelledby="directions-heading">
	<div class="mb-2 flex flex-wrap items-baseline gap-2">
		<h2 id="directions-heading" class="ui-section-label">{m.recipes_edit_directions_label()}</h2>
		<span class="text-[11px] text-base-content/50">{m.recipes_edit_directions_hint()}</span>
		<button
			bind:this={addButton}
			type="button"
			class="btn btn-xs btn-ghost ml-auto min-h-9 border border-base-300"
			onclick={addDirection}>{m.recipes_edit_add_step_button()}</button
		>
	</div>
	<ol class="space-y-4">
		{#each directions as direction, index (direction.clientId)}
			<li class="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-2" data-direction-id={direction.clientId}>
				<span class="mt-1 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-content">
					{index + 1}
				</span>
				<div class="min-w-0">
					<textarea
						bind:value={direction.text}
						rows="3"
						class="textarea textarea-bordered textarea-sm w-full min-w-0 leading-snug"
						placeholder={m.recipes_edit_direction_placeholder()}
					></textarea>
					<div class="mt-1.5 flex flex-wrap justify-end gap-1">
						<button
							type="button"
							data-move-direction="-1"
							class="btn btn-sm btn-ghost h-11 min-h-11 min-w-11 px-3"
							aria-label={m.recipes_edit_move_up_aria()}
							disabled={index === 0}
							onclick={() => moveDirection(index, -1)}>↑</button
						>
						<button
							type="button"
							data-move-direction="1"
							class="btn btn-sm btn-ghost h-11 min-h-11 min-w-11 px-3"
							aria-label={m.recipes_edit_move_down_aria()}
							disabled={index === directions.length - 1}
							onclick={() => moveDirection(index, 1)}>↓</button
						>
						<button
							type="button"
							class="btn btn-sm btn-ghost h-11 min-h-11 min-w-11 px-3 text-error"
							aria-label={m.recipes_edit_remove_direction_aria()}
							onclick={() => removeDirection(index)}><Icon name="x" class="h-4 w-4" /></button
						>
					</div>
				</div>
			</li>
		{/each}
	</ol>
</section>
